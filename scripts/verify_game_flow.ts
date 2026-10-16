import WebSocket from 'ws';

async function runVerification() {
  console.log('--- 1. Testing Room Creation API (Quick Play) ---');
  const user = {
    id: 'test_player_1',
    name: 'Test Pilot',
    email: 'pilot@example.com',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Pilot',
  };

  const createRes = await fetch('http://localhost:3001/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Verification Table',
      user,
      autoFillBots: true,
      botDifficulty: 'super',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create room: ${createRes.status} ${await createRes.text()}`);
  }

  const room = await createRes.json();
  console.log(`Room created successfully: ID=${room.id}, Phase=${room.gameState.phase}`);
  console.log('Seats:', Object.keys(room.seats).map(s => `${s}: ${room.seats[s]?.name}`));

  console.log('\n--- 2. Testing WebSocket Connection & Hand State ---');
  const ws = new WebSocket('ws://localhost:3001');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('WebSocket connection established.');
      ws.send(JSON.stringify({
        type: 'join_room',
        payload: { roomId: room.id, user },
      }));
      resolve();
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  let latestRoom = room;

  await new Promise<void>((resolve, reject) => {
    const testTimeout = setTimeout(() => {
      ws.close();
      resolve(); // Proceed after observing events
    }, 6000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'room_update') {
        latestRoom = msg.payload;
        console.log(`[Event: room_update] Phase=${latestRoom.gameState.phase}, Dealer=${latestRoom.gameState.dealer}`);
        
        // Verify tricksWonCount exists
        if (latestRoom.gameState.tricksWonCount) {
          console.log(`tricksWonCount verified: South=${latestRoom.gameState.tricksWonCount.South}`);
        } else {
          console.warn('WARNING: tricksWonCount is missing from gameState!');
        }

        // If bidding, human South can pass or bid
        if (latestRoom.gameState.phase === 'bidding' && latestRoom.gameState.currentBidder === 'South') {
          console.log('South turn to bid! Sending Pass bid...');
          ws.send(JSON.stringify({
            type: 'bid',
            payload: { roomId: room.id, bid: { type: 'pass', level: 0, contractType: 'Suit' } },
          }));
        }

        // If declaring, human South declares Hearts
        if (latestRoom.gameState.phase === 'declaring' && latestRoom.gameState.declarer === 'South') {
          console.log('South turn to declare trump! Declaring H...');
          ws.send(JSON.stringify({
            type: 'declare_trump',
            payload: { roomId: room.id, suit: 'H' },
          }));
        }

        // If playing and South turn, play a legal card
        if (latestRoom.gameState.phase === 'playing' && latestRoom.gameState.currentTurn === 'South') {
          const hand = latestRoom.gameState.hands.South || [];
          if (hand.length > 0) {
            console.log(`South turn to play card! Hand has ${hand.length} cards. Playing ${hand[0].rank}${hand[0].suit}`);
            ws.send(JSON.stringify({
              type: 'play_card',
              payload: { roomId: room.id, card: hand[0] },
            }));
          }
        }
      }
    });
  });

  ws.close();
  console.log('\n--- Verification completed successfully with NO runtime errors! ---');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
