# Remix Online Multiplayer Card Game

A real-time, 4-player trick-taking partnership card game built with React 19, Vite, Tailwind CSS v4, Node.js (Express + WebSockets `ws`), WebRTC Voice Chat, and Google Gemini AI.

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
* **Multiplayer & Bot Play**:
  * Real-time WebSocket room matchmaking and table synchronization.
  * "Sit & Fill Bots" button allows immediate play with AI bots across Casual and Super Bot difficulties.

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

---

## How to Play

1. **The Deal & Unwinnable Hand Rule ("Kosh")**:
   * 13 cards are dealt to each player in counter-clockwise order.
   * **Winning Cards Check**: Every hand must have at least one winning card: **Ace**, **King+1** (suit length $\ge 2$), **Queen+2** (suit length $\ge 3$), or **Jack+3** (suit length $\ge 4$).
   * If any player lacks winning cards, a 10-second face-up misdeal reveal is displayed, and cards are automatically re-dealt with the deal passing counter-clockwise to the next dealer.
2. **The Auction**:
   * Exactly 4 turns in counter-clockwise order starting to the immediate right of the dealer.
   * Bid level (1–7) and contract type (`Suit` or `NT`).
   * **Dealer Strategic Privileges (Turn 4)**:
     * When bid reaches dealer as **Suit** (e.g. `2 Suit`): Dealer can match the suit bid at the same level (`Match 2 Suit`), bid higher, or pass.
     * When bid reaches dealer as **No Trump** (e.g. `2 NT`): Dealer can take No Trump with the **same number or higher** (`Match 2 No Trump`, `Bid 3 No Trump`, etc.). If dealer wants to take it **Suit**, it must be **one or more higher** (e.g. `3 Suit` or above). Matching `2 Suit` against `2 NT` is disallowed.
3. **Trump Declaration**: If a Suit contract won, the Declarer declares the trump suit (♠, ♥, ♦, ♣). For NT contracts, trump declaration is skipped.
4. **Trick Play**:
   * 13 tricks played in counter-clockwise order.
   * **Opening lead**: In NT games, the Declarer leads first; in Suit games, the player to the right of the Declarer leads first.
   * Players must follow the led suit if possible; otherwise, they may trump or discard.
5. **Scoring**:
   * Base threshold is 6 tricks. A contract of level $L$ requires $6 + L$ tricks.
   * Target: **+10 points** to win the match.
   * Danger: **-10 points** eliminates a team.

---

## Configuring Animation Durations

All animation speeds, review delays, and server resolution timing are configured in [src/logic/animationConfig.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/animationConfig.ts):

```typescript
export const ANIMATION_CONFIG = {
  CARD_PLAY_DURATION_MS: 400,          // Time for card to glide onto table
  TRICK_REVIEW_DELAY_MS: 750,          // Pause to review completed 4-card trick
  TRICK_COLLECT_DURATION_MS: 550,      // Time to sweep trick to winner
  WINNER_CELEBRATION_DURATION_MS: 1000 // Celebration badge highlight duration
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
├── server.ts                    # Express + WebSocket backend server & WebRTC signaling
├── SPECIFICATION.md             # Core technical specification
├── README.md                    # Project overview and quickstart guide
├── package.json                 # Dependencies and npm scripts
├── vite.config.ts               # Vite configuration and server proxy setup
├── tsconfig.json                # TypeScript compiler configuration
├── vercel.json                  # Static hosting routing configuration
├── scripts/
│   ├── train.ts                 # CLI script for local bot simulation training
│   └── ai_optimize_superbot.ts  # CLI script for Gemini AI bot strategy synthesis
├── src/
│   ├── main.tsx                 # React DOM entry point
│   ├── App.tsx                  # Root state router & authentication guard
│   ├── types.ts                 # Canonical TypeScript types & WebSocket schemas
│   ├── index.css                # Base Tailwind styles and table textures
│   ├── components/
│   │   ├── VirtualTable.tsx     # Game arena, dynamic bottom orientation & HUD
│   │   ├── CardView.tsx         # Playing card component with 2-color engine
│   │   ├── RoyalCourtArt.tsx    # High-detail SVG artwork for J, Q, K
│   │   ├── BiddingPanel.tsx     # Auction console with dealer privileges
│   │   ├── SuitDeclarationModal.tsx # Trump suit selection modal
│   │   ├── ScoreBoard.tsx       # Match standings (+11 / -11 progress bars)
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
