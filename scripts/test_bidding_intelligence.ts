import { GameState, Card, Seat, Bid } from '../src/types.ts';
import { createInitialGameState } from '../src/logic/gameLogic.ts';
import { getSuperBotBid, analyzePartnerBiddingIntention } from '../src/logic/superBot.ts';
import { getBotBid } from '../src/logic/botAi.ts';

function makeCard(suit: 'S' | 'H' | 'D' | 'C', rank: any): Card {
  return { id: `${rank}${suit}`, suit, rank };
}

function createMockGameState(overrides?: Partial<GameState>): GameState {
  const base = createInitialGameState('South');
  return {
    ...base,
    phase: 'bidding',
    currentTurn: 'North',
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failed++;
  }
}

console.log('=== RUNNING PARTNERSHIP BIDDING INTELLIGENCE TESTS ===\n');

// -------------------------------------------------------------
// Test 1: Partner Intention Decoding
// -------------------------------------------------------------
{
  // Partner (South) opened 1_Suit
  const state = createMockGameState({
    auctionTurnsCount: 2,
    bids: [
      { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    highestBidder: 'West',
  });
  const intention = analyzePartnerBiddingIntention(state, 'North');
  assert(intention.intention === 'open_suit', 'South opening 1_Suit correctly identified as open_suit');
  assert(intention.estimatedAvgHCP >= 11, `South estimated HCP >= 11 (got ${intention.estimatedAvgHCP})`);
  assert(!intention.isWinning, 'Partner is not winning because West overbid');
}

// -------------------------------------------------------------
// Test 2: Partner Intention Decoding for Pass
// -------------------------------------------------------------
{
  const state = createMockGameState({
    auctionTurnsCount: 2,
    bids: [
      { seat: 'South', type: 'pass' },
      { seat: 'West', type: 'bid', level: 1, contractType: 'Suit' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 1, contractType: 'Suit' },
    highestBidder: 'West',
  });
  const intention = analyzePartnerBiddingIntention(state, 'North');
  assert(intention.intention === 'pass', 'South pass correctly identified as weak (<10 HCP)');
  assert(intention.estimatedAvgHCP <= 6.0, `South estimated HCP is low (got ${intention.estimatedAvgHCP})`);
}

// -------------------------------------------------------------
// Test 3: Upgrading Partner's 1 Suit to 1 NT (Doubled Scoring)
// North has 11 HCP balanced, South opened 1 Suit and is winning
// -------------------------------------------------------------
{
  const northHand: Card[] = [
    makeCard('S', 'K'), // 3
    makeCard('S', '8'),
    makeCard('H', 'Q'), // 2
    makeCard('H', '9'),
    makeCard('D', 'K'), // 3
    makeCard('D', 'J'), // 1
    makeCard('D', '8'),
    makeCard('C', 'Q'), // 2
    makeCard('C', '10'),
    makeCard('C', '7'),
    makeCard('S', '4'),
    makeCard('H', '5'),
    makeCard('D', '3'),
  ]; // Total HCP = 11, Balanced (3-3-4-3)

  const state = createMockGameState({
    dealer: 'South',
    auctionTurnsCount: 2,
    hands: { North: northHand, South: [], East: [], West: [] },
    bids: [
      { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'West', type: 'pass' },
    ],
    highestBid: { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' },
    highestBidder: 'South',
  });

  const superBotBid = getSuperBotBid(state, 'North');
  assert(
    superBotBid.type === 'bid' && superBotBid.level === 1 && superBotBid.contractType === 'NT',
    `SuperBot upgrades partner's 1 Suit to 1 NT for doubled points (got ${superBotBid.level} ${superBotBid.contractType})`
  );

  const botBid = getBotBid(state, 'North');
  assert(
    botBid.type === 'bid' && botBid.level === 1 && botBid.contractType === 'NT',
    `BotAi upgrades partner's 1 Suit to 1 NT for doubled points (got ${botBid.level} ${botBid.contractType})`
  );
}

// -------------------------------------------------------------
// Test 4: Raising Partner's 1 NT to 2 NT (+4 pts) with 10 HCP
// -------------------------------------------------------------
{
  const northHand: Card[] = [
    makeCard('S', 'K'), // 3
    makeCard('S', 'J'), // 1
    makeCard('H', 'K'), // 3
    makeCard('H', '8'),
    makeCard('D', 'Q'), // 2
    makeCard('D', '9'),
    makeCard('D', '5'),
    makeCard('C', 'J'), // 1
    makeCard('C', '10'),
    makeCard('C', '6'),
    makeCard('S', '3'),
    makeCard('H', '2'),
    makeCard('D', '2'),
  ]; // Total HCP = 10, Balanced

  const state = createMockGameState({
    dealer: 'South',
    auctionTurnsCount: 2,
    hands: { North: northHand, South: [], East: [], West: [] },
    bids: [
      { seat: 'South', type: 'bid', level: 1, contractType: 'NT' },
      { seat: 'West', type: 'pass' },
    ],
    highestBid: { seat: 'South', type: 'bid', level: 1, contractType: 'NT' },
    highestBidder: 'South',
  });

  const superBotBid = getSuperBotBid(state, 'North');
  assert(
    superBotBid.type === 'bid' && superBotBid.level === 2 && superBotBid.contractType === 'NT',
    `SuperBot raises partner's 1 NT to 2 NT (+4 pts) with 10 HCP (got ${superBotBid.level} ${superBotBid.contractType})`
  );

  const botBid = getBotBid(state, 'North');
  assert(
    botBid.type === 'bid' && botBid.level === 2 && botBid.contractType === 'NT',
    `BotAi raises partner's 1 NT to 2 NT with 10 HCP (got ${botBid.level} ${botBid.contractType})`
  );
}

// -------------------------------------------------------------
// Test 5: Protecting Partner's Contract (No Reckless Overbidding)
// Partner winning 1 Suit, Bot holds mediocre 9 HCP -> Must PASS!
// -------------------------------------------------------------
{
  const northHand: Card[] = [
    makeCard('S', 'K'), // 3
    makeCard('S', '8'),
    makeCard('H', 'Q'), // 2
    makeCard('H', '7'),
    makeCard('D', 'K'), // 3
    makeCard('D', '6'),
    makeCard('D', '4'),
    makeCard('C', 'J'), // 1
    makeCard('C', '9'),
    makeCard('C', '5'),
    makeCard('S', '2'),
    makeCard('H', '3'),
    makeCard('D', '2'),
  ]; // Total HCP = 9

  const state = createMockGameState({
    dealer: 'South',
    auctionTurnsCount: 2,
    hands: { North: northHand, South: [], East: [], West: [] },
    bids: [
      { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'West', type: 'pass' },
    ],
    highestBid: { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' },
    highestBidder: 'South',
  });

  const superBotBid = getSuperBotBid(state, 'North');
  assert(
    superBotBid.type === 'pass',
    `SuperBot passes to protect partner's 1 Suit contract (got ${superBotBid.type})`
  );

  const botBid = getBotBid(state, 'North');
  assert(
    botBid.type === 'pass',
    `BotAi passes to protect partner's 1 Suit contract (got ${botBid.type})`
  );
}

// -------------------------------------------------------------
// Test 6: Competing when Opponent Overbids Partner's Opening
// South opened 1 Suit, West overbid 2 Suit. North has 11 HCP and 4 Spades
// Combined HCP ~23 -> Team competes (2 NT or 3 Suit) instead of folding!
// -------------------------------------------------------------
{
  const northHand: Card[] = [
    makeCard('S', 'K'), // 3
    makeCard('S', 'Q'), // 2
    makeCard('S', '10'),
    makeCard('S', '4'),
    makeCard('H', 'K'), // 3
    makeCard('H', '8'),
    makeCard('D', 'K'), // 3
    makeCard('D', '6'),
    makeCard('C', '9'),
    makeCard('C', '7'),
    makeCard('C', '5'),
    makeCard('H', '3'),
    makeCard('D', '2'),
  ]; // Total HCP = 11, 4 Spades

  const state = createMockGameState({
    dealer: 'South',
    auctionTurnsCount: 2,
    hands: { North: northHand, South: [], East: [], West: [] },
    bids: [
      { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    highestBidder: 'West',
  });

  const superBotBid = getSuperBotBid(state, 'North');
  assert(
    superBotBid.type === 'bid',
    `SuperBot competes when opponent overbids partner's opening (got ${superBotBid.type} ${superBotBid.level} ${superBotBid.contractType})`
  );

  const botBid = getBotBid(state, 'North');
  assert(
    botBid.type === 'bid',
    `BotAi competes when opponent overbids partner's opening (got ${botBid.type} ${botBid.level} ${botBid.contractType})`
  );
}

// -------------------------------------------------------------
// Test 7: Conservative Discipline when Partner Passed
// South passed (<10 HCP). West bid 2 Suit. North has 10 HCP
// Combined HCP ~15 -> North MUST PASS to avoid being set!
// -------------------------------------------------------------
{
  const northHand: Card[] = [
    makeCard('S', 'K'), // 3
    makeCard('S', '9'),
    makeCard('S', '4'),
    makeCard('H', 'Q'), // 2
    makeCard('H', '8'),
    makeCard('D', 'K'), // 3
    makeCard('D', 'J'), // 1
    makeCard('D', '5'),
    makeCard('C', 'J'), // 1
    makeCard('C', '7'),
    makeCard('C', '3'),
    makeCard('H', '2'),
    makeCard('S', '2'),
  ]; // Total HCP = 10

  const state = createMockGameState({
    dealer: 'South',
    auctionTurnsCount: 2,
    hands: { North: northHand, South: [], East: [], West: [] },
    bids: [
      { seat: 'South', type: 'pass' },
      { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    highestBidder: 'West',
  });

  const superBotBid = getSuperBotBid(state, 'North');
  assert(
    superBotBid.type === 'pass',
    `SuperBot passes with 10 HCP when partner previously passed (got ${superBotBid.type})`
  );

  const botBid = getBotBid(state, 'North');
  assert(
    botBid.type === 'pass',
    `BotAi passes with 10 HCP when partner previously passed (got ${botBid.type})`
  );
}

// -------------------------------------------------------------
// Test 8: Dealer Match Privileges on Turn 4
// South is Dealer. West holds highest bid: 2 Suit.
// Partner (North) opened 1 Suit. South has 8 HCP and 4 cards in suit.
// South matches at 2 Suit without needing 9 tricks!
// -------------------------------------------------------------
{
  const southHand: Card[] = [
    makeCard('S', 'K'), // 3
    makeCard('S', 'J'), // 1
    makeCard('S', '8'),
    makeCard('S', '3'),
    makeCard('H', 'Q'), // 2
    makeCard('H', '7'),
    makeCard('D', 'Q'), // 2
    makeCard('D', '6'),
    makeCard('C', '9'),
    makeCard('C', '8'),
    makeCard('C', '4'),
    makeCard('H', '2'),
    makeCard('D', '2'),
  ]; // Total HCP = 8, 4 Spades

  const state = createMockGameState({
    dealer: 'South',
    auctionTurnsCount: 3, // Turn 4
    hands: { South: southHand, North: [], East: [], West: [] },
    bids: [
      { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'East', type: 'pass' },
      { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 2, contractType: 'Suit' },
    highestBidder: 'West',
  });

  const superBotBid = getSuperBotBid(state, 'South');
  assert(
    superBotBid.type === 'bid' && Boolean(superBotBid.isDealerPrivilegeMatch) && superBotBid.level === 2,
    `SuperBot Dealer executes Turn 4 Match Suit privilege at level 2 (got ${superBotBid.type} level=${superBotBid.level} match=${superBotBid.isDealerPrivilegeMatch})`
  );

  const botBid = getBotBid(state, 'South');
  assert(
    botBid.type === 'bid' && Boolean(botBid.isDealerPrivilegeMatch) && botBid.level === 2,
    `BotAi Dealer executes Turn 4 Match Suit privilege at level 2 (got ${botBid.type} level=${botBid.level} match=${botBid.isDealerPrivilegeMatch})`
  );
}

// -------------------------------------------------------------
// Test 9: Exhibition Scenario - 12 HCP with Singleton Ace & 5-card Suit
// Partner (West) opened 1 Suit. East holds:
// AS, QH, 10H, 8H, 4H, KD, JD, 9D, 4D, 3D, QC, 5C, 2C (12 HCP)
// Bot MUST NEVER PASS!
// -------------------------------------------------------------
{
  const eastHand: Card[] = [
    makeCard('S', 'A'), // 4 HCP
    makeCard('H', 'Q'), // 2 HCP
    makeCard('H', '10'),
    makeCard('H', '8'),
    makeCard('H', '4'),
    makeCard('D', 'K'), // 3 HCP
    makeCard('D', 'J'), // 1 HCP
    makeCard('D', '9'),
    makeCard('D', '4'),
    makeCard('D', '3'),
    makeCard('C', 'Q'), // 2 HCP
    makeCard('C', '5'),
    makeCard('C', '2'),
  ]; // Total HCP = 12, 5 Diamonds, 4 Hearts, 3 Clubs, 1 Spade (Ace)

  // 9A: At Score +7 (Team B at +7, 4 pts from +11 match victory)
  const stateClinchVictory = createMockGameState({
    dealer: 'West',
    auctionTurnsCount: 2,
    hands: { East: eastHand, West: [], North: [], South: [] },
    bids: [
      { seat: 'West', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'North', type: 'pass' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 1, contractType: 'Suit' },
    highestBidder: 'West',
    matchScores: { TeamA: -2, TeamB: 7 },
  });

  const superBotClinch = getSuperBotBid(stateClinchVictory, 'East');
  assert(
    superBotClinch.type === 'bid' && superBotClinch.contractType === 'NT',
    `SuperBot bids NT (got ${superBotClinch.type} ${superBotClinch.level} ${superBotClinch.contractType}) and NEVER passes with 12 HCP + singleton Ace!`
  );
  assert(
    superBotClinch.level === 2,
    `SuperBot bids 2 NT to seize 4 points and win the match (+11) when score is +7 (got level ${superBotClinch.level})`
  );

  const casualBotClinch = getBotBid(stateClinchVictory, 'East');
  assert(
    casualBotClinch.type === 'bid' && casualBotClinch.contractType === 'NT' && casualBotClinch.level === 2,
    `CasualBot bids 2 NT to seize 4 points and win match when score is +7 (got ${casualBotClinch.level} ${casualBotClinch.contractType})`
  );

  // 9B: At Score 0-0 (Regular opening context)
  const stateNeutral = createMockGameState({
    dealer: 'West',
    auctionTurnsCount: 2,
    hands: { East: eastHand, West: [], North: [], South: [] },
    bids: [
      { seat: 'West', type: 'bid', level: 1, contractType: 'Suit' },
      { seat: 'North', type: 'pass' },
    ],
    highestBid: { seat: 'West', type: 'bid', level: 1, contractType: 'Suit' },
    highestBidder: 'West',
    matchScores: { TeamA: 0, TeamB: 0 },
  });

  const superBotNeutral = getSuperBotBid(stateNeutral, 'East');
  assert(
    superBotNeutral.type === 'bid' && superBotNeutral.contractType === 'NT' && superBotNeutral.level === 1,
    `SuperBot upgrades to 1 NT for doubled points on 7 tricks at score 0-0 (got ${superBotNeutral.level} ${superBotNeutral.contractType})`
  );

  const casualBotNeutral = getBotBid(stateNeutral, 'East');
  assert(
    casualBotNeutral.type === 'bid' && casualBotNeutral.contractType === 'NT' && casualBotNeutral.level === 1,
    `CasualBot upgrades to 1 NT for doubled points on 7 tricks at score 0-0 (got ${casualBotNeutral.level} ${casualBotNeutral.contractType})`
  );
}

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
