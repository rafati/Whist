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

// Bot Decision for Bidding
export function getBotBid(gameState: GameState, seat: Seat): Bid {
  const hand = gameState.hands[seat] || [];
  const hcp = calculateHCP(hand);
  const strongest = getStrongestSuit(hand);
  const isDealer = gameState.dealer === seat;
  const isFinalTurn = gameState.auctionTurnsCount === 3; // 4th turn
  const highest = gameState.highestBid;

  // Final Turn: Dealer Privileges
  if (isDealer && isFinalTurn && highest && highest.type === 'bid' && highest.level) {
    // If partner is currently winning the bid, dealer passes to let partner win!
    const partner = getPartner(seat);
    if (gameState.highestBidder === partner) {
      return { seat, type: 'pass' };
    }

    const privileges = getDealerPrivileges(highest);

    // If dealer has very strong hand (HCP >= 14 and balanced), use Match NT if allowed
    if (privileges.canMatchNT && privileges.matchedNTLevel && hcp >= 14) {
      return {
        seat,
        type: 'bid',
        level: privileges.matchedNTLevel,
        contractType: 'NT',
        isDealerPrivilegeMatch: true,
      };
    }

    // If dealer has 5+ cards in a suit and HCP >= 10, use Match Suit if allowed
    if (privileges.canMatchSuit && privileges.matchedSuitLevel && strongest.count >= 5 && hcp >= 10) {
      return {
        seat,
        type: 'bid',
        level: privileges.matchedSuitLevel,
        contractType: 'Suit',
        isDealerPrivilegeMatch: true,
      };
    }

    // If dealer cannot match or hand not strong enough, pass
    return { seat, type: 'pass' };
  }

  // Standard Turn (Turns 1, 2, 3 or opening)
  // Determine if hand is strong enough to open/raise
  const minHCP = highest ? 12 + (highest.level || 1) * 2 : 11;
  const canNT = hcp >= 15;

  // Target candidate level and type
  let targetLevel = 1;
  let targetType: ContractType = 'Suit';

  if (!highest || highest.type === 'pass') {
    if (hcp < 10 && strongest.count < 5) {
      return { seat, type: 'pass' };
    }
    targetLevel = hcp >= 16 ? 2 : 1;
    targetType = canNT ? 'NT' : 'Suit';
  } else {
    // Partner has highest bid
    const partner = getPartner(seat);
    if (gameState.highestBidder === partner) {
      // Don't overbid partner unless massive hand
      if (hcp < 16) {
        return { seat, type: 'pass' };
      }
    }

    if (hcp < minHCP) {
      return { seat, type: 'pass' };
    }

    const nextLevel = (highest.level || 1) + (highest.contractType === 'NT' ? 1 : 0);
    if (nextLevel > 4) {
      return { seat, type: 'pass' };
    }

    if (highest.contractType === 'Suit') {
      // Can bid same level NT or next level Suit
      if (canNT) {
        targetLevel = highest.level || 1;
        targetType = 'NT';
      } else {
        targetLevel = (highest.level || 1) + 1;
        targetType = 'Suit';
      }
    } else {
      targetLevel = (highest.level || 1) + 1;
      targetType = canNT ? 'NT' : 'Suit';
    }
  }

  if (targetLevel > 7) {
    return { seat, type: 'pass' };
  }

  if (isBidHigher(targetLevel, targetType, highest)) {
    return {
      seat,
      type: 'bid',
      level: targetLevel,
      contractType: targetType,
    };
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

    // Check if opponents have any trumps left
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

    // TACTICAL INVARIANT: If opponent trumps are exhausted (0 left), NEVER lead trump when we hold non-trump cards!
    const nonTrumpCards = legalCards.filter((c) => trumpSuit === 'NT' || c.suit !== trumpSuit);
    if (trumpSuit !== 'NT' && opponentTrumpsLeft === 0 && nonTrumpCards.length > 0) {
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
