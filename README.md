# تدفيع الثمن — Online Multiplayer Card Game

A real-time, 4-player trick-taking partnership card game (**تدفيع الثمن**) built with React 19, Vite, Tailwind CSS v4, Node.js (Express + WebSockets `ws`), WebRTC Voice Chat, and Google Gemini AI.

---

## Key Features

* **Team 1 vs Team 2 Partnerships**:
  * 4 players divided into two partnerships: **Team 1** and **Team 2**.
  * Eliminates legacy cardinal compass designations (`North/South/East/West`) from the user interface.
* **Universal Bottom Seat Orientation (Dynamic Perspective)**:
  * Whichever seat you claim (Team 1 or Team 2), the table automatically places you at the **bottom of your screen**.
  * Your partner is always positioned at the **top**, and opponents sit to your **left and right**.
* **High-Fidelity Card Engine & Clear Face Values**:
  * **Classic 2-Color Deck**: Vibrant Red Hearts (♥) & Diamonds (♦) and Deep Black Spades (♠) & Clubs (♣).
  * **Single Giant Center Pip for Numbers**: Number cards (2 through 10, and Ace) feature a single giant, crisp, solid center suit pip for instant legibility across all screen sizes.
  * **Royal Court Art for J, Q, K**: Custom vector royal court illustrations with crowns, sceptres, armor, and heraldic patterns.
  * **Bold Corner Indices**: Bold typography and stacked suit icons in top-left and bottom-right corners, ensuring visibility when cards overlap in the hand dock.
* **Authentic Casino Table with Hardwood Rails**:
  * Polished mahogany wood rail borders (`.table-wood-rail`) with golden brass bevel trim (`.table-brass-bevel`).
  * Deep emerald green felt surface with inner stitch border (`.table-felt-stitch`).
  * **Opponent & Partner Face-Down Card Spreads**: Visual fans showing remaining card counts for partner and opponents.
* **Integrated WebRTC Mesh Voice Chat**:
  * Low-latency, peer-to-peer open mic voice communication directly at the virtual table.
  * Web Audio API real-time Voice Activity Detection (VAD) with animated speaker rings, mute, and deafen controls.
* **Zero-Scroll Viewport Layout**:
  * Designed to strictly fit within `100dvh` on mobile, tablet, and desktop without page scrollbars.
* **Smooth Physics Animations**:
  * Card flight from hand/seats to table center.
  * Trick pause and sweep animation directly into the trick winner's seat.
  * Centralized configuration in [src/logic/animationConfig.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/animationConfig.ts).
* **AI & Simulation Lab**:
  * **Monte Carlo Simulation Runner**: Headless statistical engine capable of simulating thousands of matches to benchmark strategy.
  * **AI Strategy Optimizer (Google Gemini API)**: Analyzes match telemetry and synthesizes optimized strategic parameters for the bot engine.
* **Interactive Throwable Objects (Custom Vector Graphics & Physics Choreography)**:
  * Real-time table banter with custom multi-layered SVG artwork (`src/components/ThrowableArts.tsx`): throw a **Worn Leather Boot**, **Foaming Emerald Beer Bottle**, or **Royal Gold Medal** across the table at any player or bot.
  * **3D Parabolic Flight & Ground Shadow**: Projectiles launch with anticipation wind-up, a separated table-felt ground shadow that scales with height, and multi-point particle wake trails (dust puffs, fizz bubbles, or golden star glints).
  * **Multi-Stage Physics Impact Choreography**:
    * **Worn Boot**: Triggers a spiky comic starburst flash, stamps a muddy sole tread onto the avatar, orbits dazed golden stars, and ricochet-bounces off with gravity.
    * **Foaming Beer**: Pops a 14-droplet gravity fountain of golden beer and white foam that splashes and drips down over the target's seat pod.
    * **Royal Gold Medal**: Settles onto the target's avatar with a `linear()` spring bounce, rotating golden sunburst god-rays, and 16 fluttering multi-colored confetti ribbons.
  * Synthesized procedural sound effects via native Web Audio API.
* **High-Clarity Card Redesign & Giant Rank/Suit Indices**:
  * **Giant Top-Left Rank & Vector Suit Indices**: Extra-large bold rank typography (`24px–36px font-black`) paired with a crisp inline vector SVG suit symbol (`16px–25px`) directly beneath it, remaining 100% uncovered even when cards are shingled.
  * **Giant Lower-Right Suit Pip & Upright Court Portraits**: Removing upside-down bottom-right index clutter allows a massive suit pip (`56%` width) on number/Ace cards and a large upright royal portrait (`RoyalCourtArt`) in the lower-right of `J, Q, K` cards.
  * **Strict Classic 2-Color Palette**: Rich Crimson Red (`#dc2626`) for Hearts & Diamonds and Midnight Black (`#0f172a`) for Spades & Clubs against warm ivory card stock with multi-layer depth shadows.
* **Dynamic Suit Accordion & 100% Card Visibility**:
  * **Left-to-Right `prevCard` Overlap & Stacking (`zIndex: idx + 1`)**: Each card's negative `margin-left` is calculated from the card it overlaps (`card[idx - 1]`) with strictly increasing left-to-right `z-index`, ensuring no card on the left ever covers the rank/suit index of a card to its right.
  * **Auto-Expanding Played Suit**: Cards of the required suit expand (`~58-68%` visible) and elevate with an amber glow ring for effortless selection while keeping natural card fan overlap.
  * **100% Visible Non-Played Suits**: Other suits condense cleanly while guaranteeing at least `22px–24px` of visible strip on mobile (`35px` on desktop) and retaining full card brightness (no dimming/graying).
* **Last Trick Cross (Top-Right Playing Area)**:
  * Persistent 4-card cross in the top-right corner of the table felt displaying the cards played in the last completed trick.
  * Arranged to mirror the player's perspective: Top = Partner, Bottom = You, Left = Left Opponent, Right = Right Opponent.
  * Winning card is highlighted with a golden border, glow halo, and crown badge; click/tap reveals trick review details.
* **Live Contract & Team Trick Tracker (Bottom-Left Playing Area)**:
  * High-visibility casino HUD card showing the winning bid number and declared suit (or NT) in large, bold typography.
  * Live trick count counters tracking tricks won by **Team 1** and **Team 2** this round with contract target progress.
* **Sound & Clicks Toggle & Persistence**:
  * Easily disable or enable all procedural game audio (card landing snap, projectile whooshes, impacts, and medal chimes) and interactive click feedback.
  * 1-click access via the **Lobby header**, **Table header**, and inside the **Table Options** menu.
  * Preference is automatically saved to `localStorage` across page refreshes and browser sessions.
* **Multiplayer, Friend Room Codes, Quick Play Matchmaking & AI Bots**:
  * **Play with Friends (`#CODE` & Shareable Invite Links)**: Create **Public** or **Private** tables with a unique 6-character room code (e.g., `#K7M4P2`). Friends can join instantly by entering the code in the Lobby or clicking a 1-click `?room=CODE` invite link, which automatically seats them at the first open slot.
  * **Quick Play Online Matchmaking (`POST /api/matchmaking`)**: Matchmakes solo players into open public tables (or spins up a new public matchmaking table) with an automatic 15-second bot-fill countdown so players never wait indefinitely.
  * **Configurable Human Turn Timer (`10s` Default) & Bot Auto-Play**: Every human turn during Bidding, Trump Declaration, and Trick Play has a configurable countdown timer (`5s`, `10s` default, `15s`, `30s`, or `Off`) displayed as a live progress bar on the active seat pod. If time expires, the AI Bot immediately plays a legal move on the player's behalf, clearly badged with **`🤖 Bot Move`** on the played card (`🤖 Auto` on bids) and an auto-dismissing top-center notification banner.
  * **Named AI Bots**: **فاشي الاسرار**, **صف السادس**, and **ابو قرون** across Casual and Super Bot difficulties.
  * **10-Second Disconnect Countdown & Bot Replacement**: When a seated human player leaves an active game (or closes/disconnects their browser tab), the table immediately displays a live **`Left • Bot in 10s`** badge on their seat pod and a top-center alert banner counting down 10 seconds. If the player returns within 10 seconds, they seamlessly resume their seat and hand; otherwise, an AI Bot (**فاشي الاسرار**, **صف السادس**, or **ابو قرون**) automatically replaces them after 10 seconds and plays their turns so the match continues without interruption.
* **120Hz Direct-DOM Card Swipe & Seamless Momentum Flight**:
  * Dragging a card bypasses React re-renders during pointer movement by writing `translate3d(...) rotate(...) scale(...)` directly to the card DOM node at 120Hz.
  * Velocity-aware release threshold (`dy < -32px` or upward flick velocity `vy < -0.35 px/ms`) with a single continuous 2-keyframe `cubic-bezier(0.16, 1, 0.3, 1)` deceleration curve from the exact finger release coordinates into the center trick slot.

---

## Quickstart & Local Development

### Prerequisites
* Node.js 18+ or 20+
* npm or bun

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (optional for local guest play)
cp .env.example .env

# 3. Start development server (serves Express + Vite on port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser.

### Available Scripts

| Command | Action |
|---|---|
| `npm run dev` | Starts development server with Vite middleware mode on port 3000 |
| `npm run build` | Builds frontend client (`vite build`) and bundles server (`esbuild server.ts`) into `dist/server.cjs` |
| `npm run start` | Runs the compiled production server (`node dist/server.cjs`) |
| `npm run preview` | Previews the static Vite production bundle |
| `npm run clean` | Removes build directories (`dist/` and `server.js`) |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run train` | Runs headless self-play bot training and updates `src/data/learnedPolicy.json` |
| `npm run ai-optimize` | Runs 2,500 simulation matches and optimizes bot policy using Gemini API |
| `npx tsx scripts/test_touch_gestures.ts` | Tests touch emulation, single-tap play, and swipe-up throw gestures via Headless Chrome CDP |
| `npx tsx scripts/test_ui_portrait.ts` | Tests end-to-end UI layout, auction, and trick taking on iPhone portrait viewport |
| `npx tsx scripts/test_sound_setting.ts` | Verifies sound & clicks mute/unmute state, persistence, reactive subscriptions, and synthesis guards |
| `npx tsx scripts/test_new_ui_elements.ts` | Verifies Last Trick Cross orientation, winner highlighting, Big Contract display, and live team trick counts |
| `npx tsx scripts/test_suit_accordion.ts` | Verifies dynamic suit accordion expansion, unplayable suit compression, and mobile width bounds |
| `npx tsx scripts/test_player_disconnect_bot_replace.ts` | Verifies human player leave indicator, 10-second return grace window, and automatic bot replacement after 10 seconds |

---

## How to Play

1. **The Deal & Unwinnable Hand Rule ("Kosh")**:
   * 13 cards are dealt to each player in counter-clockwise order.
   * **Winning Cards Check**: Every hand must have at least one winning card: **Ace**, **King+1** (suit length $\ge 2$), **Queen+2** (suit length $\ge 3$), or **Jack+3** (suit length $\ge 4$).
   * If any player lacks winning cards, a 10-second face-up misdeal reveal is displayed, and cards are automatically re-dealt with the deal passing counter-clockwise to the next dealer.
2. **The Auction & Live Bid Indicators**:
   * Exactly 4 turns in counter-clockwise order starting to the immediate right of the dealer.
   * Bid level (1–7) and contract type (`Suit` or `NT`).
   * **Live Seat Bids**: Each player's seat clearly marks their current bid or `Passed` badge throughout the auction.
   * **Dealer Strategic Privileges (Turn 4)**:
     * When bid reaches dealer as **Suit** (e.g. `2 Suit`): Dealer can match the suit bid at the same level (`Match 2 Suit`), bid higher, or pass.
     * When bid reaches dealer as **No Trump** (e.g. `2 NT`): Dealer can take No Trump with the **same number or higher** (`Match 2 No Trump`, `Bid 3 No Trump`, etc.). If dealer wants to take it **Suit**, it must be **one or more higher** (e.g. `3 Suit` or above). Matching `2 Suit` against `2 NT` is disallowed.
3. **Trump Declaration & Winning Bidder**:
   * The winning bidder is highlighted with a prominent golden **Winning Bid** badge (e.g., `👑 Winning Bid: 2♠ Spades`) displayed directly above their avatar.
   * If a Suit contract won, the Declarer declares the trump suit (♠, ♥, ♦, ♣). For NT contracts, trump declaration is skipped.
4. **Trick Play & Ergonomic Touch Controls**:
   * 13 tricks played in counter-clockwise order.
   * **Opening lead**: In NT games, the Declarer leads first; in Suit games, the player to the right of the Declarer leads first.
   * Players must follow the led suit if possible; otherwise, they may trump or discard.
   * **Single-Tap / 1-Click Play**: A single tap on mobile or single click on desktop instantly plays an eligible card, launching it smoothly from its hand slot directly onto the center felt.
   * **Continuous Swipe-to-Throw & Mouse Drag**: Players can drag or swipe a card upwards all the way into the table playing area. The card tracks the pointer smoothly in real time. Releasing the card keeps it flying smoothly with momentum from its exact release point until it lands in the center trick, accompanied by a procedural felt snap sound. If the player changes their mind and drags the card back down towards their hand before releasing, the throw is cancelled and the card springs back into place. Both mobile touch swiping and desktop mouse dragging are supported.
   * **Clean Center Felt**: Redundant opponent card stacks and counters have been removed so the felt remains clean and focused on gameplay.
5. **Scoring**:
   * Base threshold is 6 tricks. A contract of level $L$ requires $6 + L$ tricks.
   * Target: **+10 points** to win the match.
   * Danger: **-10 points** eliminates a team.
6. **Interactive Throwable Objects & Banter**:
   * Players can throw custom multi-layered SVG items ([`src/components/ThrowableArts.tsx`](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/ThrowableArts.tsx)) across the table at any player or bot:
     * 👞 **Worn Leather Boot (`shoe`)**: Tumbles $900^\circ$ end-over-end with a separated ground shadow and dust wake trail; impacts with a spiky comic starburst flash, stamps a muddy sole tread on the avatar, orbits 4 golden dazed stars, and ricochet-bounces off along a gravity parabola.
     * 🍾 **Foaming Beer Bottle (`beer`)**: Spins $540^\circ$ trailing golden fizz droplets and white foam bubbles; tilts and pops a 14-droplet gravity fountain of golden beer and white foam that splashes and drips down over the target's seat pod.
     * 🥇 **Royal Gold Medal (`medal`)**: Swings along a high arc leaving 4-point golden star glints; settles onto the target's avatar with a CSS `linear()` bounce/spring drop, rotating golden sunburst god-rays, and 16 fluttering multi-colored confetti ribbons.
   * **Multi-Device Dynamic Perspective**: Projectiles launch from the thrower's screen position and land on the target's avatar pod on every device, adapting in real time to each player's rotated seat view.
   * **Web Audio Synthesis**: Procedural sound effects synthesize whoosh and impact sounds directly in the browser with no external assets.

---

## Configuring Animation Durations

All animation speeds, review delays, and server resolution timing are configured in [src/logic/animationConfig.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/animationConfig.ts):

```typescript
export const ANIMATION_CONFIG = {
  CARD_PLAY_DURATION_MS: 400,          // Time for card to glide onto table
  TRICK_REVIEW_DELAY_MS: 750,          // Pause to review completed 4-card trick
  TRICK_COLLECT_DURATION_MS: 550,      // Time to sweep trick to winner
  WINNER_CELEBRATION_DURATION_MS: 1000,// Celebration badge highlight duration
  THROW_FLIGHT_DURATION_MS: 700,       // Parabolic flight time for thrown objects
  THROW_HIT_DURATION_MS: 1450,         // Post-impact physics choreography duration
  THROW_COOLDOWN_MS: 2500,             // Cooldown between consecutive throws
  DEFAULT_TURN_TIMER_SECONDS: 10,      // Default turn timer before bot auto-plays
  MATCHMAKING_AUTO_FILL_BOTS_MS: 15000 // Auto-fill matchmaking tables after 15s
};
```

---

## Google Sign-In Setup

To enable Google Sign-In with real Google profiles:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Create an **OAuth 2.0 Client ID** (Web Application).
3. Add your host domain to **Authorized JavaScript Origins** (e.g., `http://localhost:3000`).
4. Set `VITE_GOOGLE_CLIENT_ID` in your `.env` file:
   ```env
   VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   ```
*(Guest login is always available as a fallback without configuration)*

---

## Project Structure

```
├── server.ts                    # Express + WebSocket backend server, 10s disconnect bot replacement & WebRTC signaling
├── SPECIFICATION.md             # Core technical specification
├── README.md                    # Project overview and quickstart guide
├── package.json                 # Dependencies and npm scripts
├── vite.config.ts               # Vite configuration and server proxy setup
├── tsconfig.json                # TypeScript compiler configuration
├── vercel.json                  # Static hosting routing configuration
├── scripts/
│   ├── train.ts                 # CLI script for local bot simulation training
│   ├── ai_optimize_superbot.ts  # CLI script for Gemini AI bot strategy synthesis
│   ├── test_player_disconnect_bot_replace.ts # Verifies human leave indicator, 10s grace return & bot takeover
│   ├── test_suit_accordion.ts   # Verifies dynamic suit accordion expansion & card visibility
│   ├── test_new_ui_elements.ts  # Verifies Last Trick Cross & Contract HUD
│   ├── test_sound_setting.ts    # Verifies sound & clicks mute/unmute persistence
│   ├── test_touch_gestures.ts   # Verifies single-tap play & continuous swipe-to-throw
│   └── test_ui_portrait.ts      # Verifies mobile portrait layout & gameplay
├── src/
│   ├── main.tsx                 # React DOM entry point
│   ├── App.tsx                  # Root state router & authentication guard
│   ├── types.ts                 # Canonical TypeScript types & WebSocket schemas
│   ├── index.css                # Tailwind styles, table textures & physics linear() easings
│   ├── components/
│   │   ├── VirtualTable.tsx     # Game arena, dynamic bottom orientation, suit accordion & HUD
│   │   ├── CardView.tsx         # High-clarity playing card component with giant indices & vector suits
│   │   ├── RoyalCourtArt.tsx    # High-detail SVG artwork for J, Q, K
│   │   ├── ThrowableArts.tsx    # Custom multi-layered SVG artwork for Boot, Beer Bottle, Gold Medal & bursts
│   │   ├── ThrowableDock.tsx    # Interactive throwable item selector dock with cooldown
│   │   ├── ThrowableOverlay.tsx # 3D parabolic flight, ground shadow, wake trails & impact physics
│   │   ├── LastTrickCross.tsx   # Top-right 4-card cross displaying the last completed trick
│   │   ├── ContractHud.tsx      # Bottom-left winning contract & live team trick counter HUD
│   │   ├── BiddingPanel.tsx     # Auction console with dealer privileges
│   │   ├── SuitDeclarationModal.tsx # Trump suit selection modal
│   │   ├── MisdealModal.tsx     # 10-second unwinnable hand ("Kosh") reveal modal
│   │   ├── ScoreBoard.tsx       # Match standings (+10 / -10 progress bars)
│   │   ├── Lobby.tsx            # Room browser and table creation
│   │   ├── VoiceChatBar.tsx     # WebRTC voice chat controls & indicators
│   │   ├── OpponentHandSpread.tsx # Face-down opponent card fans
│   │   ├── RoundSummaryModal.tsx # Round score breakdown modal
│   │   ├── GameOverModal.tsx    # Match victory/elimination modal
│   │   ├── GoogleAuthScreen.tsx # Google Identity Services login screen
│   │   └── SimulationModal.tsx  # Monte Carlo simulator & Gemini Strategy Optimizer
│   ├── logic/
│   │   ├── gameLogic.ts         # Rules engine, bidding hierarchy, trick evaluation, scoring
│   │   ├── animationConfig.ts   # Centralized animation constants and timings
│   │   ├── botAi.ts             # Heuristic Casual Bot decision engine
│   │   ├── superBot.ts          # Tournament Super Bot (PIMC + Double Dummy)
│   │   └── simulator.ts         # Headless batch match simulation runner
│   ├── lib/
│   │   ├── socketContext.tsx    # WebSocket client provider and state sync
│   │   ├── throwSounds.ts       # Web Audio API procedural sound synthesis & mute persistence
│   │   ├── useVoiceChat.ts      # WebRTC mesh voice chat hook & audio analyser
│   │   ├── authContext.tsx      # Google authentication provider & session storage
│   │   └── session.ts           # Per-tab unique session identifier generator
│   └── data/
│       ├── botPolicy.ts         # Policy manager, bounds, and experience gradient
│       └── learnedPolicy.json   # Persisted empirical bot policy weights
└── docs/                        # Complete technical documentation suite
    ├── ARCHITECTURE.md          # Technical architecture & subsystem interactions
    ├── FUNCTIONAL_SPECIFICATION.md # Feature-by-feature business logic & rules
    ├── DATABASE_AND_STATE.md    # State architecture, in-memory store & schemas
    ├── API_REFERENCE.md         # REST endpoints & WebSocket message reference
    ├── OPERATIONS_AND_DEPLOYMENT.md # Deployment procedures, hosting, and env vars
    ├── TESTING_AND_QA.md        # Testing infrastructure, simulation & QA strategy
    ├── FINDINGS_AND_TECHNICAL_DEBT.md # Discrepancies, bugs, security risks & debt
    └── MAINTENANCE_GUIDE.md     # Safe maintenance guide for humans and AI agents
```

---

## Technical Documentation Suite

For comprehensive architectural, algorithmic, operational, and maintenance details, refer to the documentation suite in [docs/](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/):

* [Technical Architecture](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/ARCHITECTURE.md)
* [Functional Specification](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/FUNCTIONAL_SPECIFICATION.md)
* [Database & State Documentation](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/DATABASE_AND_STATE.md)
* [API & Integration Reference](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/API_REFERENCE.md)
* [Operations & Deployment Guide](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/OPERATIONS_AND_DEPLOYMENT.md)
* [Testing & Quality Assurance](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/TESTING_AND_QA.md)
* [Findings & Technical Debt Report](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/FINDINGS_AND_TECHNICAL_DEBT.md)
* [Maintenance Guide for Developers and AI Agents](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/docs/MAINTENANCE_GUIDE.md)
