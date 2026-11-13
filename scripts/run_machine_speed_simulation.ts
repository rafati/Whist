/**
 * Pure machine-speed 1,000 game simulation between:
 * - Team A (North & South): Built-in Pro Bot (SuperBot with Bayesian & Signaling)
 * - Team B (West & East): WhistAPI Engine Bot (HeuristicPolicy + Tactical Solver)
 *
 * Runs 100% in-memory with ZERO network calls, ZERO timeouts, ZERO delays.
 */

import fs from 'fs';
import {
  calculateRoundScores,
  checkMatchEnd,
  createInitialGameState,
  evaluateTrickWinner,
  getNextSeat,
  getTeam,
  isBidHigher,
  isCardLegal,
  startDealRound,
} from '../src/logic/gameLogic.ts';
import { getSuperBotBid, getSuperBotCardPlay, getSuperBotDeclaredSuit } from '../src/logic/superBot.ts';
import {
  getWhistApiBotBid,
  getWhistApiBotCardPlay,
  getWhistApiBotTrump,
} from '../src/logic/whistApiBot.ts';
import { Bid, Card, GameState, Seat, Team } from '../src/types.ts';

export interface MatchStats {
  matchIndex: number;
  winner: Team;
  rounds: number;
  teamAScore: number;
  teamBScore: number;
  teamATricks: number;
  teamBTricks: number;
  teamAContractsAttempted: number;
  teamAContractsMade: number;
  teamBContractsAttempted: number;
  teamBContractsMade: number;
  durationMs: number;
}

export function runSingleMatchFast(matchIndex: number): MatchStats {
  const t0 = Date.now();
  let state = createInitialGameState('North');
  state = startDealRound(state, 'North');
  const apiSeats: Seat[] = ['West', 'East'];

  let roundsCount = 0;
  let teamATricks = 0;
  let teamBTricks = 0;
  let teamAContractsAttempted = 0;
  let teamAContractsMade = 0;
  let teamBContractsAttempted = 0;
  let teamBContractsMade = 0;

  while (state.phase !== 'game_over' && roundsCount < 30) {
    roundsCount++;

    // Auction Phase
    while (state.phase === 'bidding' && state.currentBidder) {
      const seat = state.currentBidder;
      const isApi = apiSeats.includes(seat);
      const bid: Bid = isApi ? getWhistApiBotBid(state, seat) : getSuperBotBid(state, seat);

      const isDealer = state.dealer === seat;
      const isFinalTurn = state.auctionTurnsCount === 3;

      if (bid.type === 'pass') {
        state.bids.push({ seat, type: 'pass' });
      } else {
        if (isDealer && isFinalTurn && bid.isDealerPrivilegeMatch) {
          state.bids.push(bid);
          state.highestBid = bid;
          state.highestBidder = seat;
        } else if (bid.level && bid.contractType && isBidHigher(bid.level, bid.contractType, state.highestBid)) {
          state.bids.push(bid);
          state.highestBid = bid;
          state.highestBidder = seat;
        } else {
          state.bids.push({ seat, type: 'pass' });
        }
      }

      state.auctionTurnsCount++;
      if (state.auctionTurnsCount < 4) {
        state.currentBidder = getNextSeat(seat);
      } else {
        state.currentBidder = null;
        if (!state.highestBid || state.highestBid.type === 'pass') {
          const nextDealer = getNextSeat(state.dealer);
          state = startDealRound(state, nextDealer);
          break;
        }

        state.winningBid = state.highestBid;
        state.declarer = state.highestBidder;
        if (state.winningBid.contractType === 'Suit') {
          state.phase = 'declaring';
        } else {
          state.phase = 'playing';
          state.trumpSuit = 'NT';
          state.currentTurn = state.declarer;
        }
      }
    }

    if (state.phase === 'declaring' && state.declarer) {
      const declarer = state.declarer;
      const suit = apiSeats.includes(declarer)
        ? getWhistApiBotTrump(state.hands[declarer])
        : getSuperBotDeclaredSuit(state.hands[declarer], state, declarer);
      state.trumpSuit = suit;
      state.phase = 'playing';
      state.currentTurn = getNextSeat(declarer);
    }

    // Card Play Phase
    while (state.phase === 'playing' && state.currentTurn) {
      const seat = state.currentTurn;
      const isApi = apiSeats.includes(seat);
      const trump = state.trumpSuit!;
      const card: Card = isApi
        ? getWhistApiBotCardPlay(state, seat, trump)
        : getSuperBotCardPlay(state, seat, trump);

      const hand = state.hands[seat];
      const cIdx = hand.findIndex((c) => c.id === card.id);
      if (cIdx !== -1) hand.splice(cIdx, 1);
      state.cardsCount[seat] = hand.length;
      state.currentTrick.push({ seat, card });

      if (state.currentTrick.length < 4) {
        state.currentTurn = getNextSeat(seat);
      } else {
        const trickResult = evaluateTrickWinner(state.currentTrick, trump);
        const winner = trickResult.winner;
        const winnerTeam = getTeam(winner);
        state.tricksWonCount[winner]++;
        state.teamTricksWon[winnerTeam]++;
        state.tricksHistory.push({
          trickNumber: state.tricksHistory.length + 1,
          leader: state.currentTrick[0].seat,
          cards: [...state.currentTrick],
          winner,
          winningCard: trickResult.winningCard,
          ledSuit: state.currentTrick[0].card.suit,
        });
        state.currentTrick = [];

        if (state.tricksHistory.length === 13) {
          teamATricks += state.teamTricksWon.TeamA;
          teamBTricks += state.teamTricksWon.TeamB;

          const roundScore = calculateRoundScores(
            state.winningBid!,
            state.declarer!,
            state.trumpSuit!,
            roundsCount,
            state.teamTricksWon
          );
          state.roundScores.push(roundScore);

          if (roundScore.contractTeam === 'TeamA') {
            teamAContractsAttempted++;
            if (roundScore.bidSuccess) teamAContractsMade++;
          } else {
            teamBContractsAttempted++;
            if (roundScore.bidSuccess) teamBContractsMade++;
          }

          state.matchScores.TeamA +=
            roundScore.contractTeam === 'TeamA' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;
          state.matchScores.TeamB +=
            roundScore.contractTeam === 'TeamB' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;

          const matchResult = checkMatchEnd(state.matchScores);
          if (matchResult.isOver) {
            state.phase = 'game_over';
            state.winnerTeam = matchResult.winnerTeam;
          } else {
            state.phase = 'round_over';
            state = startDealRound(state, getNextSeat(state.dealer));
          }
          state.currentTurn = null;
        } else {
          state.currentTurn = winner;
        }
      }
    }
  }

  return {
    matchIndex,
    winner: state.winnerTeam || (state.matchScores.TeamA >= state.matchScores.TeamB ? 'TeamA' : 'TeamB'),
    rounds: roundsCount,
    teamAScore: state.matchScores.TeamA,
    teamBScore: state.matchScores.TeamB,
    teamATricks,
    teamBTricks,
    teamAContractsAttempted,
    teamAContractsMade,
    teamBContractsAttempted,
    teamBContractsMade,
    durationMs: Date.now() - t0,
  };
}

export function runMachineSpeedBatch(totalMatches: number = 1000) {
  console.log(`\n⚡ Running PURE MACHINE-SPEED simulation of ${totalMatches} matches...`);
  console.log(`Partnerships: Team A (SuperBot - North & South) vs Team B (WhistAPI Engine - West & East)`);
  const tStart = Date.now();
  const results: MatchStats[] = [];

  for (let i = 1; i <= totalMatches; i++) {
    results.push(runSingleMatchFast(i));
  }

  const totalTimeSec = ((Date.now() - tStart) / 1000).toFixed(3);
  const teamAWins = results.filter((r) => r.winner === 'TeamA').length;
  const teamBWins = results.filter((r) => r.winner === 'TeamB').length;
  const totalRounds = results.reduce((acc, r) => acc + r.rounds, 0);
  const totalTricksA = results.reduce((acc, r) => acc + r.teamATricks, 0);
  const totalTricksB = results.reduce((acc, r) => acc + r.teamBTricks, 0);
  const totalContractsA = results.reduce((acc, r) => acc + r.teamAContractsAttempted, 0);
  const madeContractsA = results.reduce((acc, r) => acc + r.teamAContractsMade, 0);
  const totalContractsB = results.reduce((acc, r) => acc + r.teamBContractsAttempted, 0);
  const madeContractsB = results.reduce((acc, r) => acc + r.teamBContractsMade, 0);

  const stats = {
    status: 'completed',
    mode: 'machine_speed',
    totalMatches,
    durationSec: Number(totalTimeSec),
    matchesPerSec: Number((totalMatches / (Number(totalTimeSec) || 0.001)).toFixed(1)),
    teamA: {
      name: 'Built-in Pro SuperBot (North & South)',
      wins: teamAWins,
      winPct: Number(((teamAWins / totalMatches) * 100).toFixed(2)),
      contractsAttempted: totalContractsA,
      contractsMade: madeContractsA,
      contractSuccessPct: totalContractsA ? Number(((madeContractsA / totalContractsA) * 100).toFixed(1)) : 0,
      averageTricksPerRound: Number((totalTricksA / totalRounds).toFixed(2)),
    },
    teamB: {
      name: 'WhistAPI Engine Bot (West & East)',
      wins: teamBWins,
      winPct: Number(((teamBWins / totalMatches) * 100).toFixed(2)),
      contractsAttempted: totalContractsB,
      contractsMade: madeContractsB,
      contractSuccessPct: totalContractsB ? Number(((madeContractsB / totalContractsB) * 100).toFixed(1)) : 0,
      averageTricksPerRound: Number((totalTricksB / totalRounds).toFixed(2)),
    },
    averageRoundsPerMatch: Number((totalRounds / totalMatches).toFixed(2)),
    lastUpdated: new Date().toISOString(),
  };

  try {
    fs.writeFileSync('scripts/simulation_results.json', JSON.stringify(stats, null, 2));
  } catch {}

  console.log('\n========================================================');
  console.log(`🏆 TOURNAMENT RESULTS: ${totalMatches} MATCHES COMPLETED in ${totalTimeSec}s`);
  console.log(`🚀 Speed: ${(totalMatches / (Number(totalTimeSec) || 0.001)).toFixed(0)} matches/second`);
  console.log('========================================================');
  console.log(`Team A (Built-in Pro SuperBot - North & South):`);
  console.log(`  Wins: ${teamAWins} (${((teamAWins / totalMatches) * 100).toFixed(2)}%)`);
  console.log(`  Contracts Made: ${madeContractsA} / ${totalContractsA} (${totalContractsA ? ((madeContractsA / totalContractsA) * 100).toFixed(1) : 0}%)`);
  console.log(`  Average Tricks / Round: ${(totalTricksA / totalRounds).toFixed(2)}`);
  console.log('--------------------------------------------------------');
  console.log(`Team B (WhistAPI Engine Bot - West & East):`);
  console.log(`  Wins: ${teamBWins} (${((teamBWins / totalMatches) * 100).toFixed(2)}%)`);
  console.log(`  Contracts Made: ${madeContractsB} / ${totalContractsB} (${totalContractsB ? ((madeContractsB / totalContractsB) * 100).toFixed(1) : 0}%)`);
  console.log(`  Average Tricks / Round: ${(totalTricksB / totalRounds).toFixed(2)}`);
  console.log('--------------------------------------------------------');
  console.log(`Average Rounds Per Match: ${(totalRounds / totalMatches).toFixed(2)}`);
  console.log('========================================================\n');

  return stats;
}

const matchCount = Number(process.argv[2]) || 1000;
runMachineSpeedBatch(matchCount);
