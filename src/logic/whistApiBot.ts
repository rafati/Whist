/**
 * Pure machine-speed implementation of the WhistAPI AI engine.
 * Faithfully mirrors WhistAPI/src/ai/heuristics.py and solver.py:
 * - HeuristicPolicy (bidding & trump selection)
 * - _select_heuristic_play (tactical card play)
 */

import { Bid, Card, ContractType, GameState, Seat, Suit, TrumpSuit } from '../types.ts';
import { evaluateTrickWinner, getDealerPrivileges, getPartner, isBidHigher, isCardLegal, RANK_VALUES, SUITS } from './gameLogic.ts';

const HCP_MAP: Record<string, number> = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1,
};

export function getCardHcp(card: Card): number {
  return HCP_MAP[card.rank] || 0;
}

export function getHandHcp(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + getCardHcp(c), 0);
}

export function getSuitCounts(hand: Card[]): Record<Suit, number> {
  const counts: Record<Suit, number> = { H: 0, D: 0, C: 0, S: 0 };
  for (const c of hand) {
    counts[c.suit]++;
  }
  return counts;
}

/**
 * WhistAPI AI Bidding Logic (HeuristicPolicy.select_bid)
 */
export function getWhistApiBotBid(state: GameState, seat: Seat): Bid {
  const hand = state.hands[seat];
  const hcp = getHandHcp(hand);
  const counts = getSuitCounts(hand);

  // Best suit by length then HCP
  let bestSuit: Suit = 'H';
  let maxSuitLen = -1;
  let bestSuitHcp = -1;
  for (const s of SUITS) {
    const len = counts[s];
    const sHcp = hand.filter((c) => c.suit === s).reduce((acc, c) => acc + getCardHcp(c), 0);
    if (len > maxSuitLen || (len === maxSuitLen && sHcp > bestSuitHcp)) {
      maxSuitLen = len;
      bestSuitHcp = sHcp;
      bestSuit = s;
    }
  }

  const effectivePoints = hcp + Math.max(0, maxSuitLen - 4) * 2;
  const partner = getPartner(seat);
  const highestBid = state.highestBid;
  const highestBidder = state.highestBidder;
  const isDealer = state.dealer === seat;
  const isTurn4 = state.auctionTurnsCount === 3;

  // Turn 4 (Dealer) privileges:
  if (isTurn4 && isDealer && highestBid && highestBidder) {
    // If partner is highest bidder, pass to let partner win
    if (highestBidder === partner) {
      return { seat, type: 'pass' };
    }

    // Opponent is highest bidder: evaluate matching
    const highLevel = highestBid.level || 1;
    const highType = highestBid.contractType || 'Suit';

    if (highType === 'Suit') {
      if (effectivePoints >= 11 + (highLevel - 1) * 3) {
        return {
          seat,
          type: 'bid',
          level: highLevel,
          contractType: 'Suit',
          isDealerPrivilegeMatch: true,
        };
      }
    } else {
      // Highest bid is NT
      if (hcp >= 14 + (highLevel - 1) * 3) {
        return {
          seat,
          type: 'bid',
          level: highLevel,
          contractType: 'NT',
          isDealerPrivilegeMatch: true,
        };
      }
    }
  }

  // Regular bidding logic:
  if (effectivePoints < 11) {
    return { seat, type: 'pass' };
  }

  // Balanced check: all suits >= 2
  const isBalanced = SUITS.every((s) => counts[s] >= 2);
  const preferredType: ContractType = isBalanced && hcp >= 15 ? 'NT' : 'Suit';

  // Target level based on points
  let targetLvl = 1;
  if (effectivePoints >= 22) targetLvl = 4;
  else if (effectivePoints >= 18) targetLvl = 3;
  else if (effectivePoints >= 14) targetLvl = 2;
  else targetLvl = 1;

  // Check candidate bids of preferred type
  for (let lvl = targetLvl; lvl >= 1; lvl--) {
    if (isBidHigher(lvl, preferredType, highestBid)) {
      return { seat, type: 'bid', level: lvl, contractType: preferredType };
    }
  }

  // Try other contract type if preferred was not higher
  const otherType: ContractType = preferredType === 'NT' ? 'Suit' : 'NT';
  for (let lvl = targetLvl; lvl >= 1; lvl--) {
    if (isBidHigher(lvl, otherType, highestBid)) {
      return { seat, type: 'bid', level: lvl, contractType: otherType };
    }
  }

  return { seat, type: 'pass' };
}

/**
 * WhistAPI AI Trump Selection (HeuristicPolicy.select_trump)
 */
export function getWhistApiBotTrump(hand: Card[]): TrumpSuit {
  const counts = getSuitCounts(hand);
  let bestSuit: TrumpSuit = 'H';
  let bestLen = -1;
  let bestHcp = -1;

  for (const s of SUITS) {
    const len = counts[s];
    const sHcp = hand.filter((c) => c.suit === s).reduce((acc, c) => acc + getCardHcp(c), 0);
    if (len > bestLen || (len === bestLen && sHcp > bestHcp)) {
      bestLen = len;
      bestHcp = sHcp;
      bestSuit = s;
    }
  }

  return bestSuit;
}

/**
 * WhistAPI AI Card Play (solver._select_heuristic_play)
 */
export function getWhistApiBotCardPlay(state: GameState, seat: Seat, trump: TrumpSuit): Card {
  const hand = state.hands[seat];
  const ledSuit = state.currentTrick[0]?.card?.suit || null;
  const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));

  if (legalCards.length === 1) {
    return legalCards[0];
  }

  const isSuitContract = trump !== 'NT';
  const partner = getPartner(seat);
  const currentTrick = state.currentTrick;

  // 1. Leading a trick
  if (currentTrick.length === 0) {
    const aces = legalCards.filter((c) => c.rank === 'A');
    if (aces.length > 0) {
      if (isSuitContract) {
        const sideAces = aces.filter((c) => c.suit !== trump);
        if (sideAces.length > 0) return sideAces[0];
      }
      return aces[0];
    }

    const nonTrumps = isSuitContract ? legalCards.filter((c) => c.suit !== trump) : legalCards;
    if (nonTrumps.length > 0) {
      return nonTrumps.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), nonTrumps[0]);
    }
    return legalCards.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), legalCards[0]);
  }

  // 2. Following a trick
  const currentWinner = evaluateTrickWinner(currentTrick, trump).winner;
  const partnerWinning = currentWinner === partner;
  const cardsInSuit = legalCards.filter((c) => c.suit === ledSuit);

  if (cardsInSuit.length > 0) {
    // Must follow suit
    if (partnerWinning) {
      // Partner already winning: play lowest card of suit
      return cardsInSuit.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), cardsInSuit[0]);
    } else {
      // Opponent winning: try to beat with cheapest winning card
      const winningCards = cardsInSuit.filter((c) => {
        const simulated = evaluateTrickWinner([...currentTrick, { seat, card: c }], trump);
        return simulated.winner === seat;
      });
      if (winningCards.length > 0) {
        return winningCards.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), winningCards[0]);
      }
      // Cannot win: play lowest card of suit
      return cardsInSuit.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), cardsInSuit[0]);
    }
  }

  // 3. Void in led suit
  if (partnerWinning) {
    // Discard lowest non-trump card
    const nonTrumps = isSuitContract ? legalCards.filter((c) => c.suit !== trump) : legalCards;
    if (nonTrumps.length > 0) {
      return nonTrumps.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), nonTrumps[0]);
    }
    return legalCards.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), legalCards[0]);
  } else {
    // Opponent winning: if we have trump (and contract is Suit), consider ruffing
    if (isSuitContract) {
      const trumps = legalCards.filter((c) => c.suit === trump);
      if (trumps.length > 0) {
        const winningTrumps = trumps.filter((c) => {
          const simulated = evaluateTrickWinner([...currentTrick, { seat, card: c }], trump);
          return simulated.winner === seat;
        });
        if (winningTrumps.length > 0) {
          // Ruff with lowest winning trump
          return winningTrumps.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), winningTrumps[0]);
        }
      }
    }
    // Discard lowest non-trump card
    const nonTrumps = isSuitContract ? legalCards.filter((c) => c.suit !== trump) : legalCards;
    if (nonTrumps.length > 0) {
      return nonTrumps.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), nonTrumps[0]);
    }
    return legalCards.reduce((min, c) => (RANK_VALUES[c.rank] < RANK_VALUES[min.rank] ? c : min), legalCards[0]);
  }
}
