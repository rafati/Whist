# تدفيع الثمن (Remix) — Technical Specification

**Version:** 3.2 (Verified Implementation)  
**Status:** Active & Implemented  
**Platform:** Full-Stack Node.js (Express + WebSocket `ws`) & React 19 SPA (Vite + Tailwind CSS v4)  
**Primary Entry Points:** [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts), [src/main.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/main.tsx), [src/App.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/App.tsx)

---

## 1. System Overview & Game Core

**تدفيع الثمن** (Remix) is an online, real-time, 4-player trick-taking partnership card game. Four players sit at a virtual table divided into two competing partnerships: **Team 1** and **Team 2**.

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
5. **Unwinnable Hand / Misdeal ("Kosh") Rule**:
   * Each dealt 13-card hand is validated to ensure it contains at least one **winning card** ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L508-L532)):
     * Any **Ace (`A`)**
     * Any **King (`K`)** with at least 1 other card of the same suit (suit length $\ge 2$)
     * Any **Queen (`Q`)** with at least 2 other cards of the same suit (suit length $\ge 3$)
     * Any **Jack (`J`)** with at least 3 other cards of the same suit (suit length $\ge 4$)
   * If any player's hand contains none of the above (has 0 winning cards):
     * The game immediately enters the `'misdeal'` phase.
     * The unwinnable player's 13-card hand is revealed face-up in the center arena for 10 seconds via [MisdealModal.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/MisdealModal.tsx).
     * An animated countdown bar indicates automatic re-dealing. The host or players can click **"Deal Now"** (`skip_misdeal`) to bypass the countdown.
     * When re-dealt, the deal advances **counter-clockwise** to the next dealer (`getNextSeat(dealer)`).

### 2.2 Phase 2: The Auction (Bidding)
1. **Turn Sequence**: Exactly 4 turns in counter-clockwise order, beginning with the player to the **immediate right of the dealer** (`getNextSeat(dealer)`). The dealer always bids 4th (last).
2. **Valid Bids**:
   * **Level**: 1 through 7 (representing 6 base tricks + level, e.g., Level 2 requires $6 + 2 = 8$ tricks).
   * **Contract Type**: `Suit` (Trump Suit) or `NT` (No Trump).
3. **Ascending Hierarchy**:
   Rank formula: $\text{Rank} = \text{Level} \times 2 + (\text{ContractType} == \text{'NT'} ? 1 : 0)$  
   `1 Suit < 1 NT < 2 Suit < 2 NT < 3 Suit < 3 NT < ... < 7 Suit < 7 NT`
4. **Dealer Privileges (4th Turn)**:
   The dealer possesses strategic privileges on their turn ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L206-L298)):
   * **Pass**: Accepts the highest bid from turns 1–3.
   * **When Highest Bid reached Dealer as Suit (e.g. `2 Suit`)**:
     * Dealer can **Match Suit** at the same level (`Match 2 Suit`, 8 tricks) with `isDealerPrivilegeMatch: true`.
     * Dealer can bid higher (`2 NT`, `3 Suit`, `3 NT`, etc.).
   * **When Highest Bid reached Dealer as No Trump (e.g. `2 NT`)**:
     * Dealer can take No Trump with the **same number or higher** (`Match 2 No Trump`, `Bid 3 No Trump`, etc.).
     * If the dealer wants to take it **Suit**, it must be **one or more higher** (e.g., `3 Suit` or above). Matching `2 Suit` against `2 NT` is strictly disallowed.
5. **Contract Determination**: The highest bidder becomes the **Declarer**. If all 4 players pass, the cards are reshuffled and re-dealt with the dealer rotating counter-clockwise.

### 2.3 Phase 3: Trump Declaration
* If a `Suit` contract was won, the Declarer chooses the trump suit: Spades (♠), Hearts (♥), Diamonds (♦), or Clubs (♣) via [SuitDeclarationModal.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/SuitDeclarationModal.tsx).
* If a `NT` contract was won, this phase is skipped automatically and trump is set to `'NT'`.

### 2.4 Phase 4: Trick Play
1. **Opening Lead** ([server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L295) and [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L311)):
   * **In No Trump (`NT`) games**: The **Declarer leads first**.
   * **In Suit games**: The **player to the immediate right of the Declarer** (`getNextSeat(state.declarer)`) leads first.
   * *Subsequent tricks* are led by the winner of the previous trick.
2. **Following Suit (Mandatory Follow)**: Players must follow the suit led if they hold at least one card in that suit ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L228-L233)). In the UI ([VirtualTable.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/VirtualTable.tsx)), `currentLedSuit` is always derived from the authoritative server state (`gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null`) rather than the animation-buffered `displayTrick`, and trick review/sweep timers (`gatherTimerRef`, `finishTimerRef`, `celebrateTimerRef`) are stored in refs so winning the 4th card of a trick immediately allows the winner to lead any suit on the next trick.
3. **Trumping & Discarding**: If void in the led suit, a player may play any card (trump or discard).
4. **Trick Evaluation** ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L238-L284)):
   * In Suit games: If any trump cards are played, the highest trump card wins.
   * Otherwise: The highest card of the led suit wins.
   * In NT games: Trumping is disabled; highest card of the led suit wins.
5. Exactly 13 tricks are played per round.

#### 2.4.1 Continuous Swipe-to-Throw & Flight Animation Engine
* **Unconstrained Swipe Dragging**: Cards in hand follow finger/mouse drag upward without artificial limits (up to -650px), enabling the card to follow the pointer directly into the center table felt.
* **Commit on Release**: If released while swiped up toward or inside the playing area ($\Delta Y \le -40\text{px}$ or upward flick), the throw is committed.
* **Continuous Release Trajectory**: The card does not snap back or pop into the center. Instead, an active flying overlay card initiates directly from the card's exact release screen coordinates and continues smoothly along its momentum vector until it lands on the bottom trick slot on the table.
* **Pull-Back to Cancel**: If the player changes their mind while dragging and pulls the card back down towards their hand spread ($\Delta Y > -40\text{px}$), the throw is cancelled upon release and the card springs smoothly back into its hand slot.
* **Desktop & Touch Parity**: Both mobile touch swipe-and-release and desktop mouse click-and-drag are supported, alongside instant 1-click/1-tap play.
* **Procedural Audio Synthesis**: Native browser `AudioContext` synthesizes a realistic card friction slide and felt snap click upon landing.

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
* **Victory Condition**: First team to achieve **+10 Match Points**.
* **Elimination Condition**: Any team falling to **-10 Match Points** is eliminated.
* **Priority Rule**: If both conditions are triggered in the same round, reaching $+10$ (Victory) takes precedence over dropping to $-10$ (Elimination). If both teams reach $+10$, higher score wins.

---

## 3. Visual Layout, Table Style & Card Engine Specifications

### 3.1 Casino Table Architecture & UI Layout
* **Mahogany Wood Rail**: Styled via `.table-wood-rail` CSS class with golden brass bevel trim (`.table-brass-bevel`) and depth lighting.
* **Casino Emerald Felt Surface**: Radial gradient felt texture (`.table-felt-radial`) with subtle dashed inner perimeter stitch line (`.table-felt-stitch`).
* **Clean Uncluttered Arena**: Redundant card stacks and counters for opponents have been completely removed from the felt to preserve focus on active card play.
* **Player Seat Indicators**:
  * **Auction Bids**: During bidding, every seat displays their active bid or a `Passed` badge directly above/below their avatar.
  * **Winning Contract Badge**: The Declarer is clearly marked with a golden crown badge (`👑 Winning Bid: <level><suit>`) throughout the playing phase.
* **Zero-Scroll Viewport**: The table layout fits within `100dvh` (`max-h-[100dvh] overflow-hidden`) with proportional card scaling and responsive containers for both mobile portrait and widescreen landscape modes.

### 3.2 Card Engine & Touch Interaction Specifications
* **Classic 2-Color Deck**:
  * Hearts (♥) & Diamonds (♦): Vibrant Red (`#c02626`).
  * Spades (♠) & Clubs (♣): Deep Black/Charcoal (`#0f172a`).
* **Geometric Pip Layouts**: Number cards (2 through 10) use authentic multi-pip vector SVG coordinates matching standard casino playing cards ([CardView.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/CardView.tsx)). Ace of Spades includes an ornate vector filigree centerpiece.
* **Royal Court Art for Court Cards (J, Q, K)**: Custom double-headed SVG illustrations with crowns, sceptres, armor, and heraldic patterns ([RoyalCourtArt.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/RoyalCourtArt.tsx)).
* **Corner Indices**: Bold serif typography stacked directly above the suit symbol in the top-left corner and bottom-right corner (inverted).
* **Single-Tap / 1-Click Card Play**: Zero double-tap confirmation required on touch devices. Tapping or clicking any legal playable card plays it immediately.
* **Swipe-Up "Throw" Gesture**: On touchscreens, players can flick or swipe cards upward to throw them onto the felt:
  * Upward movement tracks touch displacement dynamically (`translate3d`) with subtle tilt and elevated drop shadow.
  * Passing the throw threshold (drag $> 30\text{px}$ up, or flick with velocity $< -0.2\text{px/ms}$) displays an animated `Throw ↑` badge and plays the card upon release.
  * Horizontal scrolling/panning gestures across the hand are isolated and protected (`touch-action: pan-x`).

### 3.3 Configurable Animation Timing
Located in [src/logic/animationConfig.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/animationConfig.ts):

```typescript
export const ANIMATION_CONFIG = {
  CARD_PLAY_DURATION_MS: 400,          // Flight transition duration when card is played
  TRICK_REVIEW_DELAY_MS: 750,          // Pause duration after 4th card lands for review
  TRICK_COLLECT_DURATION_MS: 550,      // Sweep duration when trick cards fly to winner
  WINNER_CELEBRATION_DURATION_MS: 1000,// Winner seat highlight duration
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
| `skip_misdeal` | `roomId: string` | Bypasses 10s countdown to immediately re-deal on misdeal |
| `delete_room` | `roomId: string` | Closes and deletes the table |
| `throw_object` | `roomId: string, fromSeat: Seat, toSeat: Seat, objectType: ThrowableObjectType` | Throws an interactive item at another seated player or bot |
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
| `object_thrown` | `throwEvent: ThrownObjectEvent` | Broadcasts an animated projectile flight between table seats |
| `voice_peers_list`| `roomId: string, peers: VoicePeer[]` | Initial peer list sent to joining voice client |
| `voice_peer_joined`| `roomId: string, peer: VoicePeer` | Announces a new peer joining voice |
| `voice_peer_left` | `roomId: string, peerId: string` | Announces a peer disconnecting from voice |
| `voice_signal` | `roomId: string, fromPeerId: string, toPeerId: string, signal: any` | Relayed WebRTC signaling message |
| `voice_peer_status`| `roomId: string, peerId: string, isMuted: boolean, isDeafened: boolean` | Peer mute/deafen state change |
| `voice_peer_speaking`| `roomId: string, peerId: string, isSpeaking: boolean` | Peer voice activity state change |
| `error` | `message: string` | Validation or action error notice |

---

## 8. Interactive Throwable Objects System

Players at the table can express banter, celebration, or frustration by throwing interactive animated objects at other players (humans or bots) in real-time.

### 8.1 Custom Vector Artwork (`src/components/ThrowableArts.tsx`) & Impact Choreography
1. **Worn Leather Boot (`shoe`)**: Custom multi-layered SVG boot with stitched toe cap, rugged cleated sole, brass eyelets, and flapping shoelaces. Tumbles $900^\circ$ end-over-end with a separated ground shadow and dust wake trail. On impact, triggers a spiky comic starburst (`ComicImpactBurstArt`), stamps a muddy sole tread (`BootPrintArt`) onto the target's avatar, orbits dazed golden stars, and ricochet-bounces off along a secondary gravity arc.
2. **Foaming Beer Bottle (`beer`)**: Custom emerald-green glass bottle SVG with golden liquid glow, gold neck foil, star crest label, and overflowing foam head. Spins $540^\circ$ in an arc trailing golden fizz droplets and white foam bubbles. On impact, tilts and pops a 14-particle gravity fountain of golden beer droplets and white foam blobs that splash and drip down over the target's seat pod.
3. **Royal Gold Medal (`medal`)**: Custom 3D bevelled gold medallion SVG with crimson-and-navy V-neck ribbon and embossed star crest. Swings along a high arc leaving 4-point golden star glints. On impact, settles onto the target's avatar with a `linear()` bounce/spring drop (`.medal-award-spring`), rotating golden god-rays (`SunburstRaysArt`), and 16 fluttering multi-colored confetti ribbons.

### 8.2 UI, 3D Ground Shadow & Targeting
* **Dock Placement**: Docked on the **right side of the player console** (in the compact header row of the bottom hand footer), showcasing the custom SVG icons with hover tilt/scale transitions.
* **Separated Table-Felt Ground Shadow**: During flight, a soft blurred elliptical shadow travels along the linear table surface path between thrower and target, shrinking as the projectile arcs higher in Z-space and converging beneath it at impact.
* **Direct Targeting Flow**: Tapping an item enters **Targeting Mode**, causing all eligible target player avatar pods to pulse with glowing crosshairs. Clicking any player's pod dispatches the throw.
* **Hit Reactions**: Both bot and human avatars perform a physical spring recoil shake (`.avatar-recoiling` powered by CSS `linear()` spring easing with `cubic-bezier` fallback) with unique comic speech bubbles.
* **Audio Synthesis**: Native browser `AudioContext` synthesizer provides dynamic whoosh sounds and custom impact sound effects without external audio files.
* **Rate-Limiting**: 1.5–2.5 second cooldown per seat enforced client-side and server-side.

### 8.3 Multi-Device Dynamic Perspective Projection
Because Royal Whist dynamically rotates the virtual table on each player's screen so their own seat is always oriented at the bottom (`bottomSeat`), the physical screen coordinates of any seat vary across connected devices:
* **Local Player Origin**: When the local player throws an item, the projectile launches from the throw dock on the right of their bottom console (`[data-throw-dock]`).
* **Remote Player Origin**: On other clients, the throw originates from that specific player's avatar pod as rendered in that client's view (`[data-throw-seat="${fromSeat}"]`).
* **Target Receiver Destination**: On every client, the projectile travels towards and impacts the target's avatar pod (`[data-throw-seat="${toSeat}"]`), landing on the bottom player footer on the recipient's own screen and on their table pod on all other spectators' screens.
* **Rotated Fallback Matrix**: If DOM elements have not yet mounted or are between phase transitions, screen geometry calculates positions using `getSeatVisualPos(seat, mySeat)` (`bottom`, `top`, `left`, `right`) based on each client's `mySeat` perspective.

---

## 9. Game Audio & Sound / Click Disable Setting Architecture

All procedural synthesized audio (card slide/snap clicks, projectile flight whooshes, item hit impacts, medal chimes, and interactive tactile UI clicks) is managed centrally in [src/lib/throwSounds.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/lib/throwSounds.ts).

### 9.1 Unified Sound State & Storage
* **Local Storage Persistence**: Key `royal_whist_sound_enabled` stores `'true'` or `'false'`. If unset, it defaults to enabled (`true`).
* **Instant Reactivity**: `subscribeSoundEnabled(listener)` ensures changes are immediately dispatched across all active views without page reloads.
* **Component Hook**: `useSoundSetting()` exports `[soundEnabled, toggleSoundSetting, setSoundEnabled]`.

### 9.2 Complete Silence Guard
* `isSoundEnabled()` guards all synthesized sound triggers:
  * `playClickSound()` — tactile feedback for card drags, item selections, and button clicks.
  * `playCardSnapSound()` — card slide and felt snap landing sound.
  * `playThrowSound()` — projectile parabolic whoosh.
  * `playHitSound(type)` — shoe thud, bottle splash, and gold medal chime.
* When sound is disabled, all audio synthesizer functions early-return cleanly, creating zero audio nodes and zero Web Audio overhead.

### 9.3 UI Access Points
1. **Lobby Header Bar**: Quick toggle button next to *How to Play* displaying `<Volume2 />` (Sound On) or `<VolumeX />` (Muted).
2. **Virtual Table Header Bar**: Direct 1-click mute/unmute button next to the *Standings* button.
3. **Table Options Dropdown**: Integrated *Sound & Clicks* switch row with live On / Muted pill button.

---

## 10. In-Game Table HUD Architecture (Last Trick Cross & Live Contract/Tricks Panel)

### 10.1 Last Trick Cross (Top-Right Playing Area)
* **Component**: [src/components/LastTrickCross.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/LastTrickCross.tsx)
* **Location**: Top-right corner of the inner casino felt (`portrait-felt`), `absolute top-1.5 right-1.5 sm:top-2.5 sm:right-3 z-20`.
* **Arrangement**: A 4-card cross representing the 4 player seats dynamically mapped from each client's viewpoint (`getSeatVisualPos(seat, mySeat)`):
  * **Top**: Partner
  * **Bottom**: Local Player (You)
  * **Left**: Left Opponent
  * **Right**: Right Opponent
* **Winner Highlighting**: The trick's winning card is decorated with an amber border, ring glow, and golden crown icon (`👑`), with a footer badge displaying `★ {winnerName} won`.
* **Interactive Inspection**: Clicking/tapping toggles an expanded review popover showing trick number, winning card details, and led suit.

### 10.2 Live Contract & Team Trick Tracker (Bottom-Left Playing Area)
* **Component**: [src/components/ContractHud.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/ContractHud.tsx)
* **Location**: Bottom-left corner of the inner casino felt (`portrait-felt`), `absolute bottom-1.5 left-1.5 sm:bottom-2.5 sm:left-3 z-20`.
* **Contract Display**:
  * Large, high-visibility bid level number (font size `text-2xl sm:text-3xl font-black text-amber-300`).
  * Big suit icon (`♠`, `♥`, `♦`, `♣`) with suit name, or bold `NT` pill with `No Trump`.
  * Contract Goal indicator ($6 + \text{level}$ tricks needed).
* **Live Team Trick Counts**:
  * Real-time trick counter for **Team 1** (`teamTricksWon.TeamA`) styled in emerald.
  * Real-time trick counter for **Team 2** (`teamTricksWon.TeamB`) styled in blue.
  * Contextual `You` chip highlighting the local player's team and needed trick countdown.

---

## 11. High-Clarity Card Rendering & Dynamic Suit Accordion Engine

### 11.1 High-Clarity Card Faces (`src/components/CardView.tsx`)
* **Giant Top-Left Rank & Vector Suit Indices**: Extra-large bold rank typography (`24px–36px font-black` on hand cards, `23px–31px` on trick cards, with tight tracking on `'10'`) paired with a crisp inline vector SVG suit icon (`16px–25px`) directly beneath it inside a dedicated left-edge index column (`19px` wide on mobile, `27px–30px` on desktop).
* **Giant Lower-Right Suit Pip & Upright Court Portraits**: Upside-down bottom-right indices are omitted so that:
  * Number cards (`2–10`) and Aces display a massive vector suit pip (`w-[56%] h-[54%]`) in the lower-right area (`bottom-1 right-1`).
  * Court cards (`J, Q, K`) display a large, upright royal portrait (`RoyalCourtArt` in `w-[74%] h-[63%]` at `bottom-0.5 right-0.5`), leaving the top-left corner 100% pure ivory card stock behind the rank and suit.
* **Strict Classic 2-Color Palette**: Deep Midnight Black (`#0f172a`) for Spades & Clubs, and Rich Crimson Red (`#dc2626`) for Hearts & Diamonds, rendered against a warm ivory card surface (`#fdfdfc`) with multi-layer depth drop shadows.

### 11.2 Dynamic Suit Accordion & 100% Card Visibility (`src/components/VirtualTable.tsx`)
* **Left-to-Right `prevCard` Overlap Rule**: Because `margin-left` on `card[idx]` shifts `card[idx]` over `card[idx - 1]`, each card's `marginLeft` (`--slot-margin`) is calculated from whether **`prevCard = sortedMyHand[idx - 1]`** belongs to the required led suit (`currentLedSuit`).
* **Strict Left-to-Right Stacking (`zIndex: idx + 1`)**: Every card slot in the hand is assigned `zIndex: idx + 1` from left (`1`) to right (`N`), ensuring no card on the left ever covers the top-left rank and suit index of a card to its right.
* **Proportional Viewport-Aware Width Allocation**:
  * **Required Suit Cards** (`.card-slot-expanded`): Expose `36px–45px` on mobile portrait (`55px–63px` on desktop, `~58–68%` of card width) with extra boundary clearance on the last card of the required suit group, and elevate (`-translate-y-3 sm:-translate-y-4`) with a golden-amber ring (`ring-2 ring-amber-400`).
  * **Other Suit Cards** (`.card-slot-compressed`): Expose `22px–24px` on mobile portrait (`35px` on desktop), exceeding the `19px` (`27px` desktop) top-left index column width so 100% of all 13 cards remain clearly readable while **retaining full card brightness (no dimming or grayscale)**.
* **Uniform Spacing Fallback**: When no suit is led yet (opening lead) or the player is void in the led suit, all cards distribute with uniform standard spacing (`.card-slot-standard`).
* **Fluid Physics Transitions**: `transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), margin 260ms cubic-bezier(0.2, 0.8, 0.2, 1)` ensures smooth card slide animations when turns and tricks transition.

---

## 12. Human Player Disconnect & 10-Second Automatic Bot Replacement (`server.ts` & `VirtualTable.tsx`)

### 12.1 Server Disconnect Detection & 10-Second Grace Timer (`server.ts`)
* **Trigger Conditions**: When a seated human player leaves an active game (`room.gameState.phase !== 'waiting'`) via `leave_room`, `leave_seat`, or WebSocket disconnection (`ws.on('close')`), `handleHumanPlayerLeftRoom(roomId, userId)` is invoked.
* **Multi-Tab Socket Guard**: Before marking a player as disconnected, the server checks if the same `userId` still has any other active open WebSocket connected to `roomId`.
* **Grace Window State (`BOT_REPLACE_DELAY_MS = 10000`)**:
  * The player's `UserProfile` in `room.seats[seat]` is marked with `isDisconnected: true` and `botReplaceAt: Date.now() + 10000`.
  * The updated `room_state` is broadcast immediately to all remaining players at the table.
  * A 10-second timer (`disconnectTimers.set("${roomId}:${seat}", timer)`) is scheduled to invoke `replaceDisconnectedPlayerWithBot(roomId, seat)`.
* **Seamless Return Within 10 Seconds**:
  * If the player reconnects (`join_room` or `claim_seat`) with the same `user.id` before the 10-second timer expires, `clearDisconnectTimer(room.id, seat)` cancels the pending timer, `isDisconnected` and `botReplaceAt` are cleared, and `broadcastRoom(room.id)` restores the player seamlessly to their seat and hand.
* **Automatic Bot Replacement After 10 Seconds**:
  * If the player does not return within 10 seconds, `replaceDisconnectedPlayerWithBot(roomId, seat)` replaces `room.seats[seat]` with the corresponding seat AI Bot from `BOT_NAME_POOL` (**`فاشي الاسرار`**, **`صف السادس`**, or **`ابو قرون`**, with `isBot: true`), broadcasts the updated room state, and immediately calls `scheduleBotActionIfNeeded(room.id)` so the bot seamlessly plays any pending bid, trump declaration, or trick turn.

### 12.2 Table & Seat Pod Visual Indicators (`src/components/VirtualTable.tsx`)
* **Seat Pod Badge**: Any seat with `player.isDisconnected === true` displays a pulsing rose alert badge (`Left • Bot in Xs`), a rose-highlighted pod border, a slightly dimmed avatar, and a live `Left (Xs)` status label updated every `250ms`.
* **Top-Center Table Alert Banner**: A floating banner at the top-center of the table arena announces `{player.name} left the game — replacing with Bot in {secLeft}s`.
* **Bot Replacement Toast**: When the 10-second countdown completes and the seat transitions from a disconnected human to an AI Bot, a confirmation toast (`{prev.name} did not return — replaced by {curr.name}`) is displayed for 4.5 seconds.
