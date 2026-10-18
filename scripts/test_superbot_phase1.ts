import {
  Card,
  GameState,
  Seat,
  TrumpSuit,
} from '../src/types.ts';
import {
  createInitialGameState,
  startDealRound,
  evaluateTrickWinner,
  SEATS,
} from '../src/logic/gameLogic.ts';
import {
  getSuperBotCardPlay,
  getSuperBotBid,
  solveMicroDDS,
  getMicroDDSCardPlay,
  sampleConsistentDeals,
} from '../src/logic/superBot.ts';
import {
  getActiveBotPolicy,
  saveBotPolicy,
  loadBotPolicy,
} from '../src/data/botPolicy.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  let state = createInitialGameState('North');
  state = startDealRound(state, 'North');
  return {
    ...state,
    phase: 'playing',
    trumpSuit: 'S',
    ...overrides,
  };
}

// -------------------------------------------------------------
// TEST 1: Third-Hand Ducking Bug Fix Verification
// -------------------------------------------------------------
function testThirdHandHigh() {
  console.log('\n--- Running Test 1: Third-Hand High vs Ducking Bug ---');

  // Scenario 1: Partner leads low (5 of Spades), 2nd hand plays 2 of Spades.
  // 3rd hand (South) holds KS and 3S. 4th hand (East) has not played yet.
  const state1 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '7H', rank: '7', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' }, // hand length 5 to test heuristic branch
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'North', card: { id: '5S', rank: '5', suit: 'S' } },
      { seat: 'West', card: { id: '2S', rank: '2', suit: 'S' } },
    ],
    trumpSuit: 'NT', // No Trump contract
    currentTurn: 'South',
  });

  const cardPlayed1 = getSuperBotCardPlay(state1, 'South', 'NT');
  console.log(`Scenario 1 (Partner leads 5S, 2nd hand 2S, 3rd hand holds KS, 3S):`);
  console.log(`-> SuperBot played: ${cardPlayed1.rank}${cardPlayed1.suit}`);
  assert(
    cardPlayed1.id === 'KS',
    `Expected Third-Hand High (KS), but got ${cardPlayed1.id}! Bug: Bot ducked when partner was momentarily winning.`
  );
  console.log('✓ Third Hand High correctly played KS to prevent 4th hand winning cheaply!');

  // Scenario 2: Partner leads Ace (AS), 2nd hand plays 2S.
  // Partner's card is an Ace (unbeatable in suit).
  // South holds KS and 3S. Bot should NOT waste King on partner's Ace!
  const state2 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '7H', rank: '7', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'North', card: { id: 'AS', rank: 'A', suit: 'S' } },
      { seat: 'West', card: { id: '2S', rank: '2', suit: 'S' } },
    ],
    trumpSuit: 'NT',
    currentTurn: 'South',
  });

  const cardPlayed2 = getSuperBotCardPlay(state2, 'South', 'NT');
  console.log(`Scenario 2 (Partner leads AS, 2nd hand 2S, 3rd hand holds KS, 3S):`);
  console.log(`-> SuperBot played: ${cardPlayed2.rank}${cardPlayed2.suit}`);
  assert(
    cardPlayed2.id === '3S',
    `Expected low duck (3S) on partner's Ace, but got ${cardPlayed2.id}! Honor wasted!`
  );
  console.log('✓ Bot correctly conserved King and ducked 3S under partner\'s Ace!');

  // Scenario 3: 4th hand (trick.length === 3), partner is already winning trick.
  // South holds KS and 3S. No more opponents to play!
  const state3 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '7H', rank: '7', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'West', card: { id: '4S', rank: '4', suit: 'S' } },
      { seat: 'North', card: { id: 'QS', rank: 'Q', suit: 'S' } },
      { seat: 'East', card: { id: '2S', rank: '2', suit: 'S' } },
    ],
    trumpSuit: 'NT',
    currentTurn: 'South',
  });

  const cardPlayed3 = getSuperBotCardPlay(state3, 'South', 'NT');
  console.log(`Scenario 3 (4th hand, partner QS winning over 4S and 2S):`);
  console.log(`-> SuperBot played: ${cardPlayed3.rank}${cardPlayed3.suit}`);
  assert(
    cardPlayed3.id === '3S',
    `Expected duck (3S) when partner won trick at 4th hand, but got ${cardPlayed3.id}!`
  );
  console.log('✓ Bot correctly ducked with 3S at 4th hand when partner secured trick!');

  // Scenario 4: Partner leads King (KS), West plays 2S. South holds AS and 3S.
  // Partner's King is winning. Bot holding Ace guarantees 4th hand cannot beat King.
  // Bot should NOT waste Ace on partner's King!
  const state4 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'AS', rank: 'A', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '7H', rank: '7', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'North', card: { id: 'KS', rank: 'K', suit: 'S' } },
      { seat: 'West', card: { id: '2S', rank: '2', suit: 'S' } },
    ],
    trumpSuit: 'NT',
    currentTurn: 'South',
  });
  const cardPlayed4 = getSuperBotCardPlay(state4, 'South', 'NT');
  console.log(`Scenario 4 (Partner leads KS, West 2S, South holds AS, 3S):`);
  console.log(`-> SuperBot played: ${cardPlayed4.rank}${cardPlayed4.suit}`);
  assert(
    cardPlayed4.id === '3S',
    `Expected duck (3S) on partner's King, but got ${cardPlayed4.id}! Ace squandered on partner King!`
  );
  console.log('✓ Bot correctly conserved Ace and ducked 3S under partner\'s King!');

  // Scenario 5: Trump is Spades. Partner leads 5H, West plays 2H.
  // South is VOID in Hearts, holds AS, 2S, 7C.
  // South ruffs with CHEAPEST trump (2S), not the master Ace of trumps!
  const state5 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'AS', rank: 'A', suit: 'S' },
        { id: '2S', rank: '2', suit: 'S' },
        { id: '7C', rank: '7', suit: 'C' },
        { id: '6C', rank: '6', suit: 'C' },
        { id: '5C', rank: '5', suit: 'C' },
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'North', card: { id: '5H', rank: '5', suit: 'H' } },
      { seat: 'West', card: { id: '2H', rank: '2', suit: 'H' } },
    ],
    trumpSuit: 'S',
    currentTurn: 'South',
  });
  const cardPlayed5 = getSuperBotCardPlay(state5, 'South', 'S');
  console.log(`Scenario 5 (Void in Hearts, holds AS, 2S, trump S):`);
  console.log(`-> SuperBot played: ${cardPlayed5.rank}${cardPlayed5.suit}`);
  assert(
    cardPlayed5.id === '2S',
    `Expected cheapest trump (2S), but got ${cardPlayed5.id}! Ace of trumps squandered on ruff!`
  );
  console.log('✓ Bot correctly ruffed with cheapest trump (2S) to protect master trump (AS)!');

  // Scenario 6: Partner leads 5S, West plays JS. South holds QS, KS.
  // South covers opponent JS with CHEAPEST winning honor (QS), conserving KS!
  const state6 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'KS', rank: 'K', suit: 'S' },
        { id: 'QS', rank: 'Q', suit: 'S' },
        { id: '7H', rank: '7', suit: 'H' },
        { id: '6H', rank: '6', suit: 'H' },
        { id: '5H', rank: '5', suit: 'H' },
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'North', card: { id: '5S', rank: '5', suit: 'S' } },
      { seat: 'West', card: { id: 'JS', rank: 'J', suit: 'S' } },
    ],
    trumpSuit: 'NT',
    currentTurn: 'South',
  });
  const cardPlayed6 = getSuperBotCardPlay(state6, 'South', 'NT');
  console.log(`Scenario 6 (West JS, South holds QS, KS):`);
  console.log(`-> SuperBot played: ${cardPlayed6.rank}${cardPlayed6.suit}`);
  assert(
    cardPlayed6.id === 'QS',
    `Expected cheapest winning card (QS) covering opponent, but got ${cardPlayed6.id}!`
  );
  console.log('✓ Bot correctly covered West JS with QS, preserving King!');

  // Scenario 7: Partner leads 5S, West plays 2S. South holds QS, JS, 10S, 3S (touching sequence).
  // Bridge Third Hand High with touching honors plays lowest of touching honors (10S).
  const state7 = createMockGameState({
    hands: {
      North: [{ id: '9C', rank: '9', suit: 'C' }],
      West: [{ id: '8C', rank: '8', suit: 'C' }],
      South: [
        { id: 'QS', rank: 'Q', suit: 'S' },
        { id: 'JS', rank: 'J', suit: 'S' },
        { id: '10S', rank: '10', suit: 'S' },
        { id: '3S', rank: '3', suit: 'S' },
        { id: '5H', rank: '5', suit: 'H' },
      ],
      East: [{ id: 'AC', rank: 'A', suit: 'C' }],
    },
    currentTrick: [
      { seat: 'North', card: { id: '5S', rank: '5', suit: 'S' } },
      { seat: 'West', card: { id: '2S', rank: '2', suit: 'S' } },
    ],
    trumpSuit: 'NT',
    currentTurn: 'South',
  });
  const cardPlayed7 = getSuperBotCardPlay(state7, 'South', 'NT');
  console.log(`Scenario 7 (Touching sequence Q-J-10):`);
  console.log(`-> SuperBot played: ${cardPlayed7.rank}${cardPlayed7.suit}`);
  assert(
    cardPlayed7.id === '10S',
    `Expected lowest of touching honors (10S), but got ${cardPlayed7.id}!`
  );
  console.log('✓ Bot correctly played lowest of touching honors (10S) in Third Hand High!');
}

// -------------------------------------------------------------
// TEST 2: policy.biddingMatrix Wiring Verification
// -------------------------------------------------------------
function testBiddingMatrixWiring() {
  console.log('\n--- Running Test 2: policy.biddingMatrix Wiring into getSuperBotBid ---');

  const policy = getActiveBotPolicy();
  const originalSuitThreshold = { ...policy.biddingMatrix['1_Suit'] };

  try {
    // Hand with 10 HCP and 5 Spades (AKJxx = 4+3+1 = 8... let's make exact 10 HCP)
    // S: A J 10 9 8 (5 cards, 4+1 = 5 HCP)
    // H: K Q 2 (3 cards, 3+2 = 5 HCP)
    // D: 5 4 3 (3 cards)
    // C: 3 2 (2 cards)
    // Total HCP = 10, Spades count = 5.
    const hand10HCP: Card[] = [
      { id: 'AS', rank: 'A', suit: 'S' },
      { id: 'JS', rank: 'J', suit: 'S' },
      { id: '10S', rank: '10', suit: 'S' },
      { id: '9S', rank: '9', suit: 'S' },
      { id: '8S', rank: '8', suit: 'S' },
      { id: 'KH', rank: 'K', suit: 'H' },
      { id: 'QH', rank: 'Q', suit: 'H' },
      { id: '2H', rank: '2', suit: 'H' },
      { id: '5D', rank: '5', suit: 'D' },
      { id: '4D', rank: '4', suit: 'D' },
      { id: '3D', rank: '3', suit: 'D' },
      { id: '3C', rank: '3', suit: 'C' },
      { id: '2C', rank: '2', suit: 'C' },
    ];

    const stateOpening = createInitialGameState('North');
    stateOpening.phase = 'bidding';
    stateOpening.hands.North = hand10HCP;
    stateOpening.currentBidder = 'North';

    // Case A: With standard minHCP = 10 in matrix, bot opens 1 Suit
    policy.biddingMatrix['1_Suit'].minHCP = 10;
    saveBotPolicy(policy);

    const bidWith10 = getSuperBotBid(stateOpening, 'North');
    console.log(`Bidding with 10 HCP when matrix minHCP=10:`, bidWith10);
    assert(
      bidWith10.type === 'bid' && bidWith10.level === 1 && bidWith10.contractType === 'Suit',
      `Expected 1 Suit bid with minHCP=10, got ${JSON.stringify(bidWith10)}`
    );
    console.log('✓ Bot correctly opened 1 Suit governed by matrix minHCP=10!');

    // Case B: Raise learned threshold to minHCP = 13 in matrix
    policy.biddingMatrix['1_Suit'].minHCP = 13;
    saveBotPolicy(policy);

    const bidWith13 = getSuperBotBid(stateOpening, 'North');
    console.log(`Bidding with 10 HCP when matrix minHCP=13:`, bidWith13);
    assert(
      bidWith13.type === 'pass',
      `Expected pass with minHCP=13 for 10 HCP hand, got ${JSON.stringify(bidWith13)}`
    );
    console.log('✓ Bot correctly responded to learned matrix threshold and passed with 10 HCP!');

  } finally {
    // Restore original policy
    policy.biddingMatrix['1_Suit'] = originalSuitThreshold;
    saveBotPolicy(policy);
  }
}

// -------------------------------------------------------------
// TEST 3: Exact Micro-DDS Solver Verification
// -------------------------------------------------------------
function testMicroDDSEndgame() {
  console.log('\n--- Running Test 3: Micro-DDS Alpha-Beta Solver ---');

  // Exact 2-trick endgame scenario:
  // Trump: No Trump
  // North: AS, 2H
  // West:  KS, 3H
  // South: 2S, AH
  // East:  QS, 4H
  // Team A (North-South) vs Team B (East-West)
  // North leads trick 12.
  // Optimal play for Team A:
  // If North leads AS -> wins trick 12 (+1).
  // Then North leads 2H at trick 13, South wins with AH (+1).
  // Team A wins 2 out of 2 tricks!
  const hands = {
    North: [
      { id: 'AS', rank: 'A' as const, suit: 'S' as const },
      { id: '2H', rank: '2' as const, suit: 'H' as const },
    ],
    West: [
      { id: 'KS', rank: 'K' as const, suit: 'S' as const },
      { id: '3H', rank: '3' as const, suit: 'H' as const },
    ],
    South: [
      { id: '2S', rank: '2' as const, suit: 'S' as const },
      { id: 'AH', rank: 'A' as const, suit: 'H' as const },
    ],
    East: [
      { id: 'QS', rank: 'Q' as const, suit: 'S' as const },
      { id: '4H', rank: '4' as const, suit: 'H' as const },
    ],
  };

  const tricks = solveMicroDDS(hands, 'NT', 'TeamA', 'North', [], 0, 2);
  console.log(`Micro-DDS solution for 2-trick deal (North lead, NT): ${tricks} tricks for Team A`);
  assert(tricks === 2, `Expected Micro-DDS to solve 2 tricks, got ${tricks}`);
  console.log('✓ Micro-DDS correctly calculated 2/2 minimax tricks for Team A!');

  // Test 3B: Endplay / Throw-in scenario
  // Spades trump:
  // North: KS, 4H
  // West:  AS, 5H
  // South: 2S, 6H
  // East:  3S, 7H
  // North leads. If North leads KS, West wins with AS and must lead into South's 6H / North's 4H.
  const hands2 = {
    North: [
      { id: 'KS', rank: 'K' as const, suit: 'S' as const },
      { id: '4H', rank: '4' as const, suit: 'H' as const },
    ],
    West: [
      { id: 'AS', rank: 'A' as const, suit: 'S' as const },
      { id: '5H', rank: '5' as const, suit: 'H' as const },
    ],
    South: [
      { id: '2S', rank: '2' as const, suit: 'S' as const },
      { id: 'AH', rank: 'A' as const, suit: 'H' as const },
    ],
    East: [
      { id: '3S', rank: '3' as const, suit: 'S' as const },
      { id: '7H', rank: '7' as const, suit: 'H' as const },
    ],
  };

  const tricks2 = solveMicroDDS(hands2, 'S', 'TeamA', 'North', [], 0, 2);
  console.log(`Micro-DDS solution for throw-in deal (North lead, Spades trump): ${tricks2} tricks`);
  assert(tricks2 === 1, `Expected 1 trick for Team A against AS, got ${tricks2}`);
  console.log('✓ Micro-DDS verified against optimal defense (Team B holds Ace of trumps)!');
}

// -------------------------------------------------------------
// TEST 4: Performance Benchmark of Micro-DDS
// -------------------------------------------------------------
function testMicroDDSPerformance() {
  console.log('\n--- Running Test 4: Micro-DDS Speed Benchmark (100 random 4-card deals) ---');

  const suits = ['S', 'H', 'D', 'C'] as const;
  const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

  const t0 = performance.now();
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    // 16 random cards (4 per player)
    const allCards: Card[] = [];
    for (const s of suits) {
      for (const r of ranks) {
        allCards.push({ id: `${r}${s}`, rank: r, suit: s });
      }
    }
    // Shuffle
    for (let j = allCards.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [allCards[j], allCards[k]] = [allCards[k], allCards[j]];
    }

    const hands = {
      North: allCards.slice(0, 4),
      West: allCards.slice(4, 8),
      South: allCards.slice(8, 12),
      East: allCards.slice(12, 16),
    };

    solveMicroDDS(hands, 'NT', 'TeamA', 'North', [], 0, 4);
  }

  const elapsedMs = performance.now() - t0;
  const avgPerSolveMs = elapsedMs / iterations;
  console.log(`Completed ${iterations} 4-card Double Dummy Solves in ${elapsedMs.toFixed(2)}ms`);
  console.log(`Average latency per solve: ${avgPerSolveMs.toFixed(3)}ms (Budget: <300ms)`);
  assert(avgPerSolveMs < 5.0, `Micro-DDS latency too high: ${avgPerSolveMs}ms`);
  console.log(`✓ Micro-DDS runs in ${(avgPerSolveMs * 1000).toFixed(0)} microseconds — blazing fast!`);
}

// -------------------------------------------------------------
// TEST 5: Micro-DDS Trump Preservation & Backtracking CSP Deals
// -------------------------------------------------------------
function testMicroDDSTieBreakerAndCSP() {
  console.log('\n--- Running Test 5: Micro-DDS Trump Preservation & Backtracking CSP ---');

  // Test 5A: Trump preservation on tie breaker
  // South holds 2S (trump) and 3H (non-trump loser). North leads AC, West plays 4C.
  // South is void in Clubs. Either card gives equal minimax score.
  // South MUST discard 3H (off-suit loser) to preserve 2S (trump).
  const stateTie = createMockGameState({
    hands: {
      North: [{ id: 'AC', rank: 'A', suit: 'C' }, { id: 'KC', rank: 'K', suit: 'C' }],
      West: [{ id: '4C', rank: '4', suit: 'C' }, { id: '5C', rank: '5', suit: 'C' }],
      South: [{ id: '2S', rank: '2', suit: 'S' }, { id: '3H', rank: '3', suit: 'H' }],
      East: [{ id: '6C', rank: '6', suit: 'C' }, { id: '7C', rank: '7', suit: 'C' }],
    },
    cardsCount: { North: 2, West: 2, South: 2, East: 2 },
    currentTrick: [
      { seat: 'North', card: { id: 'AC', rank: 'A', suit: 'C' } },
      { seat: 'West', card: { id: '4C', rank: '4', suit: 'C' } },
    ],
    trumpSuit: 'S',
    currentTurn: 'South',
  });

  const tiePlay = getSuperBotCardPlay(stateTie, 'South', 'S');
  console.log(`Tie-breaker play (2S trump vs 3H loser on AC lead): ${tiePlay.id}`);
  assert(
    tiePlay.id === '3H',
    `Expected bot to preserve trump (2S) and discard loser (3H), but got ${tiePlay.id}!`
  );
  console.log('✓ Micro-DDS tie-breaker correctly preserved trump and discarded off-suit loser!');

  // Test 5B: Backtracking CSP sampling respects multi-player voids without fallback
  const stateCSP = createMockGameState({
    hands: {
      North: [{ id: 'AS', rank: 'A', suit: 'S' }, { id: 'KS', rank: 'K', suit: 'S' }],
      West: [],
      South: [{ id: '2S', rank: '2', suit: 'S' }, { id: '3S', rank: '3', suit: 'S' }],
      East: [],
    },
    cardsCount: { North: 2, West: 2, South: 2, East: 2 },
    tricksHistory: [
      // West showed void in Hearts by playing a Spade on a Heart lead
      {
        trickNumber: 1,
        leader: 'North',
        winner: 'West',
        winningCard: { id: '4S', rank: '4', suit: 'S' },
        ledSuit: 'H',
        cards: [
          { seat: 'North', card: { id: 'KH', rank: 'K', suit: 'H' } },
          { seat: 'West', card: { id: '4S', rank: '4', suit: 'S' } },
          { seat: 'South', card: { id: 'QH', rank: 'Q', suit: 'H' } },
          { seat: 'East', card: { id: 'JH', rank: 'J', suit: 'H' } },
        ],
      },
    ],
    trumpSuit: 'S',
  });

  const sampled = sampleConsistentDeals(stateCSP, 'South', 5);
  console.log(`Sampled ${sampled.length} consistent worlds under void constraints.`);
  assert(sampled.length >= 1, 'Expected at least 1 sampled deal');
  for (const deal of sampled) {
    // West MUST have 0 Hearts
    const westHearts = deal.West.filter((c) => c.suit === 'H');
    assert(
      westHearts.length === 0,
      `CSP violation: West was assigned Hearts (${westHearts.map((c) => c.id).join(', ')}) despite confirmed void!`
    );
  }
  console.log('✓ Backtracking CSP deals strictly respected all confirmed player voids!');

  // Test 5C: Undefined cardsCount fallback robustness
  const stateNoCardsCount = createMockGameState({
    hands: {
      North: [{ id: 'AS', rank: 'A', suit: 'S' }],
      West: [{ id: 'KS', rank: 'K', suit: 'S' }],
      South: [{ id: '2S', rank: '2', suit: 'S' }],
      East: [{ id: 'QS', rank: 'Q', suit: 'S' }],
    },
  });
  delete (stateNoCardsCount as any).cardsCount;
  const noCardsCountDeals = sampleConsistentDeals(stateNoCardsCount, 'South', 1);
  assert(noCardsCountDeals.length > 0, 'Expected deals even without cardsCount property');
  console.log('✓ Gracefully handled missing cardsCount property without crashing!');
}

function runAll() {
  console.log('============================================================');
  console.log('🧪 VERIFYING PHASE 1 SUPER BOT ENHANCEMENTS');
  console.log('============================================================');
  testThirdHandHigh();
  testBiddingMatrixWiring();
  testMicroDDSEndgame();
  testMicroDDSPerformance();
  testMicroDDSTieBreakerAndCSP();
  console.log('\n============================================================');
  console.log('🎉 ALL UNIT TESTS & MATHEMATICAL SOLVER CHECKS PASSED!');
  console.log('============================================================\n');
}

runAll();
