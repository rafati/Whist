# API & Integration Reference: Remix Online Multiplayer Card Game

**Version:** 3.0  
**Transport Protocols:** HTTP/1.1 (JSON REST), WebSocket (`ws`), WebRTC (Data/Voice)  
**Implementation Source:** [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts), [src/types.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/types.ts)

---

## 1. REST HTTP Endpoints

Base URL: `http://localhost:3000` (or `APP_URL` / `VITE_API_URL` environment variable).

### 1.1 Health Check
* **Endpoint:** `GET /api/health`
* **Headers:** None required
* **Description:** Verifies that the Express application server is running and responding.
* **Success Response (200 OK):**
```json
{
  "status": "ok",
  "time": "2026-10-15T19:30:00.000Z"
}
```

---

### 1.2 Room Directory
* **Endpoint:** `GET /api/rooms`
* **Description:** Retrieves the list of all currently active public (`!isPrivate`) virtual tables.
* **Success Response (200 OK):**
```json
[
  {
    "id": "grand-table-1",
    "code": "GRAND1",
    "name": "Grand Table 1 (Public)",
    "playersCount": 0,
    "status": "waiting",
    "isPrivate": false,
    "turnTimerSeconds": 10
  }
]
```

---

### 1.3 Create Table
* **Endpoint:** `POST /api/rooms`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "name": "High Stakes Table",
  "hostId": "user_sub123_sess456",
  "isPrivate": true,
  "turnTimerSeconds": 10,
  "user": {
    "id": "user_sub123_sess456",
    "name": "Alex",
    "email": "alex@example.com",
    "avatar": "https://api.dicebear.com/7.x/initials/svg?seed=Alex"
  }
}
```
* **Success Response (200 OK):** Returns the full `Room` object with an auto-generated 6-character alphanumeric `code` (e.g., `K7M4P2`). Automatically seats the creator in the `South` seat.
* **Side Effect:** Automatically broadcasts `room_list` to all connected lobby clients.

---

### 1.3b Lookup Table by Room Code
* **Endpoint:** `GET /api/rooms/by-code/:code`
* **Parameters:** `code` (6-character room code, case-insensitive)
* **Description:** Resolves a public or private room by its 6-character invite code.
* **Success Response (200 OK):** Returns the full `Room` object.
* **Error Response (404 Not Found):** `{ "error": "No table found with that room code" }`

---

### 1.3c Quick Play Matchmaking
* **Endpoint:** `POST /api/matchmaking`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "user": {
    "id": "user_sub123_sess456",
    "name": "Alex",
    "email": "alex@example.com",
    "avatar": "https://api.dicebear.com/7.x/initials/svg?seed=Alex"
  }
}
```
* **Description:** Finds the best open public waiting table with the highest number of seated humans (1–3) and an available seat, or creates a new public matchmaking table if none are available. Automatically claims the first open seat for the requesting user and schedules a 15-second auto-fill timer (`matchmakingAutoStartAt`) to fill remaining seats with AI bots if 4 humans haven't joined yet.
* **Success Response (200 OK):** Returns `{ "room": Room, "seat": Seat }`.

---

### 1.4 Delete Table
* **Endpoint:** `DELETE /api/rooms/:roomId`
* **Parameters:** `roomId` (string)
* **Success Response (200 OK):**
```json
{
  "success": true,
  "roomId": "room_xyz123"
}
```
* **Error Response (404 Not Found):**
```json
{
  "error": "Room not found"
}
```
* **Side Effects:** Cancels active bot, turn, and matchmaking timers, disbands voice chat peers, broadcasts `room_deleted` to players inside the table, and broadcasts `room_list` to lobby clients.

---

### 1.5 Run Simulation
* **Endpoint:** `POST /api/simulate`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "totalMatches": 50,
  "teamAStrategy": "super",
  "teamBStrategy": "casual",
  "maxRoundsPerMatch": 20,
  "saveToBrain": true
}
```
* **Constraints:** `totalMatches` is clamped between 1 and 5,000.
* **Success Response (200 OK):**
```json
{
  "totalMatches": 50,
  "totalRounds": 420,
  "teamAWins": 42,
  "teamBWins": 8,
  "teamAWinRate": 84,
  "teamBWinRate": 16,
  "teamAAverageTricks": 7.42,
  "teamBAverageTricks": 5.58,
  "teamABidSuccessRate": 88,
  "teamBBidSuccessRate": 64,
  "teamATotalContracts": 320,
  "teamBTotalContracts": 100,
  "teamASuccessfulContracts": 281,
  "teamBSuccessfulContracts": 64,
  "averageRoundsPerMatch": 8.4,
  "durationMs": 420,
  "policy": { ... }
}
```

---

### 1.6 Bot Policy Inspection
* **Endpoint:** `GET /api/bot-brain`
* **Description:** Retrieves the current active AI policy weights, bidding thresholds, and opening books.
* **Success Response (200 OK):** Returns `BotPolicyData` JSON.

---

### 1.7 Reset Bot Policy
* **Endpoint:** `POST /api/bot-brain/reset`
* **Description:** Resets the bot policy to default tournament factory weights and saves it to disk.
* **Success Response (200 OK):** Returns reset `BotPolicyData` JSON.

---

### 1.8 AI Autonomous Strategy Optimization (Gemini API)
* **Endpoint:** `POST /api/ai-optimize`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "totalMatches": 500
}
```
* **Constraints:** `totalMatches` clamped between 100 and 2,000.
* **Operation:** Runs baseline self-play match simulation, formats diagnostic telemetry, calls `@google/genai` model `gemini-3.1-flash-lite`, parses structured JSON recommendations, updates and saves `learnedPolicy.json`.
* **Success Response (200 OK):**
```json
{
  "baseline": { ... },
  "analysis": "Super Bot struggles when overbidding in 2 NT contracts without side entry...",
  "adjustments": [
    "Tighten minimum HCP for 2 NT to 16.5",
    "Increase partner void ruffing priority to 2.8"
  ],
  "policy": { ... }
}
```

---

## 2. Real-Time WebSocket API

WebSocket server runs on the same port as the HTTP server. Clients connect via `ws://${host}` (or `wss://${host}` when on HTTPS).

### 2.1 Client-to-Server Messages (`ClientMessage`)

#### `join_room`
Connects socket to a room instance.
```json
{
  "type": "join_room",
  "roomId": "room_123",
  "user": {
    "id": "user_abc",
    "name": "Jordan",
    "email": "jordan@example.com",
    "avatar": "https://api.dicebear.com/7.x/initials/svg?seed=Jordan"
  }
}
```

#### `leave_room`
Vacates room and returns socket association to the lobby.
```json
{
  "type": "leave_room",
  "roomId": "room_123",
  "user": { "id": "user_abc", ... }
}
```

#### `claim_seat`
Claims an unoccupied seat.
```json
{
  "type": "claim_seat",
  "roomId": "room_123",
  "seat": "South",
  "user": { "id": "user_abc", ... }
}
```

#### `leave_seat`
Vacates a claimed seat (only allowed during `'waiting'` phase).
```json
{
  "type": "leave_seat",
  "roomId": "room_123",
  "seat": "South"
}
```

#### `fill_bots`
Seats the calling user in the first open slot (if not seated) and fills all remaining open seats with AI bots.
```json
{
  "type": "fill_bots",
  "roomId": "room_123"
}
```

#### `set_bot_difficulty`
Toggles AI bot difficulty between casual and tournament super bot.
```json
{
  "type": "set_bot_difficulty",
  "roomId": "room_123",
  "difficulty": "super"
}
```

#### `set_turn_timer`
Configures the per-turn human countdown timer (in seconds; `0` disables the timer, or `5`, `10`, `15`, `30`) before an AI Bot automatically executes the turn on the player's behalf.
```json
{
  "type": "set_turn_timer",
  "roomId": "room_123",
  "seconds": 10
}
```

#### `make_bid`
Submits a bid or pass during the Auction phase.
```json
{
  "type": "make_bid",
  "roomId": "room_123",
  "bid": {
    "seat": "South",
    "type": "bid",
    "level": 2,
    "contractType": "Suit"
  }
}
```
*(Or for pass: `{ "seat": "South", "type": "pass" }`)*

#### `declare_trump`
Submits trump suit selection during `'declaring'` phase (Declarer only).
```json
{
  "type": "declare_trump",
  "roomId": "room_123",
  "suit": "S"
}
```

#### `play_card`
Plays a card from hand to the active trick.
```json
{
  "type": "play_card",
  "roomId": "room_123",
  "seat": "South",
  "card": { "id": "AS", "suit": "S", "rank": "A" }
}
```

#### `next_round`
Advances game from `'round_over'` to next round.
```json
{
  "type": "next_round",
  "roomId": "room_123"
}
```

#### `restart_match`
Resets cumulative match scores to 0-0 and starts Round 1.
```json
{
  "type": "restart_match",
  "roomId": "room_123"
}
```

#### `skip_misdeal`
Bypasses the 10-second misdeal reveal timer to immediately re-deal cards.
```json
{
  "type": "skip_misdeal",
  "roomId": "room_123"
}
```

#### `delete_room`
Deletes the room table.
```json
{
  "type": "delete_room",
  "roomId": "room_123"
}
```

---

### 2.2 WebRTC Voice Chat Signaling Messages

#### `voice_join`
Announces presence in table voice room.
```json
{
  "type": "voice_join",
  "roomId": "room_123",
  "peerId": "user_abc",
  "user": { "id": "user_abc", "name": "Jordan", ... },
  "seat": "South"
}
```

#### `voice_leave`
Disconnects from voice room.
```json
{
  "type": "voice_leave",
  "roomId": "room_123",
  "peerId": "user_abc"
}
```

#### `voice_signal`
Relays WebRTC offer, answer, or ICE candidate to another peer.
```json
{
  "type": "voice_signal",
  "roomId": "room_123",
  "fromPeerId": "user_abc",
  "toPeerId": "user_xyz",
  "signal": { "type": "candidate", "candidate": { ... } }
}
```

#### `voice_status`
Broadcasts mute or deafen toggles.
```json
{
  "type": "voice_status",
  "roomId": "room_123",
  "peerId": "user_abc",
  "isMuted": true,
  "isDeafened": false
}
```

#### `voice_speaking`
Broadcasts real-time voice activity detection (VAD).
```json
{
  "type": "voice_speaking",
  "roomId": "room_123",
  "peerId": "user_abc",
  "isSpeaking": true
}
```

---

### 2.3 Server-to-Client Messages (`ServerMessage`)

* `room_list`: Emits `{ type: 'room_list', rooms: RoomSummary[] }` to clients in lobby.
* `room_state`: Emits `{ type: 'room_state', room: Room }` to all clients in that room.
* `room_deleted`: Emits `{ type: 'room_deleted', roomId: string }` when table is deleted.
* `voice_peers_list`: Emits `{ type: 'voice_peers_list', roomId, peers: VoicePeer[] }` to newly joined voice peer.
* `voice_peer_joined`: Emits `{ type: 'voice_peer_joined', roomId, peer: VoicePeer }` to other voice peers.
* `voice_peer_left`: Emits `{ type: 'voice_peer_left', roomId, peerId }` when peer disconnects.
* `voice_signal`: Emits relayed WebRTC signaling object directly to destination socket.
* `voice_peer_status`: Broadcasts peer mute/deafen updates.
* `voice_peer_speaking`: Broadcasts peer speaking halo state.
* `error`: Emits `{ type: 'error', message: string }` on validation or action failures.
