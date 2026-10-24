import {
  Bid,
  Card,
  ContractType,
  GameState,
  Rank,
  Seat,
  Suit,
  TrumpSuit,
} from '../types.ts';
import {
  getBidRank,
  getDealerPrivileges,
  getNextSeat,
  getPartner,
  getTeam,
  isBidHigher,
  isCardLegal,
  RANK_VALUES,
  SUITS,
  RANKS,
  evaluateTrickWinner,
  calculateRoundScores,
  SEATS,
} from './gameLogic.ts';
import { calculateHCP, getStrongestSuit } from './botAi.ts';
import { getActiveBotPolicy } from '../data/botPolicy.ts';

// -------------------------------------------------------------
// Card & Hand Utilities
// -------------------------------------------------------------

export function cardToKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardToInt(card: Card): number {
  const suitIndex = card.suit === 'S' ? 0 : card.suit === 'H' ? 1 : card.suit === 'D' ? 2 : 3;
  const rankIndex = RANK_VALUES[card.rank] - 2;
  return suitIndex * 13 + rankIndex;
}

export function intToCard(val: number): Card {
  const suitIdx = Math.floor(val / 13);
  const rankIdx = val % 13;
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  return {
    id: `${RANKS[rankIdx]}${suits[suitIdx]}`,
    suit: suits[suitIdx],
    rank: RANKS[rankIdx],
  };
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Information State & Bayesian Belief Tracker
// -------------------------------------------------------------

export interface PlayerBelief {
  voids: Record<Suit, boolean>;
  minHCP: number;
  maxHCP?: number;
  isBalanced?: boolean;
  bidSuit?: Suit | null;
  isNtBidder?: boolean;
  isSuitBidder?: boolean;
  isPasser?: boolean;
}

export interface SeatCardDistribution {
  seat: Seat;
  remainingCount: number;
  suitExpectedCounts: Record<Suit, number>;
  suitVoidProbabilities: Record<Suit, number>;
  cardProbabilities: Record<string, number>;
  minHCP: number;
  maxHCP: number;
  expectedHCP: number;
}

export interface BayesianBeliefState {
  unseenCards: Card[];
  unseenCountBySuit: Record<Suit, number>;
  playerDistributions: Record<Seat, SeatCardDistribution>;
  getCardProbability: (seat: Seat, cardId: string) => number;
  getMasterProbability: (seat: Seat, suit: Suit) => number;
}

export function extractBeliefState(gameState: GameState): Record<Seat, PlayerBelief> {
  const beliefs: Record<Seat, PlayerBelief> = {
    North: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0, maxHCP: 37, isBalanced: false, bidSuit: null, isNtBidder: false, isSuitBidder: false, isPasser: false },
    West: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0, maxHCP: 37, isBalanced: false, bidSuit: null, isNtBidder: false, isSuitBidder: false, isPasser: false },
    South: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0, maxHCP: 37, isBalanced: false, bidSuit: null, isNtBidder: false, isSuitBidder: false, isPasser: false },
    East: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0, maxHCP: 37, isBalanced: false, bidSuit: null, isNtBidder: false, isSuitBidder: false, isPasser: false },
  };

  // 1. Analyze Bidding History for minimum HCP and shape clues
  let openingBidSeen = false;
  for (const bid of gameState.bids || []) {
    if (bid.type === 'bid' && bid.level) {
      openingBidSeen = true;
      beliefs[bid.seat].isPasser = false;
      if (bid.contractType === 'NT') {
        beliefs[bid.seat].isNtBidder = true;
        beliefs[bid.seat].isBalanced = true;
        beliefs[bid.seat].minHCP = Math.max(beliefs[bid.seat].minHCP, bid.level >= 2 ? 16 : 14);
        beliefs[bid.seat].maxHCP = bid.level === 1 ? 17 : bid.level === 2 ? 20 : 37;
      } else {
        beliefs[bid.seat].isSuitBidder = true;
        if (bid.level >= 2) {
          beliefs[bid.seat].minHCP = Math.max(beliefs[bid.seat].minHCP, 13);
        } else {
          beliefs[bid.seat].minHCP = Math.max(beliefs[bid.seat].minHCP, 10);
        }
      }
    } else if (bid.type === 'pass') {
      beliefs[bid.seat].isPasser = true;
      beliefs[bid.seat].maxHCP = openingBidSeen ? 12 : 9;
    }
  }

  // If declarer chose a trump suit in a suit contract, declarer holds primary length in trump suit
  if (gameState.declarer && gameState.trumpSuit && gameState.trumpSuit !== 'NT') {
    beliefs[gameState.declarer].bidSuit = gameState.trumpSuit;
  }

  // 2. Analyze Tricks History for confirmed suit voids
  for (const trick of gameState.tricksHistory || []) {
    const ledSuit = trick.ledSuit;
    for (const play of trick.cards) {
      if (play.card.suit !== ledSuit) {
        beliefs[play.seat].voids[ledSuit] = true;
      }
    }
  }

  // Check current ongoing trick
  if (gameState.currentTrick && gameState.currentTrick.length > 1) {
    const ledSuit = gameState.currentTrick[0].card.suit;
    for (let i = 1; i < gameState.currentTrick.length; i++) {
      const play = gameState.currentTrick[i];
      if (play.card.suit !== ledSuit) {
        beliefs[play.seat].voids[ledSuit] = true;
      }
    }
  }

  return beliefs;
}

export function getRemainingUnseenCards(gameState: GameState, observerSeat: Seat): Card[] {
  const myHand = gameState.hands[observerSeat] || [];
  const knownPlayed = new Set<string>();

  for (const card of myHand) knownPlayed.add(card.id);
  for (const trick of gameState.tricksHistory) {
    for (const play of trick.cards) knownPlayed.add(play.card.id);
  }
  for (const play of gameState.currentTrick) knownPlayed.add(play.card.id);

  const unseen: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = `${rank}${suit}`;
      if (!knownPlayed.has(id)) {
        unseen.push({ id, suit, rank });
      }
    }
  }
  return unseen;
}

export function getUnseenCountBySuit(gameState: GameState, observerSeat: Seat): Record<Suit, number> {
  const unseen = getRemainingUnseenCards(gameState, observerSeat);
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of unseen) counts[c.suit]++;
  return counts;
}

function createEmptySeatDistribution(
  seat: Seat,
  remainingCount: number,
  belief?: PlayerBelief
): SeatCardDistribution {
  return {
    seat,
    remainingCount,
    suitExpectedCounts: { S: 0, H: 0, D: 0, C: 0 },
    suitVoidProbabilities: { S: 0, H: 0, D: 0, C: 0 },
    cardProbabilities: {},
    minHCP: belief?.minHCP ?? 0,
    maxHCP: belief?.maxHCP ?? (belief?.isPasser ? 9 : 37),
    expectedHCP: 0,
  };
}

export function reconstructHandProbabilities(
  gameState: GameState,
  observerSeat: Seat
): BayesianBeliefState {
  const unseenCards = getRemainingUnseenCards(gameState, observerSeat);
  const unseenCountBySuit: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of unseenCards) unseenCountBySuit[c.suit]++;

  const beliefs = extractBeliefState(gameState);
  const otherSeats: Seat[] = (['North', 'West', 'South', 'East'] as Seat[]).filter((s) => s !== observerSeat);

  const getSeatRemainingCount = (s: Seat): number => {
    if (gameState.cardsCount && typeof gameState.cardsCount[s] === 'number') {
      return gameState.cardsCount[s];
    }
    if (gameState.hands && gameState.hands[s]?.length) {
      return gameState.hands[s].length;
    }
    const tricksPlayed = gameState.tricksHistory?.length || 0;
    const inCurTrick = gameState.currentTrick?.some((p) => p.seat === s) ? 1 : 0;
    return Math.max(0, 13 - tricksPlayed - inCurTrick);
  };

  const neededCounts: Record<Seat, number> = {
    North: getSeatRemainingCount('North'),
    West: getSeatRemainingCount('West'),
    South: getSeatRemainingCount('South'),
    East: getSeatRemainingCount('East'),
  };

  const distributions: Record<Seat, SeatCardDistribution> = {
    North: createEmptySeatDistribution('North', neededCounts.North, beliefs.North),
    West: createEmptySeatDistribution('West', neededCounts.West, beliefs.West),
    South: createEmptySeatDistribution('South', neededCounts.South, beliefs.South),
    East: createEmptySeatDistribution('East', neededCounts.East, beliefs.East),
  };

  // Compute Bayesian posterior probability for each unseen card
  for (const card of unseenCards) {
    const eligibleSeats = otherSeats.filter((s) => neededCounts[s] > 0 && !beliefs[s].voids[card.suit]);
    const targetSeats = eligibleSeats.length > 0 ? eligibleSeats : otherSeats.filter((s) => neededCounts[s] > 0);

    if (targetSeats.length === 0) continue;

    const weights: Record<Seat, number> = { North: 0, West: 0, South: 0, East: 0 };
    let totalWeight = 0;

    for (const seat of targetSeats) {
      const belief = beliefs[seat];
      const wCapacity = Math.max(1, neededCounts[seat]);

      // Suit clue factor
      let wSuit = 1.0;
      if (gameState.declarer === seat && gameState.trumpSuit === card.suit) {
        wSuit = 2.5; // Declarer holds long trumps (5+ expected)
      } else if (belief.bidSuit === card.suit) {
        wSuit = 2.4; // Suit bidder holds 5+ cards in their bid suit
      } else if (belief.bidSuit && belief.bidSuit !== card.suit) {
        wSuit = 0.8; // Bid a different suit
      } else if (belief.isNtBidder) {
        wSuit = 1.0; // NT bidder has balanced distribution (min 2 cards per suit)
      }

      // Honor / HCP clue factor
      let wHcp = 1.0;
      const isHonor = ['A', 'K', 'Q', 'J'].includes(card.rank);
      const isLowSpot = ['2', '3', '4', '5'].includes(card.rank);

      if (isHonor) {
        if (belief.isNtBidder) wHcp = 2.6; // 15-17 HCP holds concentrated honors
        else if (belief.isSuitBidder) wHcp = 1.8; // 10+ HCP opener
        else if (belief.isPasser) wHcp = 0.35; // Passed auction, rarely holds top honors
      } else if (isLowSpot) {
        if (belief.isPasser) wHcp = 1.6;
        else if (belief.isNtBidder) wHcp = 0.7;
      }

      const w = wCapacity * wSuit * wHcp;
      weights[seat] = w;
      totalWeight += w;
    }

    if (totalWeight > 0) {
      for (const seat of targetSeats) {
        const prob = weights[seat] / totalWeight;
        distributions[seat].cardProbabilities[card.id] = prob;
        distributions[seat].suitExpectedCounts[card.suit] += prob;
        if (['A', 'K', 'Q', 'J'].includes(card.rank)) {
          const hcpVal = card.rank === 'A' ? 4 : card.rank === 'K' ? 3 : card.rank === 'Q' ? 2 : 1;
          distributions[seat].expectedHCP += prob * hcpVal;
        }
      }
    }
  }

  // Finalize void probabilities
  for (const seat of otherSeats) {
    const dist = distributions[seat];
    const b = beliefs[seat];
    for (const suit of SUITS) {
      if (b.voids[suit]) {
        dist.suitVoidProbabilities[suit] = 1.0;
        dist.suitExpectedCounts[suit] = 0;
      } else if (unseenCountBySuit[suit] === 0) {
        dist.suitVoidProbabilities[suit] = 1.0;
        dist.suitExpectedCounts[suit] = 0;
      } else {
        const unseenInSuit = unseenCards.filter((c) => c.suit === suit);
        let probAllAbsent = 1.0;
        for (const c of unseenInSuit) {
          probAllAbsent *= (1.0 - (dist.cardProbabilities[c.id] || 0));
        }
        dist.suitVoidProbabilities[suit] = Math.min(1.0, Math.max(0.0, probAllAbsent));
      }
    }
  }

  return {
    unseenCards,
    unseenCountBySuit,
    playerDistributions: distributions,
    getCardProbability: (seat: Seat, cardId: string) => distributions[seat]?.cardProbabilities[cardId] ?? 0,
    getMasterProbability: (seat: Seat, suit: Suit) => {
      const unseenInSuit = unseenCards.filter((c) => c.suit === suit);
      if (unseenInSuit.length === 0) return 0;
      unseenInSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return distributions[seat]?.cardProbabilities[unseenInSuit[0].id] ?? 0;
    },
  };
}

// Count remaining opponent trumps using Bayesian posterior distributions
export function countRemainingOpponentTrumps(
  gameState: GameState,
  mySeat: Seat,
  trumpSuit: TrumpSuit
): number {
  if (trumpSuit === 'NT') return 0;
  const partner = getPartner(mySeat);
  const opp1 = getNextSeat(mySeat);
  const opp2 = getNextSeat(partner);
  const myHand = gameState.hands[mySeat] || [];
  const myTrumps = myHand.filter((c) => c.suit === trumpSuit).length;

  let trumpsPlayed = 0;
  let opp1TrumpsPlayed = 0;
  let opp2TrumpsPlayed = 0;
  for (const trick of gameState.tricksHistory || []) {
    for (const p of trick.cards) {
      if (p.card.suit === trumpSuit) {
        trumpsPlayed++;
        if (p.seat === opp1) opp1TrumpsPlayed++;
        else if (p.seat === opp2) opp2TrumpsPlayed++;
      }
    }
  }
  for (const p of gameState.currentTrick || []) {
    if (p.card.suit === trumpSuit) {
      trumpsPlayed++;
      if (p.seat === opp1) opp1TrumpsPlayed++;
      else if (p.seat === opp2) opp2TrumpsPlayed++;
    }
  }

  // Known remaining trumps outside bot's hand
  const trumpsOutsideMyHand = Math.max(0, 13 - trumpsPlayed - myTrumps);
  if (trumpsOutsideMyHand === 0) return 0;

  const beliefs = extractBeliefState(gameState);
  const opp1RemainingCards = gameState.cardsCount?.[opp1] ?? gameState.hands?.[opp1]?.length ?? 0;
  const opp2RemainingCards = gameState.cardsCount?.[opp2] ?? gameState.hands?.[opp2]?.length ?? 0;
  const opp1IsVoid = beliefs[opp1].voids[trumpSuit] || opp1RemainingCards === 0;
  const opp2IsVoid = beliefs[opp2].voids[trumpSuit] || opp2RemainingCards === 0;

  if (opp1IsVoid && opp2IsVoid) {
    return 0;
  }

  if (beliefs[partner].voids[trumpSuit]) {
    return trumpsOutsideMyHand;
  }

  // If opponents have already played 4+ trumps across tricks and one opponent showed void:
  if (opp1TrumpsPlayed + opp2TrumpsPlayed >= 4 && (opp1IsVoid || opp2IsVoid)) {
    return 0;
  }

  // Use Bayesian posterior distributions to estimate opponent trumps
  const bayesian = reconstructHandProbabilities(gameState, mySeat);
  const opp1Expected = opp1IsVoid ? 0 : (bayesian.playerDistributions[opp1]?.suitExpectedCounts[trumpSuit] || 0);
  const opp2Expected = opp2IsVoid ? 0 : (bayesian.playerDistributions[opp2]?.suitExpectedCounts[trumpSuit] || 0);
  const expectedTotal = opp1Expected + opp2Expected;

  if (expectedTotal < 0.75) {
    return 0;
  }

  return Math.min(trumpsOutsideMyHand, Math.max(0, Math.round(expectedTotal)));
}

// -------------------------------------------------------------
// World Determinization / Belief Sampler
// -------------------------------------------------------------

export function sampleConsistentDeals(
  gameState: GameState,
  mySeat: Seat,
  count: number = 5
): Array<Record<Seat, Card[]>> {
  const myHand = gameState.hands[mySeat] || [];
  const knownPlayed = new Set<string>();

  for (const card of myHand) knownPlayed.add(card.id);
  for (const trick of gameState.tricksHistory) {
    for (const play of trick.cards) knownPlayed.add(play.card.id);
  }
  for (const play of gameState.currentTrick) knownPlayed.add(play.card.id);

  const unknownCards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = `${rank}${suit}`;
      if (!knownPlayed.has(id)) {
        unknownCards.push({ id, suit, rank });
      }
    }
  }

  const otherSeats: Seat[] = (['North', 'West', 'South', 'East'] as Seat[]).filter(
    (s) => s !== mySeat
  );

  const neededCounts: Record<Seat, number> = {
    North: gameState.cardsCount?.North ?? gameState.hands?.North?.length ?? 0,
    West: gameState.cardsCount?.West ?? gameState.hands?.West?.length ?? 0,
    South: gameState.cardsCount?.South ?? gameState.hands?.South?.length ?? 0,
    East: gameState.cardsCount?.East ?? gameState.hands?.East?.length ?? 0,
  };

  // Sanity check: Ensure total needed cards do not exceed available unknown cards
  const totalNeeded = otherSeats.reduce((acc, s) => acc + neededCounts[s], 0);
  if (totalNeeded > unknownCards.length) {
    for (const s of otherSeats) {
      const alreadyPlayed = gameState.currentTrick.some((p) => p.seat === s);
      neededCounts[s] = Math.max(0, myHand.length - (alreadyPlayed ? 1 : 0));
    }
  }

  const beliefs = extractBeliefState(gameState);
  const bayesian = reconstructHandProbabilities(gameState, mySeat);
  const sampledWorlds: Array<Record<Seat, Card[]>> = [];

  // Sort unknown cards so that suits with fewer eligible players are placed first (Most Constrained First)
  const suitFlexibility: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const s of SUITS) {
    suitFlexibility[s] = otherSeats.filter((seat) => !beliefs[seat].voids[s]).length;
  }

  let nodeCount = 0;
  const MAX_CSP_NODES = 1500;

  function backtrackCSP(
    cards: Card[],
    cardIdx: number,
    candidateHands: Record<Seat, Card[]>
  ): boolean {
    if (otherSeats.every((s) => candidateHands[s].length === neededCounts[s])) {
      return true;
    }
    if (cardIdx >= cards.length) {
      return false;
    }
    if (++nodeCount > MAX_CSP_NODES) {
      return false;
    }

    const card = cards[cardIdx];
    const eligible = otherSeats.filter(
      (s) => candidateHands[s].length < neededCounts[s] && !beliefs[s].voids[card.suit]
    );

    // Weighted shuffle of eligible seats according to Bayesian probability for diversity across trials
    const weightedEligible = eligible.map((s) => ({
      seat: s,
      score: (bayesian.getCardProbability(s, card.id) + 0.1) * (0.5 + Math.random()),
    }));
    weightedEligible.sort((a, b) => b.score - a.score);
    const sortedSeats = weightedEligible.map((x) => x.seat);

    for (const targetSeat of sortedSeats) {
      candidateHands[targetSeat].push(card);
      if (backtrackCSP(cards, cardIdx + 1, candidateHands)) {
        return true;
      }
      candidateHands[targetSeat].pop();
    }

    return false;
  }

  for (let attempt = 0; attempt < count * 4 && sampledWorlds.length < count; attempt++) {
    nodeCount = 0;
    const shuffled = [...unknownCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Sort by flexibility ascending (most constrained suits dealt first)
    shuffled.sort((a, b) => suitFlexibility[a.suit] - suitFlexibility[b.suit]);

    const candidateHands: Record<Seat, Card[]> = {
      North: mySeat === 'North' ? [...myHand] : [],
      West: mySeat === 'West' ? [...myHand] : [],
      South: mySeat === 'South' ? [...myHand] : [],
      East: mySeat === 'East' ? [...myHand] : [],
    };

    if (backtrackCSP(shuffled, 0, candidateHands)) {
      sampledWorlds.push(candidateHands);
    }
  }

  // Fallback: If constrained sampling failed due to contradictory beliefs, assign remaining cards
  if (sampledWorlds.length === 0) {
    const candidateHands: Record<Seat, Card[]> = {
      North: mySeat === 'North' ? [...myHand] : [],
      West: mySeat === 'West' ? [...myHand] : [],
      South: mySeat === 'South' ? [...myHand] : [],
      East: mySeat === 'East' ? [...myHand] : [],
    };
    let idx = 0;
    for (const s of otherSeats) {
      const countNeeded = neededCounts[s];
      candidateHands[s] = unknownCards.slice(idx, idx + countNeeded);
      idx += countNeeded;
    }
    sampledWorlds.push(candidateHands);
  }

  return sampledWorlds;
}

// -------------------------------------------------------------
// Exact Micro-DDS (Alpha-Beta Minimax Solver for Endgame Tricks)
// -------------------------------------------------------------

/**
 * Exact Alpha-Beta Minimax Solver for double-dummy endgame play (tricks 10-13, <= 4 cards per player).
 * Computes the exact maximum number of remaining tricks targetTeam can win against optimal defense.
 */
export function solveMicroDDS(
  hands: Record<Seat, Card[]>,
  trumpSuit: TrumpSuit,
  targetTeam: 'TeamA' | 'TeamB',
  leader: Seat,
  currentTrickCards: Array<{ seat: Seat; card: Card }> = [],
  alpha: number = 0,
  beta: number = 13,
  nodeCounter: { count: number } = { count: 0 }
): number {
  const totalRemaining =
    hands.North.length +
    hands.West.length +
    hands.South.length +
    hands.East.length +
    currentTrickCards.length;
  if (totalRemaining === 0) {
    return 0;
  }

  // Micro-DDS is exclusively for tricks 10-13 (<= 16 cards total).
  // If invoked with larger hands or recursion node budget is exceeded, abort search safely.
  if (totalRemaining > 16 || ++nodeCounter.count > 10000) {
    return 0;
  }

  const currentSeat: Seat =
    currentTrickCards.length === 0
      ? leader
      : getNextSeat(currentTrickCards[currentTrickCards.length - 1].seat);
  const hand = hands[currentSeat];
  if (!hand || hand.length === 0) {
    return 0;
  }

  const ledSuit = currentTrickCards.length === 0 ? null : currentTrickCards[0].card.suit;
  let legalCards = ledSuit ? hand.filter((c) => c.suit === ledSuit) : hand;
  if (legalCards.length === 0) {
    legalCards = hand;
  }

  const isMaximizer = getTeam(currentSeat) === targetTeam;
  let bestVal = isMaximizer ? -1 : 999;

  // Move ordering: try higher cards first for faster cutoffs
  const orderedCards = [...legalCards].sort(
    (a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]
  );

  for (let i = 0; i < orderedCards.length; i++) {
    const card = orderedCards[i];
    const cardIdx = hand.indexOf(card);
    hand.splice(cardIdx, 1);

    let score: number;
    if (currentTrickCards.length === 3) {
      // Trick completes
      const completedTrick = [
        currentTrickCards[0],
        currentTrickCards[1],
        currentTrickCards[2],
        { seat: currentSeat, card },
      ];
      const trickWinner = evaluateTrickWinner(completedTrick, trumpSuit).winner;
      const trickPoint = getTeam(trickWinner) === targetTeam ? 1 : 0;

      const rem = solveMicroDDS(
        hands,
        trumpSuit,
        targetTeam,
        trickWinner,
        [],
        alpha - trickPoint,
        beta - trickPoint,
        nodeCounter
      );
      score = trickPoint + rem;
    } else {
      currentTrickCards.push({ seat: currentSeat, card });
      score = solveMicroDDS(
        hands,
        trumpSuit,
        targetTeam,
        leader,
        currentTrickCards,
        alpha,
        beta,
        nodeCounter
      );
      currentTrickCards.pop();
    }

    // Undo move
    hand.splice(cardIdx, 0, card);

    if (isMaximizer) {
      if (score > bestVal) bestVal = score;
      if (bestVal > alpha) alpha = bestVal;
      if (alpha >= beta) break; // Beta cutoff
    } else {
      if (score < bestVal) bestVal = score;
      if (bestVal < beta) beta = bestVal;
      if (beta <= alpha) break; // Alpha cutoff
    }
  }

  return bestVal;
}

/**
 * Backward-compatibility wrapper for solveDoubleDummyTricks
 */
export function solveDoubleDummyTricks(
  hands: Record<Seat, Card[]>,
  trumpSuit: TrumpSuit,
  targetTeam: 'TeamA' | 'TeamB',
  leader: Seat,
  currentTrickCards: Array<{ seat: Seat; card: Card }> = [],
  depthLimit: number = 13
): number {
  return solveMicroDDS(hands, trumpSuit, targetTeam, leader, currentTrickCards);
}

/**
 * Evaluates candidate legal moves in the endgame (remaining hand <= 4 cards)
 * using the exact Micro-DDS solver across sampled consistent worlds.
 */
export function getMicroDDSCardPlay(
  gameState: GameState,
  seat: Seat,
  trumpSuit: TrumpSuit
): Card | null {
  const hand = gameState.hands[seat];
  if (!hand || hand.length === 0) return null;

  const trick = gameState.currentTrick;
  const isOpeningLead = trick.length === 0;
  const ledSuit = isOpeningLead ? null : trick[0].card.suit;

  const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));
  if (legalCards.length <= 1) {
    return legalCards[0] || null;
  }

  // Sample consistent worlds (3-5 worlds)
  const worlds = sampleConsistentDeals(gameState, seat, 5);
  if (worlds.length === 0) return null;

  const myTeam = getTeam(seat);
  const leader = isOpeningLead ? seat : trick[0].seat;

  let bestCard = legalCards[0];
  let maxScore = -999;

  for (const cand of legalCards) {
    let cardScoreSum = 0;

    for (const deal of worlds) {
      const simHands: Record<Seat, Card[]> = {
        North: [...deal.North],
        West: [...deal.West],
        South: [...deal.South],
        East: [...deal.East],
      };

      const candIdx = simHands[seat].findIndex((c) => c.id === cand.id);
      if (candIdx !== -1) {
        simHands[seat].splice(candIdx, 1);
      }

      let tricksWon = 0;
      if (trick.length === 3) {
        const completedTrick = [...trick, { seat, card: cand }];
        const trickWinner = evaluateTrickWinner(completedTrick, trumpSuit).winner;
        const trickPt = getTeam(trickWinner) === myTeam ? 1 : 0;
        const rem = solveMicroDDS(simHands, trumpSuit, myTeam, trickWinner, [], 0, 4);
        tricksWon = trickPt + rem;
      } else {
        const ongoingTrick = [...trick, { seat, card: cand }];
        tricksWon = solveMicroDDS(simHands, trumpSuit, myTeam, leader, ongoingTrick, 0, 4);
      }

      cardScoreSum += tricksWon;
    }

    if (cardScoreSum > maxScore) {
      maxScore = cardScoreSum;
      bestCard = cand;
    } else if (cardScoreSum === maxScore) {
      // Tie breaker:
      // 1. Prefer discarding non-trump over trump to conserve valuable trump control
      const isCandTrump = trumpSuit !== 'NT' && cand.suit === trumpSuit;
      const isBestTrump = trumpSuit !== 'NT' && bestCard.suit === trumpSuit;
      if (isBestTrump && !isCandTrump) {
        bestCard = cand;
      } else if (!isBestTrump && isCandTrump) {
        // Keep non-trump bestCard
      } else {
        // Same trump status: prefer lower rank card to conserve honors
        if (RANK_VALUES[cand.rank] < RANK_VALUES[bestCard.rank]) {
          bestCard = cand;
        }
      }
    }
  }

  return bestCard;
}

// -------------------------------------------------------------
// Partnership Signaling System (Attitude, Count, Suit-Preference)
// -------------------------------------------------------------

export type AttitudeSignal = 'encourage' | 'discourage';
export type CountSignal = 'even' | 'odd';

export function getAttitudeSignalCard(
  legalCardsInSuit: Card[],
  partnerLedCard: Card,
  isNT: boolean,
  hasTrumps: boolean = false
): Card {
  if (legalCardsInSuit.length <= 1) return legalCardsInSuit[0];

  // Attitude signals are given with spot cards (rank <= 9) to conserve master honors
  const spotCards = legalCardsInSuit.filter((c) => RANK_VALUES[c.rank] <= 9);
  const honors = legalCardsInSuit.filter((c) => RANK_VALUES[c.rank] >= 10);

  // Attitude evaluation:
  // Encourage when holding:
  // 1. Supporting honor (K/Q under A, A/Q under K, J/10 under Q)
  // 2. Doubleton in suit contract with side trumps (can ruff 3rd round)
  // 3. Length in NT (4+ cards in the suit)
  const hasSupportingHonor =
    (partnerLedCard.rank === 'A' && honors.some((c) => c.rank === 'K' || c.rank === 'Q')) ||
    (partnerLedCard.rank === 'K' && honors.some((c) => c.rank === 'A' || c.rank === 'Q')) ||
    (partnerLedCard.rank === 'Q' && (honors.some((c) => c.rank === 'J') || honors.some((c) => c.rank === '10')));
  const hasDoubletonRuff = !isNT && hasTrumps && legalCardsInSuit.length === 2;
  const hasNtLength = isNT && legalCardsInSuit.length >= 4;

  const shouldEncourage = hasSupportingHonor || hasDoubletonRuff || hasNtLength;

  if (spotCards.length > 0) {
    spotCards.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    // High spot (9, 8, 7) encourages; low spot (2, 3, 4) discourages
    return shouldEncourage ? spotCards[0] : spotCards[spotCards.length - 1];
  }

  // If only honors remain, conserve highest honor by playing lowest honor
  const sortedHonors = [...honors].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
  return sortedHonors[0];
}

export function interpretPartnerAttitude(
  gameState: GameState,
  mySeat: Seat,
  suit: Suit
): AttitudeSignal | 'unknown' {
  const partner = getPartner(mySeat);
  for (let t = (gameState.tricksHistory?.length || 0) - 1; t >= 0; t--) {
    const trick = gameState.tricksHistory[t];
    if (trick.cards.length >= 2 && trick.cards[0].seat === mySeat && trick.cards[0].card.suit === suit) {
      const myCard = trick.cards[0].card;
      if (['A', 'K', 'Q'].includes(myCard.rank)) {
        const partnerPlay = trick.cards.find((p) => p.seat === partner);
        if (partnerPlay && partnerPlay.card.suit === suit) {
          const rankVal = RANK_VALUES[partnerPlay.card.rank];
          if (rankVal >= 7) return 'encourage';
          if (rankVal <= 4) return 'discourage';
          // For spot 5 or 6, check if higher spots were already accounted for in my hand or tricks
          const myHand = gameState.hands[mySeat] || [];
          const knownSpots = new Set<string>();
          for (const c of myHand) if (c.suit === suit) knownSpots.add(c.rank);
          for (const prevTrick of gameState.tricksHistory) {
            for (const p of prevTrick.cards) if (p.card.suit === suit) knownSpots.add(p.card.rank);
          }
          const higherSpotsRemaining = ['7', '8', '9'].filter((r) => !knownSpots.has(r));
          if (higherSpotsRemaining.length === 0) return 'encourage';
          return 'discourage';
        }
      }
      break; // Only evaluate the most recent lead in this suit
    }
  }
  return 'unknown';
}

export function getCountSignalCard(
  legalCardsInSuit: Card[],
  playedCountInSuit: number
): Card {
  if (legalCardsInSuit.length <= 1) return legalCardsInSuit[0];

  const totalHeldOriginally = legalCardsInSuit.length + playedCountInSuit;
  const isEvenLength = totalHeldOriginally % 2 === 0;

  // Count echo is strictly given with low spot cards (rank <= 8) to never squander honors or stoppers
  const echoSpotCards = legalCardsInSuit.filter((c) => RANK_VALUES[c.rank] <= 8);
  if (echoSpotCards.length >= 2) {
    echoSpotCards.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    // High-Low Echo: play higher spot first, lower spot second
    return isEvenLength && playedCountInSuit === 0 ? echoSpotCards[0] : echoSpotCards[echoSpotCards.length - 1];
  }

  // Fallback: lowest card to conserve honors and stoppers
  const sorted = [...legalCardsInSuit].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
  return sorted[0];
}

export function interpretPartnerCount(
  gameState: GameState,
  mySeat: Seat,
  suit: Suit
): CountSignal | 'unknown' {
  const partner = getPartner(mySeat);
  const partnerPlaysInSuit: Card[] = [];

  for (const trick of gameState.tricksHistory || []) {
    const play = trick.cards.find((p) => p.seat === partner);
    if (play && play.card.suit === suit) {
      partnerPlaysInSuit.push(play.card);
    }
  }

  if (partnerPlaysInSuit.length >= 2) {
    const r1 = RANK_VALUES[partnerPlaysInSuit[0].rank];
    const r2 = RANK_VALUES[partnerPlaysInSuit[1].rank];
    // Count signals are strictly encoded with spot cards (<= 9). If either card is an honor (>= 10), it was played for trick-taking, not count!
    if (r1 <= 9 && r2 <= 9) {
      if (r1 > r2) return 'even';
      if (r1 < r2) return 'odd';
    }
  }
  return 'unknown';
}

export function getSuitPreferenceDiscard(
  gameState: GameState,
  seat: Seat,
  legalCards: Card[],
  trumpSuit: TrumpSuit
): Card {
  if (legalCards.length === 1) return legalCards[0];

  const ledSuit = gameState.currentTrick?.[0]?.card.suit;
  const candidateSuits = SUITS.filter((s) => s !== ledSuit && (trumpSuit === 'NT' || s !== trumpSuit));
  const suitRankOrder: Record<Suit, number> = { S: 4, H: 3, D: 2, C: 1 };

  if (candidateSuits.length <= 1) {
    const sorted = [...legalCards].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return sorted[0];
  }

  // Determine preferred suit for the partnership
  let preferredSuit: Suit | null = null;
  let maxSuitScore = -999;

  for (const s of candidateSuits) {
    const inSuit = gameState.hands[seat]?.filter((c) => c.suit === s) || [];
    const hcp = calculateHCP(inSuit);
    const score = inSuit.length * 2 + hcp * 3;
    if (score > maxSuitScore) {
      maxSuitScore = score;
      preferredSuit = s;
    }
  }

  const discardableSuits = candidateSuits.filter((s) => legalCards.some((c) => c.suit === s));
  if (discardableSuits.length === 0) {
    const sorted = [...legalCards].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return sorted[0];
  }

  // Choose discard suit (prefer not discarding from our preferred suit if another exists)
  const discardSuit = discardableSuits.find((s) => s !== preferredSuit) || discardableSuits[0];
  const cardsInDiscardSuit = legalCards.filter((c) => c.suit === discardSuit);

  const otherSideSuits = candidateSuits.filter((s) => s !== discardSuit);
  if (otherSideSuits.length === 0) {
    const sorted = [...cardsInDiscardSuit].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return sorted[0];
  }

  const higherSuit = otherSideSuits.reduce((prev, curr) => (suitRankOrder[curr] > suitRankOrder[prev] ? curr : prev), otherSideSuits[0]);
  const isHighPreference = preferredSuit === higherSuit;

  const spotCards = cardsInDiscardSuit.filter((c) => RANK_VALUES[c.rank] <= 10);
  if (spotCards.length > 0) {
    spotCards.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    // High spot (>= 7) signals preference for the higher-ranking outside suit
    // Low spot (<= 5) signals preference for the lower-ranking outside suit
    return isHighPreference ? spotCards[0] : spotCards[spotCards.length - 1];
  }

  cardsInDiscardSuit.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
  return cardsInDiscardSuit[0];
}

export function interpretPartnerDiscard(
  gameState: GameState,
  mySeat: Seat,
  trumpSuit: TrumpSuit
): Suit | null {
  const partner = getPartner(mySeat);
  const suitRankOrder: Record<Suit, number> = { S: 4, H: 3, D: 2, C: 1 };

  for (let t = (gameState.tricksHistory?.length || 0) - 1; t >= 0; t--) {
    const trick = gameState.tricksHistory[t];
    const partnerPlay = trick.cards.find((p) => p.seat === partner);
    if (!partnerPlay) continue;

    if (partnerPlay.card.suit !== trick.ledSuit && partnerPlay.card.suit !== trumpSuit) {
      const discardSuit = partnerPlay.card.suit;
      const rankVal = RANK_VALUES[partnerPlay.card.rank];

      const otherSuits = SUITS.filter((s) => s !== trick.ledSuit && s !== discardSuit && (trumpSuit === 'NT' || s !== trumpSuit));
      if (otherSuits.length >= 2) {
        otherSuits.sort((a, b) => suitRankOrder[b] - suitRankOrder[a]);
        const higherSuit = otherSuits[0];
        const lowerSuit = otherSuits[otherSuits.length - 1];

        if (rankVal >= 7) return higherSuit;
        if (rankVal <= 5) return lowerSuit;
      } else if (otherSuits.length === 1) {
        return otherSuits[0];
      }
    }
  }
  return null;
}

// -------------------------------------------------------------
// Grandmaster Opening Lead Engine (Trick 1)
// -------------------------------------------------------------

function inSuitSplit(inSuit: Card[], preferredRank: Rank, lowerRank: Rank): Card {
  const hasLower = inSuit.some((c) => c.rank === lowerRank);
  if (hasLower) return inSuit.find((c) => c.rank === lowerRank)!;
  return inSuit.find((c) => c.rank === preferredRank)!;
}

export function getGrandmasterOpeningLead(
  gameState: GameState,
  seat: Seat,
  trumpSuit: TrumpSuit
): Card {
  const hand = gameState.hands[seat];
  if (!hand || hand.length === 0) throw new Error('No cards in hand for seat ' + seat);

  const isNT = trumpSuit === 'NT';
  const myTeam = getTeam(seat);
  const partner = getPartner(seat);
  const declarer = gameState.declarer;
  const isDefending = declarer ? getTeam(declarer) !== myTeam : true;
  const beliefs = extractBeliefState(gameState);

  // 1. Defending Against No Trump (NT)
  if (isNT && isDefending) {
    // 1A. Partner's bid suit (if partner bid a suit during auction, lead partner's suit!)
    if (beliefs[partner]?.bidSuit) {
      const partnerSuit = beliefs[partner].bidSuit!;
      const inPartnerSuit = hand.filter((c) => c.suit === partnerSuit);
      if (inPartnerSuit.length > 0) {
        inPartnerSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        // 4th highest if 4+ cards, otherwise top of suit
        return inPartnerSuit.length >= 4 ? inPartnerSuit[3] : inPartnerSuit[0];
      }
    }

    // 1B. Interior Sequences in 4+ card suits (10 from A-10-9, K-10-9, Q-10-9; J from A-J-10, K-J-10; Q from A-Q-J; 9 from A-9-8, K-9-8)
    for (const suit of SUITS) {
      if (declarer && beliefs[declarer]?.bidSuit === suit) continue;
      const inSuit = hand.filter((c) => c.suit === suit);
      if (inSuit.length >= 4) {
        const ranks = new Set(inSuit.map((c) => c.rank));
        // A-10-9, K-10-9, Q-10-9 (without J) -> Lead 10!
        if (ranks.has('10') && ranks.has('9') && !ranks.has('J') && (ranks.has('A') || ranks.has('K') || ranks.has('Q'))) {
          return inSuit.find((c) => c.rank === '10')!;
        }
        // A-J-10, K-J-10 (without Q) -> Lead Jack!
        if (ranks.has('J') && ranks.has('10') && !ranks.has('Q') && (ranks.has('A') || ranks.has('K'))) {
          return inSuit.find((c) => c.rank === 'J')!;
        }
        // A-Q-J (without K) -> Lead Queen!
        if (ranks.has('A') && ranks.has('Q') && ranks.has('J') && !ranks.has('K')) {
          return inSuit.find((c) => c.rank === 'Q')!;
        }
        // A-9-8, K-9-8 (without 10) -> Lead 9!
        if (ranks.has('9') && ranks.has('8') && !ranks.has('10') && (ranks.has('A') || ranks.has('K'))) {
          return inSuit.find((c) => c.rank === '9')!;
        }
      }
    }

    // 1C. Solid Touching Honor Sequence in 4+ card suit
    for (const suit of SUITS) {
      if (declarer && beliefs[declarer]?.bidSuit === suit) continue;
      const inSuit = hand.filter((c) => c.suit === suit);
      if (inSuit.length >= 4) {
        const ranks = new Set(inSuit.map((c) => c.rank));
        if (ranks.has('K') && ranks.has('Q') && ranks.has('J')) return inSuit.find((c) => c.rank === 'K')!;
        if (ranks.has('Q') && ranks.has('J') && ranks.has('10')) return inSuit.find((c) => c.rank === 'Q')!;
        if (ranks.has('J') && ranks.has('10') && ranks.has('9')) return inSuit.find((c) => c.rank === 'J')!;
        if (ranks.has('10') && ranks.has('9') && ranks.has('8')) return inSuit.find((c) => c.rank === '10')!;
      }
    }

    // 1D. 4th-Highest of Longest & Strongest Suit
    let bestSuit: Suit | null = null;
    let maxSuitLength = -1;
    let maxSuitHcp = -1;

    for (const suit of SUITS) {
      if (declarer && beliefs[declarer]?.bidSuit === suit) continue;
      const inSuit = hand.filter((c) => c.suit === suit);
      if (inSuit.length >= 4) {
        const hcp = calculateHCP(inSuit);
        const score = inSuit.length * 10 + hcp;
        if (score > maxSuitLength * 10 + maxSuitHcp) {
          maxSuitLength = inSuit.length;
          maxSuitHcp = hcp;
          bestSuit = suit;
        }
      }
    }

    if (bestSuit) {
      const inSuit = hand.filter((c) => c.suit === bestSuit);
      inSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return inSuit[3]; // 4th highest establishes long suit
    }

    // Passive exit: lowest card from weakest suit
    const sortedHand = [...hand].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return sortedHand[0];
  }

  // 2. Defending Against Suit Contracts
  if (!isNT && isDefending) {
    const trumps = hand.filter((c) => c.suit === trumpSuit);
    const hasSideTrumps = trumps.length >= 1;

    // 2A. Partner's bid suit
    if (beliefs[partner]?.bidSuit && beliefs[partner].bidSuit !== trumpSuit) {
      const pSuit = beliefs[partner].bidSuit!;
      const inPSuit = hand.filter((c) => c.suit === pSuit);
      if (inPSuit.length > 0) {
        inPSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        return inPSuit[0];
      }
    }

    // 2B. Top of Touching Honors in Side Suits (K from A-K, K from K-Q, Q from Q-J, J from J-10, 10 from 10-9)
    for (const suit of SUITS) {
      if (suit === trumpSuit) continue;
      const inSuit = hand.filter((c) => c.suit === suit);
      const ranks = new Set(inSuit.map((c) => c.rank));
      if (ranks.has('A') && ranks.has('K')) return inSuit.find((c) => c.rank === 'K')!;
      if (ranks.has('K') && ranks.has('Q')) return inSuit.find((c) => c.rank === 'K')!;
      if (ranks.has('Q') && ranks.has('J')) return inSuit.find((c) => c.rank === 'Q')!;
      if (ranks.has('J') && ranks.has('10')) return inSuit.find((c) => c.rank === 'J')!;
      if (ranks.has('10') && ranks.has('9')) return inSuit.find((c) => c.rank === '10')!;
    }

    // 2C. Singleton Lead when holding side trumps (to obtain an immediate ruff!)
    if (hasSideTrumps) {
      const singletons: Card[] = [];
      for (const suit of SUITS) {
        if (suit === trumpSuit) continue;
        const inSuit = hand.filter((c) => c.suit === suit);
        // Singleton spot card (avoid singleton Ace/King which squanders master trick)
        if (inSuit.length === 1 && inSuit[0].rank !== 'A' && inSuit[0].rank !== 'K') {
          singletons.push(inSuit[0]);
        }
      }
      if (singletons.length > 0) {
        singletons.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
        return singletons[0];
      }
    }

    // 2D. Avoid leading away from unsupported honors into declarer's tenaces!
    const safeCandidates: Card[] = [];
    for (const card of hand) {
      if (card.suit === trumpSuit) continue;
      const inSuit = hand.filter((c) => c.suit === card.suit);
      const ranks = new Set(inSuit.map((c) => c.rank));
      const hasTouchingHonor =
        (ranks.has('A') && ranks.has('K')) ||
        (ranks.has('K') && ranks.has('Q')) ||
        (ranks.has('Q') && ranks.has('J'));
      const isUnsupportedHonorSuit =
        !hasTouchingHonor && (ranks.has('K') || ranks.has('Q') || (ranks.has('A') && inSuit.length > 1));

      if (!isUnsupportedHonorSuit) {
        safeCandidates.push(card);
      }
    }

    if (safeCandidates.length > 0) {
      safeCandidates.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
      return safeCandidates[0];
    }
  }

  // 3. Declarer Lead (or fallback):
  if (!isNT) {
    const myTrumps = hand.filter((c) => c.suit === trumpSuit);
    // Pull trumps if holding top trumps (A or K) or 4+ trumps
    if (myTrumps.length >= 4 || (myTrumps.length >= 2 && myTrumps.some((c) => c.rank === 'A' || c.rank === 'K'))) {
      myTrumps.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return myTrumps[0];
    }
  }

  // Cash side-suit Aces
  const aces = hand.filter((c) => c.rank === 'A' && (isNT || c.suit !== trumpSuit));
  if (aces.length > 0) return aces[0];

  // Touching sequence in side suits
  for (const suit of SUITS) {
    if (!isNT && suit === trumpSuit) continue;
    const inSuit = hand.filter((c) => c.suit === suit);
    const ranks = new Set(inSuit.map((c) => c.rank));
    if (ranks.has('K') && ranks.has('Q')) return inSuit.find((c) => c.rank === 'K')!;
    if (ranks.has('Q') && ranks.has('J')) return inSuit.find((c) => c.rank === 'Q')!;
  }

  const strongest = getStrongestSuit(hand);
  const inStrongest = hand.filter((c) => c.suit === strongest.suit);
  if (inStrongest.length > 0) {
    inStrongest.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    if (isNT && inStrongest.length >= 4) return inStrongest[3];
    return inStrongest[0];
  }

  return hand[0];
}

// -------------------------------------------------------------
// Tournament-Grade Super Bot Card Play
// -------------------------------------------------------------

export function getSuperBotCardPlay(
  gameState: GameState,
  seat: Seat,
  trumpSuit: TrumpSuit
): Card {
  const hand = gameState.hands[seat];
  if (!hand || hand.length === 0) {
    throw new Error('No cards in hand for seat ' + seat);
  }

  const trick = gameState.currentTrick;
  const isOpeningLead = trick.length === 0;
  const ledSuit = isOpeningLead ? null : trick[0].card.suit;

  const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));
  if (legalCards.length === 1) {
    return legalCards[0];
  }

  const isNT = trumpSuit === 'NT';
  const myTeam = getTeam(seat);
  const partner = getPartner(seat);
  const opp1 = getNextSeat(seat);
  const opp2 = getNextSeat(partner);
  const beliefs = extractBeliefState(gameState);
  const bayesian = reconstructHandProbabilities(gameState, seat);
  const isDeclarerTeam = gameState.declarer && getTeam(gameState.declarer) === myTeam;

  // Exact Endgame Micro-DDS Solver for tricks 10-13 (<= 4 cards in hand)
  const maxOtherCards = Math.max(
    ...(['North', 'West', 'South', 'East'] as Seat[])
      .filter((s) => s !== seat)
      .map((s) => gameState.cardsCount?.[s] ?? gameState.hands?.[s]?.length ?? hand.length)
  );
  if (hand.length <= 4 && maxOtherCards <= 4) {
    const microDdsPlay = getMicroDDSCardPlay(gameState, seat, trumpSuit);
    if (microDdsPlay) {
      let isMicroDdsBlunder = false;
      const nonTrumpCards = legalCards.filter((c) => isNT || c.suit !== trumpSuit);

      // Invariant Guard 1: Following trick - NEVER ruff / overtrump partner's winning trick!
      if (!isOpeningLead && !isNT && microDdsPlay.suit === trumpSuit && ledSuit !== trumpSuit) {
        if (nonTrumpCards.length > 0) {
          const currentLeaderWinner = evaluateTrickWinner(trick, trumpSuit);
          if (currentLeaderWinner.winner === partner) {
            const partnerWinningRank = currentLeaderWinner.winningCard.rank;
            const partnerWinningWithTrump = currentLeaderWinner.winningCard.suit === trumpSuit;
            const isFourthHand = trick.length === 3;
            const isPartnerHonor = ['A', 'K', 'Q', 'J'].includes(partnerWinningRank);

            if (partnerWinningWithTrump || isFourthHand || isPartnerHonor) {
              isMicroDdsBlunder = true;
            }
          }
        }
      }

      // Invariant Guard 2: Leading trick - NEVER lead trump if opponents have 0 trumps or trumps were already drawn
      if (isOpeningLead && !isNT && microDdsPlay.suit === trumpSuit) {
        if (nonTrumpCards.length > 0) {
          const oppTrumpsEst = countRemainingOpponentTrumps(gameState, seat, trumpSuit);
          const trumpsLedBefore = (gameState.tricksHistory || []).some((t) => t.ledSuit === trumpSuit);
          if (oppTrumpsEst === 0 || trumpsLedBefore) {
            isMicroDdsBlunder = true;
          }
        }
      }

      if (!isMicroDdsBlunder) {
        return microDdsPlay;
      }
    }
  }

  // =========================================================
  // 1. LEADING A TRICK (When trick.length === 0)
  // =========================================================
  if (isOpeningLead) {
    // Trick 1 Opening Lead: Grandmaster Opening Lead Engine
    if (gameState.tricksHistory.length === 0) {
      return getGrandmasterOpeningLead(gameState, seat, trumpSuit);
    }

    // Subsequent Trick Leads (Tricks 2-13):
    // A. Declarer Trump Extraction:
    if (!isNT && isDeclarerTeam) {
      const trumpsLedBefore = (gameState.tricksHistory || []).some((t) => t.ledSuit === trumpSuit);
      const opponentTrumpsLeft = countRemainingOpponentTrumps(gameState, seat, trumpSuit);
      const myTrumps = legalCards.filter((c) => c.suit === trumpSuit);

      // Extract trumps ONLY on the first trump lead of the hand, and only if opponents hold trumps
      if (!trumpsLedBefore && opponentTrumpsLeft > 0 && myTrumps.length > 0) {
        myTrumps.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        return myTrumps[0];
      }
    }

    // B. Defensive Partnership Signals & Discard Intelligence (both Suit & NT):
    if (!isDeclarerTeam) {
      // B1. Partner Void Ruffing (Confirmed void + partner has trumps in suit contract):
      if (!isNT) {
        const partnerHasTrumps = !beliefs[partner].voids[trumpSuit] && (gameState.cardsCount?.[partner] ?? gameState.hands?.[partner]?.length ?? 0) > 0;
        if (partnerHasTrumps) {
          for (const suit of SUITS) {
            if (suit !== trumpSuit && beliefs[partner].voids[suit]) {
              const leadCards = legalCards.filter((c) => c.suit === suit);
              if (leadCards.length > 0) {
                leadCards.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
                return leadCards[0]; // Partner ruffs and kills declarer trick!
              }
            }
          }
        }
      }

      // B2. Partner Attitude Continuation:
      // If we led an honor recently and partner encouraged, continue the suit!
      const lastTrick = gameState.tricksHistory[gameState.tricksHistory.length - 1];
      if (lastTrick && lastTrick.cards.length > 0 && lastTrick.cards[0].seat === seat) {
        const lastSuit = lastTrick.cards[0].card.suit;
        if (isNT || lastSuit !== trumpSuit) {
          const attitude = interpretPartnerAttitude(gameState, seat, lastSuit);
          if (attitude === 'encourage') {
            const inSuit = legalCards.filter((c) => c.suit === lastSuit);
            if (inSuit.length > 0) {
              inSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
              return inSuit[0];
            }
          }
        }
      }

      // B3. Partner Suit-Preference Discard:
      const prefSuit = interpretPartnerDiscard(gameState, seat, trumpSuit);
      if (prefSuit) {
        const inPref = legalCards.filter((c) => c.suit === prefSuit);
        if (inPref.length > 0) {
          inPref.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
          return inPref[0];
        }
      }

      // B4. NT Defense Lead on Trick 2+:
      // If defending against NT and this is our first lead, employ Grandmaster NT opening lead principles:
      if (isNT) {
        return getGrandmasterOpeningLead(gameState, seat, 'NT');
      }
    }

    // C. Cash Guaranteed Winners (Aces/Kings) with Bayesian Void Verification:
    const opponentTrumpsLeft = isNT ? 0 : countRemainingOpponentTrumps(gameState, seat, trumpSuit);
    const safeAces = legalCards.filter((c) => {
      if (c.rank !== 'A') return false;
      if (isNT) return true;
      if (c.suit === trumpSuit) return false;
      // Use Bayesian void probabilities: if any opponent is void and has trumps, avoid cashing!
      const opp1VoidProb = bayesian.playerDistributions[opp1]?.suitVoidProbabilities[c.suit] || 0;
      const opp2VoidProb = bayesian.playerDistributions[opp2]?.suitVoidProbabilities[c.suit] || 0;
      if (opponentTrumpsLeft > 0 && (opp1VoidProb > 0.6 || opp2VoidProb > 0.6 || beliefs[opp1].voids[c.suit] || beliefs[opp2].voids[c.suit])) {
        return false;
      }
      return true;
    });

    if (safeAces.length > 0) {
      return safeAces[0];
    }

    // D. Lead Top of Honor Sequence (K from KQ, Q from QJ, J from J10)
    for (const suit of SUITS) {
      if (!isNT && suit === trumpSuit) continue;
      const inSuit = legalCards.filter((c) => c.suit === suit);
      if (inSuit.some((c) => c.rank === 'K') && inSuit.some((c) => c.rank === 'Q')) {
        return inSuit.find((c) => c.rank === 'K')!;
      }
      if (inSuit.some((c) => c.rank === 'Q') && inSuit.some((c) => c.rank === 'J')) {
        return inSuit.find((c) => c.rank === 'Q')!;
      }
      if (inSuit.some((c) => c.rank === 'J') && inSuit.some((c) => c.rank === '10')) {
        return inSuit.find((c) => c.rank === 'J')!;
      }
    }

    // E. Lead highest card in strongest suit
    // CRITICAL TACTICAL INVARIANT: NEVER lead trump in Section E when holding non-trump cards!
    // Section A already handles active declarer trump drawing. Section E is dedicated to establishing side suits.
    const nonTrumpCards = legalCards.filter((c) => isNT || c.suit !== trumpSuit);
    if (!isNT && nonTrumpCards.length > 0) {
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

    const strongest = getStrongestSuit(hand);
    const inStrongest = legalCards.filter((c) => c.suit === strongest.suit);
    if (inStrongest.length > 0) {
      inStrongest.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return inStrongest[0];
    }

    return legalCards[0];
  }

  // =========================================================
  // 2. FOLLOWING IN-PROGRESS TRICK (Trick has 1, 2, or 3 cards)
  // =========================================================
  const currentLeaderWinner = evaluateTrickWinner(trick, trumpSuit);
  const partnerIsWinning = currentLeaderWinner.winner === partner;
  const inLedSuit = legalCards.filter((c) => c.suit === ledSuit);
  const isFourthHand = trick.length === 3;
  const isSecondHand = trick.length === 1;
  const isThirdHand = trick.length === 2;

  // A. Partner is currently winning the trick:
  if (partnerIsWinning) {
    const isPartnerHonorLead = trick[0].seat === partner && ['A', 'K', 'Q'].includes(trick[0].card.rank);
    const partnerWinningRank = currentLeaderWinner.winningCard.rank;

    // 1. If following in led suit:
    if (inLedSuit.length > 0) {
      const inLedSuitAsc = [...inLedSuit].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);

      // Attitude signal: if partner led an honor (A, K, Q):
      if (isPartnerHonorLead) {
        const trumps = hand.filter((c) => c.suit === trumpSuit);
        return getAttitudeSignalCard(inLedSuit, trick[0].card, isNT, trumps.length > 0);
      }

      // If 4th hand, partner has already won the trick! Duck lowest card in led suit.
      if (isFourthHand) {
        return inLedSuitAsc[0];
      }

      // If partner's winning card is Ace, King, or Queen: duck lowest card to conserve honors and avoid overtaking partner
      if (['A', 'K', 'Q'].includes(partnerWinningRank)) {
        return inLedSuitAsc[0];
      }

      // Third Hand High when partner led spot card (3rd hand):
      if (isThirdHand) {
        const winningInSuit = inLedSuit.filter((c) => {
          const test = [...trick, { seat, card: c }];
          return evaluateTrickWinner(test, trumpSuit).winner === seat;
        });

        if (winningInSuit.length > 0) {
          winningInSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
          let chosenCard = winningInSuit[0];
          for (let i = 1; i < winningInSuit.length; i++) {
            const prev = winningInSuit[i - 1];
            const curr = winningInSuit[i];
            if (RANK_VALUES[prev.rank] - RANK_VALUES[curr.rank] === 1) {
              if (chosenCard === prev) {
                chosenCard = curr;
              }
            } else {
              break;
            }
          }
          return chosenCard;
        }
      }

      return inLedSuitAsc[0];
    } else {
      // 2. Void in led suit (Partner is winning!):
      const nonTrumpCards = legalCards.filter((c) => isNT || c.suit !== trumpSuit);

      // On 4th hand: Partner ALREADY WON the trick! NEVER ruff partner's trick!
      // Discard an off-suit loser using Suit-Preference Discard (or lowest non-trump)
      if (isFourthHand) {
        if (nonTrumpCards.length > 0) {
          return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards, trumpSuit);
        }
        // Only trumps remain: must play lowest trump
        const trumpsAsc = [...legalCards].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
        return trumpsAsc[0];
      }

      // On 3rd hand:
      // INVARIANT 1: If partner is winning with a TRUMP, NEVER overtrump partner!
      if (currentLeaderWinner.winningCard.suit === trumpSuit) {
        if (nonTrumpCards.length > 0) {
          return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards, trumpSuit);
        }
        const trumpsAsc = [...legalCards].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
        return trumpsAsc[0];
      }

      // INVARIANT 2: If partner is winning with an honor (A, K, Q, J): NEVER RUFF! Discard off-suit loser.
      if (['A', 'K', 'Q', 'J'].includes(partnerWinningRank)) {
        if (nonTrumpCards.length > 0) {
          return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards, trumpSuit);
        }
      }

      // INVARIANT 3: If 4th hand opponent cannot beat partner's card, DO NOT RUFF! Discard off-suit loser.
      const opp4 = getNextSeat(seat);
      const opp4IsVoidInTrump = !isNT ? beliefs[opp4]?.voids?.[trumpSuit] : false;
      const opp4IsVoidInLed = ledSuit ? beliefs[opp4]?.voids?.[ledSuit] : false;
      if (opp4IsVoidInTrump && opp4IsVoidInLed && nonTrumpCards.length > 0) {
        return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards, trumpSuit);
      }

      // INVARIANT 4: Only if partner led a weak spot card (<= 9) and 4th hand might beat it,
      // consider ruffing with a cheap trump (rank <= 10). NEVER waste honor trumps (J, Q, K, A)
      // over partner's winning card if we have off-suit cards to discard!
      if (!isNT) {
        const trumps = legalCards.filter((c) => c.suit === trumpSuit);
        const winningTrumps = trumps.filter((c) => {
          const test = [...trick, { seat, card: c }];
          return evaluateTrickWinner(test, trumpSuit).winner === seat;
        });
        if (winningTrumps.length > 0) {
          winningTrumps.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
          if (nonTrumpCards.length > 0) {
            const cheapWinningTrumps = winningTrumps.filter((c) => RANK_VALUES[c.rank] <= 10);
            if (cheapWinningTrumps.length > 0) {
              return cheapWinningTrumps[0];
            }
            // Discard off-suit loser instead of squandering high honor trump!
            return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards, trumpSuit);
          }
          return winningTrumps[0];
        }
      }

      return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards.length > 0 ? nonTrumpCards : legalCards, trumpSuit);
    }
  }

  // B. Opponent is currently winning the trick:

  // B1. SECOND HAND PLAY (trick.length === 1, opponent led, partner is 4th hand):
  if (isSecondHand) {
    if (inLedSuit.length > 0) {
      const inLedSuitAsc = [...inLedSuit].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
      const ledCardRank = trick[0].card.rank;

      // 1. Cover an honor with an honor!
      // When opponent leads Q, J, or 10:
      if (['Q', 'J', '10'].includes(ledCardRank)) {
        const covers = inLedSuit.filter((c) => RANK_VALUES[c.rank] > RANK_VALUES[ledCardRank]);
        if (covers.length > 0) {
          covers.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
          return covers[0]; // Lowest covering honor
        }
      }

      // 2. Second Hand Low on spot leads (rank <= 9):
      // Check for splitting touching honors (e.g. Q-J-10 -> play 10; K-Q -> play Q; J-10 -> play 10)
      if (inLedSuit.length >= 2) {
        const ranks = new Set(inLedSuit.map((c) => c.rank));
        if (ranks.has('K') && ranks.has('Q')) return inLedSuit.find((c) => c.rank === 'Q')!;
        if (ranks.has('Q') && ranks.has('J')) return inSuitSplit(inLedSuit, 'J', '10');
        if (ranks.has('J') && ranks.has('10')) return inSuitSplit(inLedSuit, '10', '9');
      }

      // Default Second Hand Low: play lowest spot card to protect honors & let partner in 4th hand win!
      return inLedSuitAsc[0];
    } else {
      // Void in led suit as Second Hand:
      if (!isNT) {
        const trumps = legalCards.filter((c) => c.suit === trumpSuit);
        // If opponent led an honor (e.g. King, Ace, Queen), ruffing is valuable:
        if (trumps.length > 0 && ['A', 'K', 'Q'].includes(trick[0].card.rank)) {
          trumps.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
          return trumps[0];
        }
      }
      return getSuitPreferenceDiscard(gameState, seat, legalCards, trumpSuit);
    }
  }

  // B2. THIRD HAND PLAY (trick.length === 2, partner led, 2nd hand opponent is winning):
  if (isThirdHand) {
    if (inLedSuit.length > 0) {
      // Third Hand High! Try to win the trick:
      const winningInSuit = inLedSuit.filter((c) => {
        const test = [...trick, { seat, card: c }];
        return evaluateTrickWinner(test, trumpSuit).winner === seat;
      });

      if (winningInSuit.length > 0) {
        winningInSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        let chosenCard = winningInSuit[0];
        for (let i = 1; i < winningInSuit.length; i++) {
          const prev = winningInSuit[i - 1];
          const curr = winningInSuit[i];
          if (RANK_VALUES[prev.rank] - RANK_VALUES[curr.rank] === 1) {
            if (chosenCard === prev) chosenCard = curr;
          } else {
            break;
          }
        }
        return chosenCard;
      }

      // Cannot beat 2nd hand: give Count Signal (High-Low Echo on even length)
      let playedCountInSuit = 0;
      for (const t of gameState.tricksHistory) {
        const p = t.cards.find((c) => c.seat === seat);
        if (p && p.card.suit === ledSuit) playedCountInSuit++;
      }
      return getCountSignalCard(inLedSuit, playedCountInSuit);
    } else {
      // Void in led suit as 3rd hand:
      if (!isNT) {
        const trumps = legalCards.filter((c) => c.suit === trumpSuit);
        const winningTrumps = trumps.filter((c) => {
          const test = [...trick, { seat, card: c }];
          return evaluateTrickWinner(test, trumpSuit).winner === seat;
        });
        if (winningTrumps.length > 0) {
          winningTrumps.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
          return winningTrumps[0];
        }
      }
      return getSuitPreferenceDiscard(gameState, seat, legalCards, trumpSuit);
    }
  }

  // B3. FOURTH HAND PLAY (trick.length === 3, last to play, opponent currently winning):
  const winningPlays: Card[] = [];
  for (const card of legalCards) {
    const testTrick = [...trick, { seat, card }];
    const res = evaluateTrickWinner(testTrick, trumpSuit);
    if (res.winner === seat) {
      winningPlays.push(card);
    }
  }

  if (winningPlays.length > 0) {
    winningPlays.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return winningPlays[0]; // Win trick as cheaply as possible!
  }

  // Cannot win trick:
  if (inLedSuit.length > 0) {
    let playedCountInSuit = 0;
    for (const t of gameState.tricksHistory) {
      const p = t.cards.find((c) => c.seat === seat);
      if (p && p.card.suit === ledSuit) playedCountInSuit++;
    }
    return getCountSignalCard(inLedSuit, playedCountInSuit);
  }

  // Void: discard lowest off-suit card via suit-preference
  const nonTrumpCards = legalCards.filter((c) => isNT || c.suit !== trumpSuit);
  return getSuitPreferenceDiscard(gameState, seat, nonTrumpCards.length > 0 ? nonTrumpCards : legalCards, trumpSuit);
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

// Check if hand is suitable for No Trump (balanced or semi-balanced with stoppers)
export function isHandNTEligible(hand: Card[]): boolean {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) counts[c.suit]++;
  const values = Object.values(counts);
  const minCount = Math.min(...values);
  const maxCount = Math.max(...values);

  // 1. Standard balanced: 4-3-3-3, 4-4-3-2, 5-3-3-2 (minCount >= 2, maxCount <= 5)
  if (minCount >= 2 && maxCount <= 5) return true;

  // 2. Voids (0 cards in any suit) are unstopped and fatal in NT
  if (minCount === 0) return false;

  // 3. Semi-balanced with singleton (minCount === 1, maxCount <= 6):
  // Safe if the singleton is an unassailable stopper/winner (Ace or King)
  if (minCount === 1 && maxCount <= 6) {
    for (const suit of SUITS) {
      if (counts[suit] === 1) {
        const card = hand.find((c) => c.suit === suit);
        if (card && (card.rank === 'A' || card.rank === 'K')) {
          return true;
        }
      }
    }
    return false;
  }

  // 4. Semi-balanced 5-4-2-2 or 6-3-2-2
  if (minCount >= 2 && maxCount <= 6) return true;

  return false;
}

// -------------------------------------------------------------
// Partner Bidding Intention Decoding & Partnership Communication
// -------------------------------------------------------------

export type PartnerBiddingIntention =
  | 'none'                // Partner hasn't bid yet (we are bidding first)
  | 'pass'                // Partner passed (weak, 0-9 HCP)
  | 'open_suit'           // Partner opened 1 Suit (10-14 HCP, 5+ card suit, wants Suit contract)
  | 'open_nt'             // Partner opened 1 NT (14-16 HCP balanced, wants doubled NT contract)
  | 'strong_nt'           // Partner opened 2 NT (17+ HCP balanced, powerhouse NT)
  | 'competitive_suit'    // Partner competed in Suit at level 2+
  | 'competitive_nt';     // Partner competed in NT at level 2+

export interface PartnerBiddingAnalysis {
  hasBid: boolean;
  intention: PartnerBiddingIntention;
  bid: Bid | null;
  isWinning: boolean;
  estimatedMinHCP: number;
  estimatedMaxHCP: number;
  estimatedAvgHCP: number;
  likelySuitContract: boolean;
  likelyNTContract: boolean;
}

export function analyzePartnerBiddingIntention(
  gameState: GameState,
  mySeat: Seat
): PartnerBiddingAnalysis {
  const partner = getPartner(mySeat);
  const partnerBid = gameState.bids.find((b) => b.seat === partner);
  const isWinning = gameState.highestBidder === partner;

  if (!partnerBid) {
    return {
      hasBid: false,
      intention: 'none',
      bid: null,
      isWinning: false,
      estimatedMinHCP: 0,
      estimatedMaxHCP: 20,
      estimatedAvgHCP: 9.5,
      likelySuitContract: false,
      likelyNTContract: false,
    };
  }

  if (partnerBid.type === 'pass') {
    return {
      hasBid: true,
      intention: 'pass',
      bid: partnerBid,
      isWinning: false,
      estimatedMinHCP: 0,
      estimatedMaxHCP: 9,
      estimatedAvgHCP: 5.5,
      likelySuitContract: false,
      likelyNTContract: false,
    };
  }

  // Partner made a real bid
  const level = partnerBid.level || 1;
  const contractType = partnerBid.contractType || 'Suit';

  if (contractType === 'NT') {
    if (level === 1) {
      return {
        hasBid: true,
        intention: 'open_nt',
        bid: partnerBid,
        isWinning,
        estimatedMinHCP: 14,
        estimatedMaxHCP: 17,
        estimatedAvgHCP: 15.2,
        likelySuitContract: false,
        likelyNTContract: true,
      };
    } else {
      return {
        hasBid: true,
        intention: level === 2 ? 'strong_nt' : 'competitive_nt',
        bid: partnerBid,
        isWinning,
        estimatedMinHCP: 16,
        estimatedMaxHCP: 22,
        estimatedAvgHCP: 17.5,
        likelySuitContract: false,
        likelyNTContract: true,
      };
    }
  }

  // ContractType is 'Suit'
  if (level === 1) {
    return {
      hasBid: true,
      intention: 'open_suit',
      bid: partnerBid,
      isWinning,
      estimatedMinHCP: 10,
      estimatedMaxHCP: 15,
      estimatedAvgHCP: 11.8,
      likelySuitContract: true,
      likelyNTContract: false,
    };
  }

  return {
    hasBid: true,
    intention: 'competitive_suit',
    bid: partnerBid,
    isWinning,
    estimatedMinHCP: 12,
    estimatedMaxHCP: 18,
    estimatedAvgHCP: 14.0,
    likelySuitContract: true,
    likelyNTContract: false,
  };
}

// -------------------------------------------------------------
// Tournament Super Bot Bidding Engine (Expected Value Optimization)
// -------------------------------------------------------------

export function getSuperBotBid(gameState: GameState, seat: Seat): Bid {
  const hand = gameState.hands[seat] || [];
  const hcp = calculateHCP(hand);
  const strongest = getStrongestSuit(hand);
  const isDealer = gameState.dealer === seat;
  const isFinalTurn = gameState.auctionTurnsCount === 3;
  const highest = gameState.highestBid;
  const myTeam = getTeam(seat);
  const partner = getPartner(seat);
  const policy = getActiveBotPolicy();

  // 1. Partner intention analysis
  const partnerAnalysis = analyzePartnerBiddingIntention(gameState, seat);

  // 2. Distribution points (DOP)
  let dop = 0;
  const suitCounts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) suitCounts[c.suit]++;
  for (const s of SUITS) {
    if (suitCounts[s] === 0) dop += policy.partnershipCoefficients.voidBonus;
    else if (suitCounts[s] === 1) dop += policy.partnershipCoefficients.singletonBonus;
    else if (suitCounts[s] === 2) dop += policy.partnershipCoefficients.doubletonBonus;
  }
  // Extra length bonus (6th card +1, 7th+ card +2)
  if (strongest.count >= 6) dop += (strongest.count - 5);

  const effectivePower = hcp + dop;
  const balanced = isHandBalanced(hand);
  const ntReady = isHandNTEligible(hand);

  // Match Context & Vulnerability
  const currentScore = gameState.matchScores[myTeam];
  const isCloseToElimination = currentScore <= -5;
  const isCloseToVictory = currentScore >= 7; // At +7, a 4-point win (+4) achieves +11 match victory!

  const combinedHCP = hcp + partnerAnalysis.estimatedAvgHCP;
  const combinedPower = effectivePower + partnerAnalysis.estimatedAvgHCP;

  // Rule of 20 check for opening: HCP + sum of 2 longest suits >= 20
  const sortedSuitCounts = Object.values(suitCounts).sort((a, b) => b - a);
  const ruleOf20 = hcp + (sortedSuitCounts[0] || 0) + (sortedSuitCounts[1] || 0) >= 20;

  // 3. Dealer Privilege Resolution on Turn 4 (Final Turn)
  if (isDealer && isFinalTurn && highest && highest.type === 'bid' && highest.level) {
    const privileges = getDealerPrivileges(highest);

    // If partner already holds the winning bid, PASS to protect partner's contract!
    if (gameState.highestBidder === partner) {
      return { seat, type: 'pass' };
    }

    // Opponent holds highest bid on Turn 4: Dealer evaluates Match Privileges
    const tSuit1 = policy.biddingMatrix['1_Suit'];
    const minSuitLen = tSuit1?.minSuitLength ?? 5;
    const minSuitHcp = tSuit1?.minHCP ?? 10;

    // A. Match Suit: Steal the contract at the same level without increasing required tricks!
    if (privileges.canMatchSuit && privileges.matchedSuitLevel) {
      const partnerHasOpening = partnerAnalysis.intention === 'open_suit' || partnerAnalysis.intention === 'open_nt' || partnerAnalysis.intention === 'competitive_suit';
      const dealerCanSupport = strongest.count >= 4 && (hcp >= 8 || effectivePower >= 9);
      const dealerHasOwnSuit = strongest.count >= minSuitLen && (hcp >= minSuitHcp - 1 || effectivePower >= minSuitHcp);

      if ((partnerHasOpening && dealerCanSupport) || dealerHasOwnSuit || combinedPower >= 19.5) {
        return {
          seat,
          type: 'bid',
          level: privileges.matchedSuitLevel,
          contractType: 'Suit',
          isDealerPrivilegeMatch: true,
        };
      }
    }

    // B. Match NT: Steal doubled NT contract!
    if (privileges.canMatchNT && privileges.matchedNTLevel && (balanced || ntReady)) {
      const partnerHasOpening = partnerAnalysis.intention === 'open_suit' || partnerAnalysis.intention === 'open_nt';
      if ((partnerHasOpening && hcp >= 9) || hcp >= 13 || combinedHCP >= 23) {
        return {
          seat,
          type: 'bid',
          level: privileges.matchedNTLevel,
          contractType: 'NT',
          isDealerPrivilegeMatch: true,
        };
      }
    }

    return { seat, type: 'pass' };
  }

  // 4. Partner is Currently Winning the Bid: Upgrades & Protection
  if (partnerAnalysis.isWinning) {
    const pBid = partnerAnalysis.bid;
    const pLevel = pBid?.level || 1;
    const pType = pBid?.contractType || 'Suit';

    // Upgrade 4A: Partner is winning 1 Suit.
    if (pLevel === 1 && pType === 'Suit') {
      // 4A-1: Game-winning 2 NT when close to victory or holding strong opening values:
      // If team has +7 points, winning 4 points (+4) reaches +11 and WINS THE MATCH!
      // With 12+ HCP and NT-eligible hand, or 14+ HCP, seize the match with 2 NT!
      if (ntReady && (hcp >= 14 || (hcp >= 12 && isCloseToVictory))) {
        return {
          seat,
          type: 'bid',
          level: 2,
          contractType: 'NT',
        };
      }

      // 4A-2: High-Reward 1 NT Upgrade:
      // Requires the EXACT SAME 7 tricks as 1 Suit, but DOUBLES scoring (+2 pts vs +1 pt)!
      // Responder with 10+ HCP (or 9 HCP with a 5-card suit) and NT-eligible hand MUST NEVER PASS!
      if (ntReady && (hcp >= 10 || (hcp >= 9 && strongest.count >= 5))) {
        return {
          seat,
          type: 'bid',
          level: 1,
          contractType: 'NT',
        };
      }

      // 4A-3: Dominant Suit Overcall with 13+ HCP:
      // If not NT-ready (e.g. holding a void), but holds 13+ HCP and a dominant 6+ card suit:
      if (!ntReady && strongest.count >= 6 && hcp >= 13) {
        return {
          seat,
          type: 'bid',
          level: 2,
          contractType: 'Suit',
        };
      }
    }

    // Upgrade 4B: Partner is winning 1 NT (14-16 HCP balanced, doubled points).
    if (pType === 'NT' && pLevel === 1) {
      // 8-11 HCP -> 22-27 combined HCP -> Bid 2 NT (needs 8 tricks, awards +4 pts)!
      if (hcp >= 8 && hcp <= 11 && (ntReady || strongest.count >= 5)) {
        return {
          seat,
          type: 'bid',
          level: 2,
          contractType: 'NT',
        };
      }
      // 12+ HCP -> 26+ combined HCP -> Bid 3 NT (needs 9 tricks, awards +6 pts)!
      if (hcp >= 12) {
        return {
          seat,
          type: 'bid',
          level: 3,
          contractType: 'NT',
        };
      }
    }

    // In all other cases: Partner already holds the winning bid!
    // PASS to let partner win the contract at the lowest, safest level!
    return { seat, type: 'pass' };
  }

  // 4. Candidate Bids Generation (Governed by Partner Intention & Policy Matrix)
  const candidateBids: Array<{ level: number; type: ContractType }> = [];
  const partnerOpened =
    partnerAnalysis.intention === 'open_suit' ||
    partnerAnalysis.intention === 'open_nt' ||
    partnerAnalysis.intention === 'competitive_suit';
  const partnerPassed = partnerAnalysis.intention === 'pass';

  if (!highest || highest.type === 'pass') {
    // Opening auction: Always open 1 Suit (or 1 NT / 2 NT for doubled points)
    const tSuit1 = policy.biddingMatrix['1_Suit'];
    const minSuit1Len = tSuit1?.minSuitLength ?? 5;
    const minSuit1Hcp = tSuit1?.minHCP ?? 10;
    if (
      (strongest.count >= minSuit1Len && (hcp >= minSuit1Hcp || effectivePower >= minSuit1Hcp + 1 || ruleOf20)) ||
      (strongest.count >= 4 && hcp >= minSuit1Hcp + 3)
    ) {
      candidateBids.push({ level: 1, type: 'Suit' });
    }
    // High-reward 1 NT: balanced or NT-ready hand governed by learned threshold
    const tNT1 = policy.biddingMatrix['1_NT'];
    const minNT1Hcp = tNT1?.minHCP ?? 14;
    if ((balanced || ntReady) && hcp >= minNT1Hcp) {
      candidateBids.push({ level: 1, type: 'NT' });
    }
    // 2 NT: balanced or NT-ready hand governed by learned threshold
    const tNT2 = policy.biddingMatrix['2_NT'];
    const minNT2Hcp = tNT2?.minHCP ?? 16;
    if ((balanced || ntReady) && hcp >= minNT2Hcp) {
      candidateBids.push({ level: 2, type: 'NT' });
    }
  } else {
    // Opponent is currently winning the auction.
    const minL = highest.level || 1;
    const tNTCurrent = policy.biddingMatrix[`${minL}_NT`];
    const minNTCurrentHcp = tNTCurrent?.minHCP ?? (14 + (minL - 1) * 2);
    const tNTNext = policy.biddingMatrix[`${minL + 1}_NT`];
    const minNTNextHcp = tNTNext?.minHCP ?? (14 + minL * 2);

    if (partnerOpened) {
      // Scenario A: Partner opened earlier, opponent overbid -> Compete with combined partnership strength!
      if (highest.contractType === 'Suit') {
        if ((balanced || ntReady) && (hcp >= minNTCurrentHcp || combinedHCP >= 23)) {
          candidateBids.push({ level: minL, type: 'NT' });
        }
        if (strongest.count >= 4 && (effectivePower >= 9 || combinedPower >= 20 || combinedHCP >= 21)) {
          candidateBids.push({ level: minL + 1, type: 'Suit' });
        }
        if ((balanced || ntReady) && (hcp >= minNTNextHcp || combinedHCP >= 25)) {
          candidateBids.push({ level: minL + 1, type: 'NT' });
        }
      } else {
        // Highest is NT
        if (strongest.count >= 4 && (effectivePower >= 10 || combinedPower >= 22)) {
          candidateBids.push({ level: minL + 1, type: 'Suit' });
        }
        if ((balanced || ntReady) && combinedHCP >= 26) {
          candidateBids.push({ level: minL + 1, type: 'NT' });
        }
      }
    } else if (partnerPassed) {
      // Scenario B: Partner passed (<10 HCP, avg ~5.5) -> Sound independent overcall required
      if (highest.contractType === 'Suit') {
        if ((balanced || ntReady) && hcp >= 16) {
          candidateBids.push({ level: minL, type: 'NT' });
        }
        if (strongest.count >= 5 && (hcp >= 13 || effectivePower >= 15)) {
          candidateBids.push({ level: minL + 1, type: 'Suit' });
        }
        if ((balanced || ntReady) && hcp >= 18) {
          candidateBids.push({ level: minL + 1, type: 'NT' });
        }
      } else {
        if (strongest.count >= 5 && (hcp >= 14 || effectivePower >= 16)) {
          candidateBids.push({ level: minL + 1, type: 'Suit' });
        }
      }
    } else {
      // Scenario C: Partner has not spoken yet (Turn 2/3 overcall)
      if (highest.contractType === 'Suit') {
        if ((balanced || ntReady) && hcp >= minNTCurrentHcp) {
          candidateBids.push({ level: minL, type: 'NT' });
        }
        if (strongest.count >= 5 && (hcp >= 11 || effectivePower >= 13)) {
          candidateBids.push({ level: minL + 1, type: 'Suit' });
        }
        if ((balanced || ntReady) && hcp >= minNTNextHcp) {
          candidateBids.push({ level: minL + 1, type: 'NT' });
        }
      } else {
        if (strongest.count >= 5 && (hcp >= 12 || effectivePower >= 14)) {
          candidateBids.push({ level: minL + 1, type: 'Suit' });
        }
        if ((balanced || ntReady) && hcp >= minNTNextHcp) {
          candidateBids.push({ level: minL + 1, type: 'NT' });
        }
      }
    }
  }

  const validCandidates = candidateBids.filter(
    (b) => b.level <= 4 && isBidHigher(b.level, b.type, highest)
  );

  if (validCandidates.length === 0) {
    return { seat, type: 'pass' };
  }

  // 5. Expected Value (EV) Evaluation (Calibrated Bridge/Tarneeb Expectation Formula)
  let bestBidOption: { level: number; type: ContractType } | null = null;
  let maxEV = -999;

  for (const cand of validCandidates) {
    const matrixEntry = policy.biddingMatrix[`${cand.level}_${cand.type}`];
    const tricksNeeded = 6 + cand.level;

    // Safety checks against reckless overbidding when partner passed
    if (partnerPassed && cand.level >= 2 && effectivePower < 14) {
      continue;
    }

    // Calibrated Bridge/Tarneeb trick expectation:
    // Base tricks from HCP: 1.5 + (combinedHCP * 0.26)
    let expectedTricks = 1.5 + (combinedHCP * 0.26);

    if (cand.type === 'Suit') {
      // Long suit bonus
      expectedTricks += Math.max(0, strongest.count - 4) * 0.5;

      // Shortness/ruffing value
      if (dop > 0) {
        expectedTricks += Math.min(1.5, dop * 0.35);
      }

      // Partnership fit bonus if partner opened suit
      if (partnerOpened) {
        const fitBonus = strongest.count >= 5
          ? policy.partnershipCoefficients.fitBonus9PlusTrumps
          : policy.partnershipCoefficients.fitBonus8Trumps;
        expectedTricks += fitBonus;
      }
    } else {
      // NT: relies on high cards and running long suits
      if (strongest.count >= 5) {
        expectedTricks += (strongest.count - 4) * 0.4;
      }
    }

    expectedTricks = Math.min(13, Math.max(2, expectedTricks));

    const margin = expectedTricks - tricksNeeded;
    const winProb =
      margin >= 1.0
        ? 0.95
        : margin >= 0.5
        ? 0.85
        : margin >= 0.0
        ? 0.70
        : margin >= -0.5
        ? 0.42
        : margin >= -1.0
        ? 0.18
        : 0.05;

    let calculatedEV = 0;
    const defTricksOverSix = Math.max(0, (13 - expectedTricks) - 6);
    if (cand.type === 'Suit') {
      const rewardIfMade = Math.max(1, expectedTricks - 6);
      const penaltyIfSet = -cand.level - defTricksOverSix;
      calculatedEV = winProb * rewardIfMade + (1 - winProb) * penaltyIfSet;
    } else {
      // Doubled NT contract:
      // When made: (L * 2) + extra overtricks
      // When set: -(L * 2) penalty AND defenders get doubled points for tricks over 6!
      const rewardIfMade = cand.level * 2 + Math.max(0, expectedTricks - tricksNeeded);
      const defDoubledTricks = Math.min(cand.level, defTricksOverSix);
      const defRegularTricks = Math.max(0, defTricksOverSix - cand.level);
      const defScoreGained = defDoubledTricks * 2 + defRegularTricks;
      const penaltyIfSet = -(cand.level * 2 + defScoreGained);
      calculatedEV = winProb * rewardIfMade + (1 - winProb) * penaltyIfSet;
    }

    // Blend situational calculated EV with learned empirical EV from policy
    const empiricalBaseEV = matrixEntry ? matrixEntry.empiricalEV : calculatedEV;
    const empiricalWinRate = matrixEntry ? matrixEntry.empiricalWinRate : 0.80;
    const evAdjustmentRatio = empiricalWinRate > 0 ? winProb / empiricalWinRate : 1.0;
    const blendedEV = 0.5 * calculatedEV + 0.5 * (empiricalBaseEV * evAdjustmentRatio);

    let ev = blendedEV;
    if (isCloseToElimination) ev -= 2.0;

    if (ev > 0.1 && ev > maxEV) {
      maxEV = ev;
      bestBidOption = cand;
    }
  }

  if (bestBidOption) {
    return {
      seat,
      type: 'bid',
      level: bestBidOption.level,
      contractType: bestBidOption.type,
    };
  }

  return { seat, type: 'pass' };
}

// -------------------------------------------------------------
// Tournament Trump Selection (Guarantees Longest Suit as Trump)
// -------------------------------------------------------------

export function getSuperBotDeclaredSuit(
  hand: Card[],
  gameState?: GameState,
  declarerSeat?: Seat
): Suit {
  // In trick games, trump length is paramount: declarer MUST declare their longest suit!
  let bestSuit: Suit = 'S';
  let maxCount = -1;
  let bestHCP = -1;

  for (const suit of SUITS) {
    const cards = hand.filter((c) => c.suit === suit);
    const hcp = calculateHCP(cards);
    if (cards.length > maxCount || (cards.length === maxCount && hcp > bestHCP)) {
      maxCount = cards.length;
      bestHCP = hcp;
      bestSuit = suit;
    }
  }

  return bestSuit;
}
