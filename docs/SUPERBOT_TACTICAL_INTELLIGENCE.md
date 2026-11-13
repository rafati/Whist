# SuperBot Tactical Intelligence & Decision Inspector

This document details the 3-phase tactical enhancement and decision telemetry system introduced to eliminate tactical mistakes ("stupid mistakes") in `SuperBot` ([superBot.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/superBot.ts)).

---

## 1. Overview & Motivation

In Syrian Whist 400 (Tadfeea), partnership coordination and high-level card play require strict tactical invariants alongside deep search. Previously, pure heuristic play or premature double-dummy minimax could make unintuitive plays in single-dummy scenarios (e.g., ducking second hand with $A-K$, failing to draw remaining opponent trumps before cashing side suits, or underleading unsupported honors).

The 3-phase upgrade resolves these issues through rule-based tactical invariants, extended 6-card endgame lookahead, and live telemetry.

```mermaid
flowchart TD
    subgraph Phase1["Phase 1: Tactical Invariants"]
        M1["isMasterCard Recognition"]
        M2["Continuous Declarer Trump Pull"]
        M3["Low Lead from Unsupported Honor"]
        M4["Second-Hand A-K Cash"]
    end

    subgraph Phase2["Phase 2: 6-Card Micro-DDS Depth"]
        D1["Endgame Depth: Tricks 8-13 (<= 6 cards)"]
        D2["Alpha-Beta Minimax (15k Node Budget)"]
        D3["Invariant Blunder Guards (Anti-Duck / Anti-Overruff)"]
    end

    subgraph Phase3["Phase 3: Decision Inspector Telemetry"]
        T1["getSuperBotBidWithReason (EV + Privileges)"]
        T2["getSuperBotCardPlayWithReason (Tactical Rule)"]
        T3["GameState.lastBotReasoning Broadcast"]
        T4["VirtualTable UI Pill & Hover Tooltip"]
    end

    Phase1 --> Phase2
    Phase2 --> Phase3
```

---

## 2. Phase 1: High-Impact Tactical Invariants

### 2.1 Dynamic Master Card Recognition (`isMasterCard`)
A card is considered a "Master Card" if no higher rank in that suit remains unplayed across the game.
- An Ace is always master.
- When an Ace has fallen in trick history or the current trick, the King becomes promoted to master.
- When Ace and King have fallen, the Queen becomes promoted to master.

**Rule:** When on lead (or in notrump contracts), if the bot holds a promoted master card, it immediately cashes it to bank guaranteed tricks and clear suit communication.

### 2.2 Continuous Declarer Trump Extraction
- Declarers in suit contracts must continuously pull trumps as long as opponents hold unplayed trumps.
- Calculated via `countRemainingOpponentTrumps(gameState, seat, trumpSuit)` with Bayesian hand reconstruction.
- If declarer holds master trumps, touching top trumps, or a numerical length surplus, declarer leads high trumps continuously until opponent trumps are stripped, preventing opponents from scoring cheap ruffs on side-suit honors.

### 2.3 Protection of Unsupported Honors
- When leading a side suit without sequential touching honors (e.g. holding $K-x-x$ without the Ace or Queen), the bot never leads the unsupported honor bare.
- Instead, it leads 4th-best or a low spot card to protect the King and develop the suit through partner finesses.

### 2.4 Second-Hand $A-K$ Play
- In standard bridge/whist, "Second Hand Low" applies to spot cards or split honors.
- However, when second hand holds **both** the Ace and King ($A-K$), ducking risks losing a cheap trick or allowing a singleton/doubleton trick to slip through.
- SuperBot strictly enforces playing the King from $A-K$ in second position to secure the trick immediately.

### 2.5 Teammate Suit Memory & "Return Partner's Suit"
In partnership Whist, when your teammate leads a suit or plays a high card in it, they are signaling length and trick potential in that suit.
- `getPartnerInitiatedSuit`: Scans trick history backwards to detect suits partner led, won with an honor ($K, Q, J, 10$), or encouraged via attitude signals.
- `selectCardToReturnPartnerSuit`: Adheres to the textbook Whist law:
  - **Holding 2 cards remaining ($x\text{-}x$):** Returns the **higher** card to unblock the suit for partner.
  - **Holding 3+ cards remaining ($x\text{-}x\text{-}x$):** Returns the **lowest** card to protect honors behind the fourth-hand opponent.
  - **Holding touching top honors ($A\text{-}K$ or $K\text{-}Q$):** Leads top honor to secure the trick immediately.

### 2.6 Stopper Conservation Invariant & NT Working Suit Development (Anti-Burn)
In No-Trump (and side suits), an isolated Ace or master card in a short suit ($\le 2$ cards) is a **stopper and lifeline (entry)**, NOT a lead weapon.
- **The Anti-Burn Rule:** The bot strictly forbids leading short Aces while an unestablished working suit (length $\ge 3$) exists, unless in Cash-Out Mode.
- **Working Suit Establishment:** The bot attacks its longest working suit (driving out opponent stoppers with touching sequences like $K\text{-}Q$ or leading 4th-best from unsupported honors) while side stoppers remain intact.

### 2.7 Contract Horizon & Cash-Out Mode
Tracks distance to contract fulfillment:
$$\text{Tricks Needed} = \text{Contract Target} - \text{Tricks Won}$$
- If $\text{Sure Master Winners in Hand} \ge \text{Tricks Needed}$, the bot enters **Cash-Out Mode** and immediately cashes its winners to seal the victory without taking unnecessary risks.

---

## 3. Phase 2: Extended Endgame Lookahead (6-Card Micro-DDS)

The Micro-DDS (Double Dummy Solver) search depth has been expanded from 4 tricks (16 cards total) to **6 tricks (24 cards total)**:
- **Active Range:** Tricks 8 through 13 (`hand.length <= 6` and `maxOtherCards <= 6`).
- **Search Engine:** Minimax game tree with alpha-beta pruning over sampled consistent opponent card assignments.
- **Node Budget:** 15,000 nodes per decision to guarantee sub-millisecond real-time response.
- **Invariant Blunder Guards:** Protects against single-dummy discrepancies in double-dummy solutions:
  - *Guard 1:* Never ruff or overtrump partner's winning trick.
  - *Guard 2:* Never lead trumps if opponents have 0 remaining trumps.
  - *Guard 3:* Second hand holding $A-K$ never ducks.
  - *Guard 4:* Declarer holding master trumps while opponents hold trumps never leads side suits first.
  - *Guard 5:* Never burn an isolated stopper ($\le 2$ cards) in NT while an unestablished long working suit exists.
  - *Guard 6:* On trick 2+ opening lead, return partner's initiated suit rather than switching to an uncoordinated suit.

---

## 4. Phase 3: Bot Decision Inspector & Telemetry

Both bidding and card play engines now provide transparent, human-readable tactical reasoning:

### 4.1 Bidding Telemetry (`getSuperBotBidWithReason`)
Explains:
- Opening bids with expected value (EV) calculations (e.g. `Bid 1 Suit (Expected Value: +4.79)`).
- Turn 4 Match Suit dealer privilege declarations.
- Partner contract protection and raises to $2\text{ NT}$ for accelerated victory (+4 points).

### 4.2 Card Play Telemetry (`getSuperBotCardPlayWithReason`)
Explains the exact rule, signal, or minimax line executed, including:
- `"Continuous declarer trump extraction: AS (5 opp trumps left)"`
- `"Cashed promoted master card: KH"`
- `"Led 4th-best/low 2S to protect unsupported KS and develop suit"`
- `"Second hand: played King from A-K to secure immediate trick"`
- `"Micro-DDS minimax line: played AS (6 tricks remaining)"`

### 4.3 UI Presentation ([VirtualTable.tsx](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/components/VirtualTable.tsx))
- **Live Decision Pill:** When a bot takes an action, a floating pill appears below its player pod displaying `💡 <reason>`.
- **Pod Tooltip:** Hovering over the bot icon in any pod displays the full tactical rationale of its latest action.

---

## 5. Verification & Test Suite

The test suite is integrated into `npm test` and can be run independently:
```bash
npx tsx scripts/test_superbot_tactical_phases.ts
```

### Verified Test Cases:
1. **Master Card Recognition (`isMasterCard`):** Correct identification and promotion of Aces, Kings, and Queens.
2. **Continuous Declarer Trump Extraction:** Declarer draws trumps while opponents hold trumps.
3. **Cashing Promoted Master Winners:** Immediate cash of promoted honors in NT/suit contracts.
4. **Low Leads from Unsupported Honors:** Protection of bare Kings by leading low spot cards.
5. **Second-Hand $A-K$ Play:** Playing King from $A-K$ in second position.
6. **6-Card Micro-DDS Depth:** Minimax evaluation across 6-trick endgame within 15k node budget.
7. **Bot Bidding Decision Reasoning Telemetry:** EV calculation and rationale broadcasting.
8. **NT Stopper Preservation & Working Suit Development (Anti-Burn):** Holding isolated $A\spadesuit$ and $A\clubsuit$ alongside 5 Diamonds ($K\text{-}Q\text{-}J\text{-}10\text{-}4\diamondsuit$), the bot leads $K\diamondsuit$ and preserves the Aces as stoppers.
9. **Return Partner's Suit (High from 2):** Partner led Spades on trick 1; bot wins trick 1 and returns $8\spadesuit$ from $8\text{-}2\spadesuit$ to unblock for partner.
10. **Return Partner's Suit (Low from 3):** Bot holding $Q\text{-}6\text{-}2\spadesuit$ returns $2\spadesuit$ to preserve $Q\spadesuit$ behind the opponent.
11. **Cash-Out Mode:** When sure winners in hand meet contract target, the bot claims the contract by immediately cashing out.
