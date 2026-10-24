import {
  Bid,
  Card,
  ContractType,
  GameState,
  Seat,
  Suit,
  TrumpSuit,
} from '../types.ts';
import {
  getBidRank,
  getDealerPrivileges,
  getNextSeat,
  getPartner,
  isBidHigher,
  isCardLegal,
  RANK_VALUES,
  SUITS,
  evaluateTrickWinner,
} from './gameLogic.ts';

// Calculate High Card Points
export function calculateHCP(hand: Card[]): number {
  let points = 0;
  for (const card of hand) {
    if (card.rank === 'A') points += 4;
    else if (card.rank === 'K') points += 3;
    else if (card.rank === 'Q') points += 2;
    else if (card.rank === 'J') points += 1;
  }
  return points;
}

// Find strongest suit in hand
export function getStrongestSuit(hand: Card[]): { suit: Suit; count: number; hcp: number } {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  const hcp: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };

  for (const card of hand) {
    counts[card.suit]++;
    if (card.rank === 'A') hcp[card.suit] += 4;
    else if (card.rank === 'K') hcp[card.suit] += 3;
    else if (card.rank === 'Q') hcp[card.suit] += 2;
    else if (card.rank === 'J') hcp[card.suit] += 1;
  }

  let bestSuit: Suit = 'S';
  let bestScore = -1;

  for (const s of SUITS) {
    const score = counts[s] * 2 + hcp[s];
    if (score > bestScore) {
      bestScore = score;
      bestSuit = s;
    }
  }

  return { suit: bestSuit, count: counts[bestSuit], hcp: hcp[bestSuit] };
}

// Check if hand is balanced (no singletons or voids, suitable for No Trump)
export function isHandBalanced(hand: Card[]): boolean {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) counts[c.suit]++;
  const values = Object.values(counts);
  const minCount = Math.min(...values);
  const maxCount = Math.max(...values);
  return minCount >= 2 && maxCount <= 5;
}

// Bot Decision for Bidding
export function getBotBid(gameState: GameState, seat: Seat): Bid {
  const hand = gameState.hands[seat] || [];
  const hcp = calculateHCP(hand);
  const strongest = getStrongestSuit(hand);
  const balanced = isHandBalanced(hand);
  const isDealer = gameState.dealer === seat;
  const isFinalTurn = gameState.auctionTurnsCount === 3; // 4th turn
  const highest = gameState.highestBid;
  const partner = getPartner(seat);

  // Partner intention awareness
  const partnerBids = (gameState.bids || []).filter((b) => b.seat === partner);
  const lastPartnerBid = partnerBids.length > 0 ? partnerBids[partnerBids.length - 1] : null;
  const partnerPassed = lastPartnerBid?.type === 'pass';
  const partnerOpened = lastPartnerBid?.type === 'bid';
  const isPartnerWinning = gameState.highestBidder === partner;

  // 1. Final Turn: Dealer Privileges
  if (isDealer && isFinalTurn && highest && highest.type === 'bid' && highest.level) {
    // If partner is currently winning the bid, dealer passes to protect partner!
    if (isPartnerWinning) {
      return { seat, type: 'pass' };
    }

    const privileges = getDealerPrivileges(highest);

    // Dealer privilege match Suit:
    const canSupportPartnerSuit = partnerOpened && strongest.count >= 4 && hcp >= 8;
    const canMatchOwnSuit = strongest.count >= 5 && hcp >= 10;
    if (privileges.canMatchSuit && privileges.matchedSuitLevel && (canSupportPartnerSuit || canMatchOwnSuit)) {
      return {
        seat,
        type: 'bid',
        level: privileges.matchedSuitLevel,
        contractType: 'Suit',
        isDealerPrivilegeMatch: true,
      };
    }

    // Dealer privilege match NT:
    const canSupportPartnerNT = partnerOpened && balanced && hcp >= 9;
    const canMatchOwnNT = balanced && hcp >= 13;
    if (privileges.canMatchNT && privileges.matchedNTLevel && (canSupportPartnerNT || canMatchOwnNT)) {
      return {
        seat,
        type: 'bid',
        level: privileges.matchedNTLevel,
        contractType: 'NT',
        isDealerPrivilegeMatch: true,
      };
    }

    // Cannot match or insufficient hand
    return { seat, type: 'pass' };
  }

  // 2. Partner is Currently Winning the Bid: Upgrades & Protection
  if (isPartnerWinning && highest && highest.level) {
    // Upgrade 2A: Partner holds 1 Suit. If bot has 14+ HCP balanced, upgrade to 1 NT for doubled points!
    if (highest.level === 1 && highest.contractType === 'Suit' && balanced && hcp >= 14) {
      return {
        seat,
        type: 'bid',
        level: 1,
        contractType: 'NT',
      };
    }

    // Upgrade 2B: Partner holds 1 NT. Raise to 2 NT (9-12 HCP) or 3 NT (13+ HCP)
    if (highest.contractType === 'NT' && highest.level === 1) {
      if (hcp >= 9 && hcp <= 12) {
        return {
          seat,
          type: 'bid',
          level: 2,
          contractType: 'NT',
        };
      }
      if (hcp >= 13) {
        return {
          seat,
          type: 'bid',
          level: 3,
          contractType: 'NT',
        };
      }
    }

    // In all other cases: Partner holds winning contract, pass to protect!
    return { seat, type: 'pass' };
  }

  // 3. Opening Bid (No bids made yet)
  if (!highest || highest.type === 'pass') {
    if (hcp < 10 && strongest.count < 5) {
      return { seat, type: 'pass' };
    }
    // High HCP balanced opens NT for doubled points
    if (balanced && hcp >= 15) {
      return {
        seat,
        type: 'bid',
        level: hcp >= 18 ? 2 : 1,
        contractType: 'NT',
      };
    }
    return {
      seat,
      type: 'bid',
      level: 1,
      contractType: 'Suit',
    };
  }

  // 4. Competitive Bidding (Opponent holds highest bid)
  const currentLevel = highest.level || 1;
  const currentType = highest.contractType || 'Suit';

  // If partner opened earlier, compute combined partnership power
  if (partnerOpened) {
    const combinedHCP = hcp + 12; // Partner opened with at least ~11-13 HCP

    // Support partner or compete:
    if (currentType === 'Suit') {
      if (balanced && (hcp >= 13 || combinedHCP >= 23)) {
        return {
          seat,
          type: 'bid',
          level: currentLevel,
          contractType: 'NT',
        };
      }
      if ((strongest.count >= 4 && hcp >= 8) || combinedHCP >= 21) {
        if (currentLevel + 1 <= 3) {
          return {
            seat,
            type: 'bid',
            level: currentLevel + 1,
            contractType: 'Suit',
          };
        }
      }
    } else {
      // Opponent bid NT
      if (strongest.count >= 5 && combinedHCP >= 22 && currentLevel + 1 <= 3) {
        return {
          seat,
          type: 'bid',
          level: currentLevel + 1,
          contractType: 'Suit',
        };
      }
    }
    return { seat, type: 'pass' };
  }

  // If partner passed earlier, bot is on its own with weak partner (avg ~5.5 HCP)
  if (partnerPassed) {
    // Only overcall with strong sound hand
    if (currentType === 'Suit') {
      if (balanced && hcp >= 16) {
        return { seat, type: 'bid', level: currentLevel, contractType: 'NT' };
      }
      if (strongest.count >= 5 && hcp >= 13 && currentLevel + 1 <= 2) {
        return { seat, type: 'bid', level: currentLevel + 1, contractType: 'Suit' };
      }
    }
    return { seat, type: 'pass' };
  }

  // Partner has not spoken yet: standard overcall requirements
  if (currentType === 'Suit') {
    if (balanced && hcp >= 15) {
      return { seat, type: 'bid', level: currentLevel, contractType: 'NT' };
    }
    if (strongest.count >= 5 && hcp >= 11 && currentLevel + 1 <= 2) {
      return { seat, type: 'bid', level: currentLevel + 1, contractType: 'Suit' };
    }
  } else {
    if (strongest.count >= 5 && hcp >= 13 && currentLevel + 1 <= 2) {
      return { seat, type: 'bid', level: currentLevel + 1, contractType: 'Suit' };
    }
  }

  return { seat, type: 'pass' };
}

// Bot Decision for Declaring Suit
export function getBotDeclaredSuit(hand: Card[]): Suit {
  return getStrongestSuit(hand).suit;
}

// Bot Decision for Playing a Card
export function getBotCardPlay(
  gameState: GameState,
  seat: Seat,
  trumpSuit: TrumpSuit
): Card {
  const hand = gameState.hands[seat];
  if (!hand || hand.length === 0) {
    throw new Error('No cards in hand');
  }

  const trick = gameState.currentTrick;
  const isOpeningLead = trick.length === 0;
  const ledSuit = isOpeningLead ? null : trick[0].card.suit;

  // Filter legal cards (Mandatory follow)
  const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));

  if (legalCards.length === 1) {
    return legalCards[0];
  }

  // 1. Opening Lead Strategy
  if (isOpeningLead) {
    // If we have an Ace in a non-trump suit (or trump suit), cash it!
    const aces = legalCards.filter((c) => c.rank === 'A' && (trumpSuit === 'NT' || c.suit !== trumpSuit));
    if (aces.length > 0) {
      return aces[0];
    }

    // Check if opponents have any trumps left or if trumps were already pulled
    const trumpsLedBefore = (gameState.tricksHistory || []).some((t) => t.ledSuit === trumpSuit);
    let opponentTrumpsLeft = 0;
    if (trumpSuit !== 'NT') {
      let trumpsPlayed = 0;
      for (const t of gameState.tricksHistory || []) {
        for (const p of t.cards) {
          if (p.card.suit === trumpSuit) trumpsPlayed++;
        }
      }
      const myTrumps = hand.filter((c) => c.suit === trumpSuit).length;
      opponentTrumpsLeft = Math.max(0, 13 - trumpsPlayed - myTrumps);

      // Check if both opponents showed void in trump
      const partner = getPartner(seat);
      const opp1 = getNextSeat(seat);
      const opp2 = getNextSeat(partner);
      let opp1VoidInTrump = false;
      let opp2VoidInTrump = false;
      for (const t of gameState.tricksHistory || []) {
        if (t.ledSuit === trumpSuit) {
          const p1 = t.cards.find((c) => c.seat === opp1);
          if (p1 && p1.card.suit !== trumpSuit) opp1VoidInTrump = true;
          const p2 = t.cards.find((c) => c.seat === opp2);
          if (p2 && p2.card.suit !== trumpSuit) opp2VoidInTrump = true;
        }
      }
      if (opp1VoidInTrump && opp2VoidInTrump) {
        opponentTrumpsLeft = 0;
      }
    }

    // TACTICAL INVARIANT: If opponent trumps are exhausted OR trumps were already led before,
    // NEVER lead trump when we hold non-trump cards! Establish and cash side suits instead.
    const nonTrumpCards = legalCards.filter((c) => trumpSuit === 'NT' || c.suit !== trumpSuit);
    if (trumpSuit !== 'NT' && (opponentTrumpsLeft === 0 || trumpsLedBefore) && nonTrumpCards.length > 0) {
      const nonTrumpHand = hand.filter((c) => c.suit !== trumpSuit);
      const strongestSide = getStrongestSuit(nonTrumpHand.length > 0 ? nonTrumpHand : hand);
      const inSideSuit = nonTrumpCards.filter((c) => c.suit === strongestSide.suit);
      if (inSideSuit.length > 0) {
        inSideSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        return inSideSuit[0];
      }
      nonTrumpCards.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return nonTrumpCards[0];
    }

    // Lead highest card in strongest suit
    const strongest = getStrongestSuit(hand);
    const inStrongest = legalCards.filter((c) => c.suit === strongest.suit);
    if (inStrongest.length > 0) {
      // Sort descending
      inStrongest.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return inStrongest[0];
    }

    return legalCards[0];
  }

  // 2. Following a Trick
  const partner = getPartner(seat);
  const currentLeaderWinner = evaluateTrickWinner(trick, trumpSuit);
  const partnerIsWinning = currentLeaderWinner.winner === partner;

  // Sort legal cards lowest to highest
  const sortedLegal = [...legalCards].sort(
    (a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]
  );

  // TACTICAL INVARIANT: If partner is currently winning the trick:
  // NEVER trump partner's winning card unless forced (holding only trumps)!
  if (partnerIsWinning) {
    const inLedSuit = legalCards.filter((c) => c.suit === ledSuit);
    if (inLedSuit.length > 0) {
      // If following led suit, play lowest card in led suit!
      inLedSuit.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
      return inLedSuit[0];
    }

    // Void in led suit: DISCARD LOWEST NON-TRUMP CARD!
    // NEVER trump or overtrump partner's winning trick!
    const nonTrumps = legalCards.filter((c) => trumpSuit === 'NT' || c.suit !== trumpSuit);
    if (nonTrumps.length > 0) {
      nonTrumps.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
      return nonTrumps[0];
    }

    // Only trumps remain: forced to play lowest trump
    return sortedLegal[0];
  }

  // Try to find a card that wins the trick
  const winningPlays: Card[] = [];
  for (const card of legalCards) {
    const testTrick = [...trick, { seat, card }];
    const res = evaluateTrickWinner(testTrick, trumpSuit);
    if (res.winner === seat) {
      winningPlays.push(card);
    }
  }

  if (winningPlays.length > 0) {
    // Pick the lowest card that wins
    winningPlays.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return winningPlays[0];
  }

  // Cannot win: play lowest card (prefer discarding non-trumps before throwing away trumps!)
  const inLedSuit = legalCards.filter((c) => c.suit === ledSuit);
  if (inLedSuit.length > 0) {
    inLedSuit.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return inLedSuit[0];
  }
  const nonTrumps = legalCards.filter((c) => trumpSuit === 'NT' || c.suit !== trumpSuit);
  if (nonTrumps.length > 0) {
    nonTrumps.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return nonTrumps[0];
  }
  return sortedLegal[0];
}
