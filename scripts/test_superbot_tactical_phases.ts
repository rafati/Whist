import {
  isMasterCard,
  getSuperBotCardPlayWithReason,
  getSuperBotBidWithReason,
  solveMicroDDS,
} from '../src/logic/superBot.ts';
import { Card, GameState, Seat, Suit } from '../src/types.ts';
import { createInitialGameState, startDealRound } from '../src/logic/gameLogic.ts';

console.log('============================================================');
console.log('🧪 RUNNING SUPERBOT TACTICAL PHASES VERIFICATION TEST SUITE');
console.log('============================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// Test 1: Master Card Recognition (isMasterCard)
// -------------------------------------------------------------
console.log('--- Test 1: Master Card Recognition (isMasterCard) ---');
let state = createInitialGameState('North');
state = startDealRound(state, 'North');

const aceSpades: Card = { id: 'AS', suit: 'S', rank: 'A' };
const kingSpades: Card = { id: 'KS', suit: 'S', rank: 'K' };
const queenSpades: Card = { id: 'QS', suit: 'S', rank: 'Q' };

// Before any play, Ace is Master, King is NOT Master
assert(isMasterCard(aceSpades, state) === true, 'Ace of Spades is recognized as Master Card');
assert(isMasterCard(kingSpades, state) === false, 'King of Spades is NOT Master before Ace is played');

// Simulate Ace of Spades played in trick 1
state.tricksHistory.push({
  trickNumber: 1,
  leader: 'North',
  cards: [{ seat: 'North', card: aceSpades }],
  winner: 'North',
  winningCard: aceSpades,
  ledSuit: 'S',
});

// Now King of Spades MUST be recognized as promoted Master Card!
assert(isMasterCard(kingSpades, state) === true, 'King of Spades is promoted to Master Card after Ace is played');
assert(isMasterCard(queenSpades, state) === false, 'Queen of Spades is NOT Master while King is unplayed');

// Simulate King of Spades played in trick 2
state.tricksHistory.push({
  trickNumber: 2,
  leader: 'North',
  cards: [{ seat: 'North', card: kingSpades }],
  winner: 'North',
  winningCard: kingSpades,
  ledSuit: 'S',
});

// Now Queen of Spades MUST be recognized as Master Card!
assert(isMasterCard(queenSpades, state) === true, 'Queen of Spades is promoted to Master Card after Ace and King are played');

// -------------------------------------------------------------
// Test 2: Continuous Declarer Trump Extraction
// -------------------------------------------------------------
console.log('\n--- Test 2: Continuous Declarer Trump Extraction ---');
// Setup: North is declarer with Spade trump.
// A trump trick has ALREADY been played before (trumpsLedBefore = true).
// Opponents still hold trumps (e.g. West holds 8S, East holds 7S).
// North holds [AS, KS, AD, KD].
// North MUST lead a trump (AS) to continue pulling trumps, rather than stopping!
const stateTrump = createInitialGameState('North');
stateTrump.phase = 'playing';
stateTrump.trumpSuit = 'S';
stateTrump.declarer = 'North';
stateTrump.winningBid = { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' };
stateTrump.currentTurn = 'North';
stateTrump.currentTrick = [];
stateTrump.tricksHistory = [
  {
    trickNumber: 1,
    leader: 'North',
    cards: [
      { seat: 'North', card: { id: 'QS', suit: 'S', rank: 'Q' } },
      { seat: 'West', card: { id: 'JS', suit: 'S', rank: 'J' } },
      { seat: 'South', card: { id: '2S', suit: 'S', rank: '2' } },
      { seat: 'East', card: { id: '9S', suit: 'S', rank: '9' } },
    ],
    winner: 'North',
    winningCard: { id: 'QS', suit: 'S', rank: 'Q' },
    ledSuit: 'S',
  },
];
stateTrump.cardsCount = { North: 7, West: 7, South: 7, East: 7 };
stateTrump.hands = {
  North: [
    { id: 'AS', suit: 'S', rank: 'A' },
    { id: 'KS', suit: 'S', rank: 'K' },
    { id: 'AD', suit: 'D', rank: 'A' },
    { id: 'KD', suit: 'D', rank: 'K' },
    { id: '2C', suit: 'C', rank: '2' },
    { id: '3C', suit: 'C', rank: '3' },
    { id: '4C', suit: 'C', rank: '4' },
  ],
  West: [
    { id: '8S', suit: 'S', rank: '8' },
    { id: '2H', suit: 'H', rank: '2' },
    { id: '3H', suit: 'H', rank: '3' },
    { id: '4H', suit: 'H', rank: '4' },
    { id: '5C', suit: 'C', rank: '5' },
    { id: '6C', suit: 'C', rank: '6' },
    { id: '7C', suit: 'C', rank: '7' },
  ],
  South: [
    { id: '3S', suit: 'S', rank: '3' },
    { id: '5H', suit: 'H', rank: '5' },
    { id: '6H', suit: 'H', rank: '6' },
    { id: '7H', suit: 'H', rank: '7' },
    { id: '8C', suit: 'C', rank: '8' },
    { id: '9C', suit: 'C', rank: '9' },
    { id: '10C', suit: 'C', rank: '10' },
  ],
  East: [
    { id: '10S', suit: 'S', rank: '10' },
    { id: '8H', suit: 'H', rank: '8' },
    { id: '9H', suit: 'H', rank: '9' },
    { id: '10H', suit: 'H', rank: '10' },
    { id: 'JC', suit: 'C', rank: 'J' },
    { id: 'QC', suit: 'C', rank: 'Q' },
    { id: 'KC', suit: 'C', rank: 'K' },
  ],
};

const decisionTrump = getSuperBotCardPlayWithReason(stateTrump, 'North', 'S');
assert(decisionTrump.card.suit === 'S', `Declarer continuously draws trumps: led ${decisionTrump.card.id}`);
assert(decisionTrump.reason.includes('Continuous declarer trump extraction'), `Reason includes continuous extraction: "${decisionTrump.reason}"`);

// -------------------------------------------------------------
// Test 3: Cashing Promoted Master Winner
// -------------------------------------------------------------
console.log('\n--- Test 3: Cashing Promoted Master Winner ---');
// Setup: North is on lead (trick 6, 7 cards in hand). No trump contract (NT).
// North holds [KH, 5D, 4C, 3C, 2C, 6H, 7H]. Ace of Hearts already fell in trick 1.
// North should cash the promoted master King of Hearts!
const stateMaster = createInitialGameState('North');
stateMaster.phase = 'playing';
stateMaster.trumpSuit = 'NT';
stateMaster.declarer = 'North';
stateMaster.currentTurn = 'North';
stateMaster.currentTrick = [];
stateMaster.tricksHistory = [
  {
    trickNumber: 1,
    leader: 'West',
    cards: [
      { seat: 'West', card: { id: 'AH', suit: 'H', rank: 'A' } },
      { seat: 'North', card: { id: '2H', suit: 'H', rank: '2' } },
      { seat: 'East', card: { id: '3H', suit: 'H', rank: '3' } },
      { seat: 'South', card: { id: '4H', suit: 'H', rank: '4' } },
    ],
    winner: 'West',
    winningCard: { id: 'AH', suit: 'H', rank: 'A' },
    ledSuit: 'H',
  },
];
stateMaster.hands = {
  North: [
    { id: 'KH', suit: 'H', rank: 'K' },
    { id: '5D', suit: 'D', rank: '5' },
    { id: '4C', suit: 'C', rank: '4' },
    { id: '3C', suit: 'C', rank: '3' },
    { id: '2C', suit: 'C', rank: '2' },
    { id: '6H', suit: 'H', rank: '6' },
    { id: '7H', suit: 'H', rank: '7' },
  ],
  West: [
    { id: 'QH', suit: 'H', rank: 'Q' },
    { id: '6D', suit: 'D', rank: '6' },
    { id: '7C', suit: 'C', rank: '7' },
    { id: '8C', suit: 'C', rank: '8' },
    { id: '9C', suit: 'C', rank: '9' },
    { id: '8H', suit: 'H', rank: '8' },
    { id: '9H', suit: 'H', rank: '9' },
  ],
  South: [
    { id: 'JH', suit: 'H', rank: 'J' },
    { id: '8D', suit: 'D', rank: '8' },
    { id: '10C', suit: 'C', rank: '10' },
    { id: 'JC', suit: 'C', rank: 'J' },
    { id: 'QC', suit: 'C', rank: 'Q' },
    { id: '10H', suit: 'H', rank: '10' },
    { id: '2D', suit: 'D', rank: '2' },
  ],
  East: [
    { id: '10D', suit: 'D', rank: '10' },
    { id: 'JD', suit: 'D', rank: 'J' },
    { id: 'QD', suit: 'D', rank: 'Q' },
    { id: 'KC', suit: 'C', rank: 'K' },
    { id: 'AC', suit: 'C', rank: 'A' },
    { id: '3D', suit: 'D', rank: '3' },
    { id: '4D', suit: 'D', rank: '4' },
  ],
};

const decisionMaster = getSuperBotCardPlayWithReason(stateMaster, 'North', 'NT');
assert(decisionMaster.card.id === 'KH', `Cashed promoted master King of Hearts: got ${decisionMaster.card.id}`);
assert(decisionMaster.reason.includes('master card'), `Reason states master card: "${decisionMaster.reason}"`);

// -------------------------------------------------------------
// Test 4: Low Lead from Unsupported Honor (4th-best lead)
// -------------------------------------------------------------
console.log('\n--- Test 4: Low Lead from Unsupported Honor ---');
// Setup: North is leading a side suit on trick 6 (7 cards in hand).
// Non-trump contract or trumps pulled.
// North holds unsupported [KS, 8S, 4S, 2S, 3C, 4C, 5C] (no Ace, no Queen).
// Leading KS bare into opponents is fatal. Bot should lead 4th-best (2S)!
const stateLow = createInitialGameState('North');
stateLow.phase = 'playing';
stateLow.trumpSuit = 'H';
stateLow.declarer = 'North';
stateLow.currentTurn = 'North';
stateLow.currentTrick = [];
stateLow.tricksHistory = [
  {
    trickNumber: 1,
    leader: 'North',
    cards: [
      { seat: 'North', card: { id: 'AH', suit: 'H', rank: 'A' } },
      { seat: 'West', card: { id: '2H', suit: 'H', rank: '2' } },
      { seat: 'South', card: { id: '3H', suit: 'H', rank: '3' } },
      { seat: 'East', card: { id: '4H', suit: 'H', rank: '4' } },
    ],
    winner: 'North',
    winningCard: { id: 'AH', suit: 'H', rank: 'A' },
    ledSuit: 'H',
  },
];
stateLow.hands = {
  North: [
    { id: 'KS', suit: 'S', rank: 'K' },
    { id: '8S', suit: 'S', rank: '8' },
    { id: '4S', suit: 'S', rank: '4' },
    { id: '2S', suit: 'S', rank: '2' },
    { id: '3C', suit: 'C', rank: '3' },
    { id: '4C', suit: 'C', rank: '4' },
    { id: '5C', suit: 'C', rank: '5' },
  ],
  West: [
    { id: 'AS', suit: 'S', rank: 'A' },
    { id: '6C', suit: 'C', rank: '6' },
    { id: '7C', suit: 'C', rank: '7' },
    { id: '8C', suit: 'C', rank: '8' },
    { id: '9C', suit: 'C', rank: '9' },
    { id: '10C', suit: 'C', rank: '10' },
    { id: 'JC', suit: 'C', rank: 'J' },
  ],
  South: [
    { id: 'QS', suit: 'S', rank: 'Q' },
    { id: 'QC', suit: 'C', rank: 'Q' },
    { id: 'KC', suit: 'C', rank: 'K' },
    { id: 'AC', suit: 'C', rank: 'A' },
    { id: '2D', suit: 'D', rank: '2' },
    { id: '3D', suit: 'D', rank: '3' },
    { id: '4D', suit: 'D', rank: '4' },
  ],
  East: [
    { id: 'JS', suit: 'S', rank: 'J' },
    { id: '5D', suit: 'D', rank: '5' },
    { id: '6D', suit: 'D', rank: '6' },
    { id: '7D', suit: 'D', rank: '7' },
    { id: '8D', suit: 'D', rank: '8' },
    { id: '9D', suit: 'D', rank: '9' },
    { id: '10D', suit: 'D', rank: '10' },
  ],
};

const decisionLow = getSuperBotCardPlayWithReason(stateLow, 'North', 'H');
assert(decisionLow.card.id !== 'KS', `Did NOT lead unsupported King bare: got ${decisionLow.card.id}`);
assert(decisionLow.card.rank === '2' || decisionLow.card.rank === '4' || decisionLow.card.rank === '8', `Led low spot card from length: got ${decisionLow.card.id}`);
assert(decisionLow.reason.includes('unsupported'), `Reason mentions unsupported honor protection: "${decisionLow.reason}"`);

// -------------------------------------------------------------
// Test 5: Second Hand King from A-K
// -------------------------------------------------------------
console.log('\n--- Test 5: Second Hand King from A-K ---');
// Setup: West leads a spot card (5H).
// North is 2nd hand holding [AH, KH, 2H].
// Bot should play King to secure the trick immediately rather than ducking low!
const stateAK = createInitialGameState('North');
stateAK.phase = 'playing';
stateAK.trumpSuit = 'S';
stateAK.currentTurn = 'North';
stateAK.currentTrick = [{ seat: 'West', card: { id: '5H', suit: 'H', rank: '5' } }];
stateAK.hands = {
  North: [
    { id: 'AH', suit: 'H', rank: 'A' },
    { id: 'KH', suit: 'H', rank: 'K' },
    { id: '2H', suit: 'H', rank: '2' },
  ],
  West: [{ id: '6H', suit: 'H', rank: '6' }, { id: '7H', suit: 'H', rank: '7' }],
  South: [{ id: '8H', suit: 'H', rank: '8' }, { id: '9H', suit: 'H', rank: '9' }, { id: '10H', suit: 'H', rank: '10' }],
  East: [{ id: 'QH', suit: 'H', rank: 'Q' }, { id: 'JH', suit: 'H', rank: 'J' }, { id: '4H', suit: 'H', rank: '4' }],
};

const decisionAK = getSuperBotCardPlayWithReason(stateAK, 'North', 'S');
assert(decisionAK.card.rank === 'K', `Second hand played King from A-K: got ${decisionAK.card.id}`);
assert(decisionAK.reason.includes('King from A-K'), `Reason states King from A-K: "${decisionAK.reason}"`);

// -------------------------------------------------------------
// Test 6: 6-Card Micro-DDS Depth
// -------------------------------------------------------------
console.log('\n--- Test 6: 6-Card Micro-DDS Depth ---');
const hands6: Record<Seat, Card[]> = {
  North: [
    { id: 'AS', suit: 'S', rank: 'A' }, { id: 'KS', suit: 'S', rank: 'K' },
    { id: 'AH', suit: 'H', rank: 'A' }, { id: 'KH', suit: 'H', rank: 'K' },
    { id: 'AD', suit: 'D', rank: 'A' }, { id: 'KD', suit: 'D', rank: 'K' },
  ],
  West: [
    { id: 'QS', suit: 'S', rank: 'Q' }, { id: 'JS', suit: 'S', rank: 'J' },
    { id: 'QH', suit: 'H', rank: 'Q' }, { id: 'JH', suit: 'H', rank: 'J' },
    { id: 'QD', suit: 'D', rank: 'Q' }, { id: 'JD', suit: 'D', rank: 'J' },
  ],
  South: [
    { id: '10S', suit: 'S', rank: '10' }, { id: '9S', suit: 'S', rank: '9' },
    { id: '10H', suit: 'H', rank: '10' }, { id: '9H', suit: 'H', rank: '9' },
    { id: '10D', suit: 'D', rank: '10' }, { id: '9D', suit: 'D', rank: '9' },
  ],
  East: [
    { id: '8S', suit: 'S', rank: '8' }, { id: '7S', suit: 'S', rank: '7' },
    { id: '8H', suit: 'H', rank: '8' }, { id: '7H', suit: 'H', rank: '7' },
    { id: '8D', suit: 'D', rank: '8' }, { id: '7D', suit: 'D', rank: '7' },
  ],
};
const nodes = { count: 0 };
const tricksWon6 = solveMicroDDS(hands6, 'S', 'TeamA', 'North', [], 0, 6, nodes);
assert(tricksWon6 === 6, `6-Card Micro-DDS calculated exact 6 tricks: got ${tricksWon6}`);
assert(nodes.count > 0 && nodes.count < 15000, `Micro-DDS node count within budget: visited ${nodes.count} nodes`);

// -------------------------------------------------------------
// Test 7: Bot Bidding Decision Reasoning Telemetry
// -------------------------------------------------------------
console.log('\n--- Test 7: Bot Bidding Decision Reasoning Telemetry ---');
const stateBid = createInitialGameState('North');
stateBid.hands.North = [
  { id: 'AS', suit: 'S', rank: 'A' }, { id: 'KS', suit: 'S', rank: 'K' }, { id: 'QS', suit: 'S', rank: 'Q' },
  { id: 'AH', suit: 'H', rank: 'A' }, { id: 'KH', suit: 'H', rank: 'K' },
  { id: 'AD', suit: 'D', rank: 'A' }, { id: 'KD', suit: 'D', rank: 'K' },
  { id: 'AC', suit: 'C', rank: 'A' }, { id: 'KC', suit: 'C', rank: 'K' },
  { id: '2S', suit: 'S', rank: '2' }, { id: '3S', suit: 'S', rank: '3' }, { id: '4S', suit: 'S', rank: '4' }, { id: '5S', suit: 'S', rank: '5' },
];
const bidDecision = getSuperBotBidWithReason(stateBid, 'North');
assert(bidDecision.bid.type === 'bid', `North opened auction: got ${bidDecision.bid.level} ${bidDecision.bid.contractType}`);
assert(bidDecision.reason.length > 5, `Bid decision includes telemetry reason: "${bidDecision.reason}"`);

console.log('\n============================================================');
console.log(`🎉 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
