import {
  Card,
  GameState,
  Seat,
  Suit,
  TrumpSuit,
  Bid,
  TrickResult,
  PlayedCard,
} from '../src/types.ts';
import {
  createInitialGameState,
  startDealRound,
  evaluateTrickWinner,
  SEATS,
  SUITS,
  RANK_VALUES,
} from '../src/logic/gameLogic.ts';
import {
  extractBeliefState,
  getRemainingUnseenCards,
  getUnseenCountBySuit,
  reconstructHandProbabilities,
  getAttitudeSignalCard,
  interpretPartnerAttitude,
  getCountSignalCard,
  interpretPartnerCount,
  getSuitPreferenceDiscard,
  interpretPartnerDiscard,
  getGrandmasterOpeningLead,
  getSuperBotCardPlay,
  sampleConsistentDeals,
} from '../src/logic/superBot.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

function createMockGameState(
  overrides: Partial<Omit<GameState, 'hands'>> & { hands?: Partial<Record<Seat, Card[]>> } = {}
): GameState {
  let state = createInitialGameState('North');
  state = startDealRound(state, 'North');
  const baseHands: Record<Seat, Card[]> = {
    North: [],
    West: [],
    South: [],
    East: [],
  };
  const mergedHands: Record<Seat, Card[]> = overrides.hands
    ? { ...baseHands, ...overrides.hands }
    : state.hands;

  return {
    ...state,
    phase: 'playing',
    trumpSuit: 'S',
    ...overrides,
    hands: mergedHands,
  };
}

function mockTrick(
  trickNumber: number,
  leader: Seat,
  ledSuit: Suit,
  cards: PlayedCard[],
  winner: Seat,
  winningCard: Card
): TrickResult {
  return {
    trickNumber,
    leader,
    ledSuit,
    cards,
    winner,
    winningCard,
  };
}

// ============================================================================
// SUITE 1: Bayesian Card Counting & Opponent Hand Reconstruction
// ============================================================================
function testBayesianHandReconstruction() {
  console.log('\n============================================================');
  console.log('🧪 SUITE 1: Bayesian Card Counting & Opponent Hand Reconstruction');
  console.log('============================================================');

  // Test 1A: Probability Normalization
  console.log('-> Subtest 1A: Probability Distribution Normalization Across Seats...');
  const state1 = createMockGameState({
    hands: {
      North: [
        { id: 'AS', rank: 'A', suit: 'S' },
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: 'QS', rank: 'Q', suit: 'S' },
      ],
      West: [{ id: '2S', rank: '2', suit: 'S' }],
      South: [{ id: '3S', rank: '3', suit: 'S' }],
      East: [{ id: '4S', rank: '4', suit: 'S' }],
    },
    cardsCount: { North: 3, West: 10, South: 10, East: 10 },
    bids: [
      { seat: 'North', type: 'pass' },
      { seat: 'East', type: 'pass' },
      { seat: 'South', type: 'pass' },
      { seat: 'West', type: 'pass' },
    ],
  });

  const bayesian = reconstructHandProbabilities(state1, 'North');
  assert(bayesian.unseenCards.length === 49, `Expected 49 unseen cards, got ${bayesian.unseenCards.length}`);

  // For every unseen card, the sum of probabilities across the 3 other seats must equal 1.0 (within float epsilon)
  for (const card of bayesian.unseenCards) {
    const pWest = bayesian.getCardProbability('West', card.id);
    const pSouth = bayesian.getCardProbability('South', card.id);
    const pEast = bayesian.getCardProbability('East', card.id);
    const sum = pWest + pSouth + pEast;
    assert(
      Math.abs(sum - 1.0) < 1e-6,
      `Probability sum for card ${card.id} across seats is ${sum}, expected 1.0`
    );
  }
  console.log('✓ All 49 unseen card probabilities strictly normalize to 1.0 across opponent/partner seats.');

  // Test 1B: Auction Inferences (NT Bidder vs Suit Bidder vs Passer)
  console.log('-> Subtest 1B: Bayesian Updates from Auction Clues (NT Opener vs Passer)...');
  const stateAuction = createMockGameState({
    hands: {
      North: [
        { id: '2S', rank: '2', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
      ],
      West: [{ id: '4S', rank: '4', suit: 'S' }],
      South: [{ id: '5S', rank: '5', suit: 'S' }],
      East: [{ id: '6S', rank: '6', suit: 'S' }],
    },
    cardsCount: { North: 2, West: 10, South: 10, East: 10 },
    bids: [
      { seat: 'East', type: 'bid', level: 1, contractType: 'NT' }, // East opened 1NT (15-17 HCP, balanced)
      { seat: 'South', type: 'pass' },                             // South passed (<= 9 HCP)
      { seat: 'West', type: 'pass' },                              // West passed (<= 9 HCP)
    ],
    declarer: 'East',
    trumpSuit: 'NT',
  });

  const beliefsAuction = extractBeliefState(stateAuction);
  assert(beliefsAuction.East.isNtBidder === true, 'East should be identified as NT bidder');
  assert(beliefsAuction.East.isBalanced === true, 'East should be identified as holding balanced shape');
  assert(beliefsAuction.East.minHCP >= 14, `East minHCP expected >= 14, got ${beliefsAuction.East.minHCP}`);
  assert(beliefsAuction.South.isPasser === true, 'South should be identified as passer');
  assert(beliefsAuction.West.isPasser === true, 'West should be identified as passer');

  const bayesAuction = reconstructHandProbabilities(stateAuction, 'North');
  // Ace of Hearts (honor) should have much higher probability for East (NT opener) than for South (passer)
  const pEastAH = bayesAuction.getCardProbability('East', 'AH');
  const pSouthAH = bayesAuction.getCardProbability('South', 'AH');
  console.log(`Honor AH Probability: East (NT opener) = ${pEastAH.toFixed(3)}, South (passer) = ${pSouthAH.toFixed(3)}`);
  assert(
    pEastAH > pSouthAH * 2.0,
    `Expected East AH probability (${pEastAH}) to be > 2x South AH probability (${pSouthAH})`
  );

  // Low spot card (2C) should have higher or equal probability for passer than for NT opener
  const pEast2C = bayesAuction.getCardProbability('East', '2C');
  const pSouth2C = bayesAuction.getCardProbability('South', '2C');
  console.log(`Low spot 2C Probability: East (NT opener) = ${pEast2C.toFixed(3)}, South (passer) = ${pSouth2C.toFixed(3)}`);
  assert(
    pSouth2C > pEast2C,
    `Expected South (passer) to have higher probability for low spot 2C (${pSouth2C}) than East NT opener (${pEast2C})`
  );
  console.log('✓ Bayesian posteriors correctly elevate honor probabilities for NT bidder and spots for passers.');

  // Test 1C: Trick Voids Updating Posteriors
  console.log('-> Subtest 1C: Dynamic Trick Play Void Inference & Probability Transfer...');
  const stateVoid = createMockGameState({
    hands: {
      North: [{ id: '9H', rank: '9', suit: 'H' }],
      West: [{ id: '2H', rank: '2', suit: 'H' }],
      South: [{ id: '3H', rank: '3', suit: 'H' }],
      East: [{ id: '4H', rank: '4', suit: 'H' }],
    },
    cardsCount: { North: 1, West: 5, South: 5, East: 5 },
    tricksHistory: [
      mockTrick(
        1,
        'North',
        'S',
        [
          { seat: 'North', card: { id: 'AS', rank: 'A', suit: 'S' } },
          { seat: 'West', card: { id: '4H', rank: '4', suit: 'H' } }, // West failed to follow suit in Spades!
          { seat: 'South', card: { id: '2S', rank: '2', suit: 'S' } },
          { seat: 'East', card: { id: '3S', rank: '3', suit: 'S' } },
        ],
        'North',
        { id: 'AS', rank: 'A', suit: 'S' }
      ),
    ],
  });

  const beliefsVoid = extractBeliefState(stateVoid);
  assert(beliefsVoid.West.voids.S === true, 'West must have confirmed void in Spades');
  assert(beliefsVoid.South.voids.S === false, 'South is not void in Spades');
  assert(beliefsVoid.East.voids.S === false, 'East is not void in Spades');

  const bayesVoid = reconstructHandProbabilities(stateVoid, 'North');
  // For any unseen Spade, West must have 0.0 probability, and South + East must share 100%
  const unseenSpade = bayesVoid.unseenCards.find((c) => c.suit === 'S');
  assert(unseenSpade !== undefined, 'Expected at least one unseen Spade');
  const pWestSpade = bayesVoid.getCardProbability('West', unseenSpade!.id);
  const pSouthSpade = bayesVoid.getCardProbability('South', unseenSpade!.id);
  const pEastSpade = bayesVoid.getCardProbability('East', unseenSpade!.id);

  console.log(`Unseen Spade (${unseenSpade!.id}) Posteriors: West = ${pWestSpade}, South = ${pSouthSpade.toFixed(3)}, East = ${pEastSpade.toFixed(3)}`);
  assert(pWestSpade === 0, `Expected West probability for Spade to be 0, got ${pWestSpade}`);
  assert(
    Math.abs(pSouthSpade + pEastSpade - 1.0) < 1e-6,
    `Expected South + East to sum to 1.0, got ${pSouthSpade + pEastSpade}`
  );
  assert(
    bayesVoid.playerDistributions.West.suitVoidProbabilities.S === 1.0,
    `West void probability in Spades should be 1.0, got ${bayesVoid.playerDistributions.West.suitVoidProbabilities.S}`
  );
  console.log('✓ Void detection dynamically forces card probability to 0.0 and redistributes mass to non-void seats.');

  // Test 1D: Master Card Probability
  console.log('-> Subtest 1D: getMasterProbability for Highest Remaining Card...');
  const masterProbSouth = bayesVoid.getMasterProbability('South', 'S');
  const masterProbEast = bayesVoid.getMasterProbability('East', 'S');
  const masterProbWest = bayesVoid.getMasterProbability('West', 'S');
  assert(masterProbWest === 0, 'West cannot hold master Spade when void');
  assert(masterProbSouth > 0 && masterProbEast > 0, 'South and East must hold positive master Spade probabilities');
  assert(Math.abs(masterProbSouth + masterProbEast - 1.0) < 1e-6, 'South + East master probability should sum to 1.0');
  console.log(`✓ Master Card Probabilities correctly computed: South = ${masterProbSouth.toFixed(3)}, East = ${masterProbEast.toFixed(3)}.`);
}

// ============================================================================
// SUITE 2: Partnership Signaling System (Attitude, Count, Suit-Preference)
// ============================================================================
function testPartnershipSignaling() {
  console.log('\n============================================================');
  console.log('🧪 SUITE 2: Partnership Signaling System');
  console.log('============================================================');

  // Test 2A: Attitude Signals on Partner's Honor Lead
  console.log('-> Subtest 2A: Attitude Signals (Encouraging vs Discouraging Spots)...');
  // Scenario 1: Partner leads Ace of Spades. We hold KS, 8S, 2S (Supporting King!)
  // Bot should encourage with high spot (8S), NEVER squandering King.
  const cardsWithKing: Card[] = [
    { id: 'KS', rank: 'K', suit: 'S' },
    { id: '8S', rank: '8', suit: 'S' },
    { id: '2S', rank: '2', suit: 'S' },
  ];
  const signalEncourage = getAttitudeSignalCard(cardsWithKing, { id: 'AS', rank: 'A', suit: 'S' }, false);
  console.log(`Holding [KS, 8S, 2S] under Partner's AS -> Bot plays: ${signalEncourage.id}`);
  assert(
    signalEncourage.id === '8S',
    `Expected high spot 8S to encourage partner's Ace with King, got ${signalEncourage.id}`
  );

  // Scenario 2: Partner leads Ace of Spades. We hold 8S, 5S, 2S (No honor, suit contract, no trumps)
  // Bot should discourage with lowest spot (2S).
  const cardsNoHonor: Card[] = [
    { id: '8S', rank: '8', suit: 'S' },
    { id: '5S', rank: '5', suit: 'S' },
    { id: '2S', rank: '2', suit: 'S' },
  ];
  const signalDiscourage = getAttitudeSignalCard(cardsNoHonor, { id: 'AS', rank: 'A', suit: 'S' }, false, false);
  console.log(`Holding [8S, 5S, 2S] under Partner's AS (no honor) -> Bot plays: ${signalDiscourage.id}`);
  assert(
    signalDiscourage.id === '2S',
    `Expected lowest spot 2S to discourage partner's Ace, got ${signalDiscourage.id}`
  );

  // Scenario 3: Doubleton in suit contract with trumps (can ruff 3rd round)
  const doubletonRuff: Card[] = [
    { id: '8S', rank: '8', suit: 'S' },
    { id: '3S', rank: '3', suit: 'S' },
  ];
  const signalRuff = getAttitudeSignalCard(doubletonRuff, { id: 'AS', rank: 'A', suit: 'S' }, false, true);
  console.log(`Holding [8S, 3S] with side trumps in suit contract -> Bot plays: ${signalRuff.id}`);
  assert(
    signalRuff.id === '8S',
    `Expected high spot 8S to encourage for ruff potential, got ${signalRuff.id}`
  );

  // Scenario 4: Honor conservation: Holding only honors [QS, JS, 10S]
  const onlyHonors: Card[] = [
    { id: 'QS', rank: 'Q', suit: 'S' },
    { id: 'JS', rank: 'J', suit: 'S' },
    { id: '10S', rank: '10', suit: 'S' },
  ];
  const signalHonorsOnly = getAttitudeSignalCard(onlyHonors, { id: 'AS', rank: 'A', suit: 'S' }, false);
  assert(
    signalHonorsOnly.id === '10S',
    `Expected lowest honor 10S to conserve higher honors, got ${signalHonorsOnly.id}`
  );
  console.log('✓ Attitude signal correctly plays high spot to encourage, low to discourage, and conserves honors.');

  // Test 2B: Interpreting Partner's Attitude
  console.log('-> Subtest 2B: interpretPartnerAttitude from Trick History...');
  const stateEncouraged = createMockGameState({
    tricksHistory: [
      mockTrick(
        1,
        'South',
        'H',
        [
          { seat: 'South', card: { id: 'AH', rank: 'A', suit: 'H' } },
          { seat: 'East', card: { id: '3H', rank: '3', suit: 'H' } },
          { seat: 'North', card: { id: '9H', rank: '9', suit: 'H' } }, // Partner (North) encouraged with 9
          { seat: 'West', card: { id: '2H', rank: '2', suit: 'H' } },
        ],
        'South',
        { id: 'AH', rank: 'A', suit: 'H' }
      ),
    ],
  });
  const attitudeEnc = interpretPartnerAttitude(stateEncouraged, 'South', 'H');
  assert(attitudeEnc === 'encourage', `Expected 'encourage', got ${attitudeEnc}`);

  const stateDiscouraged = createMockGameState({
    tricksHistory: [
      mockTrick(
        1,
        'South',
        'H',
        [
          { seat: 'South', card: { id: 'AH', rank: 'A', suit: 'H' } },
          { seat: 'East', card: { id: '3H', rank: '3', suit: 'H' } },
          { seat: 'North', card: { id: '2H', rank: '2', suit: 'H' } }, // Partner (North) discouraged with 2
          { seat: 'West', card: { id: '4H', rank: '4', suit: 'H' } },
        ],
        'South',
        { id: 'AH', rank: 'A', suit: 'H' }
      ),
    ],
  });
  const attitudeDisc = interpretPartnerAttitude(stateDiscouraged, 'South', 'H');
  assert(attitudeDisc === 'discourage', `Expected 'discourage', got ${attitudeDisc}`);
  console.log('✓ Partner attitude correctly interpreted as encourage on rank >= 7, discourage on rank <= 5.');

  // Test 2C: Count Echo Signals (High-Low on Even, Low-High on Odd)
  console.log('-> Subtest 2C: Count Echo Signals (High-Low on Even, Low-High on Odd)...');
  // 4 cards in suit (even length): [8D, 6D, 4D, 2D]
  const evenCards: Card[] = [
    { id: '8D', rank: '8', suit: 'D' },
    { id: '6D', rank: '6', suit: 'D' },
    { id: '4D', rank: '4', suit: 'D' },
    { id: '2D', rank: '2', suit: 'D' },
  ];
  // 1st play (playedCount = 0): should play high spot (8D)
  const countPlay1 = getCountSignalCard(evenCards, 0);
  assert(countPlay1.id === '8D', `Expected high spot 8D for even count on 1st round, got ${countPlay1.id}`);
  // 2nd play (playedCount = 1): should play low spot (2D)
  const remEvenCards = evenCards.filter((c) => c.id !== '8D');
  const countPlay2 = getCountSignalCard(remEvenCards, 1);
  assert(countPlay2.id === '2D', `Expected low spot 2D for even count echo on 2nd round, got ${countPlay2.id}`);

  // 3 cards in suit (odd length): [7D, 5D, 2D]
  const oddCards: Card[] = [
    { id: '7D', rank: '7', suit: 'D' },
    { id: '5D', rank: '5', suit: 'D' },
    { id: '2D', rank: '2', suit: 'D' },
  ];
  // 1st play (playedCount = 0): should play lowest card (2D)
  const countOddPlay1 = getCountSignalCard(oddCards, 0);
  assert(countOddPlay1.id === '2D', `Expected low spot 2D for odd count on 1st round, got ${countOddPlay1.id}`);

  // Stopper / Honor protection in count echo: holding [KD, 10D, 8D, 2D]
  // Echo should use 8D, NEVER squandering King or 10!
  const honorsAndSpots: Card[] = [
    { id: 'KD', rank: 'K', suit: 'D' },
    { id: '10D', rank: '10', suit: 'D' },
    { id: '8D', rank: '8', suit: 'D' },
    { id: '2D', rank: '2', suit: 'D' },
  ];
  const countSafe = getCountSignalCard(honorsAndSpots, 0);
  assert(
    countSafe.id === '8D',
    `Expected safe echo spot 8D (never KD or 10D), got ${countSafe.id}`
  );
  console.log('✓ Count signals play High-Low on even length, Low-High on odd length, strictly protecting honors/stoppers.');

  // Test 2D: Interpreting Partner's Count Echo
  console.log('-> Subtest 2D: interpretPartnerCount...');
  const stateEvenCount = createMockGameState({
    tricksHistory: [
      mockTrick(
        1,
        'East',
        'C',
        [
          { seat: 'East', card: { id: 'AC', rank: 'A', suit: 'C' } },
          { seat: 'South', card: { id: '3C', rank: '3', suit: 'C' } },
          { seat: 'West', card: { id: '4C', rank: '4', suit: 'C' } },
          { seat: 'North', card: { id: '8C', rank: '8', suit: 'C' } }, // Partner played 8 first
        ],
        'East',
        { id: 'AC', rank: 'A', suit: 'C' }
      ),
      mockTrick(
        2,
        'East',
        'C',
        [
          { seat: 'East', card: { id: 'KC', rank: 'K', suit: 'C' } },
          { seat: 'South', card: { id: '5C', rank: '5', suit: 'C' } },
          { seat: 'West', card: { id: '6C', rank: '6', suit: 'C' } },
          { seat: 'North', card: { id: '2C', rank: '2', suit: 'C' } }, // Partner played 2 second
        ],
        'East',
        { id: 'KC', rank: 'K', suit: 'C' }
      ),
    ],
  });
  const partnerCountEven = interpretPartnerCount(stateEvenCount, 'South', 'C');
  assert(partnerCountEven === 'even', `Expected 'even' count signal, got ${partnerCountEven}`);

  const stateOddCount = createMockGameState({
    tricksHistory: [
      mockTrick(
        1,
        'East',
        'C',
        [
          { seat: 'East', card: { id: 'AC', rank: 'A', suit: 'C' } },
          { seat: 'South', card: { id: '3C', rank: '3', suit: 'C' } },
          { seat: 'West', card: { id: '4C', rank: '4', suit: 'C' } },
          { seat: 'North', card: { id: '2C', rank: '2', suit: 'C' } }, // Partner played 2 first
        ],
        'East',
        { id: 'AC', rank: 'A', suit: 'C' }
      ),
      mockTrick(
        2,
        'East',
        'C',
        [
          { seat: 'East', card: { id: 'KC', rank: 'K', suit: 'C' } },
          { seat: 'South', card: { id: '5C', rank: '5', suit: 'C' } },
          { seat: 'West', card: { id: '6C', rank: '6', suit: 'C' } },
          { seat: 'North', card: { id: '7C', rank: '7', suit: 'C' } }, // Partner played 7 second
        ],
        'East',
        { id: 'KC', rank: 'K', suit: 'C' }
      ),
    ],
  });
  const partnerCountOdd = interpretPartnerCount(stateOddCount, 'South', 'C');
  assert(partnerCountOdd === 'odd', `Expected 'odd' count signal, got ${partnerCountOdd}`);
  console.log('✓ Partner count correctly deduced: 8-then-2 is even, 2-then-7 is odd.');

  // Test 2E: Suit-Preference Discards (Lavinthal)
  console.log('-> Subtest 2E: Suit-Preference Discard & Interpretation...');
  // Led suit: Clubs (C). Trump: None (NT).
  // South is void in Clubs. South holds:
  // - Strong Spades (AS, KS, QS - High outside suit)
  // - Weak Diamonds (3D, 2D - Low outside suit)
  // - Discardable Hearts: [9H, 2H]
  const stateDiscard = createMockGameState({
    hands: {
      South: [
        { id: 'AS', rank: 'A', suit: 'S' },
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: 'QS', rank: 'Q', suit: 'S' },
        { id: '9H', rank: '9', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
      ],
    },
    currentTrick: [
      { seat: 'West', card: { id: 'AC', rank: 'A', suit: 'C' } },
    ],
    trumpSuit: 'NT',
  });

  const legalDiscards = stateDiscard.hands.South;
  const discardHigh = getSuitPreferenceDiscard(stateDiscard, 'South', legalDiscards, 'NT');
  console.log(`With strong Spades, discard choice from Hearts: ${discardHigh.id}`);
  assert(
    discardHigh.suit === 'H' && RANK_VALUES[discardHigh.rank] >= 7,
    `Expected high discard in Hearts (e.g. 9H) to signal preference for Spades, got ${discardHigh.id}`
  );

  // Now test partner's interpretation of South's discard:
  const stateDecodeDiscard = createMockGameState({
    tricksHistory: [
      mockTrick(
        1,
        'West',
        'C',
        [
          { seat: 'West', card: { id: 'AC', rank: 'A', suit: 'C' } },
          { seat: 'North', card: { id: '3C', rank: '3', suit: 'C' } },
          { seat: 'East', card: { id: '4C', rank: '4', suit: 'C' } },
          { seat: 'South', card: { id: '9H', rank: '9', suit: 'H' } }, // South discarded 9H!
        ],
        'West',
        { id: 'AC', rank: 'A', suit: 'C' }
      ),
    ],
    trumpSuit: 'NT',
  });
  const signaledSuit = interpretPartnerDiscard(stateDecodeDiscard, 'North', 'NT');
  console.log(`Partner (North) decodes South's 9H discard: preferred suit = ${signaledSuit}`);
  assert(
    signaledSuit === 'S',
    `Expected high discard (9H) to signal higher-ranking outside suit (Spades), got ${signaledSuit}`
  );
  console.log('✓ Suit-preference discard correctly signals higher/lower suit via discard rank.');
}

// ============================================================================
// SUITE 3: Grandmaster Opening Lead Engine (Trick 1)
// ============================================================================
function testGrandmasterOpeningLeads() {
  console.log('\n============================================================');
  console.log('🧪 SUITE 3: Grandmaster Opening Lead Engine (Trick 1)');
  console.log('============================================================');

  // Test 3A: NT Defense - Interior Sequences
  console.log('-> Subtest 3A: NT Defense - Interior Sequences...');
  // Scenario 1: A-10-9-4 in Hearts -> Must lead 10!
  const stateNT10 = createMockGameState({
    hands: {
      West: [
        { id: 'AH', rank: 'A', suit: 'H' },
        { id: '10H', rank: '10', suit: 'H' },
        { id: '9H', rank: '9', suit: 'H' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '5S', rank: '5', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
        { id: '5C', rank: '5', suit: 'C' },
        { id: '3C', rank: '3', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'NT',
    currentTrick: [],
  });
  const lead10 = getGrandmasterOpeningLead(stateNT10, 'West', 'NT');
  console.log(`Holding [AH, 10H, 9H, 4H] against NT -> Lead: ${lead10.id}`);
  assert(lead10.id === '10H', `Expected 10H interior sequence lead from A-10-9, got ${lead10.id}`);

  // Scenario 2: K-J-10-3 in Diamonds -> Must lead Jack!
  const stateNTJ = createMockGameState({
    hands: {
      West: [
        { id: 'KD', rank: 'K', suit: 'D' },
        { id: 'JD', rank: 'J', suit: 'D' },
        { id: '10D', rank: '10', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '5S', rank: '5', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '3H', rank: '3', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '5C', rank: '5', suit: 'C' },
        { id: '3C', rank: '3', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'NT',
    currentTrick: [],
  });
  const leadJ = getGrandmasterOpeningLead(stateNTJ, 'West', 'NT');
  console.log(`Holding [KD, JD, 10D, 3D] against NT -> Lead: ${leadJ.id}`);
  assert(leadJ.id === 'JD', `Expected JD interior sequence lead from K-J-10, got ${leadJ.id}`);

  // Scenario 3: A-Q-J-2 in Spades -> Must lead Queen!
  const stateNTQ = createMockGameState({
    hands: {
      West: [
        { id: 'AS', rank: 'A', suit: 'S' },
        { id: 'QS', rank: 'Q', suit: 'S' },
        { id: 'JS', rank: 'J', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '3H', rank: '3', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
        { id: '5C', rank: '5', suit: 'C' },
        { id: '3C', rank: '3', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'NT',
    currentTrick: [],
  });
  const leadQ = getGrandmasterOpeningLead(stateNTQ, 'West', 'NT');
  console.log(`Holding [AS, QS, JS, 2S] against NT -> Lead: ${leadQ.id}`);
  assert(leadQ.id === 'QS', `Expected QS interior sequence lead from A-Q-J, got ${leadQ.id}`);
  console.log('✓ All NT interior sequences (10 from A-10-9, J from K-J-10, Q from A-Q-J) verified.');

  // Test 3B: NT Defense - Touching Honors and 4th-Highest
  console.log('-> Subtest 3B: NT Defense - Touching Sequence & 4th-Highest...');
  // Scenario 4: K-Q-J-4 in Clubs -> Lead King!
  const stateNTKQJ = createMockGameState({
    hands: {
      West: [
        { id: 'KC', rank: 'K', suit: 'C' },
        { id: 'QC', rank: 'Q', suit: 'C' },
        { id: 'JC', rank: 'J', suit: 'C' },
        { id: '4C', rank: '4', suit: 'C' },
        { id: '4S', rank: '4', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '3H', rank: '3', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'NT',
    currentTrick: [],
  });
  const leadKQJ = getGrandmasterOpeningLead(stateNTKQJ, 'West', 'NT');
  console.log(`Holding [KC, QC, JC, 4C] against NT -> Lead: ${leadKQJ.id}`);
  assert(leadKQJ.id === 'KC', `Expected KC touching sequence lead, got ${leadKQJ.id}`);

  // Scenario 5: K-8-6-3 in Spades (no sequence) + 3-3-3 elsewhere -> 4th highest (3S)
  const stateNT4th = createMockGameState({
    hands: {
      West: [
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: '8S', rank: '8', suit: 'S' },
        { id: '6S', rank: '6', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '3H', rank: '3', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
        { id: '4C', rank: '4', suit: 'C' },
        { id: '3C', rank: '3', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'NT',
    currentTrick: [],
  });
  const lead4th = getGrandmasterOpeningLead(stateNT4th, 'West', 'NT');
  console.log(`Holding [KS, 8S, 6S, 3S] against NT -> Lead: ${lead4th.id}`);
  assert(lead4th.id === '3S', `Expected 4th-highest 3S from longest/strongest suit, got ${lead4th.id}`);
  console.log('✓ NT touching honors sequence (K from K-Q-J) and 4th-highest verified.');

  // Test 3C: Suit Contract Defense - Touching Honors in Side Suits
  console.log('-> Subtest 3C: Suit Defense - Touching Honors (K from A-K, Q from Q-J)...');
  // Scenario 6: Defending against Spades trump. Hand holds A-K-4 in Clubs.
  // Standard bridge lead: King from Ace-King!
  const stateSuitAK = createMockGameState({
    hands: {
      West: [
        { id: 'AC', rank: 'A', suit: 'C' },
        { id: 'KC', rank: 'K', suit: 'C' },
        { id: '4C', rank: '4', suit: 'C' },
        { id: '5S', rank: '5', suit: 'S' },
        { id: '4S', rank: '4', suit: 'S' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '3H', rank: '3', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '5D', rank: '5', suit: 'D' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
        { id: '7S', rank: '7', suit: 'S' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'S',
    currentTrick: [],
  });
  const leadAK = getGrandmasterOpeningLead(stateSuitAK, 'West', 'S');
  console.log(`Defending Spades trump, holding [AC, KC, 4C] -> Lead: ${leadAK.id}`);
  assert(leadAK.id === 'KC', `Expected King from Ace-King lead (KC), got ${leadAK.id}`);

  // Scenario 7: Defending Spades trump. Hand holds Q-J-5 in Hearts.
  const stateSuitQJ = createMockGameState({
    hands: {
      West: [
        { id: 'QH', rank: 'Q', suit: 'H' },
        { id: 'JH', rank: 'J', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
        { id: '5S', rank: '5', suit: 'S' },
        { id: '4S', rank: '4', suit: 'S' },
        { id: '4C', rank: '4', suit: 'C' },
        { id: '3C', rank: '3', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
        { id: '5D', rank: '5', suit: 'D' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
        { id: '7S', rank: '7', suit: 'S' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'S',
    currentTrick: [],
  });
  const leadQJ = getGrandmasterOpeningLead(stateSuitQJ, 'West', 'S');
  console.log(`Defending Spades trump, holding [QH, JH, 5H] -> Lead: ${leadQJ.id}`);
  assert(leadQJ.id === 'QH', `Expected Queen from Queen-Jack lead (QH), got ${leadQJ.id}`);
  console.log('✓ Suit touching honors (K from A-K, Q from Q-J) verified.');

  // Test 3D: Suit Contract Defense - Singleton Lead with Side Trumps
  console.log('-> Subtest 3D: Suit Defense - Singleton Lead for Immediate Ruff...');
  // Scenario 8: Defending Spades trump. Hand has 2 small trumps [6S, 4S], singleton 7C, and balanced losers elsewhere.
  const stateSingleton = createMockGameState({
    hands: {
      West: [
        { id: '7C', rank: '7', suit: 'C' }, // Singleton spot card!
        { id: '6S', rank: '6', suit: 'S' }, // Side trumps to ruff!
        { id: '4S', rank: '4', suit: 'S' },
        { id: '8H', rank: '8', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '7D', rank: '7', suit: 'D' },
        { id: '6D', rank: '6', suit: 'D' },
        { id: '5D', rank: '5', suit: 'D' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'S',
    currentTrick: [],
  });
  const leadSingle = getGrandmasterOpeningLead(stateSingleton, 'West', 'S');
  console.log(`Defending Spades trump with side trumps & singleton 7C -> Lead: ${leadSingle.id}`);
  assert(leadSingle.id === '7C', `Expected singleton lead 7C to set up ruff, got ${leadSingle.id}`);
  console.log('✓ Singleton lead with side trumps verified.');

  // Test 3E: Avoid Leading Away from Unsupported Honors (Tenace Avoidance)
  console.log('-> Subtest 3E: Tenace Avoidance - Avoid Leading Away from Unsupported Honors...');
  // Scenario 9: Defending Spades trump. No touching honors, no singleton.
  // Clubs has unsupported King: [KC, 5C, 2C]. Leading a low club plays into declarer's AQ tenace.
  // Hearts has passive cards: [8H, 6H, 4H, 2H].
  // The bot MUST avoid leading away from unsupported King in Clubs, and choose the safe/passive suit.
  const stateTenace = createMockGameState({
    hands: {
      West: [
        { id: 'KC', rank: 'K', suit: 'C' }, // Unsupported King!
        { id: '5C', rank: '5', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
        { id: '8H', rank: '8', suit: 'H' }, // Safe / passive cards
        { id: '6H', rank: '6', suit: 'H' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '6D', rank: '6', suit: 'D' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '5S', rank: '5', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'S',
    currentTrick: [],
  });
  const leadTenace = getGrandmasterOpeningLead(stateTenace, 'West', 'S');
  console.log(`With unsupported King in Clubs [KC, 5C, 2C] vs passive Hearts/Diamonds -> Lead: ${leadTenace.id}`);
  assert(
    leadTenace.suit !== 'C',
    `Expected bot to avoid leading unsupported Club into declarer's tenace, but got ${leadTenace.id}`
  );
  console.log('✓ Bot safely avoids leading away from unsupported honors into declarer tenaces.');
}

// ============================================================================
// SUITE 4: Full SuperBot Integration (Opening Lead, Signals, & Follow-up)
// ============================================================================
function testSuperBotIntegration() {
  console.log('\n============================================================');
  console.log('🧪 SUITE 4: Full SuperBot Integration');
  console.log('============================================================');

  // Test 4A: getSuperBotCardPlay invokes Grandmaster Opening Lead on Trick 1
  console.log('-> Subtest 4A: Trick 1 Opening Lead via getSuperBotCardPlay...');
  const stateLead = createMockGameState({
    hands: {
      West: [
        { id: 'AH', rank: 'A', suit: 'H' },
        { id: '10H', rank: '10', suit: 'H' },
        { id: '9H', rank: '9', suit: 'H' },
        { id: '4H', rank: '4', suit: 'H' },
        { id: '5S', rank: '5', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
        { id: '4D', rank: '4', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '2D', rank: '2', suit: 'D' },
        { id: '5C', rank: '5', suit: 'C' },
        { id: '3C', rank: '3', suit: 'C' },
        { id: '2C', rank: '2', suit: 'C' },
      ],
    },
    declarer: 'North',
    trumpSuit: 'NT',
    currentTrick: [],
    currentTurn: 'West',
    tricksHistory: [],
  });
  const leadPlayed = getSuperBotCardPlay(stateLead, 'West', 'NT');
  console.log(`getSuperBotCardPlay opening lead against NT: ${leadPlayed.id}`);
  assert(leadPlayed.id === '10H', `Expected 10H interior sequence opening lead, got ${leadPlayed.id}`);
  console.log('✓ getSuperBotCardPlay seamlessly dispatches Grandmaster opening lead on trick 1.');

  // Test 4B: Continuing Partner's Encouraged Suit on Trick 2 Lead
  console.log('-> Subtest 4B: Continuation of Partner\'s Encouraged Suit on Subsequent Lead...');
  // Trick 1: South led AH, North (partner) encouraged with 9H.
  // Trick 2: South is on lead. South holds KH and cards in other suits.
  // South MUST continue Hearts to cash or establish partner's suit!
  const stateContinuation = createMockGameState({
    hands: {
      South: [
        { id: 'KH', rank: 'K', suit: 'H' },
        { id: '3H', rank: '3', suit: 'H' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '7D', rank: '7', suit: 'D' },
        { id: '6C', rank: '6', suit: 'C' },
        { id: '5C', rank: '5', suit: 'C' },
      ],
    },
    currentTrick: [],
    currentTurn: 'South',
    declarer: 'West',
    trumpSuit: 'NT',
    tricksHistory: [
      mockTrick(
        1,
        'South',
        'H',
        [
          { seat: 'South', card: { id: 'AH', rank: 'A', suit: 'H' } },
          { seat: 'West', card: { id: '4H', rank: '4', suit: 'H' } },
          { seat: 'North', card: { id: '9H', rank: '9', suit: 'H' } }, // Partner encouraged!
          { seat: 'East', card: { id: '2H', rank: '2', suit: 'H' } },
        ],
        'South',
        { id: 'AH', rank: 'A', suit: 'H' }
      ),
    ],
  });
  const continuationPlay = getSuperBotCardPlay(stateContinuation, 'South', 'NT');
  console.log(`Partner encouraged Hearts on Trick 1 -> South leads: ${continuationPlay.id}`);
  assert(
    continuationPlay.suit === 'H',
    `Expected South to continue partner's encouraged Heart suit, but got ${continuationPlay.id}`
  );
  console.log('✓ Bot faithfully obeys partner\'s attitude signal and continues encouraged suit.');

  // Test 4C: Leading Partner's Void Suit in Suit Contract for Ruff
  console.log('-> Subtest 4C: Leading Partner\'s Void Suit in Suit Contract for Ruff...');
  // Trick 1: Clubs led. North (partner) showed void in Clubs by discarding a Diamond.
  // North still holds trumps. South is on lead with Club loser.
  // South leads Club to give North an immediate ruff!
  const stateRuff = createMockGameState({
    hands: {
      South: [
        { id: '5C', rank: '5', suit: 'C' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '7D', rank: '7', suit: 'D' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
      ],
      North: [
        { id: 'AS', rank: 'A', suit: 'S' }, // North holds trumps
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '7D', rank: '7', suit: 'D' },
        { id: '6D', rank: '6', suit: 'D' },
      ],
    },
    currentTrick: [],
    currentTurn: 'South',
    declarer: 'East',
    trumpSuit: 'S',
    tricksHistory: [
      mockTrick(
        1,
        'East',
        'C',
        [
          { seat: 'East', card: { id: 'KC', rank: 'K', suit: 'C' } },
          { seat: 'South', card: { id: 'AC', rank: 'A', suit: 'C' } },
          { seat: 'West', card: { id: '2C', rank: '2', suit: 'C' } },
          { seat: 'North', card: { id: '2D', rank: '2', suit: 'D' } }, // North void in Clubs!
        ],
        'South',
        { id: 'AC', rank: 'A', suit: 'C' }
      ),
    ],
  });
  const ruffPlay = getSuperBotCardPlay(stateRuff, 'South', 'S');
  console.log(`North is void in Clubs with trumps -> South leads: ${ruffPlay.id}`);
  assert(
    ruffPlay.suit === 'C',
    `Expected South to lead Clubs to give void partner a ruff, but got ${ruffPlay.id}`
  );
  console.log('✓ Bot leads partner\'s void suit in suit contract for a ruff.');
}

// ============================================================================
// SUITE 5: Robust Defensive Heuristics, Honor Preservation & Second-Hand Play
// ============================================================================
function testRobustDefenseAndSignals() {
  console.log('\n============================================================');
  console.log('🧪 SUITE 5: Robust Defensive Heuristics & Second-Hand Play');
  console.log('============================================================');

  // Test 5A: Second-Hand Low on spot lead
  console.log('-> Subtest 5A: Second-Hand Low on spot lead...');
  const stateSecondHandLow = createMockGameState({
    declarer: 'West',
    trumpSuit: 'S',
    currentTrick: [
      { seat: 'West', card: { id: '3H', rank: '3', suit: 'H' } },
    ],
    hands: {
      North: [
        { id: 'KH', rank: 'K', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '7D', rank: '7', suit: 'D' },
        { id: '6D', rank: '6', suit: 'D' },
        { id: '5D', rank: '5', suit: 'D' },
        { id: '4D', rank: '4', suit: 'D' },
      ],
    },
    cardsCount: { North: 7, West: 6, South: 7, East: 7 },
  });
  const play2ndLow = getSuperBotCardPlay(stateSecondHandLow, 'North', 'S');
  console.log(`West leads 3H, North holds [KH, 2H] -> North plays: ${play2ndLow.id}`);
  assert(
    play2ndLow.id === '2H',
    `Expected Second-Hand Low (2H) to preserve King, but got ${play2ndLow.id}`
  );
  console.log('✓ Second Hand Low verified (conserved unsupported honor, avoided honor suicide).');

  // Test 5B: Second-Hand Covering Honor with Honor
  console.log('-> Subtest 5B: Second-Hand Covering Honor with Honor...');
  const stateSecondHandCover = createMockGameState({
    declarer: 'West',
    trumpSuit: 'S',
    currentTrick: [
      { seat: 'West', card: { id: 'QH', rank: 'Q', suit: 'H' } },
    ],
    hands: {
      North: [
        { id: 'KH', rank: 'K', suit: 'H' },
        { id: '2H', rank: '2', suit: 'H' },
        { id: '8D', rank: '8', suit: 'D' },
        { id: '7D', rank: '7', suit: 'D' },
        { id: '6D', rank: '6', suit: 'D' },
        { id: '5D', rank: '5', suit: 'D' },
        { id: '4D', rank: '4', suit: 'D' },
      ],
    },
    cardsCount: { North: 7, West: 6, South: 7, East: 7 },
  });
  const play2ndCover = getSuperBotCardPlay(stateSecondHandCover, 'North', 'S');
  console.log(`West leads QH, North holds [KH, 2H] -> North covers with: ${play2ndCover.id}`);
  assert(
    play2ndCover.id === 'KH',
    `Expected North to cover Queen with King, but got ${play2ndCover.id}`
  );
  console.log('✓ Cover honor with honor verified.');

  // Test 5C: 4th-Hand Discard Conservation Under Partner's Winning Ace
  console.log('-> Subtest 5C: 4th-Hand Discard Conservation under Partner\'s Winning Ace...');
  const stateFourthHandDiscard = createMockGameState({
    declarer: 'North',
    trumpSuit: 'S',
    currentTrick: [
      { seat: 'East', card: { id: '4D', rank: '4', suit: 'D' } },
      { seat: 'North', card: { id: 'AD', rank: 'A', suit: 'D' } },
      { seat: 'West', card: { id: '5D', rank: '5', suit: 'D' } },
    ],
    hands: {
      South: [
        { id: '2S', rank: '2', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '8H', rank: '8', suit: 'H' },
        { id: '9H', rank: '9', suit: 'H' },
        { id: '10H', rank: '10', suit: 'H' },
        { id: 'JC', rank: 'J', suit: 'C' },
        { id: 'QC', rank: 'Q', suit: 'C' },
      ],
    },
    cardsCount: { North: 6, West: 6, South: 7, East: 6 },
  });
  const play4thDiscard = getSuperBotCardPlay(stateFourthHandDiscard, 'South', 'S');
  console.log(`Partner won with AD, South void in D holds [2S, 3S, 8H, 9H...] -> South plays: ${play4thDiscard.id}`);
  assert(
    play4thDiscard.suit !== 'S',
    `Expected South to discard off-suit loser, but ruffed partner's Ace with ${play4thDiscard.id}`
  );
  console.log('✓ 4th Hand discard conservation verified (trumps preserved, never overruffs partner).');

  // Test 5D: NT Defense Lead on Trick 2+ (Interior Sequences)
  console.log('-> Subtest 5D: NT Defense Lead on Trick 2+...');
  const stateNTTrick2 = createMockGameState({
    declarer: 'East',
    trumpSuit: 'NT',
    currentTrick: [],
    tricksHistory: [
      mockTrick(
        1,
        'East',
        'C',
        [
          { seat: 'East', card: { id: '4C', rank: '4', suit: 'C' } },
          { seat: 'South', card: { id: 'AC', rank: 'A', suit: 'C' } },
          { seat: 'West', card: { id: '2C', rank: '2', suit: 'C' } },
          { seat: 'North', card: { id: '3C', rank: '3', suit: 'C' } },
        ],
        'South',
        { id: 'AC', rank: 'A', suit: 'C' }
      ),
    ],
    hands: {
      South: [
        { id: 'KD', rank: 'K', suit: 'D' },
        { id: 'JD', rank: 'J', suit: 'D' },
        { id: '10D', rank: '10', suit: 'D' },
        { id: '3D', rank: '3', suit: 'D' },
        { id: '8H', rank: '8', suit: 'H' },
        { id: '7H', rank: '7', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
      ],
    },
    cardsCount: { North: 6, West: 6, South: 7, East: 6 },
  });
  const playNTLead = getSuperBotCardPlay(stateNTTrick2, 'South', 'NT');
  console.log(`South leads Trick 2 defending against NT with [KD, JD, 10D, 3D] -> South leads: ${playNTLead.id}`);
  assert(
    playNTLead.id === 'JD',
    `Expected South to lead interior sequence JD against NT on Trick 2, got ${playNTLead.id}`
  );
  console.log('✓ NT Defense Lead on Trick 2 verified.');

  // Test 5E: Count Signal Isolates Trick-Taking Honors
  console.log('-> Subtest 5E: Count Signal Isolates Trick-Taking Honors...');
  const stateCountWithHonor = createMockGameState({
    tricksHistory: [
      mockTrick(
        1,
        'East',
        'H',
        [
          { seat: 'East', card: { id: '4H', rank: '4', suit: 'H' } },
          { seat: 'South', card: { id: '5H', rank: '5', suit: 'H' } },
          { seat: 'West', card: { id: '3H', rank: '3', suit: 'H' } },
          { seat: 'North', card: { id: 'KH', rank: 'K', suit: 'H' } }, // North won with King!
        ],
        'North',
        { id: 'KH', rank: 'K', suit: 'H' }
      ),
      mockTrick(
        2,
        'North',
        'H',
        [
          { seat: 'North', card: { id: '2H', rank: '2', suit: 'H' } },
          { seat: 'East', card: { id: 'AH', rank: 'A', suit: 'H' } },
          { seat: 'South', card: { id: '6H', rank: '6', suit: 'H' } },
          { seat: 'West', card: { id: '7H', rank: '7', suit: 'H' } },
        ],
        'East',
        { id: 'AH', rank: 'A', suit: 'H' }
      ),
    ],
  });
  const countHonorCheck = interpretPartnerCount(stateCountWithHonor, 'South', 'H');
  assert(
    countHonorCheck === 'unknown',
    `Expected 'unknown' because King is an honor, not an echo spot, but got ${countHonorCheck}`
  );
  console.log('✓ Count signal correctly ignores trick-taking honors.');

  // Test 5F: Discard Interpretation with 1 Side Suit Remaining
  console.log('-> Subtest 5F: Discard Interpretation with 1 Side Suit Remaining...');
  const stateSingleSideSuit = createMockGameState({
    declarer: 'East',
    trumpSuit: 'S',
    tricksHistory: [
      mockTrick(
        1,
        'East',
        'H',
        [
          { seat: 'East', card: { id: 'AH', rank: 'A', suit: 'H' } },
          { seat: 'South', card: { id: '3H', rank: '3', suit: 'H' } },
          { seat: 'West', card: { id: '4H', rank: '4', suit: 'H' } },
          { seat: 'North', card: { id: '9D', rank: '9', suit: 'D' } }, // Discarded Diamonds. Trump is S, led is H -> only C remains!
        ],
        'East',
        { id: 'AH', rank: 'A', suit: 'H' }
      ),
    ],
  });
  const decodedSingle = interpretPartnerDiscard(stateSingleSideSuit, 'South', 'S');
  console.log(`Partner discarded 9D on Heart lead with Spade trump -> decoded preference: ${decodedSingle}`);
  assert(
    decodedSingle === 'C',
    `Expected sole outside suit 'C', got ${decodedSingle}`
  );
  console.log('✓ Discard preference correctly identifies sole outside suit.');
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function runAllIntelligenceTests() {
  console.log('============================================================');
  console.log('🚀 RUNNING SUPERBOT INTELLIGENCE UPGRADE TEST SUITE');
  console.log('============================================================');

  const start = Date.now();
  testBayesianHandReconstruction();
  testPartnershipSignaling();
  testGrandmasterOpeningLeads();
  testSuperBotIntegration();
  testRobustDefenseAndSignals();

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log('\n============================================================');
  console.log(`🎉 ALL 5 INTELLIGENCE TEST SUITES PASSED IN ${elapsed}s!`);
  console.log('============================================================\n');
}

runAllIntelligenceTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
