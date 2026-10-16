# Remix Online Multiplayer Card Game — Technical Specification

**Version:** 3.0 (Verified Implementation)  
**Status:** Active & Implemented  
**Platform:** Full-Stack Node.js (Express + WebSocket `ws`) & React 19 SPA (Vite + Tailwind CSS v4)  
**Primary Entry Points:** [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts), [src/main.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/main.tsx), [src/App.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/App.tsx)

---

## 1. System Overview & Game Core

Remix is an online, real-time, 4-player trick-taking partnership card game. Four players sit at a virtual table divided into two competing partnerships: **Team 1** and **Team 2**.

### 1.1 Team Structure & Partnerships
* **4 Players / Seats**: Two partnerships of 2 players each.
  * **Team 1** (`TeamA` internally): Player 1 (North) and Player 2 (South) sitting opposite each other.
  * **Team 2** (`TeamB` internally): Player 1 (East) and Player 2 (West) sitting opposite each other.
* **Elimination of Compass Concept in UI**: While the internal codebase and data types represent positions using cardinal seats (`North`, `South`, `East`, `West`), all user-facing seats, badges, action banners, speech bubbles, standings, and history logs strictly reference **Team 1** and **Team 2**.

### 1.2 Universal Bottom Seat Orientation (Dynamic Perspective)
* Regardless of which physical seat (`North`, `South`, `East`, or `West`) a human player claims, their client interface **dynamically rotates to place them at the bottom location** of the table arena (`src/components/VirtualTable.tsx` lines 345–356).
* **Top Location**: The user's partner (same team: South $\leftrightarrow$ North, West $\leftrightarrow$ East).
* **Left Location**: The opponent sitting to the user's left (`getPrevSeat(mySeat)`).
* **Right Location**: The opponent sitting to the user's right (`getNextSeat(mySeat)`).
* **Spectator / Pre-Seat Mode**: If an unseated user enters a waiting room, they see open seats clearly marked with **Team 1 • Sit Here** or **Team 2 • Sit Here** buttons. Once claimed, the table rotates to orient the user at the bottom.

---

## 2. Game Phases & Rules Engine

Play proceeds strictly in a **Counter-Clockwise** direction across all phases:
`North` $\rightarrow$ `West` $\rightarrow$ `South` $\rightarrow$ `East` $\rightarrow$ `North` ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L62-L73)).

### 2.1 Phase 1: The Deal
1. A standard 52-card deck (Ranks: 2–A, Suits: Spades ♠, Hearts ♥, Diamonds ♦, Clubs ♣) is shuffled using the Fisher-Yates algorithm ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L124-L132)).
2. 13 cards are dealt to each of the 4 players.
3. Hand cards are automatically sorted by suit (`Spades` > `Hearts` > `Clubs` > `Diamonds`, with trump placed first if active) and rank descending.
4. For round 1, dealer selection is randomized among the 4 seats. In subsequent rounds, the dealer button rotates counter-clockwise (`getNextSeat(dealer)`).

### 2.2 Phase 2: The Auction (Bidding)
1. **Turn Sequence**: Exactly 4 turns in counter-clockwise order, beginning with the player to the **immediate right of the dealer** (`getNextSeat(dealer)`). The dealer always bids 4th (last).
2. **Valid Bids**:
   * **Level**: 1 through 7 (representing 6 base tricks + level, e.g., Level 2 requires $6 + 2 = 8$ tricks).
   * **Contract Type**: `Suit` (Trump Suit) or `NT` (No Trump).
3. **Ascending Hierarchy**:
   Rank formula: $\text{Rank} = \text{Level} \times 2 + (\text{ContractType} == \text{'NT'} ? 1 : 0)$  
   `1 Suit < 1 NT < 2 Suit < 2 NT < 3 Suit < 3 NT < ... < 7 Suit < 7 NT`
4. **Dealer Privileges (4th Turn)**:
   The dealer possesses strategic privileges on their turn ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L196-L225)):
   * **Pass**: Accepts the highest bid from turns 1–3.
   * **Match Suit**: Matches the highest numeric level to declare a Suit contract without needing to increase the level (e.g., if high bid is 2 Suit or 2 NT, dealer can claim 2 Suit).
   * **Match NT / Exceed**: Matches or exceeds the current high bid level.
5. **Contract Determination**: The highest bidder becomes the **Declarer**. If all 4 players pass, the cards are reshuffled and re-dealt with the dealer rotating counter-clockwise.

### 2.3 Phase 3: Trump Declaration
* If a `Suit` contract was won, the Declarer chooses the trump suit: Spades (♠), Hearts (♥), Diamonds (♦), or Clubs (♣) via [SuitDeclarationModal.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/SuitDeclarationModal.tsx).
* If a `NT` contract was won, this phase is skipped automatically and trump is set to `'NT'`.

### 2.4 Phase 4: Trick Play
1. **Opening Lead** ([server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L295) and [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L311)):
   * **In No Trump (`NT`) games**: The **Declarer leads first**.
   * **In Suit games**: The **player to the immediate right of the Declarer** (`getNextSeat(state.declarer)`) leads first.
   * *Subsequent tricks* are led by the winner of the previous trick.
2. **Following Suit (Mandatory Follow)**: Players must follow the suit led if they hold at least one card in that suit ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L228-L233)).
3. **Trumping & Discarding**: If void in the led suit, a player may play any card (trump or discard).
4. **Trick Evaluation** ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L238-L284)):
   * In Suit games: If any trump cards are played, the highest trump card wins.
   * Otherwise: The highest card of the led suit wins.
   * In NT games: Trumping is disabled; highest card of the led suit wins.
5. Exactly 13 tricks are played per round.

### 2.5 Phase 5: Scoring Engine
Scoring is calculated per round based on tricks won above the base threshold of 6 tricks ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L289-L394)). Let $L = \text{Bid Level}$, required tricks $= 6 + L$:

#### A. Suit Contracts
* **Bid Made** ($\text{Tricks} \ge 6 + L$):
  * Declarer Team: $+1$ point per trick won over 6 ($\text{Tricks} - 6$).
  * Defending Team: $0$ points.
* **Bid Set / Failed** ($\text{Tricks} < 6 + L$):
  * Declarer Team: Penalty of $-L$ points.
  * Defending Team: $+1$ point per trick won over 6 ($\max(0, \text{Defending Tricks} - 6)$).

#### B. No Trump (NT) Contracts (Doubled)
* **Bid Made** ($\text{Tricks} \ge 6 + L$):
  * Declarer Team: Base contract points $(L \times 2) + 1$ point for each overtrick over $(6 + L)$.
  * Defending Team: $0$ points.
* **Bid Set / Failed** ($\text{Tricks} < 6 + L$):
  * Declarer Team: Penalty of $-(L \times 2)$ points.
  * Defending Team: Points for tricks over 6: first $L$ tricks are worth 2 points each; further tricks are worth 1 point each.

### 2.6 Victory and Elimination Conditions
Evaluated by `checkMatchEnd()` ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L400-L449)):
* **Victory Condition**: First team to achieve **+11 Match Points**.
* **Elimination Condition**: Any team falling to **-11 Match Points** is eliminated.
* **Priority Rule**: If both conditions are triggered in the same round, reaching $+11$ (Victory) takes precedence over dropping to $-11$ (Elimination). If both teams reach $+11$, higher score wins.

---

## 3. Visual Layout, Table Style & Card Engine Specifications

### 3.1 Casino Table Architecture
* **Mahogany Wood Rail**: Styled via `.table-wood-rail` CSS class with golden brass bevel trim (`.table-brass-bevel`) and depth lighting.
* **Casino Emerald Felt Surface**: Radial gradient felt texture (`.table-felt-radial`) with subtle dashed inner perimeter stitch line (`.table-felt-stitch`).
* **Zero-Scroll Viewport**: The table layout fits within `100dvh` (`max-h-[100dvh] overflow-hidden`) with proportional card scaling and responsive containers.

### 3.2 High-Legibility Card Engine
* **Classic 2-Color Deck**:
  * Hearts (♥) & Diamonds (♦): Vibrant Red (`#dc2626`).
  * Spades (♠) & Clubs (♣): Deep Black/Charcoal (`#0f172a`).
* **Single Giant Center Pip for Numbers**: Number cards (2 through 10, and Ace) render a single bold center suit pip for instant legibility across devices ([CardView.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/CardView.tsx#L156-L163)). Ace of Spades includes an ornate vector centerpiece.
* **Royal Court Art for Court Cards (J, Q, K)**: Custom SVG illustrations with crowns, sceptres, armor, and heraldic patterns ([RoyalCourtArt.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/RoyalCourtArt.tsx)).
* **Corner Indices**: Bold rank typography stacked directly above the suit symbol in the top-left corner and bottom-right corner (inverted).
* **Opponent Face-Down Card Spreads**: Visual fans showing remaining card count for partner and opponents with diamond lattice card backs ([OpponentHandSpread.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/OpponentHandSpread.tsx)).

### 3.3 Configurable Animation Timing
Located in [src/logic/animationConfig.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/animationConfig.ts):

```typescript
export const ANIMATION_CONFIG = {
  CARD_PLAY_DURATION_MS: 400,          // Flight transition duration when card is played
  TRICK_REVIEW_DELAY_MS: 750,          // Pause duration after 4th card lands for review
  TRICK_COLLECT_DURATION_MS: 550,      // Sweep duration when trick cards fly to winner
  WINNER_CELEBRATION_DURATION_MS: 1000,// Celebration highlight duration (+1 Trick badge)
  CARD_FLIGHT_EASING: 'cubic-bezier(0.22, 1, 0.36, 1)',
  TRICK_SWEEP_EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const SERVER_TRICK_RESOLVE_DELAY_MS =
  ANIMATION_CONFIG.CARD_PLAY_DURATION_MS +
  ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS +
  ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS +
  150; // Total server delay = 1850ms
```

---

## 4. Artificial Intelligence & Simulation Engines

The application includes two distinct, complementary AI subsystems:

### 4.1 Monte Carlo Simulation Lab
* **Engine**: Headless simulation runner ([simulator.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/simulator.ts)) invoked via REST API `POST /api/simulate`.
* **Comparison**: PIMC + DDS Super Bot vs Heuristic Casual Bot.
* **Output**: Match win rates, trick averages, contract success percentages, and duration.
* **Brain Training**: When `saveToBrain: true`, simulation results update empirical EV and HCP thresholds in [src/data/learnedPolicy.json](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/data/learnedPolicy.json) via `trainPolicyFromSimulation()`.

### 4.2 AI Strategy Optimizer (Google Gemini API)
* **Engine**: Server-side proxy calling Google Gemini API (`@google/genai`).
* **Active Models**: Calls `gemini-3.1-flash-lite` in [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L996) and falls back across `['gemini-3.1-flash-lite', 'gemini-3.8-flash']` in [scripts/ai_optimize_superbot.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/scripts/ai_optimize_superbot.ts#L122).
* **Workflow**:
  1. Simulates batch games (e.g. 500–2,500 games) to record telemetry.
  2. Submits match telemetry alongside the current `BotPolicyData` to Gemini.
  3. Gemini provides qualitative strategic diagnosis and outputs optimized JSON policy weights.
  4. Automatically saves updated policy weights to `src/data/learnedPolicy.json`.

---

## 5. WebRTC Mesh Voice Chat Subsystem

A full-mesh peer-to-peer voice chat system integrated into the table interface ([useVoiceChat.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/lib/useVoiceChat.ts)):
* **Signaling**: Relayed through the primary WebSocket server via `voice_*` messages.
* **P2P Audio**: WebRTC `RTCPeerConnection` established between all seated peers using public Google STUN servers (`stun.l.google.com:19302`).
* **Voice Activity Detection (VAD)**: Real-time RMS audio analysis via Web Audio API `AudioContext` and `AnalyserNode` (`SPEAKING_RMS_THRESHOLD = 0.02`).
* **Controls**: Live mute, deafen, speaking indicators, and automatic cleanup on disconnect.

---

## 6. Authentication & Session Management

* **Google Identity Services (GIS)**: Loaded via `https://accounts.google.com/gsi/client` in [index.html](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/index.html).
* **Client Token Handling**: Initialized using `VITE_GOOGLE_CLIENT_ID`. JWT credentials are decoded client-side into player profile attributes ([GoogleAuthScreen.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/GoogleAuthScreen.tsx#L23-L39)).
* **Guest Fallback**: If no Client ID is provided or Google services are unavailable, a fallback modal enables manual display name entry with auto-generated avatars.
* **Per-Tab Isolation**: [session.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/lib/session.ts) maintains a unique `sessionStorage` token per browser tab, ensuring two tabs under the same Google account receive distinct in-game player IDs.

---

## 7. REST & WebSocket API Specification

### 7.1 REST HTTP Endpoints
| Method | Path | Request Body | Response | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | — | `{ status, time }` | Server health check |
| `GET` | `/api/rooms` | — | `RoomSummary[]` | Directory of active tables |
| `POST` | `/api/rooms` | `{ name, hostId, user }` | `Room` | Creates a new table instance |
| `DELETE` | `/api/rooms/:roomId` | — | `{ success, roomId }` | Deletes a table |
| `POST` | `/api/simulate` | `{ totalMatches, teamAStrategy, teamBStrategy, saveToBrain }` | `SimulationResult & { policy }` | Runs headless match simulation |
| `GET` | `/api/bot-brain` | — | `BotPolicyData` | Returns active bot policy |
| `POST` | `/api/bot-brain/reset` | — | `BotPolicyData` | Resets bot policy to factory weights |
| `POST` | `/api/ai-optimize` | `{ totalMatches }` | `{ baseline, analysis, adjustments, policy }` | Runs AI Gemini optimization |

### 7.2 Client-to-Server WebSocket Messages (`ClientMessage`)
| Type | Payload Properties | Description |
|---|---|---|
| `join_room` | `roomId: string, user: UserProfile` | Connects socket to room instance |
| `leave_room` | `roomId: string, user: UserProfile` | Vacates room and returns to lobby |
| `claim_seat` | `roomId: string, seat: Seat, user: UserProfile` | Claims an open seat on Team 1 or Team 2 |
| `leave_seat` | `roomId: string, seat: Seat` | Leaves seat while in waiting phase |
| `fill_bots` | `roomId: string` | Auto-seats user if unseated and fills open seats with AI bots |
| `set_bot_difficulty` | `roomId: string, difficulty: 'casual' \| 'super'` | Toggles bot intelligence engine |
| `make_bid` | `roomId: string, bid: Bid` | Submits a bid or pass during the Auction |
| `declare_trump` | `roomId: string, suit: Suit` | Submits trump suit selection |
| `play_card` | `roomId: string, seat: Seat, card: Card` | Plays a card to the active trick |
| `next_round` | `roomId: string` | Starts next round from round summary |
| `restart_match` | `roomId: string` | Resets match scores to 0-0 |
| `delete_room` | `roomId: string` | Closes and deletes the table |
| `voice_join` | `roomId: string, peerId: string, user: UserProfile, seat?: Seat \| null` | Joins table WebRTC voice room |
| `voice_leave` | `roomId: string, peerId: string` | Disconnects from voice room |
| `voice_signal` | `roomId: string, toPeerId: string, fromPeerId: string, signal: any` | Relays WebRTC SDP offer/answer/ICE |
| `voice_status` | `roomId: string, peerId: string, isMuted: boolean, isDeafened: boolean` | Broadcasts mute/deafen status |
| `voice_speaking` | `roomId: string, peerId: string, isSpeaking: boolean` | Broadcasts voice activity state |

### 7.3 Server-to-Client WebSocket Messages (`ServerMessage`)
| Type | Payload Properties | Description |
|---|---|---|
| `room_list` | `rooms: Array<{ id, name, playersCount, status }>` | Broadcasts active tables to lobby |
| `room_state` | `room: Room` | Full synchronized room and game state |
| `room_deleted` | `roomId: string` | Notifies clients that the table was deleted |
| `voice_peers_list`| `roomId: string, peers: VoicePeer[]` | Initial peer list sent to joining voice client |
| `voice_peer_joined`| `roomId: string, peer: VoicePeer` | Announces a new peer joining voice |
| `voice_peer_left` | `roomId: string, peerId: string` | Announces a peer disconnecting from voice |
| `voice_signal` | `roomId: string, fromPeerId: string, toPeerId: string, signal: any` | Relayed WebRTC signaling message |
| `voice_peer_status`| `roomId: string, peerId: string, isMuted: boolean, isDeafened: boolean` | Peer mute/deafen state change |
| `voice_peer_speaking`| `roomId: string, peerId: string, isSpeaking: boolean` | Peer voice activity state change |
| `error` | `message: string` | Validation or action error notice |
