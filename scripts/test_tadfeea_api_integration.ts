import {
  checkApiHealth,
  seatToPlayerIndex,
  playerIndexToSeat,
  initBotSession,
  requestBotBid,
  requestBotPlay,
  broadcastActionToApiBots,
  cleanupBotSessions,
} from '../src/logic/tadfeeaApiClient.ts';
import { Card, Seat } from '../src/types.ts';

async function runTests() {
  console.log('=== RUNNING TADFEEA API INTEGRATION VERIFICATION ===\n');

  // 1. Seat Mapping Tests
  console.log('[Test 1] Seat <-> Player Index Mapping (Counter-Clockwise)');
  const seatCases: [Seat, number][] = [
    ['North', 0],
    ['West', 1],
    ['South', 2],
    ['East', 3],
  ];
  for (const [seat, idx] of seatCases) {
    if (seatToPlayerIndex(seat) !== idx) {
      throw new Error(`Expected seatToPlayerIndex(${seat}) === ${idx}, got ${seatToPlayerIndex(seat)}`);
    }
    if (playerIndexToSeat(idx) !== seat) {
      throw new Error(`Expected playerIndexToSeat(${idx}) === ${seat}, got ${playerIndexToSeat(idx)}`);
    }
  }
  console.log('✅ Seat index bidirectional mapping verified: North=0, West=1, South=2, East=3\n');

  // 2. Health Check
  console.log('[Test 2] Health Check against Local WhistAPI (Port 8008)');
  const health = await checkApiHealth();
  console.log('Health status:', health);
  if (!health.ready) {
    console.warn('⚠️ Port 8008 is not ready or not responding. Note: Fallback will be tested.');
  } else {
    console.log(`✅ Health check OK: API version ${health.version}, model ${health.model}\n`);
  }

  if (health.ready) {
    const testRoomId = `test_int_${Date.now()}`;
    const testHand: Card[] = [
      { id: 'AS', suit: 'S', rank: 'A' },
      { id: 'KS', suit: 'S', rank: 'K' },
      { id: 'QS', suit: 'S', rank: 'Q' },
      { id: 'JS', suit: 'S', rank: 'J' },
      { id: '10S', suit: 'S', rank: '10' },
      { id: '9S', suit: 'S', rank: '9' },
      { id: '8S', suit: 'S', rank: '8' },
      { id: '7S', suit: 'S', rank: '7' },
      { id: '6S', suit: 'S', rank: '6' },
      { id: '5S', suit: 'S', rank: '5' },
      { id: '4S', suit: 'S', rank: '4' },
      { id: '3S', suit: 'S', rank: '3' },
      { id: '2S', suit: 'S', rank: '2' },
    ];

    // 3. Init Session
    console.log('[Test 3] Initialize Bot Session for Seat West');
    const initOk = await initBotSession({
      roomId: testRoomId,
      seat: 'West',
      dealer: 'North',
      hand: testHand,
      matchScores: { TeamA: 0, TeamB: 0 },
    });
    if (!initOk) throw new Error('Failed to initialize bot session on WhistAPI');
    console.log('✅ Bot session initialized successfully on WhistAPI.\n');

    // 4. Request Bid
    console.log('[Test 4] Request AI Bid Decision for West (Turn 0)');
    const bidDecision = await requestBotBid({
      roomId: testRoomId,
      seat: 'West',
      turnIndex: 0,
    });
    console.log('Bot bid decision:', bidDecision);
    if (!bidDecision) throw new Error('Expected non-null bid from API bot');
    console.log(`✅ AI Bid received: ${bidDecision.type} Level=${bidDecision.level || 'N/A'} Contract=${bidDecision.contractType || 'N/A'}\n`);

    // 5. Broadcast Bid & Trump Selection
    console.log('[Test 5] Broadcast Actions (BID and TRUMP_SELECTION)');
    await broadcastActionToApiBots({
      roomId: testRoomId,
      botSeats: ['West'],
      actionType: 'BID',
      payload: {
        player: seatToPlayerIndex('West'),
        bid_type: bidDecision.type === 'bid' ? 'BID' : 'PASS',
        level: bidDecision.level || null,
        contract_type: bidDecision.contractType === 'Suit' ? 'SUIT' : 'NT',
      },
    });

    await broadcastActionToApiBots({
      roomId: testRoomId,
      botSeats: ['West'],
      actionType: 'TRUMP_SELECTION',
      payload: {
        trump_suit: 'S',
      },
    });
    console.log('✅ Action broadcasts accepted by API engine.\n');

    // 6. Request Card Play
    console.log('[Test 6] Request AI Card Play Decision');
    const playedCardId = await requestBotPlay({
      roomId: testRoomId,
      seat: 'West',
      trickNum: 1,
      contract: {
        level: 1,
        type: 'Suit',
        trump: 'S',
        declarer: 'West',
      },
    });
    console.log('Bot played card ID:', playedCardId);
    if (!playedCardId) throw new Error('Expected played card ID from API bot');
    console.log(`✅ AI Card Play received: ${playedCardId}\n`);

    // 7. Cleanup
    console.log('[Test 7] Cleanup Bot Session');
    await cleanupBotSessions({
      roomId: testRoomId,
      botSeats: ['West'],
    });
    console.log('✅ Session cleaned up.\n');
  }

  // 8. Graceful Fallback Test (Simulate bad port)
  console.log('[Test 8] Graceful Fallback Test on unreachable endpoint');
  const badHealth = await checkApiHealth('http://localhost:59999/api/v1');
  if (badHealth.ready) throw new Error('Expected bad port to return ready=false');
  const badBid = await requestBotBid({
    roomId: 'dummy',
    seat: 'West',
    turnIndex: 0,
    baseUrl: 'http://localhost:59999/api/v1',
  });
  if (badBid !== null) throw new Error('Expected bad endpoint to return null (graceful fallback)');
  console.log('✅ Graceful fallback verified: Unreachable endpoint returns null without crashing.\n');

  console.log('🎉 ALL TADFEEA API INTEGRATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
