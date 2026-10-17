import WebSocket from 'ws';
import { Room, ServerMessage } from '../src/types.ts';

const BASE_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function waitForRoomState(
  ws: WebSocket,
  predicate: (room: Room) => boolean,
  timeoutMs = 15000,
  label = 'room_state predicate'
): Promise<Room> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`));
    }, timeoutMs);

    const onMsg = (data: WebSocket.RawData) => {
      try {
        const msg: ServerMessage = JSON.parse(data.toString());
        if (msg.type === 'room_state' && predicate(msg.room)) {
          clearTimeout(timer);
          ws.off('message', onMsg);
          resolve(msg.room);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.on('message', onMsg);
  });
}

async function runTest() {
  console.log('=== Testing Human Player Leave -> 10s Countdown -> Bot Replacement ===');

  const alice = {
    id: 'user_alice_test',
    name: 'Alice',
    email: 'alice@example.com',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Alice',
  };

  const bob = {
    id: 'user_bob_test',
    name: 'Bob',
    email: 'bob@example.com',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Bob',
  };

  // 1. Create room via REST API
  const createRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Disconnect Test Table',
      hostId: alice.id,
      user: alice,
      botDifficulty: 'super',
      autoFillBots: false,
    }),
  });
  const createdRoom: Room = await createRes.json();
  const roomId = createdRoom.id;
  console.log(`1. Created test room: ${roomId}`);

  const wsAlice = new WebSocket(WS_URL);
  const wsBob = new WebSocket(WS_URL);

  await Promise.all([
    new Promise((res) => wsAlice.once('open', res)),
    new Promise((res) => wsBob.once('open', res)),
  ]);

  // 2. Alice and Bob join room, Bob claims West, then fill_bots starts the game
  wsAlice.send(JSON.stringify({ type: 'join_room', roomId, user: alice }));
  wsBob.send(JSON.stringify({ type: 'join_room', roomId, user: bob }));

  await waitForRoomState(wsBob, (r) => r.id === roomId, 3000, 'Bob initial join');

  wsBob.send(JSON.stringify({ type: 'claim_seat', roomId, seat: 'West', user: bob }));
  await waitForRoomState(wsAlice, (r) => r.seats.West?.id === bob.id, 3000, 'Bob seated at West');

  wsAlice.send(JSON.stringify({ type: 'fill_bots', roomId }));
  const startedRoom = await waitForRoomState(
    wsAlice,
    (r) => r.gameState.phase !== 'waiting',
    5000,
    'Game started with 2 humans + 2 bots'
  );
  console.log(`2. Game active in phase: ${startedRoom.gameState.phase}`);

  // 3. Test Scenario A: Bob leaves the room via leave_room, then returns within 10s
  console.log('3. Bob leaves room (leave_room) — verifying immediate disconnected state & 10s timer...');
  const disconnectPromiseA = waitForRoomState(
    wsAlice,
    (r) => Boolean(r.seats.West?.id === bob.id && r.seats.West?.isDisconnected),
    3000,
    'Bob marked as isDisconnected after leave_room'
  );
  wsBob.send(JSON.stringify({ type: 'leave_room', roomId }));

  const disconnectedRoomA = await disconnectPromiseA;
  const replaceAtA = disconnectedRoomA.seats.West?.botReplaceAt || 0;
  const remainingMsA = replaceAtA - Date.now();
  console.log(`   -> Verified West isDisconnected=true, botReplaceAt in ~${Math.round(remainingMsA / 1000)}s`);
  assert(remainingMsA > 7000 && remainingMsA <= 10500, `Expected ~10s grace timer, got ${remainingMsA}ms`);

  // Bob returns after 1.2s (well within the 10s window)
  await new Promise((r) => setTimeout(r, 1200));
  console.log('4. Bob rejoins within 10s window — verifying timer cancellation and seat restoration...');
  const restorePromise = waitForRoomState(
    wsAlice,
    (r) => Boolean(r.seats.West?.id === bob.id && !r.seats.West?.isDisconnected && !r.seats.West?.isBot),
    3000,
    'Bob restored to seat West'
  );
  wsBob.send(JSON.stringify({ type: 'join_room', roomId, user: bob }));
  const restoredRoom = await restorePromise;
  assert(restoredRoom.seats.West?.id === bob.id, 'West should still be Bob');
  assert(!restoredRoom.seats.West?.isDisconnected, 'West should no longer be marked disconnected');
  assert(restoredRoom.seats.West?.botReplaceAt === undefined, 'botReplaceAt should be cleared');
  console.log('   -> Verified Bob restored seamlessly before 10s!');

  // 4. Test Scenario B: Bob closes his WebSocket and does NOT return for 10 seconds
  console.log('5. Bob disconnects (ws.close()) and does NOT return — waiting 10s for Bot replacement...');
  const disconnectPromiseB = waitForRoomState(
    wsAlice,
    (r) => Boolean(r.seats.West?.id === bob.id && r.seats.West?.isDisconnected),
    3000,
    'Bob marked as isDisconnected after socket close'
  );
  const closeStartTime = Date.now();
  wsBob.close();

  await disconnectPromiseB;
  console.log('   -> Alice notified immediately that Bob left. Waiting for 10-second countdown...');

  const botReplacedRoom = await waitForRoomState(
    wsAlice,
    (r) => Boolean(r.seats.West?.isBot === true),
    13000,
    'West seat replaced by Bot after 10 seconds'
  );
  const elapsedMs = Date.now() - closeStartTime;
  console.log(
    `   -> West replaced by "${botReplacedRoom.seats.West?.name}" (isBot=${botReplacedRoom.seats.West?.isBot}) after ${elapsedMs}ms!`
  );
  assert(elapsedMs >= 9500 && elapsedMs <= 12500, `Expected replacement around 10000ms, took ${elapsedMs}ms`);
  assert(botReplacedRoom.seats.North?.name === 'فاشي الاسرار', `Expected North bot name to be فاشي الاسرار, got ${botReplacedRoom.seats.North?.name}`);
  assert(botReplacedRoom.seats.West?.name === 'صف السادس', `Expected West bot name to be صف السادس, got ${botReplacedRoom.seats.West?.name}`);
  assert(botReplacedRoom.seats.East?.name === 'ابو قرون', `Expected East bot name to be ابو قرون, got ${botReplacedRoom.seats.East?.name}`);

  // Cleanup test room
  await fetch(`${BASE_URL}/api/rooms/${roomId}`, { method: 'DELETE' });
  wsAlice.close();
  console.log('=== ALL DISCONNECT & 10s BOT REPLACEMENT TESTS PASSED! ===');
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
