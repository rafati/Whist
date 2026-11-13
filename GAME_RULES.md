# تدفيع الثمن (Tadfeea Al-Thaman) — Game Rules

A 4-player trick-taking partnership card game played with a standard 52-card deck.

---

## 1. Overview & Setup

* **Players & Teams**: 
  * 4 players divided into two fixed partnerships: **Team 1** and **Team 2**.
  * Partners sit directly opposite each other.
* **Deck**:
  * Standard 52-card deck without jokers.
  * 4 Suits: Spades (♠), Hearts (♥), Clubs (♣), Diamonds (♦).
  * 13 Ranks in descending order: **Ace (highest), King, Queen, Jack, 10, 9, 8, 7, 6, 5, 4, 3, 2 (lowest)**.
* **Direction of Play**:
  * All phases (dealing, bidding, and trick play) proceed strictly **counter-clockwise**.
* **Dealer Rotation**:
  * For the first round, the dealer is chosen at random.
  * In each subsequent round, the deal rotates counter-clockwise to the next player.

---

## 2. Deal & Misdeal ("Kosh") Rules

1. **Card Distribution**:
   * The dealer distributes 13 cards to each player.
2. **Unwinnable Hand / Misdeal ("Kosh") Rule**:
   * A dealt hand is considered playable if it contains at least one **winning card**, defined as:
     * Any **Ace (A)**
     * Any **King (K)** with at least 1 other card of the same suit (suit count $\ge 2$)
     * Any **Queen (Q)** with at least 2 other cards of the same suit (suit count $\ge 3$)
     * Any **Jack (J)** with at least 3 other cards of the same suit (suit count $\ge 4$)
   * If any player's hand contains **none** of the above combinations (0 winning cards), a **Misdeal ("Kosh")** occurs.
   * In the event of a misdeal, the round is aborted immediately, the cards are reshuffled, and the deal passes counter-clockwise to the next dealer.

---

## 3. Bidding Rules (The Auction)

The auction determines the **Declarer**, the **Contract Level**, and the **Contract Type**.

### 3.1 Auction Flow & Turns
* The auction consists of **exactly 4 turns**, conducted in counter-clockwise order:
  * **Turn 1**: Player to the immediate right of the dealer.
  * **Turn 2**: Partner of the opening bidder.
  * **Turn 3**: Opponent sitting to the right of Turn 2.
  * **Turn 4**: The **Dealer** (always bids last).
* Each player has exactly one opportunity to bid or pass.

### 3.2 Bid Structure & Hierarchy
* **Contract Level**: 1 to 7.
  * The level represents required tricks above the base of 6:
    $$\text{Required Tricks} = 6 + \text{Level}$$
    * Level 1 = 7 tricks
    * Level 2 = 8 tricks
    * Level 3 = 9 tricks
    * Level 4 = 10 tricks
    * Level 5 = 11 tricks
    * Level 6 = 12 tricks
    * Level 7 = 13 tricks (all tricks)
* **Contract Type**:
  * **Suit**: One of the four suits will be declared as Trump.
  * **NT (No Trump)**: No trump suit; tricks are decided strictly by the led suit.
* **Ascending Bid Hierarchy**:
  $$\text{1 Suit} < \text{1 NT} < \text{2 Suit} < \text{2 NT} < \text{3 Suit} < \text{3 NT} < \dots < \text{7 Suit} < \text{7 NT}$$
  * A regular bid (Turns 1–3) must be strictly higher in rank than the current highest bid.

### 3.3 Dealer Privileges (Turn 4)
The dealer on their final turn possesses special strategic privileges:
* **Pass**: Accepts the leading bid from the first 3 players; the leading bidder becomes Declarer.
* **When Highest Bid reached Dealer as a Suit contract (e.g., `2 Suit`)**:
  * **Match**: Dealer can match the bid at the same level (`Match 2 Suit`, requiring 8 tricks) and win the contract.
  * **Bid Higher**: Dealer can submit a higher bid (`2 NT`, `3 Suit`, `3 NT`, etc.).
* **When Highest Bid reached Dealer as No Trump (e.g., `2 NT`)**:
  * **Match**: Dealer can take No Trump with the **same level or higher** (`Match 2 NT`, `3 NT`, etc.) and win the contract.
  * **Take Suit**: If the dealer wants to play a Suit contract against an NT bid, the level must be **at least one higher** (e.g., `3 Suit` or above). Matching at the same level (e.g., bidding `2 Suit` against `2 NT`) is strictly forbidden.

### 3.4 Auction Conclusion
* The player with the final highest bid becomes the **Declarer**, and their partnership becomes the **Contract / Declaring Team**.
* The other partnership becomes the **Defending Team**.
* **Passed Out**: If all 4 players pass, the cards are reshuffled and re-dealt with the dealer rotating counter-clockwise.

---

## 4. Trump Declaration

* **Suit Contracts**: The Declarer selects the trump suit: Spades (♠), Hearts (♥), Diamonds (♦), or Clubs (♣).
* **No Trump (NT) Contracts**: No trump suit is declared.

---

## 5. Play Rules (Trick Play)

Each round consists of **13 tricks**.

### 5.1 Opening Lead
* **In Suit Contracts**: The player to the **immediate right of the Declarer** leads the first card.
* **In No Trump (NT) Contracts**: The **Declarer leads first**.
* **Subsequent Tricks**: The player who won the previous trick leads the next trick.

### 5.2 Mandatory Follow Rule (Following Suit)
* Play proceeds counter-clockwise.
* A player **must follow the suit led** if they hold at least one card in that suit.
* If a player holds **no cards** in the suit led (void), they may play any card:
  * In a Suit contract: they may play a trump card (to cut/ruff) or discard a card of any other suit.
  * In an NT contract: they may discard any card (discards cannot win the trick).

### 5.3 Trick Resolution (Winning a Trick)
* **In Suit Contracts**:
  * If one or more trump cards are played, the **highest trump card** wins the trick.
  * If no trump cards are played, the **highest card of the suit led** wins the trick.
* **In No Trump (NT) Contracts**:
  * The **highest card of the suit led** wins the trick. Cards of any other suit cannot win.

---

## 6. Scoring Rules

Scores are computed at the conclusion of all 13 tricks.
Let $L = \text{Bid Level}$, and $\text{Target Tricks} = 6 + L$.

### 6.1 Suit Contracts
* **Contract Made** (Declaring team wins $\ge 6 + L$ tricks):
  * **Declaring Team**: $+1$ point for each trick won over 6:
    $$\text{Points} = \text{Tricks Won} - 6$$
  * **Defending Team**: $0$ points.
* **Contract Failed / Set** (Declaring team wins $< 6 + L$ tricks):
  * **Declaring Team Penalty**: $-L$ points (deducted from their match score).
  * **Defending Team**: $+1$ point for each trick they won over 6:
    $$\text{Points} = \max(0, \text{Defending Tricks Won} - 6)$$

### 6.2 No Trump (NT) Contracts (Doubled)
* **Contract Made** (Declaring team wins $\ge 6 + L$ tricks):
  * **Declaring Team**: Base points of $(L \times 2)$ plus 1 point for each overtrick above the target:
    $$\text{Points} = (L \times 2) + (\text{Tricks Won} - (6 + L))$$
  * **Defending Team**: $0$ points.
* **Contract Failed / Set** (Declaring team wins $< 6 + L$ tricks):
  * **Declaring Team Penalty**: $-(L \times 2)$ points (deducted from their match score).
  * **Defending Team**: Points for tricks they won over 6:
    * The first $L$ tricks over 6 award **2 points each**.
    * Any additional tricks beyond that award **1 point each**:
      $$\text{Defending Over 6} = \max(0, \text{Defending Tricks Won} - 6)$$
      $$\text{Points} = \min(\text{Defending Over 6}, L) \times 2 + \max(0, \text{Defending Over 6} - L) \times 1$$

### 6.3 Salpand (سالابند) — 13-Trick Grand Slam
When either partnership captures all **13 tricks** in a single round:
* **Offensive Salpand (Declarer captures 13 tricks)**:
  * Awarded a flat **+11 points** (replaces regular formula).
  * In No Trump, even if the normal formula would calculate higher (e.g., $5\text{ NT} = 12$, $6\text{ NT} = 13$, $7\text{ NT} = 14$), it is strictly **capped at 11 points**.
  * Defending team gets $0$ points.
* **Defensive Salpand (Defenders capture 13 tricks)**:
  * The defending team is awarded **+11 points**.
  * The declaring team receives their standard failed contract penalty ($-L$ in Suit, $-(L \times 2)$ in NT).

---

## 7. Match Winning & Elimination Rules

The match score is cumulative across rounds.

* **Victory Condition**:
  * The first team to reach **+10 Match Points** (or higher) wins the match immediately.
* **Elimination Condition**:
  * A team that drops to **-10 Match Points** (or lower) is eliminated, giving the opposing team the match victory.
* **Tie-Breaking & Priority Rules**:
  * **Victory over Elimination**: If one team reaches $+10$ and the other team falls to $-10$ in the same round, reaching $+10$ (Victory) takes precedence.
  * **Both Reach +10**: If both teams reach $+10$ or higher in the same round, the team with the higher score wins. If tied, Team 1 holds victory precedence.
  * **Both Drop to -10**: If both teams drop to $-10$ or lower in the same round, the team with the higher (less negative) score wins.
