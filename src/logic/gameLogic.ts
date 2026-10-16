import {
  Card,
  Rank,
  Seat,
  Suit,
  Team,
  TrumpSuit,
  ContractType,
  Bid,
  PlayedCard,
  TrickResult,
  RoundScoreBreakdown,
  GameState,
} from '../types.ts';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const SUIT_NAMES: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

export const SUIT_COLORS: Record<Suit, string> = {
  S: 'text-slate-900',
  H: 'text-red-600',
  D: 'text-red-600',
  C: 'text-slate-900',
};

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

// Fixed cardinal seats
export const SEATS: Seat[] = ['North', 'West', 'South', 'East'];

// Counter-Clockwise (Right):
// Top (North) -> Left (West) -> Bottom (South) -> Right (East) -> Top (North)
export function getNextSeat(seat: Seat): Seat {
  switch (seat) {
    case 'North':
      return 'West';
    case 'West':
      return 'South';
    case 'South':
      return 'East';
    case 'East':
      return 'North';
  }
}

export function getPrevSeat(seat: Seat): Seat {
  switch (seat) {
    case 'North':
      return 'East';
    case 'East':
      return 'South';
    case 'South':
      return 'West';
    case 'West':
      return 'North';
  }
}

export function getTeam(seat: Seat): Team {
  return seat === 'North' || seat === 'South' ? 'TeamA' : 'TeamB';
}

export function getTeamName(team: Team): string {
  return team === 'TeamA' ? 'Team 1' : 'Team 2';
}

export function getPartner(seat: Seat): Seat {
  switch (seat) {
    case 'North':
      return 'South';
    case 'South':
      return 'North';
    case 'East':
      return 'West';
    case 'West':
      return 'East';
  }
}

// Generate Standard 52 Card Deck
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}${suit}`,
        suit,
        rank,
      });
    }
  }
  return deck;
}

// Fisher-Yates Shuffle
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Sort hand by suit and rank descending
export function sortHand(hand: Card[], trumpSuit: TrumpSuit | null = null): Card[] {
  const suitOrder: Record<Suit, number> = {
    S: 3,
    H: 2,
    C: 1,
    D: 0,
  };

  return [...hand].sort((a, b) => {
    if (trumpSuit && trumpSuit !== 'NT') {
      if (a.suit === trumpSuit && b.suit !== trumpSuit) return -1;
      if (b.suit === trumpSuit && a.suit !== trumpSuit) return 1;
    }
    if (a.suit !== b.suit) {
      return suitOrder[b.suit] - suitOrder[a.suit];
    }
    return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
  });
}

// Deal 13 cards to each player
export function dealHands(): Record<Seat, Card[]> {
  const deck = shuffleDeck(createDeck());
  const hands: Record<Seat, Card[]> = {
    North: [],
    West: [],
    South: [],
    East: [],
  };

  // Deal 13 cards counter-clockwise starting right of dealer or standard rotation
  for (let i = 0; i < 52; i++) {
    const seat = SEATS[i % 4];
    hands[seat].push(deck[i]);
  }

  // Sort each hand
  for (const seat of SEATS) {
    hands[seat] = sortHand(hands[seat]);
  }

  return hands;
}

// Bid Value Hierarchy:
// 1 Suit < 1 NT < 2 Suit < 2 NT < ... < 7 Suit < 7 NT
export function getBidRank(level: number, contractType: ContractType): number {
  return level * 2 + (contractType === 'NT' ? 1 : 0);
}

export function isBidHigher(
  candidateLevel: number,
  candidateType: ContractType,
  currentHighest: Bid | null
): boolean {
  if (!currentHighest || currentHighest.type === 'pass' || !currentHighest.level || !currentHighest.contractType) {
    return true;
  }
  return getBidRank(candidateLevel, candidateType) > getBidRank(currentHighest.level, currentHighest.contractType);
}

// Dealer Privileges Validation
export interface DealerPrivileges {
  canPass: boolean;
  canMatchSuit: boolean;
  matchedSuitLevel?: number;
  canMatchNT: boolean;
  matchedNTLevel?: number;
  canExceedNT: boolean;
}

export function getDealerPrivileges(highestBid: Bid | null): DealerPrivileges {
  if (!highestBid || highestBid.type === 'pass' || !highestBid.level || !highestBid.contractType) {
    return {
      canPass: true,
      canMatchSuit: false,
      canMatchNT: false,
      canExceedNT: false,
    };
  }

  const highestLevel = highestBid.level;
  if (highestBid.contractType === 'Suit') {
    return {
      canPass: true,
      canMatchSuit: true,
      matchedSuitLevel: highestLevel,
      canMatchNT: false,
      canExceedNT: highestLevel < 7,
    };
  } else {
    // If highest bid reached dealer as NT (e.g. 2 NT):
    // Dealer can take NT with the same number or higher.
    // If dealer wants to take it Suit, it must be one or more higher (e.g. 3 Suit or above).
    return {
      canPass: true,
      canMatchSuit: false, // Cannot take Suit at same level when highest is NT!
      canMatchNT: true,
      matchedNTLevel: highestLevel,
      canExceedNT: highestLevel < 7,
    };
  }
}

// Validates whether candidate bid is legal for a player.
// If isDealerFinalTurn is true, dealer privileges apply:
// - If highest bid is Suit: dealer can match the suit bid at the same level (or bid higher).
// - If highest bid is NT: dealer can take NT with the same level or higher, or take Suit at level + 1 or higher.
export function isLegalBid(
  level: number,
  contractType: ContractType,
  highestBid: Bid | null,
  isDealerFinalTurn: boolean = false
): boolean {
  if (level < 1 || level > 7) return false;

  if (!highestBid || highestBid.type === 'pass' || !highestBid.level || !highestBid.contractType) {
    return true;
  }

  // Check standard higher bid
  if (isBidHigher(level, contractType, highestBid)) {
    return true;
  }

  // Dealer privilege on final turn (turn 4):
  if (isDealerFinalTurn) {
    if (highestBid.contractType === 'Suit') {
      // Can match suit bid at same level
      if (contractType === 'Suit' && level === highestBid.level) {
        return true;
      }
    } else if (highestBid.contractType === 'NT') {
      // Can take NT with the same number or higher
      if (contractType === 'NT' && level === highestBid.level) {
        return true;
      }
      // Note: If taking Suit, level must be >= highestBid.level + 1,
      // which is already covered above by isBidHigher!
    }
  }

  return false;
}

// Checks if a bid is specifically utilizing the dealer's special match privilege
export function isDealerPrivilegeMatch(
  level: number,
  contractType: ContractType,
  highestBid: Bid | null,
  isDealerFinalTurn: boolean
): boolean {
  if (!isDealerFinalTurn || !highestBid || highestBid.type !== 'bid' || !highestBid.level || !highestBid.contractType) {
    return false;
  }

  if (highestBid.contractType === 'Suit') {
    return contractType === 'Suit' && level === highestBid.level;
  }

  if (highestBid.contractType === 'NT') {
    return contractType === 'NT' && level === highestBid.level;
  }

  return false;
}

// Card play legal check (Mandatory Follow)
export function isCardLegal(card: Card, hand: Card[], ledSuit: Suit | null): boolean {
  if (!ledSuit) return true; // Opening lead
  const hasLedSuit = hand.some((c) => c.suit === ledSuit);
  if (!hasLedSuit) return true; // Void in led suit, can play anything
  return card.suit === ledSuit;
}

// Trick Winner Evaluation
// 1. Highest Trump wins (Suit game only)
// 2. Otherwise, highest card of led suit wins
export function evaluateTrickWinner(cards: PlayedCard[], trumpSuit: TrumpSuit): { winner: Seat; winningCard: Card } {
  if (cards.length === 0) {
    throw new Error('Trick has no cards');
  }

  const ledSuit = cards[0].card.suit;
  const isSuitGame = trumpSuit !== 'NT';

  let bestPlay = cards[0];

  for (let i = 1; i < cards.length; i++) {
    const play = cards[i];
    const bestCard = bestPlay.card;
    const currentCard = play.card;

    if (isSuitGame) {
      const bestIsTrump = bestCard.suit === trumpSuit;
      const currentIsTrump = currentCard.suit === trumpSuit;

      if (currentIsTrump && !bestIsTrump) {
        bestPlay = play;
      } else if (currentIsTrump && bestIsTrump) {
        if (RANK_VALUES[currentCard.rank] > RANK_VALUES[bestCard.rank]) {
          bestPlay = play;
        }
      } else if (!currentIsTrump && !bestIsTrump) {
        if (currentCard.suit === ledSuit && bestCard.suit === ledSuit) {
          if (RANK_VALUES[currentCard.rank] > RANK_VALUES[bestCard.rank]) {
            bestPlay = play;
          }
        }
      }
    } else {
      // NT Game: Only led suit counts
      if (currentCard.suit === ledSuit && bestCard.suit === ledSuit) {
        if (RANK_VALUES[currentCard.rank] > RANK_VALUES[bestCard.rank]) {
          bestPlay = play;
        }
      }
    }
  }

  return {
    winner: bestPlay.seat,
    winningCard: bestPlay.card,
  };
}

// Phase 5: Scoring Engine
// Scoring is based on tricks won above the base of 6.
// Let L = Bid Level
export function calculateRoundScores(
  bid: Bid,
  declarer: Seat,
  trumpSuit: TrumpSuit,
  roundNumber: number,
  teamTricksWon: { TeamA: number; TeamB: number }
): RoundScoreBreakdown {
  const contractTeam = getTeam(declarer);
  const defendingTeam = contractTeam === 'TeamA' ? 'TeamB' : 'TeamA';

  const bidLevel = bid.level || 1;
  const contractType = bid.contractType || 'Suit';

  const tricksWonBidTeam = teamTricksWon[contractTeam];
  const tricksWonDefTeam = teamTricksWon[defendingTeam];

  const tricksNeeded = 6 + bidLevel;
  const bidSuccess = tricksWonBidTeam >= tricksNeeded;

  let scoreDeltaBidTeam = 0;
  let scoreDeltaDefTeam = 0;
  const explanation: string[] = [];

  explanation.push(
    `Declarer ${declarer} (${getTeamName(contractTeam)}) bid ${bidLevel} ${contractType} (contract requires ${tricksNeeded} tricks).`
  );
  explanation.push(
    `Result: ${getTeamName(contractTeam)} won ${tricksWonBidTeam} tricks. ${getTeamName(defendingTeam)} won ${tricksWonDefTeam} tricks.`
  );

  if (contractType === 'Suit') {
    // 2.6 A. Suit Contracts
    if (bidSuccess) {
      // Bidding Team: +1 point per trick over 6
      const overSix = tricksWonBidTeam - 6;
      scoreDeltaBidTeam = overSix;
      scoreDeltaDefTeam = 0;
      explanation.push(
        `Bid Made: ${getTeamName(contractTeam)} won ${tricksWonBidTeam} tricks (${overSix} tricks over base 6). +${scoreDeltaBidTeam} pts.`
      );
      explanation.push(`Defending team gets 0 pts.`);
    } else {
      // Bidding Team: -L points (negative penalty equal to bid level)
      // Defending Team: +1 point per trick they won over 6
      scoreDeltaBidTeam = -bidLevel;
      const defOverSix = Math.max(0, tricksWonDefTeam - 6);
      scoreDeltaDefTeam = defOverSix;
      explanation.push(
        `Bid Set (Failed): ${getTeamName(contractTeam)} fell short of ${tricksNeeded} tricks. Penalty: -${bidLevel} pts.`
      );
      explanation.push(
        `Defending ${getTeamName(defendingTeam)} won ${tricksWonDefTeam} tricks (${defOverSix} over base 6): +${scoreDeltaDefTeam} pts.`
      );
    }
  } else {
    // 2.6 B. No Trump Contracts (Doubled)
    if (bidSuccess) {
      // Bidding Team: (L × 2) + 1 point for each additional overtrick
      // (Example: Bid 2 NT, Win 9 Tricks = 4 pts for contract + 1 pt for extra trick = 5 pts)
      const baseContractPoints = bidLevel * 2;
      const extraOvertricks = Math.max(0, tricksWonBidTeam - tricksNeeded);
      scoreDeltaBidTeam = baseContractPoints + extraOvertricks;
      scoreDeltaDefTeam = 0;
      explanation.push(
        `Bid Made (NT): Contract base (${bidLevel} × 2) = ${baseContractPoints} pts + ${extraOvertricks} overtrick(s) = +${scoreDeltaBidTeam} pts.`
      );
      explanation.push(`Defending team gets 0 pts.`);
    } else {
      // Failure (Set):
      // Bidding Team: -(L × 2) points
      // Defending Team: Points calculated using NT rules for their tricks over 6.
      // (First L tricks over 6 are worth 2 pts each; any further tricks are worth 1 pt).
      scoreDeltaBidTeam = -(bidLevel * 2);
      const defOverSix = Math.max(0, tricksWonDefTeam - 6);
      let defPoints = 0;
      if (defOverSix > 0) {
        const doubleTricks = Math.min(defOverSix, bidLevel);
        const singleTricks = Math.max(0, defOverSix - bidLevel);
        defPoints = doubleTricks * 2 + singleTricks * 1;
      }
      scoreDeltaDefTeam = defPoints;
      explanation.push(
        `Bid Set (NT Failed): Penalty for ${getTeamName(contractTeam)} is -(${bidLevel} × 2) = ${scoreDeltaBidTeam} pts.`
      );
      explanation.push(
        `Defending ${getTeamName(defendingTeam)} won ${tricksWonDefTeam} tricks (${defOverSix} over 6). NT scoring: +${scoreDeltaDefTeam} pts.`
      );
    }
  }

  return {
    roundNumber,
    declarer,
    contractTeam,
    defendingTeam,
    bidLevel,
    contractType,
    trumpSuit,
    tricksWonBidTeam,
    tricksWonDefTeam,
    bidSuccess,
    scoreDeltaBidTeam,
    scoreDeltaDefTeam,
    explanation,
  };
}

// 2.7 Win/Loss Conditions
// Victory Condition: First team to reach +10 points.
// Elimination Condition: First team to drop to -10 points.
// Priority Rule: If a single round triggers both conditions, +10 (Victory) takes precedence.
export function checkMatchEnd(scores: { TeamA: number; TeamB: number }): {
  isOver: boolean;
  winnerTeam: Team | null;
  reason: string | null;
} {
  const { TeamA, TeamB } = scores;

  const teamAVictory = TeamA >= 10;
  const teamBVictory = TeamB >= 10;
  const teamAEliminated = TeamA <= -10;
  const teamBEliminated = TeamB <= -10;

  // Check victory conditions first (+10 takes precedence over -10)
  if (teamAVictory && teamBVictory) {
    if (TeamA > TeamB) {
      return { isOver: true, winnerTeam: 'TeamA', reason: `Team 1 reached +10 (${TeamA} pts) ahead of Team 2 (${TeamB} pts)` };
    } else if (TeamB > TeamA) {
      return { isOver: true, winnerTeam: 'TeamB', reason: `Team 2 reached +10 (${TeamB} pts) ahead of Team 1 (${TeamA} pts)` };
    } else {
      return { isOver: true, winnerTeam: 'TeamA', reason: `Both teams tied at +10. Team 1 holds victory precedence.` };
    }
  }

  if (teamAVictory) {
    return { isOver: true, winnerTeam: 'TeamA', reason: `Team 1 reached +10 points (Score: ${TeamA})!` };
  }

  if (teamBVictory) {
    return { isOver: true, winnerTeam: 'TeamB', reason: `Team 2 reached +10 points (Score: ${TeamB})!` };
  }

  // Check elimination conditions (-10)
  if (teamAEliminated && teamBEliminated) {
    if (TeamA > TeamB) {
      return { isOver: true, winnerTeam: 'TeamA', reason: `Team 2 eliminated at ${TeamB} pts (Team 1: ${TeamA} pts).` };
    } else {
      return { isOver: true, winnerTeam: 'TeamB', reason: `Team 1 eliminated at ${TeamA} pts (Team 2: ${TeamB} pts).` };
    }
  }

  if (teamAEliminated) {
    return { isOver: true, winnerTeam: 'TeamB', reason: `Team 1 eliminated by reaching -10 points (Score: ${TeamA}). Team 2 Wins!` };
  }

  if (teamBEliminated) {
    return { isOver: true, winnerTeam: 'TeamA', reason: `Team 2 eliminated by reaching -10 points (Score: ${TeamB}). Team 1 Wins!` };
  }

  return { isOver: false, winnerTeam: null, reason: null };
}

// Initial Game State Factory
export function createInitialGameState(initialDealer: Seat = 'North'): GameState {
  return {
    phase: 'waiting',
    roundNumber: 1,
    dealer: initialDealer,
    hands: {
      North: [],
      West: [],
      South: [],
      East: [],
    },
    cardsCount: {
      North: 0,
      West: 0,
      South: 0,
      East: 0,
    },
    auctionTurnsCount: 0,
    currentBidder: null,
    openingBidder: null,
    bids: [],
    highestBid: null,
    highestBidder: null,
    winningBid: null,
    declarer: null,
    trumpSuit: null,
    currentTurn: null,
    currentTrick: [],
    tricksHistory: [],
    tricksWonCount: {
      North: 0,
      West: 0,
      South: 0,
      East: 0,
    },
    teamTricksWon: {
      TeamA: 0,
      TeamB: 0,
    },
    matchScores: {
      TeamA: 0,
      TeamB: 0,
    },
    roundScores: [],
    winnerTeam: null,
    winnerReason: null,
  };
}

// Unwinnable Hand / Misdeal Validation
// A hand is considered to have "winning cards" if it contains AT LEAST ONE of:
// 1) Any Ace
// 2) Any King with at least 1 other card of the same suit (suit length >= 2)
// 3) Any Queen with at least 2 other cards of the same suit (suit length >= 3)
// 4) Any Jack with at least 3 other cards of the same suit (suit length >= 4)
// If a hand has NONE of the above, it has no winning cards ("Kosh" / unwinnable hand).
export function hasWinningCards(hand: Card[]): boolean {
  if (!hand || hand.length === 0) return true;

  const suitCounts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const card of hand) {
    suitCounts[card.suit]++;
  }

  for (const card of hand) {
    if (card.rank === 'A') {
      return true;
    }
    if (card.rank === 'K' && suitCounts[card.suit] >= 2) {
      return true;
    }
    if (card.rank === 'Q' && suitCounts[card.suit] >= 3) {
      return true;
    }
    if (card.rank === 'J' && suitCounts[card.suit] >= 4) {
      return true;
    }
  }

  return false;
}

// Scans all 4 dealt hands to see if any player has no winning cards
export function findSeatWithoutWinningCards(hands: Record<Seat, Card[]>): Seat | null {
  for (const seat of SEATS) {
    const hand = hands[seat];
    if (hand && hand.length > 0 && !hasWinningCards(hand)) {
      return seat;
    }
  }
  return null;
}

// Start Deal Phase
export function startDealRound(
  state: GameState,
  dealerSeat: Seat,
  preDealtHands?: Record<Seat, Card[]>
): GameState {
  const hands = preDealtHands || dealHands();
  const openingBidder = getNextSeat(dealerSeat); // Player to the right of the dealer

  return {
    ...state,
    phase: 'bidding',
    dealer: dealerSeat,
    misdealInfo: null,
    hands,
    cardsCount: {
      North: 13,
      West: 13,
      South: 13,
      East: 13,
    },
    auctionTurnsCount: 0,
    openingBidder,
    currentBidder: openingBidder,
    bids: [],
    highestBid: null,
    highestBidder: null,
    winningBid: null,
    declarer: null,
    trumpSuit: null,
    currentTurn: null,
    currentTrick: [],
    tricksHistory: [],
    tricksWonCount: {
      North: 0,
      West: 0,
      South: 0,
      East: 0,
    },
    teamTricksWon: {
      TeamA: 0,
      TeamB: 0,
    },
  };
}
