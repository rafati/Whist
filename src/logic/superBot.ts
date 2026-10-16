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
// Information State & Belief Tracker
// -------------------------------------------------------------

export interface PlayerBelief {
  voids: Record<Suit, boolean>;
  minHCP: number;
}

export function extractBeliefState(gameState: GameState): Record<Seat, PlayerBelief> {
  const beliefs: Record<Seat, PlayerBelief> = {
    North: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0 },
    West: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0 },
    South: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0 },
    East: { voids: { S: false, H: false, D: false, C: false }, minHCP: 0 },
  };

  // 1. Analyze Bidding History for minimum HCP inferences
  for (const bid of gameState.bids) {
    if (bid.type === 'bid' && bid.level) {
      if (bid.contractType === 'NT') {
        beliefs[bid.seat].minHCP = Math.max(beliefs[bid.seat].minHCP, 14);
      } else if (bid.level >= 2) {
        beliefs[bid.seat].minHCP = Math.max(beliefs[bid.seat].minHCP, 13);
      } else {
        beliefs[bid.seat].minHCP = Math.max(beliefs[bid.seat].minHCP, 10);
      }
    }
  }

  // 2. Analyze Tricks History for confirmed suit voids
  for (const trick of gameState.tricksHistory) {
    const ledSuit = trick.ledSuit;
    for (const play of trick.cards) {
      if (play.card.suit !== ledSuit) {
        beliefs[play.seat].voids[ledSuit] = true;
      }
    }
  }

  // Check current ongoing trick
  if (gameState.currentTrick.length > 1) {
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

// Count remaining opponent trumps
export function countRemainingOpponentTrumps(
  gameState: GameState,
  mySeat: Seat,
  trumpSuit: TrumpSuit
): number {
  if (trumpSuit === 'NT') return 0;
  const partner = getPartner(mySeat);
  const myHand = gameState.hands[mySeat] || [];
  const myTrumps = myHand.filter((c) => c.suit === trumpSuit).length;

  let trumpsPlayed = 0;
  for (const trick of gameState.tricksHistory) {
    for (const p of trick.cards) {
      if (p.card.suit === trumpSuit) trumpsPlayed++;
    }
  }
  for (const p of gameState.currentTrick) {
    if (p.card.suit === trumpSuit) trumpsPlayed++;
  }

  // Known remaining trumps outside bot's hand
  const trumpsOutsideMyHand = Math.max(0, 13 - trumpsPlayed - myTrumps);

  // If partner is confirmed void in trumps, all outside trumps belong to opponents
  const beliefs = extractBeliefState(gameState);
  if (beliefs[partner].voids[trumpSuit]) {
    return trumpsOutsideMyHand;
  }

  // Estimate opponent share (~60% if partner might hold trumps)
  return Math.max(0, Math.round(trumpsOutsideMyHand * 0.65));
}

// -------------------------------------------------------------
// World Determinization / Belief Sampler
// -------------------------------------------------------------

export function sampleConsistentDeals(
  gameState: GameState,
  mySeat: Seat,
  count: number = 8
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
    North: gameState.cardsCount.North,
    West: gameState.cardsCount.West,
    South: gameState.cardsCount.South,
    East: gameState.cardsCount.East,
  };

  for (const play of gameState.currentTrick) {
    if (play.seat !== mySeat) {
      neededCounts[play.seat] = Math.max(0, (gameState.hands[play.seat]?.length || 0));
    }
  }

  const beliefs = extractBeliefState(gameState);
  const sampledWorlds: Array<Record<Seat, Card[]>> = [];

  for (let attempt = 0; attempt < count * 3 && sampledWorlds.length < count; attempt++) {
    const shuffled = [...unknownCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const candidateHands: Record<Seat, Card[]> = {
      North: mySeat === 'North' ? [...myHand] : [],
      West: mySeat === 'West' ? [...myHand] : [],
      South: mySeat === 'South' ? [...myHand] : [],
      East: mySeat === 'East' ? [...myHand] : [],
    };

    let isValidDeal = true;
    for (const card of shuffled) {
      const eligibleSeats = otherSeats.filter(
        (s) => candidateHands[s].length < neededCounts[s] && !beliefs[s].voids[card.suit]
      );
      if (eligibleSeats.length === 0) {
        isValidDeal = false;
        break;
      }
      const targetSeat = eligibleSeats[Math.floor(Math.random() * eligibleSeats.length)];
      candidateHands[targetSeat].push(card);
    }

    if (isValidDeal && otherSeats.every((s) => candidateHands[s].length === neededCounts[s])) {
      sampledWorlds.push(candidateHands);
    }
  }

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
// Double-Dummy Simulation Rollout Engine
// -------------------------------------------------------------

export function solveDoubleDummyTricks(
  hands: Record<Seat, Card[]>,
  trumpSuit: TrumpSuit,
  targetTeam: 'TeamA' | 'TeamB',
  leader: Seat,
  currentTrickCards: Array<{ seat: Seat; card: Card }> = [],
  depthLimit: number = 13
): number {
  const simHands: Record<Seat, Card[]> = {
    North: [...hands.North],
    West: [...hands.West],
    South: [...hands.South],
    East: [...hands.East],
  };

  let curTrick = [...currentTrickCards];
  let curLeader = leader;
  let teamTricksWon = 0;
  let remainingRounds = depthLimit;

  while (remainingRounds > 0) {
    const totalRemainingCards =
      simHands.North.length + simHands.West.length + simHands.South.length + simHands.East.length;
    if (totalRemainingCards === 0 && curTrick.length === 0) break;

    while (curTrick.length < 4) {
      const currentSeat: Seat =
        curTrick.length === 0 ? curLeader : getNextSeat(curTrick[curTrick.length - 1].seat);
      const hand = simHands[currentSeat];
      if (hand.length === 0) break;

      const ledSuit = curTrick.length === 0 ? null : curTrick[0].card.suit;
      const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));
      if (legalCards.length === 0) break;

      let chosenCard = legalCards[0];

      if (curTrick.length === 0) {
        // Leading: cash an Ace or lead top of honors
        const ace = legalCards.find((c) => c.rank === 'A' && (trumpSuit === 'NT' || c.suit !== trumpSuit));
        if (ace) {
          chosenCard = ace;
        } else {
          const sorted = [...legalCards].sort(
            (a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]
          );
          chosenCard = sorted[0];
        }
      } else {
        const currentWinner = evaluateTrickWinner(curTrick, trumpSuit).winner;
        const partner = getPartner(currentSeat);
        const partnerWinning = currentWinner === partner;

        const sortedAsc = [...legalCards].sort(
          (a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]
        );

        if (partnerWinning) {
          chosenCard = sortedAsc[0];
        } else {
          const winningCards = legalCards.filter((c) => {
            const test = [...curTrick, { seat: currentSeat, card: c }];
            return evaluateTrickWinner(test, trumpSuit).winner === currentSeat;
          });

          if (winningCards.length > 0) {
            winningCards.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
            chosenCard = winningCards[0];
          } else {
            chosenCard = sortedAsc[0];
          }
        }
      }

      const idx = hand.findIndex((c) => c.id === chosenCard.id);
      if (idx !== -1) hand.splice(idx, 1);
      curTrick.push({ seat: currentSeat, card: chosenCard });
    }

    if (curTrick.length === 4) {
      const winner = evaluateTrickWinner(curTrick, trumpSuit).winner;
      if (getTeam(winner) === targetTeam) {
        teamTricksWon++;
      }
      curLeader = winner;
      curTrick = [];
      remainingRounds--;
    } else {
      break;
    }
  }

  return teamTricksWon;
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
  const beliefs = extractBeliefState(gameState);
  const isDeclarer = gameState.declarer === seat;
  const isDeclarerTeam = gameState.declarer && getTeam(gameState.declarer) === myTeam;

  // =========================================================
  // 1. OPENING LEAD STRATEGY (When Leading any trick)
  // =========================================================
  if (isOpeningLead) {
    // A. Trick 1 Opening Book: 4th highest against NT
    if (gameState.tricksHistory.length === 0 && isNT) {
      for (const suit of SUITS) {
        const inSuit = legalCards.filter((c) => c.suit === suit);
        if (inSuit.length >= 4) {
          inSuit.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
          return inSuit[3]; // 4th highest establishes long suit!
        }
      }
    }

    // B. Declarer Trump Extraction:
    // If our team holds the contract, check if opponents still hold trumps!
    if (!isNT && isDeclarerTeam) {
      const opponentTrumpsLeft = countRemainingOpponentTrumps(gameState, seat, trumpSuit);
      const myTrumps = legalCards.filter((c) => c.suit === trumpSuit);

      // If opponents still hold trumps, pull trumps with our high trumps!
      if (opponentTrumpsLeft > 0 && myTrumps.length > 0) {
        myTrumps.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        return myTrumps[0]; // Draw out defenders' trumps!
      }
      // If opponents have 0 trumps left: STOP pulling trumps and cash side-suit winners!
    }

    // C. Partner Void Ruffing (Defensive cross-ruff):
    // When defending in suit contract, lead a suit partner is known to be void in!
    if (!isNT && !isDeclarerTeam) {
      for (const suit of SUITS) {
        if (suit !== trumpSuit && beliefs[partner].voids[suit] && gameState.cardsCount[partner] > 0) {
          const leadCards = legalCards.filter((c) => c.suit === suit);
          if (leadCards.length > 0) {
            leadCards.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
            return leadCards[0]; // Partner ruffs and kills declarer's trick!
          }
        }
      }
    }

    // D. Cash Guaranteed Off-Suit Winners (Aces) - avoid cashing if opponent is known void with trumps!
    const opponentTrumpsLeft = countRemainingOpponentTrumps(gameState, seat, trumpSuit);
    const opp1 = getNextSeat(seat);
    const opp2 = getNextSeat(partner);

    const safeAces = legalCards.filter((c) => {
      if (c.rank !== 'A') return false;
      if (isNT) return true;
      if (c.suit === trumpSuit) return false;
      // If either opponent is confirmed void and still holds trumps, don't get Ace ruffed!
      if ((beliefs[opp1].voids[c.suit] || beliefs[opp2].voids[c.suit]) && opponentTrumpsLeft > 0) {
        return false;
      }
      return true;
    });

    if (safeAces.length > 0) {
      return safeAces[0];
    }

    // E. Lead Top of Honor Sequence (K from KQ, Q from QJ, J from J10)
    for (const suit of SUITS) {
      if (suit === trumpSuit) continue;
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

    // F. Lead highest card in strongest suit
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

  const sortedLegalAsc = [...legalCards].sort(
    (a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]
  );
  const sortedLegalDesc = [...legalCards].sort(
    (a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]
  );

  // A. Partner is already winning the trick:
  // DUCK with lowest legal card to conserve honors and avoid ruffing partner!
  if (partnerIsWinning) {
    return sortedLegalAsc[0];
  }

  // B. Opponent is currently winning:
  const winningPlays: Card[] = [];
  for (const card of legalCards) {
    const testTrick = [...trick, { seat, card }];
    const res = evaluateTrickWinner(testTrick, trumpSuit);
    if (res.winner === seat) {
      winningPlays.push(card);
    }
  }

  // B1. We CAN win the trick:
  if (winningPlays.length > 0) {
    // 3rd Hand when partner led: "Third Hand High"
    // Play highest winning card so 4th hand behind cannot beat us with intermediate cards
    if (trick.length === 2 && trick[0].seat === partner) {
      winningPlays.sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      return winningPlays[0];
    }

    // Otherwise (4th hand or opponent led): Take trick with CHEAPEST card that beats opponent!
    winningPlays.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    return winningPlays[0];
  }

  // C. We CANNOT win the trick:
  // Sluff lowest legal card to preserve future defensive strength
  return sortedLegalAsc[0];
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

  // Partner bidding intelligence
  const partnerBid = gameState.bids.find((b) => b.seat === partner && b.type === 'bid');

  // Distribution points (DOP)
  let dop = 0;
  const suitCounts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) suitCounts[c.suit]++;
  for (const s of SUITS) {
    if (suitCounts[s] === 0) dop += policy.partnershipCoefficients.voidBonus;
    else if (suitCounts[s] === 1) dop += policy.partnershipCoefficients.singletonBonus;
    else if (suitCounts[s] === 2) dop += policy.partnershipCoefficients.doubletonBonus;
  }
  const effectivePower = hcp + dop;
  const balanced = isHandBalanced(hand);

  // 1. Dealer Privilege Resolution on Turn 4
  if (isDealer && isFinalTurn && highest && highest.type === 'bid' && highest.level) {
    const privileges = getDealerPrivileges(highest);

    // If partner already holds the winning bid, PASS to protect partner's contract!
    if (gameState.highestBidder === partner) {
      return { seat, type: 'pass' };
    }

    // Dealer Match Suit: Steal the contract with 5+ cards in a suit and 10+ HCP!
    if (privileges.canMatchSuit && strongest.count >= 5 && (hcp >= 10 || effectivePower >= 11)) {
      return {
        seat,
        type: 'bid',
        level: privileges.matchedSuitLevel,
        contractType: 'Suit',
        isDealerPrivilegeMatch: true,
      };
    }

    // Dealer Match 1 NT: Scores DOUBLED (+2 pts), requires 14+ HCP and balanced
    if (privileges.canMatchNT && balanced && hcp >= 14) {
      return {
        seat,
        type: 'bid',
        level: privileges.matchedNTLevel,
        contractType: 'NT',
        isDealerPrivilegeMatch: true,
      };
    }

    return { seat, type: 'pass' };
  }

  // 2. Partner Protection:
  // If partner is currently the winning bidder, PASS unless holding massive hand (17+ HCP)
  if (gameState.highestBidder === partner) {
    if (hcp < 17) {
      return { seat, type: 'pass' };
    }
  }

  // 3. Match Context & Vulnerability
  const currentScore = gameState.matchScores[myTeam];
  const isCloseToElimination = currentScore <= -5;
  const isCloseToVictory = currentScore >= 8;

  // 4. Candidate Bids Generation
  const candidateBids: Array<{ level: number; type: ContractType }> = [];
  const partnerSupportBonus = partnerBid ? 3.0 : 0;

  if (!highest || highest.type === 'pass') {
    // Opening auction: Always open 1 Suit (or 1 NT / 2 NT for doubled points)
    // Never open 2 Suit because 1 Suit scores identical overtrick points with zero failure penalty!
    if ((strongest.count >= 5 && (hcp >= 10 || effectivePower >= 11)) || (strongest.count >= 4 && hcp >= 13)) {
      candidateBids.push({ level: 1, type: 'Suit' });
    }
    // High-reward 1 NT: balanced hand with 15+ HCP (scores doubled +2 pts base)
    if (balanced && hcp >= 15) {
      candidateBids.push({ level: 1, type: 'NT' });
    }
    // 2 NT: 17+ HCP balanced (scores doubled +4 pts base)
    if (balanced && hcp >= 17) {
      candidateBids.push({ level: 2, type: 'NT' });
    }
  } else {
    const minL = highest.level || 1;
    // Overbidding: 5+ cards with 11+ HCP or partner support
    const canSafelyOverbidSuit =
      (partnerBid && effectivePower >= 10) ||
      (strongest.count >= 5 && (hcp >= 11 || effectivePower >= 12));

    if (highest.contractType === 'Suit') {
      if (balanced && hcp >= 15) candidateBids.push({ level: minL, type: 'NT' });
      if (canSafelyOverbidSuit) {
        candidateBids.push({ level: minL + 1, type: 'Suit' });
      }
      if (balanced && hcp >= 17 + (minL - 1) * 2) candidateBids.push({ level: minL + 1, type: 'NT' });
    } else {
      if (canSafelyOverbidSuit) {
        candidateBids.push({ level: minL + 1, type: 'Suit' });
      }
      if (balanced && hcp >= 17 + (minL - 1) * 2) candidateBids.push({ level: minL + 1, type: 'NT' });
    }
  }

  const validCandidates = candidateBids.filter(
    (b) => b.level <= 4 && isBidHigher(b.level, b.type, highest)
  );

  if (validCandidates.length === 0) {
    return { seat, type: 'pass' };
  }

  // 5. Expected Value (EV) Evaluation
  let bestBidOption: { level: number; type: ContractType } | null = null;
  let maxEV = -999;

  for (const cand of validCandidates) {
    const requiredHCP = (cand.level - 1) * 3 + (cand.type === 'NT' ? 14 : 9);
    if (effectivePower < requiredHCP) continue;

    const tricksNeeded = 6 + cand.level;
    const estimatedPartnerHCP = partnerBid ? 11.5 : 9.5;
    const combinedHCP = hcp + estimatedPartnerHCP;

    let expectedTricks = Math.min(
      13,
      Math.max(
        3,
        4.2 + (combinedHCP / 3.3) + (cand.type === 'Suit' ? Math.max(0, strongest.count - 4) * 0.8 : 0)
      )
    );

    // Partnership fit EV bonus
    if (partnerBid && cand.type === 'Suit') {
      expectedTricks = Math.min(13, expectedTricks + policy.partnershipCoefficients.fitBonus8Trumps);
    }

    const winProb =
      expectedTricks >= tricksNeeded + 0.5
        ? 0.90
        : expectedTricks >= tricksNeeded
        ? 0.72
        : expectedTricks >= tricksNeeded - 0.5
        ? 0.42
        : 0.15;

    let ev = 0;
    if (cand.type === 'Suit') {
      const rewardIfMade = Math.max(1, expectedTricks - 6);
      const penaltyIfSet = -cand.level - Math.max(0, (13 - expectedTricks) - 6);
      ev = winProb * rewardIfMade + (1 - winProb) * penaltyIfSet;
    } else {
      // Doubled NT reward!
      const rewardIfMade = cand.level * 2 + Math.max(0, expectedTricks - tricksNeeded);
      const penaltyIfSet = -(cand.level * 2) - Math.max(0, (13 - expectedTricks) - 6);
      ev = winProb * rewardIfMade + (1 - winProb) * penaltyIfSet;
    }

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
