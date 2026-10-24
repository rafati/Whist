import assert from 'assert';
import { GameState, Seat, Card } from '../src/types.ts';
import { getBotCardPlay } from '../src/logic/botAi.ts';
import { getSuperBotCardPlay, countRemainingOpponentTrumps } from '../src/logic/superBot.ts';
import { createInitialGameState, startDealRound } from '../src/logic/gameLogic.ts';

console.log('--- RUNNING BOT TACTICAL INVARIANTS TEST SUITE ---');

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

// =========================================================================
// TEST 1: Partner is winning in off-suit, bot is void. MUST NOT TRUMP!
// =========================================================================
console.log('\n[Test 1] Partner is winning off-suit trick, bot is void in led suit:');
{
  const northHand: Card[] = [
    { id: '2S', suit: 'S', rank: '2' }, // Trump!
    { id: '5D', suit: 'D', rank: '5' },
    { id: '9C', suit: 'C', rank: '9' },
    { id: 'KD', suit: 'D', rank: 'K' },
    { id: 'QC', suit: 'C', rank: 'Q' },
    { id: 'JC', suit: 'C', rank: 'J' },
  ];

  const state = createMockGameState({
    hands: {
      North: northHand,
      West: [{ id: '4H', suit: 'H', rank: '4' }],
      South: [{ id: 'AH', suit: 'H', rank: 'A' }],
      East: [{ id: '2H', suit: 'H', rank: '2' }],
    },
    currentTrick: [
      { seat: 'South', card: { id: 'AH', suit: 'H', rank: 'A' } },
      { seat: 'West', card: { id: '4H', suit: 'H', rank: '4' } },
    ],
    currentTurn: 'North',
  });

  // SuperBot test
  const superPlay = getSuperBotCardPlay(state, 'North', 'S');
  console.log(`  -> SuperBot chose: ${superPlay.rank}${superPlay.suit}`);
  assert.notStrictEqual(superPlay.suit, 'S', 'SuperBot must NOT trump partner winning card AH!');
  assert.strictEqual(superPlay.rank, '5', 'SuperBot should sluff lowest non-trump 5D');

  // CasualBot test
  const casualPlay = getBotCardPlay(state, 'North', 'S');
  console.log(`  -> CasualBot chose: ${casualPlay.rank}${casualPlay.suit}`);
  assert.notStrictEqual(casualPlay.suit, 'S', 'CasualBot must NOT trump partner winning card AH!');
  assert.strictEqual(casualPlay.rank, '5', 'CasualBot should sluff lowest non-trump 5D');

  console.log('✅ PASSED: Both bots discarded off-suit loser instead of trumping partner’s winning Ace.');
}

// =========================================================================
// TEST 2: Partner already trumped the trick. Bot MUST NOT overtrump partner!
// =========================================================================
console.log('\n[Test 2] Partner already won/trumped trick. Bot MUST NOT overtrump:');
{
  const southHand: Card[] = [
    { id: 'QS', suit: 'S', rank: 'Q' }, // Trump!
    { id: '6C', suit: 'C', rank: '6' },
    { id: '8H', suit: 'H', rank: '8' },
    { id: '7C', suit: 'C', rank: '7' },
    { id: '9H', suit: 'H', rank: '9' },
    { id: '10C', suit: 'C', rank: '10' },
  ];

  const state = createMockGameState({
    hands: {
      South: southHand,
      West: [{ id: 'KD', suit: 'D', rank: 'K' }],
      North: [{ id: '4S', suit: 'S', rank: '4' }],
      East: [{ id: '7D', suit: 'D', rank: '7' }],
    },
    currentTrick: [
      { seat: 'West', card: { id: 'KD', suit: 'D', rank: 'K' } },
      { seat: 'North', card: { id: '4S', suit: 'S', rank: '4' } },
      { seat: 'East', card: { id: '7D', suit: 'D', rank: '7' } },
    ],
    currentTurn: 'South',
  });

  // SuperBot test
  const superPlay = getSuperBotCardPlay(state, 'South', 'S');
  console.log(`  -> SuperBot chose: ${superPlay.rank}${superPlay.suit}`);
  assert.notStrictEqual(superPlay.suit, 'S', 'SuperBot must NOT overtrump partner 4S with QS!');

  // CasualBot test
  const casualPlay = getBotCardPlay(state, 'South', 'S');
  console.log(`  -> CasualBot chose: ${casualPlay.rank}${casualPlay.suit}`);
  assert.notStrictEqual(casualPlay.suit, 'S', 'CasualBot must NOT overtrump partner 4S with QS!');

  console.log('✅ PASSED: Both bots discarded instead of overtrumping partner’s winning trump.');
}

// =========================================================================
// TEST 3: Opponents have 0 trumps left. Bot MUST NOT lead trump!
// =========================================================================
console.log('\n[Test 3] Opponent trumps are exhausted (0 left). Bot MUST NOT lead trump:');
{
  const northHand: Card[] = [
    { id: 'JS', suit: 'S', rank: 'J' }, // Trump! Only 1 trump left in whole game!
    { id: 'AH', suit: 'H', rank: 'A' },
    { id: 'KH', suit: 'H', rank: 'K' },
    { id: 'AD', suit: 'D', rank: 'A' },
    { id: '4C', suit: 'C', rank: '4' },
    { id: '5C', suit: 'C', rank: '5' },
  ];

  const state = createMockGameState({
    hands: {
      North: northHand,
      West: [{ id: '2H', suit: 'H', rank: '2' }],
      South: [{ id: '3H', suit: 'H', rank: '3' }],
      East: [{ id: '4H', suit: 'H', rank: '4' }],
    },
    tricksHistory: [
      {
        trickNumber: 1,
        leader: 'North',
        ledSuit: 'S',
        winningCard: { id: 'AS', suit: 'S', rank: 'A' },
        cards: [
          { seat: 'North', card: { id: 'AS', suit: 'S', rank: 'A' } },
          { seat: 'East', card: { id: '2S', suit: 'S', rank: '2' } },
          { seat: 'South', card: { id: '8S', suit: 'S', rank: '8' } },
          { seat: 'West', card: { id: '3S', suit: 'S', rank: '3' } },
        ],
        winner: 'North',
      },
      {
        trickNumber: 2,
        leader: 'North',
        ledSuit: 'S',
        winningCard: { id: 'KS', suit: 'S', rank: 'K' },
        cards: [
          { seat: 'North', card: { id: 'KS', suit: 'S', rank: 'K' } },
          { seat: 'East', card: { id: '4S', suit: 'S', rank: '4' } },
          { seat: 'South', card: { id: '9S', suit: 'S', rank: '9' } },
          { seat: 'West', card: { id: '5S', suit: 'S', rank: '5' } },
        ],
        winner: 'North',
      },
      {
        trickNumber: 3,
        leader: 'North',
        ledSuit: 'S',
        winningCard: { id: 'QS', suit: 'S', rank: 'Q' },
        cards: [
          { seat: 'North', card: { id: 'QS', suit: 'S', rank: 'Q' } },
          { seat: 'East', card: { id: '6S', suit: 'S', rank: '6' } },
          { seat: 'South', card: { id: '10S', suit: 'S', rank: '10' } },
          { seat: 'West', card: { id: '7S', suit: 'S', rank: '7' } },
        ],
        winner: 'North',
      },
    ],
    currentTrick: [],
    currentTurn: 'North',
  });

  // Check remaining opponent trumps
  const oppTrumps = countRemainingOpponentTrumps(state, 'North', 'S');
  console.log(`  -> countRemainingOpponentTrumps: ${oppTrumps}`);
  assert.strictEqual(oppTrumps, 0, 'Opponents must have 0 trumps left');

  // SuperBot test
  const superLead = getSuperBotCardPlay(state, 'North', 'S');
  console.log(`  -> SuperBot led: ${superLead.rank}${superLead.suit}`);
  assert.notStrictEqual(superLead.suit, 'S', 'SuperBot must NOT lead JS when opponents have no trumps left!');

  // CasualBot test
  const casualLead = getBotCardPlay(state, 'North', 'S');
  console.log(`  -> CasualBot led: ${casualLead.rank}${casualLead.suit}`);
  assert.notStrictEqual(casualLead.suit, 'S', 'CasualBot must NOT lead JS when opponents have no trumps left!');

  console.log('✅ PASSED: Both bots cashed/developed side suits instead of pulling dead trumps.');
}

console.log('\n🎉 ALL TACTICAL INVARIANT TESTS PASSED COMPLETELY!');
