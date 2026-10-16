# Findings & Technical Debt Report: Remix Online Multiplayer Card Game

**Audit Date:** October 2026  
**Status:** Documented for Human Review (No Code Changes Applied per Constraints)

---

## 1. Summary of Findings

During this comprehensive audit of the codebase and specifications, 10 primary findings were identified across security, architectural compatibility, specification accuracy, data persistence, and error handling.

| ID | Category | Severity | Item |
|---|---|---|---|
| `FINDING-01` | Security | High | Client-Side JWT Decoding Without Server-Side Signature Verification |
| `FINDING-02` | Security | High | Hardcoded API Keys & Client IDs in Local `.env` |
| `FINDING-03` | Architecture | High | Vercel Static Configuration Incompatible with Stateful WebSocket Server |
| `FINDING-04` | Specification | Medium | First Trick Opening Lead Rule Discrepancy |
| `FINDING-05` | Specification | Medium | WebSocket Message Type Discrepancy (`make_bid` vs `bid`) |
| `FINDING-06` | Specification | Medium | AI Model Version Discrepancies |
| `FINDING-07` | Persistence | Medium | In-Memory Ephemeral Storage Without Crash/Restart Recovery |
| `FINDING-08` | Reliability | Medium | Game Stalling on Human Player Disconnection |
| `FINDING-09` | Networking | Low | Lack of TURN Relay Servers for WebRTC NAT Traversal |
| `FINDING-10` | Game Rules | Low | Asymmetric Tie-Breaker Precedence for Team 1 |

---

## 2. Detailed Findings

### FINDING-01: Client-Side JWT Decoding Without Server-Side Verification
* **Location:** [src/components/GoogleAuthScreen.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/GoogleAuthScreen.tsx#L23-L39) and [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L501-L507)
* **Evidence:** The client decodes Google Identity Services JWT tokens using `atob` without cryptographic signature verification:
  ```typescript
  const base64Url = response.credential.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64)...);
  const data = JSON.parse(jsonPayload);
  ```
  The user attributes are forwarded over WebSocket to the server, which blindly trusts them. The previously claimed `google-auth-library` dependency is not installed in `package.json`.
* **Potential Impact:** A malicious user can craft arbitrary WebSocket messages claiming any user ID, name, or avatar, spoofing other players.
* **Confidence Level:** 100% (Confirmed by code inspection).
* **Suggested Next Step:** Install `google-auth-library` or `jose` on the server. Send the raw Google ID token (`credential`) to the server during authentication and verify it via `oauth2Client.verifyIdToken()` before seating the user.

---

### FINDING-02: Hardcoded Secrets in Local `.env`
* **Location:** [.env](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/.env#L1-L2)
* **Evidence:** `.env` contains an actual Google Client ID and Gemini API Key:
  ```env
  VITE_GOOGLE_CLIENT_ID=<REDACTED_GOOGLE_CLIENT_ID>
  GEMINI_API_KEY=<REDACTED_GEMINI_API_KEY>
  ```
* **Potential Impact:** If the repository is published or pushed to a public remote, the Gemini API key will be exposed, leading to quota exhaustion or unauthorized billing.
* **Confidence Level:** 100% (Confirmed by file inspection).
* **Suggested Next Step:** Revoke and rotate the exposed API key in Google AI Studio / Google Cloud Console. Ensure `.env` is listed in `.gitignore` and distribute `.env.example` with placeholder strings.

---

### FINDING-03: Vercel Static Configuration Incompatible with Stateful Server
* **Location:** [vercel.json](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/vercel.json) vs [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts)
* **Evidence:** `vercel.json` defines a standard static Vite single-page rewrite (`buildCommand: "vite build"`, `outputDirectory: "dist"`).
* **Potential Impact:** Deploying to standard Vercel static hosting only serves the compiled client bundle. The Node.js Express and WebSocket server (`server.ts`) will not run, causing all room creation, game synchronization, bot AI, and WebRTC signaling to fail immediately.
* **Confidence Level:** 100% (Confirmed by architecture analysis).
* **Suggested Next Step:** Deploy the application to a container-based platform that supports persistent Node.js processes and WebSockets (e.g., Google Cloud Run, Railway, Render, Fly.io, or VPS). Update documentation to clarify hosting prerequisites.

---

### FINDING-04: First Trick Opening Lead Rule Discrepancy
* **Location:** [SPECIFICATION.md](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/SPECIFICATION.md), [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L295), [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L311), [src/logic/simulator.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/simulator.ts#L140), [src/logic/simulator.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/simulator.ts#L152)
* **Evidence:** Legacy `SPECIFICATION.md` stated: *"The Declarer leads the first trick."* However, in the code:
  * For NT games: Declarer leads first (`state.currentTurn = state.declarer`).
  * For Suit games: The player to the immediate right of the Declarer leads first (`state.currentTurn = getNextSeat(state.declarer)`).
* **Potential Impact:** Developer confusion regarding business rules.
* **Confidence Level:** 100% (Corrected in `SPECIFICATION.md` and documentation suite to reflect actual code behavior).
* **Suggested Next Step:** Verify with game stakeholders whether Suit games should be led by the player to the right of the Declarer (as currently implemented) or by the Declarer directly.

---

### FINDING-05: WebSocket Message Type Discrepancy (`make_bid` vs `bid`)
* **Location:** [src/types.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/types.ts#L127) vs legacy `SPECIFICATION.md`
* **Evidence:** Legacy `SPECIFICATION.md` documented the client message type as `bid`. The actual TypeScript interface and server message handler require `{ type: 'make_bid', roomId: string, bid: Bid }`.
* **Potential Impact:** Any external client or automated test sending `{ type: 'bid' }` will be silently ignored by the server.
* **Confidence Level:** 100% (Corrected in `SPECIFICATION.md` and `docs/API_REFERENCE.md`).
* **Suggested Next Step:** Ensure all future API clients use `make_bid`.

---

### FINDING-06: AI Model Version Discrepancies
* **Location:** [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L996), [scripts/ai_optimize_superbot.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/scripts/ai_optimize_superbot.ts#L122), legacy `README.md`
* **Evidence:** Legacy documents referenced `Gemini 2.5 Flash`. The server actually invokes `gemini-3.1-flash-lite`, and the optimization script falls back between `gemini-3.1-flash-lite` and `gemini-3.8-flash`.
* **Potential Impact:** Inaccurate architectural reporting.
* **Confidence Level:** 100% (Corrected in documentation suite).
* **Suggested Next Step:** Align AI model configuration with project standards.

---

### FINDING-07: In-Memory Volatile Storage
* **Location:** [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L55)
* **Evidence:** `rooms = new Map<string, Room>()`.
* **Potential Impact:** If the server process restarts or encounters an uncaught exception, all active tables and ongoing matches are permanently wiped.
* **Confidence Level:** 100% (Confirmed by code inspection).
* **Suggested Next Step:** For production scale, introduce a persistence layer (e.g., Redis or PostgreSQL) to persist room sessions and match records.

---

### FINDING-08: Game Stalling on Human Player Disconnection
* **Location:** [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L787-L805)
* **Evidence:** When a socket disconnects, the player's profile remains seated in `room.seats`. There is no turn countdown timer for human players.
* **Potential Impact:** If a human player closes their browser tab or loses internet access while it is their turn to bid or play a card, the game stalls permanently for the remaining 3 players.
* **Confidence Level:** 95% (Observed via code flow analysis).
* **Suggested Next Step:** Implement an auto-turn timer (e.g., 20 seconds). If a human player does not act within 20 seconds, automatically substitute a Casual Bot or play a default legal card/pass.

---

### FINDING-09: Lack of TURN Relay Servers for WebRTC
* **Location:** [src/lib/useVoiceChat.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/lib/useVoiceChat.ts#L5-L11)
* **Evidence:** Only Google's public STUN servers are configured (`stun:stun.l.google.com:19302`).
* **Potential Impact:** Users behind symmetric NATs, university networks, or enterprise firewalls will fail to establish direct P2P audio connections with other players.
* **Confidence Level:** 90% (Standard WebRTC limitation).
* **Suggested Next Step:** Configure a TURN relay server (e.g. Coturn, Twilio Network Traversal, or Cloudflare Calls) to ensure 100% connection success.

---

### FINDING-10: Asymmetric Tie-Breaker Precedence for Team 1
* **Location:** [src/logic/gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L419)
* **Evidence:** In `checkMatchEnd()`:
  ```typescript
  if (teamAVictory && teamBVictory) {
    if (TeamA > TeamB) { ... }
    else if (TeamB > TeamA) { ... }
    else {
      return { isOver: true, winnerTeam: 'TeamA', reason: `Both teams tied at +11. Team 1 holds victory precedence.` };
    }
  }
  ```
* **Potential Impact:** An exact tie at $+11$ automatically awards the win to Team 1, introducing structural bias.
* **Confidence Level:** 100% (Confirmed by code inspection).
* **Suggested Next Step:** Review with stakeholders whether a tie should trigger an overtime "sudden death" round rather than awarding victory to Team 1.
