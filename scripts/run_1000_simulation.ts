import fs from 'fs';
import {
  initBotSession,
  requestBotBid,
  requestBotPlay,
  broadcastActionToApiBots,
  cleanupBotSessions,
  seatToPlayerIndex,
} from '../src/logic/tadfeeaApiClient.ts';
import {
  calculateRoundScores,
  checkMatchEnd,
  createInitialGameState,
  dealHands,
  evaluateTrickWinner,
  getNextSeat,
  getPartner,
  getTeam,
  isBidHigher,
  isCardLegal,
  SEATS,
  startDealRound,
} from '../src/logic/gameLogic.ts';
import { getSuperBotBid, getSuperBotCardPlay, getSuperBotDeclaredSuit } from '../src/logic/superBot.ts';
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

export async function runSingleSimulatedMatch(
  matchIndex: number,
  agentMode: 'hybrid' | 'heuristic' = (process.env.AGENT_MODE as any) || 'hybrid'
): Promise<MatchStats> {
  const t0 = Date.now();
  const roomId = `sim_${matchIndex}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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

  while (state.phase !== 'game_over' && roundsCount < 20) {
    roundsCount++;
    const roundRoomId = `${roomId}_r${roundsCount}`;

    // Init API bot sessions for this round
    for (const seat of apiSeats) {
      await initBotSession({
        roomId: roundRoomId,
        seat,
        dealer: state.dealer,
        hand: state.hands[seat],
        matchScores: state.matchScores,
        agentMode,
      });
    }

    // Auction Phase
    while (state.phase === 'bidding' && state.currentBidder) {
      const seat = state.currentBidder;
      const isApi = apiSeats.includes(seat);
      let bid: Bid;
      if (isApi) {
        const res = await requestBotBid({
          roomId: roundRoomId,
          seat,
          turnIndex: state.auctionTurnsCount,
          hand: state.hands[seat],
          dealer: state.dealer,
        });
        bid = res || { seat, type: 'pass' };
      } else {
        bid = getSuperBotBid(state, seat);
      }

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

      await broadcastActionToApiBots({
        roomId: roundRoomId,
        botSeats: apiSeats,
        actionType: 'BID',
        payload: {
          player: seatToPlayerIndex(seat),
          bid_type: bid.type === 'pass' ? 'PASS' : (bid.isDealerPrivilegeMatch ? 'MATCH' : 'BID'),
          level: bid.level || null,
          contract_type: bid.contractType ? (bid.contractType === 'Suit' ? 'SUIT' : 'NT') : null,
        },
      });

      state.auctionTurnsCount++;
      if (state.auctionTurnsCount < 4) {
        state.currentBidder = getNextSeat(seat);
      } else {
        state.currentBidder = null;
        if (!state.highestBid || state.highestBid.type === 'pass') {
          await cleanupBotSessions({ roomId: roundRoomId, botSeats: apiSeats });
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
      const suit = getSuperBotDeclaredSuit(state.hands[declarer], state, declarer);
      state.trumpSuit = suit;
      state.phase = 'playing';
      state.currentTurn = getNextSeat(declarer);
      await broadcastActionToApiBots({
        roomId: roundRoomId,
        botSeats: apiSeats,
        actionType: 'TRUMP_SELECTION',
        payload: { trump_suit: suit },
      });
    }

    while (state.phase === 'playing' && state.currentTurn) {
      const seat = state.currentTurn;
      const isApi = apiSeats.includes(seat);
      const trump = state.trumpSuit!;
      let card: Card;

      if (isApi) {
        const hand = state.hands[seat];
        const ledSuit = state.currentTrick[0]?.card?.suit || null;
        const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));

        const cardId = await requestBotPlay({
          roomId: roundRoomId,
          seat,
          trickNum: state.tricksHistory.length + 1,
          contract: {
            level: state.winningBid?.level || 1,
            type: state.trumpSuit === 'NT' ? 'NT' : 'Suit',
            trump: state.trumpSuit,
            declarer: state.declarer || seat,
          },
          hand,
          legalCards,
        });
        const found = cardId ? hand.find((c) => c.id === cardId) : null;
        if (found && isCardLegal(found, hand, ledSuit)) {
          card = found;
        } else {
          card = getSuperBotCardPlay(state, seat, trump);
        }
      } else {
        card = getSuperBotCardPlay(state, seat, trump);
      }

      const hand = state.hands[seat];
      const cIdx = hand.findIndex((c) => c.id === card.id);
      if (cIdx !== -1) hand.splice(cIdx, 1);
      state.cardsCount[seat] = hand.length;
      state.currentTrick.push({ seat, card });

      await broadcastActionToApiBots({
        roomId: roundRoomId,
        botSeats: apiSeats,
        actionType: 'PLAY_CARD',
        payload: { player: seatToPlayerIndex(seat), card: card.id },
      });

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

          await cleanupBotSessions({ roomId: roundRoomId, botSeats: apiSeats });

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

  await cleanupBotSessions({ roomId, botSeats: apiSeats });

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

async function runBatch(totalMatches: number, concurrency: number) {
  console.log(`Starting simulation of ${totalMatches} matches (concurrency: ${concurrency})...`);
  const tStart = Date.now();
  const results: MatchStats[] = [];
  let completed = 0;

  const queue: number[] = Array.from({ length: totalMatches }, (_, i) => i + 1);

  async function worker() {
    while (queue.length > 0) {
      const idx = queue.shift()!;
      try {
        const res = await runSingleSimulatedMatch(idx);
        results.push(res);
        completed++;
        if (completed % 25 === 0 || completed === totalMatches) {
          const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(1);
          const rate = (completed / (Number(elapsedSec) || 1)).toFixed(1);
          const aWins = results.filter((r) => r.winner === 'TeamA').length;
          const bWins = results.filter((r) => r.winner === 'TeamB').length;
          console.log(
            `[Progress: ${completed}/${totalMatches} (${((completed / totalMatches) * 100).toFixed(0)}%)] ` +
            `SuperBot(TeamA): ${aWins} (${((aWins / completed) * 100).toFixed(1)}%) | ` +
            `ApiBot(TeamB): ${bWins} (${((bWins / completed) * 100).toFixed(1)}%) | ` +
            `Speed: ${rate} matches/sec | Elapsed: ${elapsedSec}s`
          );
          try {
            fs.writeFileSync('scripts/simulation_results.json', JSON.stringify({
              status: completed === totalMatches ? 'completed' : 'in_progress',
              totalMatches,
              completed,
              elapsedSec: Number(elapsedSec),
              speed: Number(rate),
              teamAWins: aWins,
              teamBWins: bWins,
              teamAWinPct: Number(((aWins / completed) * 100).toFixed(2)),
              teamBWinPct: Number(((bWins / completed) * 100).toFixed(2)),
              lastUpdated: new Date().toISOString(),
            }, null, 2));
          } catch {}
        }
      } catch (err) {
        console.error(`Error in match ${idx}:`, err);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalTimeSec = ((Date.now() - tStart) / 1000).toFixed(1);
  const teamAWins = results.filter((r) => r.winner === 'TeamA').length;
  const teamBWins = results.filter((r) => r.winner === 'TeamB').length;
  const totalRounds = results.reduce((acc, r) => acc + r.rounds, 0);
  const totalTricksA = results.reduce((acc, r) => acc + r.teamATricks, 0);
  const totalTricksB = results.reduce((acc, r) => acc + r.teamBTricks, 0);
  const totalContractsA = results.reduce((acc, r) => acc + r.teamAContractsAttempted, 0);
  const madeContractsA = results.reduce((acc, r) => acc + r.teamAContractsMade, 0);
  const totalContractsB = results.reduce((acc, r) => acc + r.teamBContractsAttempted, 0);
  const madeContractsB = results.reduce((acc, r) => acc + r.teamBContractsMade, 0);

  try {
    fs.writeFileSync('scripts/simulation_results.json', JSON.stringify({
      status: 'completed',
      totalMatches,
      completed: results.length,
      durationSec: Number(totalTimeSec),
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
        name: 'WhistAPI Bot (West & East)',
        wins: teamBWins,
        winPct: Number(((teamBWins / totalMatches) * 100).toFixed(2)),
        contractsAttempted: totalContractsB,
        contractsMade: madeContractsB,
        contractSuccessPct: totalContractsB ? Number(((madeContractsB / totalContractsB) * 100).toFixed(1)) : 0,
        averageTricksPerRound: Number((totalTricksB / totalRounds).toFixed(2)),
      },
      averageRoundsPerMatch: Number((totalRounds / totalMatches).toFixed(2)),
      lastUpdated: new Date().toISOString(),
    }, null, 2));
  } catch {}

  console.log('\n========================================================');
  console.log(`🏆 TOURNAMENT RESULTS: ${totalMatches} MATCHES COMPLETED in ${totalTimeSec}s`);
  console.log('========================================================');
  console.log(`Team A (Built-in Pro SuperBot - North & South):`);
  console.log(`  Wins: ${teamAWins} (${((teamAWins / totalMatches) * 100).toFixed(2)}%)`);
  console.log(`  Contracts Made: ${madeContractsA} / ${totalContractsA} (${totalContractsA ? ((madeContractsA / totalContractsA) * 100).toFixed(1) : 0}%)`);
  console.log(`  Average Tricks / Round: ${(totalTricksA / totalRounds).toFixed(2)}`);
  console.log('--------------------------------------------------------');
  console.log(`Team B (WhistAPI Bot - West & East):`);
  console.log(`  Wins: ${teamBWins} (${((teamBWins / totalMatches) * 100).toFixed(2)}%)`);
  console.log(`  Contracts Made: ${madeContractsB} / ${totalContractsB} (${totalContractsB ? ((madeContractsB / totalContractsB) * 100).toFixed(1) : 0}%)`);
  console.log(`  Average Tricks / Round: ${(totalTricksB / totalRounds).toFixed(2)}`);
  console.log('--------------------------------------------------------');
  console.log(`Average Rounds Per Match: ${(totalRounds / totalMatches).toFixed(2)}`);
  console.log('========================================================\n');
}

const count = Number(process.argv[2]) || 1000;
const concurrency = Number(process.argv[3]) || 10;
runBatch(count, concurrency).catch(console.error);
