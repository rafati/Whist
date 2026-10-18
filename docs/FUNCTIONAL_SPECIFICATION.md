# Functional Specification: Remix Online Multiplayer Card Game

**Version:** 3.0  
**Status:** Implemented & Verified  
**Primary Engine:** [gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts), [server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts)

---

## 1. Feature: Room Management, Friend Codes, Matchmaking & Turn Timer

### 1.1 Purpose & Expected Users
Enables human players and AI bots to assemble at virtual tables in 2-versus-2 partnerships via private friend room codes, shareable invite links, or automatic public matchmaking. Accessible to authenticated Google users and guest players.

### 1.2 Access & Workflow
1. Users view the list of active public tables in [Lobby.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/Lobby.tsx).
2. **Create Table (Public or Private)**: Users can create a table via `POST /api/rooms` with configurable visibility (`Public` or `Private`) and Turn Timer (`5s`, `10s` default, `15s`, `30s`, or `Off`). Every room receives a unique 6-character code (e.g., `#K7M4P2`). The host is automatically seated at `South` (Team 1).
3. **Play with Friends (`#CODE` & Shareable Invite Links)**:
   * Players can enter a 6-character room code in the Lobby (`GET /api/rooms/by-code/:code`) or open a shareable link (`?room=CODE`), which automatically joins the room and claims the first open seat.
   * Inside [VirtualTable.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/VirtualTable.tsx), players can copy the room code or shareable invite URL with a single click.
4. **Quick Play Online Matchmaking (`POST /api/matchmaking`)**:
   * Places the player into the fullest open public table in `'waiting'` state (or creates a new public matchmaking table) and claims an open seat.
   * Starts a 15-second auto-fill countdown (`matchmakingAutoStartAt`) that automatically populates any remaining empty seats with AI bots (`فاشي الاسرار`, `صف السادس`, `ابو قرون`) so the match begins promptly.
5. **Sit & Fill Bots**: A user can click "Sit & Fill Bots" in [VirtualTable.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/VirtualTable.tsx) at any time during `'waiting'` to immediately fill all remaining empty seats with AI bots.
6. **Configurable Human Turn Timer & Bot Auto-Play**:
   * Whenever a seated human player is on the clock during `bidding`, `declaring`, or `playing` and `room.turnTimerSeconds > 0` (default `10s`), the server sets `turnDeadlineAt` and starts a countdown timer.
   * If the human player does not act before `turnDeadlineAt`, the server's AI Bot engine (`super` or `casual`) immediately computes and executes a legal move on their behalf without converting the human seat into a permanent bot.
   * Auto-played moves are flagged with `isAutoPlayed: true`, badged on the table felt with **`🤖 Bot Move`** (or `🤖 Auto` on bids), and announced via an auto-dismissing top-center notification banner (`lastAutoPlayNotice`).

### 1.3 Validation & Rules
* A seat cannot be claimed if occupied by another human player.
* If a human user is already seated in seat $S_1$ and claims seat $S_2$, $S_1$ is vacated automatically.
* Automatic Start Trigger: Once all 4 seats are occupied, the room automatically transitions from `'waiting'` to `'bidding'`, and Phase 1 begins.

---

## 2. Feature: Phase 1 — The Deal

### 2.1 Sequence of Operations
1. Shuffles a standard 52-card deck using Fisher-Yates ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L124-L132)).
2. Distributes 13 cards each to North, West, South, and East.
3. Automatically sorts each player's hand by suit (`Spades` > `Hearts` > `Clubs` > `Diamonds`) and rank descending ($A, K, Q, J, 10, \dots, 2$) ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L135-L153)).
4. **Dealer Selection**:
   * Round 1: Randomized dealer selected from `['North', 'West', 'South', 'East']`.
   * Subsequent Rounds: Dealer rotates counter-clockwise: `North` $\rightarrow$ `West` $\rightarrow$ `South` $\rightarrow$ `East` $\rightarrow$ `North`.
5. The auction opening bidder is assigned to the player to the immediate right of the dealer (`getNextSeat(dealer)`).
6. **Unwinnable Hand / Misdeal ("Kosh") Rule**:
   * Hands are verified for winning card criteria:
     * Any **Ace (`A`)**
     * Any **King (`K`)** with at least 1 other card of the same suit (suit length $\ge 2$)
     * Any **Queen (`Q`)** with at least 2 other cards of the same suit (suit length $\ge 3$)
     * Any **Jack (`J`)** with at least 3 other cards of the same suit (suit length $\ge 4$)
   * If any hand contains none of the above, state transitions to `'misdeal'`.
   * The 13-card hand is revealed face-up for 10 seconds via [MisdealModal.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/MisdealModal.tsx) with a countdown progress bar and "Deal Now" skip button.
   * On timeout or skip, cards are re-dealt with the dealer rotating counter-clockwise (`getNextSeat(dealer)`).

---

## 3. Feature: Phase 2 — The Auction (Bidding)

### 3.1 Purpose & Workflow
Players bid to determine the contract level, contract type, and which partnership will be the Declarer.

### 3.2 Turn Sequence & Mechanics
* Exactly **4 turns** in counter-clockwise order:
  * Turn 1: Player to right of dealer (`getNextSeat(dealer)`)
  * Turn 2: Partner of opening bidder (`getNextSeat(turn1)`)
  * Turn 3: Opponent (`getNextSeat(turn2)`)
  * Turn 4: Dealer (`dealer`)
* Current state tracked by `gameState.auctionTurnsCount` (0 through 3).

### 3.3 Valid Bid Hierarchy
A bid consists of a Level (1 through 7) and a Contract Type (`Suit` or `NT`):
$$\text{Rank} = \text{Level} \times 2 + (\text{ContractType} == \text{'NT'} ? 1 : 0)$$

Hierarchy: `1 Suit < 1 NT < 2 Suit < 2 NT < 3 Suit < 3 NT < ... < 7 Suit < 7 NT`

### 3.4 Dealer Strategic Privileges (Turn 4)
The dealer on turn 4 has special strategic options ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L206-L298)):
1. **Pass**: Accepts the leading bid from turns 1–3.
2. **When Highest Bid reached Dealer as Suit (e.g. `2 Suit`)**:
   * Dealer can **Match Suit** at the same level (`Match 2 Suit`, 8 tricks) with `isDealerPrivilegeMatch: true`.
   * Dealer can submit a higher bid (`2 NT`, `3 Suit`, `3 NT`, etc.).
3. **When Highest Bid reached Dealer as No Trump (e.g. `2 NT`)**:
   * Dealer can take No Trump with the **same number or higher** (`Match 2 No Trump`, `Bid 3 No Trump`, etc.).
   * If the dealer wants to take it **Suit**, it must be **one or more higher** (e.g. `3 Suit` or above). Matching `2 Suit` against `2 NT` is strictly disallowed.
4. **Exceed**: Submits any strictly higher legal bid.

### 3.5 Auction Conclusion & Contract Visibility
* **All 4 Players Pass**: The cards are reshuffled and re-dealt with the dealer rotating counter-clockwise ([server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L272-L278)).
* **Live Seat Bids**: All players display their submitted bid or a `Passed` badge directly above/below their avatar throughout the auction.
* **Winning Bid & Declarer Badge**: The highest bidder becomes the **Declarer**. A prominent golden badge (`👑 Winning Bid: <level><suit>`) is attached to the Declarer's avatar for the duration of the round.
  * If winning bid is `Suit`: Game transitions to `declaring` (Phase 3).
  * If winning bid is `NT`: Game sets `trumpSuit = 'NT'` and transitions directly to `playing` (Phase 4). The Declarer leads the first trick.

---

## 4. Feature: Phase 3 — Trump Suit Declaration

### 4.1 Workflow
* Rendered via [SuitDeclarationModal.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/SuitDeclarationModal.tsx).
* Only the **Declarer** can select the trump suit (♠ Spades, ♥ Hearts, ♦ Diamonds, ♣ Clubs).
* Other players see a waiting indicator displaying the Declarer's team.
* Once submitted via `declare_trump`:
  * `gameState.trumpSuit` is set.
  * Game transitions to `playing` (Phase 4).
  * **Opening Turn**: The player to the **immediate right of the Declarer** (`getNextSeat(declarer)`) receives the opening turn ([server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L311)).

---

## 5. Feature: Phase 4 — Trick Play

### 5.1 Play Order & Mandatory Follow
* Players take turns playing one card in counter-clockwise rotation.
* **Mandatory Follow Rule** ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L228-L233)):
  * If the player holds at least one card in the suit led by the trick leader, they **must** play a card of that suit.
  * If void in the led suit, the player may play any card (trump or discard).
* **Card Interaction Mechanics**:
  * **Single-Tap / 1-Click Play**: On both desktop and mobile touch devices, tapping or clicking a legal playable card plays it immediately. The 2-tap confirmation has been removed.
  * **Swipe-Up "Throw" Gesture**: On touch devices, swiping or flicking an eligible card upwards towards the table felt throws the card into the trick. Visual drag tracking follows the user's finger with dynamic elevation, tilt, and an animated `Throw ↑` badge when the release threshold is reached.
  * **Clean Felt Design**: Opponent card stacks/counts have been removed from player cards to keep the felt spacious and uncluttered.

### 5.2 Trick Evaluation & Timing
When the 4th card lands in the trick ([server.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/server.ts#L347-L380)):
1. The server pauses input (`currentTurn = null`) and broadcasts the completed trick.
2. The client executes visual animations:
   * 4th card glide: 400ms (`CARD_PLAY_DURATION_MS`)
   * Review delay: 750ms (`TRICK_REVIEW_DELAY_MS`)
   * Sweep animation to winner seat: 550ms (`TRICK_COLLECT_DURATION_MS`)
   * Celebration badge highlight: 1000ms (`WINNER_CELEBRATION_DURATION_MS`)
3. The server evaluates the winner using `evaluateTrickWinner()` after `SERVER_TRICK_RESOLVE_DELAY_MS` (1850ms):
   * Highest trump card wins (if trump played in Suit game).
   * Otherwise, highest card of led suit wins.
4. Trick winner is awarded $+1$ trick in `tricksWonCount[winner]` and `teamTricksWon[winnerTeam]`.
5. The winner leads the next trick.

---

## 6. Feature: Phase 5 — Scoring Engine

Triggered after all 13 tricks have been played ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L289-L394)):

### 6.1 Suit Contracts
Let $L = \text{Bid Level}$, Required Tricks $= 6 + L$:
* **Contract Made** ($\text{Tricks} \ge 6 + L$):
  $$\text{Contract Team Delta} = \text{TricksWon} - 6$$
  $$\text{Defending Team Delta} = 0$$
* **Contract Set / Failed** ($\text{Tricks} < 6 + L$):
  $$\text{Contract Team Delta} = -L$$
  $$\text{Defending Team Delta} = \max(0, \text{DefendingTricksWon} - 6)$$

### 6.2 No Trump (NT) Contracts (Doubled)
* **Contract Made** ($\text{Tricks} \ge 6 + L$):
  $$\text{Contract Team Delta} = (L \times 2) + \max(0, \text{TricksWon} - (6 + L))$$
  $$\text{Defending Team Delta} = 0$$
* **Contract Set / Failed** ($\text{Tricks} < 6 + L$):
  $$\text{Contract Team Delta} = -(L \times 2)$$
  $$\text{Defending Over 6} = \max(0, \text{DefendingTricksWon} - 6)$$
  $$\text{Defending Team Delta} = \min(\text{Defending Over 6}, L) \times 2 + \max(0, \text{Defending Over 6} - L) \times 1$$

---

## 7. Feature: Victory and Elimination Conditions

Evaluated via `checkMatchEnd()` ([gameLogic.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/gameLogic.ts#L400-L449)):
* **Victory Condition**: Reaching $\ge +10$ match points.
* **Elimination Condition**: Dropping to $\le -10$ match points.
* **Priority Rule**: If both teams trigger conditions simultaneously, $+10$ Victory takes precedence over $-10$ Elimination. If both teams exceed $+10$, the team with the higher score wins; if exactly tied, Team 1 holds victory precedence.
* **Game Over Modal**: Displays confetti, final scores, and offers "Start New Match" ([GameOverModal.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/GameOverModal.tsx)).
