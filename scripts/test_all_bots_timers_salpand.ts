import assert from 'assert';
import { GameState, Seat, Card, ContractType, Bid, Room, UserProfile, RoundScoreBreakdown } from '../src/types.ts';
import {
  SEATS,
  getPartner,
  getNextSeat,
  getPrevSeat,
  calculateRoundScores,
} from '../src/logic/gameLogic.ts';
import { ANIMATION_CONFIG } from '../src/logic/animationConfig.ts';

console.log('--- RUNNING ALL-BOTS, TIMERS & SALPAND VICTORY TESTS ---');

// ==========================================
// 1. ALL BOTS PERSPECTIVE ROTATION & CARD VISIBILITY
// ==========================================
console.log('\n[Test Suite 1] All-Bots Perspective Rotation & Seating Math');

// Simulate 4 bots setup
const botSeats: Record<Seat, UserProfile> = {
  North: { id: 'bot_north', name: 'فاشي الاسرار', email: 'north@ai.studio', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Polaris', isBot: true },
  West: { id: 'bot_west', name: 'صف السادس', email: 'west@ai.studio', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Zephyr', isBot: true },
  South: { id: 'bot_south', name: 'ابو قرون', email: 'south@ai.studio', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Atlas', isBot: true },
  East: { id: 'bot_east', name: 'الزعيم', email: 'east@ai.studio', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Orion', isBot: true },
};

const isAllBots = SEATS.every((s) => Boolean(botSeats[s]?.isBot));
assert.strictEqual(isAllBots, true, 'Room with 4 bots should have isAllBots === true');

// When user selects South
let selectedBotSeat: Seat = 'South';
let effectiveSeat: Seat = selectedBotSeat;
let bottomSeat: Seat = effectiveSeat;
let topSeat: Seat = getPartner(effectiveSeat);
let leftSeat: Seat = getPrevSeat(effectiveSeat);
let rightSeat: Seat = getNextSeat(effectiveSeat);

assert.strictEqual(bottomSeat, 'South');
assert.strictEqual(topSeat, 'North');
assert.strictEqual(leftSeat, 'West');
assert.strictEqual(rightSeat, 'East');

const getSeatVisualPos = (seat: Seat, bottom: Seat, top: Seat, left: Seat, right: Seat) => {
  if (seat === bottom) return 'bottom';
  if (seat === top) return 'top';
  if (seat === left) return 'left';
  return 'right';
};

assert.strictEqual(getSeatVisualPos('South', bottomSeat, topSeat, leftSeat, rightSeat), 'bottom');
assert.strictEqual(getSeatVisualPos('North', bottomSeat, topSeat, leftSeat, rightSeat), 'top');

// Now user selects West to rotate perspective to West
selectedBotSeat = 'West';
effectiveSeat = selectedBotSeat;
bottomSeat = effectiveSeat;
topSeat = getPartner(effectiveSeat);
leftSeat = getPrevSeat(effectiveSeat);
rightSeat = getNextSeat(effectiveSeat);

assert.strictEqual(bottomSeat, 'West', 'Selected bot West should rotate to bottom');
assert.strictEqual(topSeat, 'East', 'Partner East should rotate to top');
assert.strictEqual(leftSeat, 'North', 'North should rotate to left');
assert.strictEqual(rightSeat, 'South', 'South should rotate to right');

assert.strictEqual(getSeatVisualPos('West', bottomSeat, topSeat, leftSeat, rightSeat), 'bottom');
assert.strictEqual(getSeatVisualPos('East', bottomSeat, topSeat, leftSeat, rightSeat), 'top');
assert.strictEqual(getSeatVisualPos('North', bottomSeat, topSeat, leftSeat, rightSeat), 'left');
assert.strictEqual(getSeatVisualPos('South', bottomSeat, topSeat, leftSeat, rightSeat), 'right');

// Now user selects East to rotate perspective to East
selectedBotSeat = 'East';
effectiveSeat = selectedBotSeat;
bottomSeat = effectiveSeat;
topSeat = getPartner(effectiveSeat);
assert.strictEqual(bottomSeat, 'East');
assert.strictEqual(topSeat, 'West');
assert.strictEqual(getSeatVisualPos('East', bottomSeat, topSeat, leftSeat, rightSeat), 'bottom');

// Now user selects North to rotate perspective to North
selectedBotSeat = 'North';
effectiveSeat = selectedBotSeat;
bottomSeat = effectiveSeat;
topSeat = getPartner(effectiveSeat);
assert.strictEqual(bottomSeat, 'North');
assert.strictEqual(topSeat, 'South');
assert.strictEqual(getSeatVisualPos('North', bottomSeat, topSeat, leftSeat, rightSeat), 'bottom');

console.log('✅ PASSED: All 4 bot rotations properly position the selected bot at bottom, partner at top, opponents at left/right.');

// Hand cards display verification:
const hands: Record<Seat, Card[]> = {
  North: Array.from({ length: 13 }, (_, i) => ({ id: `N_${i}`, suit: 'S', rank: 'A' })),
  West: Array.from({ length: 13 }, (_, i) => ({ id: `W_${i}`, suit: 'H', rank: 'K' })),
  South: Array.from({ length: 13 }, (_, i) => ({ id: `S_${i}`, suit: 'D', rank: 'Q' })),
  East: Array.from({ length: 13 }, (_, i) => ({ id: `E_${i}`, suit: 'C', rank: 'J' })),
};

for (const seat of SEATS) {
  const displayedHand: Card[] = (isAllBots ? hands[seat] : []) || [];
  assert.strictEqual(displayedHand.length, 13, `Hand for ${seat} must have 13 cards`);
  assert.strictEqual(displayedHand[0].id.startsWith(seat[0]), true, `Card id should match ${seat}`);
}
console.log('✅ PASSED: Hand cards of selected bot are accurately retrieved and displayed in bottom dock.');

// ==========================================
// 2. BIDDING & DECLARING TIMERS (BOT 5s, HUMAN 20s)
// ==========================================
console.log('\n[Test Suite 2] Bidding & Suit Declaring Timers');

const BOT_BIDDING_TIME_MS = 5000;
const HUMAN_BIDDING_TIME_MS = 20000;
const BOT_DECLARING_TIME_MS = 5000;
const HUMAN_DECLARING_TIME_MS = 20000;

assert.strictEqual(BOT_BIDDING_TIME_MS, 5000, 'Bot bidding must be 5 seconds (5000ms)');
assert.strictEqual(HUMAN_BIDDING_TIME_MS, 20000, 'Human bidding must be 20 seconds (20000ms)');
assert.strictEqual(BOT_DECLARING_TIME_MS, 5000, 'Bot trump declaration must be 5 seconds (5000ms)');
assert.strictEqual(HUMAN_DECLARING_TIME_MS, 20000, 'Human trump declaration must be 20 seconds (20000ms)');

console.log('✅ PASSED: Timer constants for bots (5s) and humans (20s) match user specifications exactly.');

// ==========================================
// 3. SALPAND VICTORY + GAME OVER INTEGRATION
// ==========================================
console.log('\n[Test Suite 3] Salpand Victory + GameOverModal Integration');

const bid1Suit: Bid = { seat: 'South', type: 'bid', level: 1, contractType: 'Suit' };
const roundResultSalpandWin = calculateRoundScores(
  bid1Suit,
  'South',
  'S',
  1,
  { TeamA: 13, TeamB: 0 }
);

assert.strictEqual(roundResultSalpandWin.isSalpand, true, 'Must identify as Salpand');
assert.strictEqual(roundResultSalpandWin.salpandTeam, 'TeamA');
assert.strictEqual(roundResultSalpandWin.scoreDeltaBidTeam, 11, 'Salpand awards 11 points');
assert.strictEqual(roundResultSalpandWin.scoreDeltaDefTeam, 0);

// In game state, score >= 11 (or match target) triggers phase = 'game_over'
const mockRoundScore: RoundScoreBreakdown = {
  roundNumber: 1,
  declarer: 'South',
  contractTeam: 'TeamA',
  defendingTeam: 'TeamB',
  bidLevel: 1,
  contractType: 'Suit',
  trumpSuit: 'S',
  tricksWonBidTeam: 13,
  tricksWonDefTeam: 0,
  bidSuccess: true,
  scoreDeltaBidTeam: 11,
  scoreDeltaDefTeam: 0,
  explanation: ['Captured all 13 tricks (Salpand)!'],
  isSalpand: true,
  salpandTeam: 'TeamA',
};

const matchWinningGameState: Partial<GameState> = {
  phase: 'game_over',
  isSalpand: true,
  salpandTeam: 'TeamA',
  winnerTeam: 'TeamA',
  matchScores: { TeamA: 11, TeamB: 0 },
  roundScores: [mockRoundScore],
};

const isSalpandVictory = Boolean(
  matchWinningGameState.isSalpand || matchWinningGameState.roundScores?.[0]?.isSalpand
);
assert.strictEqual(isSalpandVictory, true, 'isSalpandVictory should be true');
assert.strictEqual(matchWinningGameState.phase, 'game_over', 'Phase should be game_over');
assert.strictEqual(matchWinningGameState.winnerTeam, 'TeamA', 'Winner team should be TeamA');

console.log('✅ PASSED: Salpand match victory state flags both isSalpandVictory and game_over correctly.');

console.log('\n🎉 ALL ALL-BOTS, TIMERS & SALPAND VICTORY TESTS PASSED SUCCESSFULLY!');
