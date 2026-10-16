import {
  Bid,
  Card,
  ContractType,
  GameState,
  Seat,
  Suit,
  Team,
  TrumpSuit,
} from '../types.ts';
import {
  calculateRoundScores,
  checkMatchEnd,
  createInitialGameState,
  dealHands,
  evaluateTrickWinner,
  getDealerPrivileges,
  getNextSeat,
  getTeam,
  isBidHigher,
  isCardLegal,
  SEATS,
  startDealRound,
} from './gameLogic.ts';
import { getBotBid, getBotCardPlay, getBotDeclaredSuit } from './botAi.ts';
import {
  getSuperBotBid,
  getSuperBotCardPlay,
  getSuperBotDeclaredSuit,
} from './superBot.ts';

export type BotStrategy = 'casual' | 'super';

export interface SimulationConfig {
  totalMatches: number;
  teamAStrategy: BotStrategy;
  teamBStrategy: BotStrategy;
  maxRoundsPerMatch?: number;
}

export interface SimulationResult {
  totalMatches: number;
  totalRounds: number;
  teamAWins: number;
  teamBWins: number;
  teamAWinRate: number; // 0..100%
  teamBWinRate: number;
  teamAAverageTricks: number;
  teamBAverageTricks: number;
  teamABidSuccessRate: number;
  teamBBidSuccessRate: number;
  teamATotalContracts: number;
  teamBTotalContracts: number;
  teamASuccessfulContracts: number;
  teamBSuccessfulContracts: number;
  averageRoundsPerMatch: number;
  durationMs: number;
}

// Helper to get bid according to team strategy
function getBidForSeat(state: GameState, seat: Seat, strategy: BotStrategy): Bid {
  if (strategy === 'super') {
    return getSuperBotBid(state, seat);
  }
  return getBotBid(state, seat);
}

// Helper to get declared trump according to team strategy
function getDeclaredSuitForSeat(state: GameState, seat: Seat, strategy: BotStrategy): Suit {
  if (strategy === 'super') {
    return getSuperBotDeclaredSuit(state.hands[seat], state, seat);
  }
  return getBotDeclaredSuit(state.hands[seat]);
}

// Helper to get card play according to team strategy
function getCardPlayForSeat(state: GameState, seat: Seat, trump: TrumpSuit, strategy: BotStrategy): Card {
  if (strategy === 'super') {
    return getSuperBotCardPlay(state, seat, trump);
  }
  return getBotCardPlay(state, seat, trump);
}

// Runs a single complete round headlessly
export function simulateSingleRound(
  state: GameState,
  teamAStrategy: BotStrategy,
  teamBStrategy: BotStrategy
): GameState {
  let curState = { ...state };
  const getStrategy = (seat: Seat) => (getTeam(seat) === 'TeamA' ? teamAStrategy : teamBStrategy);

  // 1. Auction Phase (4 turns)
  while (curState.phase === 'bidding' && curState.currentBidder) {
    const seat = curState.currentBidder;
    const strat = getStrategy(seat);
    const bid = getBidForSeat(curState, seat, strat);

    const isDealer = curState.dealer === seat;
    const isFinalTurn = curState.auctionTurnsCount === 3;

    if (bid.type === 'pass') {
      curState.bids.push({ seat, type: 'pass' });
    } else {
      if (isDealer && isFinalTurn && bid.isDealerPrivilegeMatch) {
        curState.bids.push(bid);
        curState.highestBid = bid;
        curState.highestBidder = seat;
      } else if (bid.level && bid.contractType && isBidHigher(bid.level, bid.contractType, curState.highestBid)) {
        curState.bids.push(bid);
        curState.highestBid = bid;
        curState.highestBidder = seat;
      } else {
        curState.bids.push({ seat, type: 'pass' });
      }
    }

    curState.auctionTurnsCount++;

    if (curState.auctionTurnsCount < 4) {
      curState.currentBidder = getNextSeat(seat);
    } else {
      // Auction over
      curState.currentBidder = null;
      if (!curState.highestBid || curState.highestBid.type === 'pass') {
        // All 4 passed -> Redeal next dealer
        const nextDealer = getNextSeat(curState.dealer);
        curState = startDealRound(curState, nextDealer);
        continue;
      }

      curState.winningBid = curState.highestBid;
      curState.declarer = curState.highestBidder;

      if (curState.winningBid.contractType === 'Suit') {
        curState.phase = 'declaring';
      } else {
        curState.phase = 'playing';
        curState.trumpSuit = 'NT';
        curState.currentTurn = curState.declarer;
      }
    }
  }

  // 2. Declaration Phase (if Suit)
  if (curState.phase === 'declaring' && curState.declarer) {
    const declarer = curState.declarer;
    const strat = getStrategy(declarer);
    const suit = getDeclaredSuitForSeat(curState, declarer, strat);
    curState.trumpSuit = suit;
    curState.phase = 'playing';
    curState.currentTurn = getNextSeat(declarer);
  }

  // 3. Trick Play Phase (13 tricks)
  while (curState.phase === 'playing' && curState.currentTurn) {
    const seat = curState.currentTurn;
    const strat = getStrategy(seat);
    const trump = curState.trumpSuit!;
    const card = getCardPlayForSeat(curState, seat, trump, strat);

    const hand = curState.hands[seat];
    const cIdx = hand.findIndex((c) => c.id === card.id);
    if (cIdx !== -1) {
      hand.splice(cIdx, 1);
    }
    curState.cardsCount[seat] = hand.length;
    curState.currentTrick.push({ seat, card });

    if (curState.currentTrick.length < 4) {
      curState.currentTurn = getNextSeat(seat);
    } else {
      // Trick complete
      const trickResult = evaluateTrickWinner(curState.currentTrick, trump);
      const winner = trickResult.winner;
      const winnerTeam = getTeam(winner);

      curState.tricksWonCount[winner]++;
      curState.teamTricksWon[winnerTeam]++;

      curState.tricksHistory.push({
        trickNumber: curState.tricksHistory.length + 1,
        leader: curState.currentTrick[0].seat,
        cards: [...curState.currentTrick],
        winner,
        winningCard: trickResult.winningCard,
        ledSuit: curState.currentTrick[0].card.suit,
      });

      curState.currentTrick = [];

      // Check if all 13 tricks played
      if (curState.tricksHistory.length === 13) {
        // Scoring
        const breakdown = calculateRoundScores(
          curState.winningBid!,
          curState.declarer!,
          curState.trumpSuit!,
          curState.roundNumber,
          curState.teamTricksWon
        );

        if (!curState.roundScores) curState.roundScores = [];
        curState.roundScores.push(breakdown);
        curState.matchScores.TeamA += breakdown.scoreDeltaBidTeam * (breakdown.contractTeam === 'TeamA' ? 1 : 0) + breakdown.scoreDeltaDefTeam * (breakdown.defendingTeam === 'TeamA' ? 1 : 0);
        curState.matchScores.TeamB += breakdown.scoreDeltaBidTeam * (breakdown.contractTeam === 'TeamB' ? 1 : 0) + breakdown.scoreDeltaDefTeam * (breakdown.defendingTeam === 'TeamB' ? 1 : 0);

        const matchResult = checkMatchEnd(curState.matchScores);
        if (matchResult.isOver) {
          curState.phase = 'game_over';
          curState.winnerTeam = matchResult.winnerTeam;
          curState.winnerReason = matchResult.reason;
        } else {
          curState.phase = 'round_over';
        }
        curState.currentTurn = null;
      } else {
        curState.currentTurn = winner;
      }
    }
  }

  return curState;
}

// Runs a full match until victory (+11) or elimination (-11)
export function simulateSingleMatch(
  teamAStrategy: BotStrategy,
  teamBStrategy: BotStrategy,
  maxRounds: number = 20
): {
  winner: Team;
  roundsPlayed: number;
  finalScores: { TeamA: number; TeamB: number };
  teamATricks: number;
  teamBTricks: number;
  teamABidsAttempted: number;
  teamBBidsAttempted: number;
  teamABidsWon: number;
  teamBBidsWon: number;
} {
  let state = createInitialGameState('North');
  state = startDealRound(state, 'North');

  let teamATricks = 0;
  let teamBTricks = 0;
  let teamABidsAttempted = 0;
  let teamBBidsAttempted = 0;
  let teamABidsWon = 0;
  let teamBBidsWon = 0;
  let roundsCount = 0;

  while (state.phase !== 'game_over' && roundsCount < maxRounds) {
    state = simulateSingleRound(state, teamAStrategy, teamBStrategy);
    roundsCount++;

    const lastRound = state.roundScores[state.roundScores.length - 1];
    if (lastRound) {
      teamATricks += state.teamTricksWon.TeamA;
      teamBTricks += state.teamTricksWon.TeamB;

      if (lastRound.contractTeam === 'TeamA') {
        teamABidsAttempted++;
        if (lastRound.bidSuccess) teamABidsWon++;
      } else {
        teamBBidsAttempted++;
        if (lastRound.bidSuccess) teamBBidsWon++;
      }
    }

    if (state.phase === 'round_over') {
      const nextDealer = getNextSeat(state.dealer);
      state = startDealRound(state, nextDealer);
      state.roundNumber = roundsCount + 1;
    }
  }

  const winner: Team =
    state.winnerTeam ||
    (state.matchScores.TeamA >= state.matchScores.TeamB ? 'TeamA' : 'TeamB');

  return {
    winner,
    roundsPlayed: roundsCount,
    finalScores: { ...state.matchScores },
    teamATricks,
    teamBTricks,
    teamABidsAttempted,
    teamBBidsAttempted,
    teamABidsWon,
    teamBBidsWon,
  };
}

// High-level batch simulator
export async function runBatchSimulation(
  config: SimulationConfig,
  onProgress?: (completed: number, total: number) => void
): Promise<SimulationResult> {
  const startTime = Date.now();
  const { totalMatches, teamAStrategy, teamBStrategy, maxRoundsPerMatch = 25 } = config;

  let teamAWins = 0;
  let teamBWins = 0;
  let totalRounds = 0;
  let totalTeamATricks = 0;
  let totalTeamBTricks = 0;
  let teamAContracts = 0;
  let teamBContracts = 0;
  let teamASuccessful = 0;
  let teamBSuccessful = 0;

  for (let i = 0; i < totalMatches; i++) {
    const match = simulateSingleMatch(teamAStrategy, teamBStrategy, maxRoundsPerMatch);

    if (match.winner === 'TeamA') teamAWins++;
    else teamBWins++;

    totalRounds += match.roundsPlayed;
    totalTeamATricks += match.teamATricks;
    totalTeamBTricks += match.teamBTricks;
    teamAContracts += match.teamABidsAttempted;
    teamBContracts += match.teamBBidsAttempted;
    teamASuccessful += match.teamABidsWon;
    teamBSuccessful += match.teamBBidsWon;

    if (onProgress && (i + 1) % 5 === 0) {
      onProgress(i + 1, totalMatches);
    }

    // Micro-yield every 25 matches to keep event loop and server completely responsive
    if (i % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    totalMatches,
    totalRounds,
    teamAWins,
    teamBWins,
    teamAWinRate: totalMatches > 0 ? Math.round((teamAWins / totalMatches) * 100) : 0,
    teamBWinRate: totalMatches > 0 ? Math.round((teamBWins / totalMatches) * 100) : 0,
    teamAAverageTricks: totalRounds > 0 ? Number((totalTeamATricks / totalRounds).toFixed(2)) : 0,
    teamBAverageTricks: totalRounds > 0 ? Number((totalTeamBTricks / totalRounds).toFixed(2)) : 0,
    teamABidSuccessRate: teamAContracts > 0 ? Math.round((teamASuccessful / teamAContracts) * 100) : 0,
    teamBBidSuccessRate: teamBContracts > 0 ? Math.round((teamBSuccessful / teamBContracts) * 100) : 0,
    teamATotalContracts: teamAContracts,
    teamBTotalContracts: teamBContracts,
    teamASuccessfulContracts: teamASuccessful,
    teamBSuccessfulContracts: teamBSuccessful,
    averageRoundsPerMatch: totalMatches > 0 ? Number((totalRounds / totalMatches).toFixed(1)) : 0,
    durationMs,
  };
}
