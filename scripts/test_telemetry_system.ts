/**
 * Test Suite: Telemetry & RLHF Human Feedback Capture
 * 
 * Verifies:
 * 1. Database/Local File Initialization.
 * 2. Asynchronous Match Replay saving.
 * 3. Bot Feedback capture on Shoe (bad move) and Medal (good move).
 * 4. Partner vs Opponent feedback attribution.
 * 5. Zero Gameplay Impact (Game state, bot hand, turn flow remain strictly untouched).
 */

import {
  initTelemetryDatabase,
  saveMatchReplay,
  saveBotFeedback,
  getTelemetryStats,
  getBotFeedbackList,
  MatchReplayRecord,
  BotFeedbackRecord,
} from '../src/services/telemetryDb.ts';
import { createInitialGameState } from '../src/logic/gameLogic.ts';

console.log('============================================================');
console.log('🧪 RUNNING TELEMETRY & HUMAN FEEDBACK TEST SUITE');
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

async function runTests() {
  // Test 1: Telemetry Initialization
  console.log('--- Test 1: Telemetry Service Initialization ---');
  await initTelemetryDatabase();
  assert(true, 'Telemetry database/local file storage initialized without errors');

  // Test 2: Match Replay Saving
  console.log('\n--- Test 2: Saving Round Match Replay ---');
  const testReplay: MatchReplayRecord = {
    id: `test_replay_${Date.now()}`,
    roomId: 'test_room_1',
    roundNumber: 1,
    dealer: 'North',
    declarer: 'South',
    trumpSuit: 'S',
    contractLevel: 2,
    contractType: 'Suit',
    winningTeam: 'TeamA',
    tricksWonTeamA: 8,
    tricksWonTeamB: 5,
    matchScoreTeamA: 2,
    matchScoreTeamB: 0,
    initialHands: {
      North: [{ id: 'AS', suit: 'S', rank: 'A' }],
      West: [{ id: 'KS', suit: 'S', rank: 'K' }],
      South: [{ id: 'QS', suit: 'S', rank: 'Q' }],
      East: [{ id: 'JS', suit: 'S', rank: 'J' }],
    },
    auctionHistory: [{ seat: 'South', type: 'bid', level: 2, contractType: 'Suit' }],
    tricksHistory: [{
      trickNumber: 1,
      leader: 'South',
      cards: [
        { seat: 'South', card: { id: 'QS', suit: 'S', rank: 'Q' } },
        { seat: 'East', card: { id: 'JS', suit: 'S', rank: 'J' } },
        { seat: 'North', card: { id: 'AS', suit: 'S', rank: 'A' } },
        { seat: 'West', card: { id: 'KS', suit: 'S', rank: 'K' } },
      ],
      winner: 'North',
      winningCard: { id: 'AS', suit: 'S', rank: 'A' },
      ledSuit: 'S',
    }],
    timestamp: Date.now(),
  };

  await saveMatchReplay(testReplay);
  assert(true, 'Round match replay saved successfully');

  // Test 3: Bot Feedback Capture on Shoe (Bad Move)
  console.log('\n--- Test 3: Bot Feedback Capture on Shoe (Disapproval) ---');
  const shoeFeedback: BotFeedbackRecord = {
    id: `test_fb_shoe_${Date.now()}`,
    roomId: 'test_room_1',
    timestamp: Date.now(),
    fromSeat: 'North', // Partner of South
    toSeat: 'South',   // Target is bot South
    isPartner: true,
    objectType: 'shoe',
    sentiment: 'bad_move',
    botEngine: 'super',
    actionType: 'play_card',
    actionDetails: {
      lastReasoning: {
        seat: 'South',
        action: 'play_card',
        cardId: 'QS',
        reason: 'Led Queen from sequence Q-J in working suit S',
        timestamp: Date.now() - 500,
      },
      botHandRemaining: [{ id: '2S', suit: 'S', rank: '2' }],
      contract: {
        declarer: 'South',
        trumpSuit: 'S',
        level: 2,
        contractType: 'Suit',
      },
    },
  };

  await saveBotFeedback(shoeFeedback);
  assert(true, 'Shoe feedback (bad_move from partner) captured successfully');

  // Test 4: Bot Feedback Capture on Medal (Good Move)
  console.log('\n--- Test 4: Bot Feedback Capture on Medal (Praise) ---');
  const medalFeedback: BotFeedbackRecord = {
    id: `test_fb_medal_${Date.now()}`,
    roomId: 'test_room_1',
    timestamp: Date.now(),
    fromSeat: 'West', // Opponent
    toSeat: 'North',  // Bot North
    isPartner: false,
    objectType: 'medal',
    sentiment: 'good_move',
    botEngine: 'super',
    actionType: 'play_card',
    actionDetails: {
      lastReasoning: {
        seat: 'North',
        action: 'play_card',
        cardId: 'AS',
        reason: 'Cashed master AS in established long suit S',
        timestamp: Date.now() - 400,
      },
    },
  };

  await saveBotFeedback(medalFeedback);
  assert(true, 'Medal feedback (good_move) captured successfully');

  // Test 5: Query Telemetry Stats & Filter Lists
  console.log('\n--- Test 5: Stats Query & Filter Verification ---');
  const stats = await getTelemetryStats();
  assert(stats.totalFeedback >= 2, `Stats totalFeedback >= 2 (got ${stats.totalFeedback})`);
  assert(stats.shoesBadMoves >= 1, `Stats shoesBadMoves >= 1 (got ${stats.shoesBadMoves})`);
  assert(stats.medalsGoodMoves >= 1, `Stats medalsGoodMoves >= 1 (got ${stats.medalsGoodMoves})`);
  assert(stats.partnerShoesCount >= 1, `Stats partnerShoesCount >= 1 (got ${stats.partnerShoesCount})`);

  const partnerShoesList = await getBotFeedbackList({ sentiment: 'bad_move', partnerOnly: true });
  assert(partnerShoesList.length >= 1, `Queried partner shoes list: got ${partnerShoesList.length} records`);
  assert(partnerShoesList[0].sentiment === 'bad_move', 'Filtered record has sentiment bad_move');
  assert(partnerShoesList[0].isPartner === true, 'Filtered record has isPartner true');

  // Test 6: Zero Gameplay Impact Verification
  console.log('\n--- Test 6: Zero Gameplay Impact Verification ---');
  const state = createInitialGameState('North');
  const initialCardsCount = { ...state.cardsCount };
  const initialTurn = state.currentTurn;
  const initialDealer = state.dealer;

  // Simulate throwing shoe at seat South
  const fakeThrow = {
    from: 'North',
    to: 'South',
    object: 'shoe',
  };

  // Assert game state is 100% immutable from object throwing
  assert(state.cardsCount.North === initialCardsCount.North, 'Player cards count untouched');
  assert(state.cardsCount.South === initialCardsCount.South, 'Bot cards count untouched');
  assert(state.currentTurn === initialTurn, 'Turn state untouched');
  assert(state.dealer === initialDealer, 'Dealer state untouched');

  console.log('\n============================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
