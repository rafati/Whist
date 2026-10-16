# Testing & Quality Assurance: Remix Online Multiplayer Card Game

**Version:** 3.0  
**Current Testing Status:** Type Checking & Headless Monte Carlo Simulation Only (Automated Unit/Integration Test Suite Not Yet Implemented)

---

## 1. Existing Testing Capabilities

### 1.1 Static Type Checking
* **Command:** `npm run lint`
* **Underlying Tool:** TypeScript Compiler (`tsc --noEmit`)
* **Scope:** Validates all TypeScript types across `server.ts`, `src/`, and `scripts/`. Ensures interface conformance for WebSocket messages, component props, and game models.

### 1.2 Headless Monte Carlo Simulation Runner
While formal assertion-based unit tests are not present, the codebase features a high-throughput deterministic simulation engine in [src/logic/simulator.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/src/logic/simulator.ts).

* **Command:** `npm run train [matches]` (e.g. `npm run train 100`)
* **CLI Runner:** [scripts/train.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/scripts/train.ts)
* **What it Exercises:**
  * Complete full-match self-play between Super Bot and Casual Bot.
  * Card shuffling, dealing, and hand sorting.
  * 4-turn auction with dealer privilege logic.
  * Mandatory follow rules and 13-trick evaluation per round.
  * Suit and NT score delta calculations.
  * Victory and elimination termination conditions.

### 1.3 Automated Headless Chrome CDP Verification Scripts
The test suite includes dedicated browser automation runners that leverage the Chrome DevTools Protocol (CDP) for mobile viewport and gesture verification:

* **Touch Gestures & Single-Tap Play Runner**: [scripts/test_touch_gestures.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/scripts/test_touch_gestures.ts)
  * `npx tsx scripts/test_touch_gestures.ts`
  * Emulates touch screens (`Emulation.setTouchEmulationEnabled`) with coarse pointer events.
  * Dispatches `Input.dispatchTouchEvent` sequences (`touchStart`, `touchMove`, `touchEnd`) verifying upward swipe throw mechanics and single-tap card plays.
* **Mobile Portrait Viewport Runner**: [scripts/test_ui_portrait.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/scripts/test_ui_portrait.ts)
  * `npx tsx scripts/test_ui_portrait.ts`
  * Tests the complete player journey on iPhone portrait viewports (390x844): Auth, Lobby, Quick Play table entry, auction bidding, trump declaration, single-tap card play, and trick evaluation.
  * Captures timestamped visual screenshots across each game phase.
* **WebSocket Flow Smoke Test**: [scripts/verify_game_flow.ts](file:///Users/rafatishaq/antigravity/Remix-Online-Multiplayer-Card-Game/scripts/verify_game_flow.ts)
  * `npx tsx scripts/verify_game_flow.ts`
  * Validates room creation REST API and WebSocket state synchronization without requiring a browser UI.

---

## 2. Testing Limitations & Uncovered Critical Areas

| Critical Subsystem | Current Test Coverage | Identified Risk |
|---|---|---|
| **Scoring Engine** (`calculateRoundScores`) | Exercised only via simulator | Edge cases in NT failure penalty calculation and undertricks have no formal regression assertions |
| **Mandatory Follow Rules** (`isCardLegal`) | Exercised only via simulator | Invalid client cards could bypass validation if regression occurs |
| **Dealer Privilege Hierarchy** (`getDealerPrivileges`, `isBidHigher`) | Exercised only via simulator | Dealer Turn 4 Match Suit / Match NT logic needs strict boundary unit tests |
| **Tie-Breaker Rule** (`checkMatchEnd`) | Exercised only via simulator | Simultaneous +11 victory tie gives automatic precedence to Team 1 without formal test suite |
| **WebSocket Protocol & Reconnection** | Manual browser testing only | Dropped connections, rapid re-connections, and session handoffs are untested |
| **WebRTC Audio & Signaling** | Manual browser testing only | Peer leaving mid-match or ICE negotiation failure has no automated verification |

---

## 3. Recommended Testing Strategy & Roadmap

Future maintainers should introduce an automated test framework (such as **Vitest** for fast unit/integration testing and **Playwright** for end-to-end browser multiplayer testing).

### 3.1 Proposed Unit Test Setup (Vitest)
Add to `package.json`:
```json
"devDependencies": {
  "vitest": "^2.0.0"
}
```

#### Example Unit Test: `tests/scoring.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { calculateRoundScores } from '../src/logic/gameLogic';

describe('Scoring Engine', () => {
  it('correctly calculates 2 NT contract made with 1 overtrick', () => {
    const result = calculateRoundScores(
      { seat: 'South', type: 'bid', level: 2, contractType: 'NT' },
      'South',
      'NT',
      1,
      { TeamA: 9, TeamB: 4 } // 2 NT requires 8 tricks, won 9 (1 overtrick)
    );
    // Base 2 * 2 = 4 pts + 1 extra trick = 5 pts
    expect(result.bidSuccess).toBe(true);
    expect(result.scoreDeltaBidTeam).toBe(5);
    expect(result.scoreDeltaDefTeam).toBe(0);
  });

  it('correctly assesses penalty for defeated 2 Suit contract', () => {
    const result = calculateRoundScores(
      { seat: 'South', type: 'bid', level: 2, contractType: 'Suit' },
      'South',
      'S',
      1,
      { TeamA: 7, TeamB: 6 } // Required 8 tricks, won 7 (1 undertrick)
    );
    // Defeated 2 Suit: -2 pts to bidding team, 0 pts to defenders (6 tricks = 0 over 6)
    expect(result.bidSuccess).toBe(false);
    expect(result.scoreDeltaBidTeam).toBe(-2);
    expect(result.scoreDeltaDefTeam).toBe(0);
  });
});
```

### 3.2 Proposed End-to-End Test Setup (Playwright)
Multi-tab multiplayer coordination tests to verify:
1. Four browser contexts join `grand-table-1`.
2. Seating completes and transitions table to `'bidding'`.
3. Bids are submitted in turn sequence.
4. Cards are played and the trick sweeps to the winning seat.
