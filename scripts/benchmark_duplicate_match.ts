import {
  dealHands,
  startDealRound,
  createInitialGameState,
  calculateRoundScores,
  checkMatchEnd,
  getNextSeat,
  evaluateTrickWinner,
  getTeam,
  isBidHigher,
  SEATS,
} from '../src/logic/gameLogic.ts';
import { simulateSingleRound, simulateSingleMatch } from '../src/logic/simulator.ts';
import { GameState, Seat, Team } from '../src/types.ts';

// Deep clone gameState
function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

export async function runDuplicateBenchmark(numBoards: number = 50) {
  console.log('\n============================================================');
  console.log(`🏆 RUNNING DUPLICATE MATCH BENCHMARK (${numBoards} DUPLICATE BOARDS)`);
  console.log('============================================================');
  console.log('Methodology: Each board is played TWICE with the exact same deal:');
  console.log('  - Run A: SuperBot (Team A: North-South) vs CasualBot (Team B: East-West)');
  console.log('  - Run B: CasualBot (Team A: North-South) vs SuperBot (Team B: East-West)');
  console.log('Net result isolates AI decision-making quality from card deal luck.\n');

  let superBotWinsBoard = 0;
  let casualBotWinsBoard = 0;
  let tiesCount = 0;

  let totalSuperBotTricksOnA = 0;
  let totalCasualBotTricksOnA = 0;
  let totalSuperBotPoints = 0;
  let totalCasualBotPoints = 0;

  let superBotContractsMade = 0;
  let superBotContractsAttempted = 0;
  let casualBotContractsMade = 0;
  let casualBotContractsAttempted = 0;

  const startTime = Date.now();

  for (let i = 0; i < numBoards; i++) {
    // Generate fresh deal
    let baseState = createInitialGameState('North');
    baseState = startDealRound(baseState, 'North');

    // Run A: SuperBot on Team A (North-South)
    const stateA = cloneGameState(baseState);
    const resultA = simulateSingleRound(stateA, 'super', 'casual');
    const scoreA = resultA.roundScores[resultA.roundScores.length - 1];

    // Run B: CasualBot on Team A (North-South), SuperBot on Team B (East-West)
    const stateB = cloneGameState(baseState);
    const resultB = simulateSingleRound(stateB, 'casual', 'super');
    const scoreB = resultB.roundScores[resultB.roundScores.length - 1];

    // Compare performance of North-South cards:
    // How did SuperBot do with North-South cards vs how CasualBot did with the IDENTICAL North-South cards?
    const superBotTricksAsNS = resultA.teamTricksWon.TeamA;
    const casualBotTricksAsNS = resultB.teamTricksWon.TeamA;

    totalSuperBotTricksOnA += superBotTricksAsNS;
    totalCasualBotTricksOnA += casualBotTricksAsNS;

    // Track points scored with North-South cards
    const superBotDeltaNS = (scoreA.contractTeam === 'TeamA' ? scoreA.scoreDeltaBidTeam : scoreA.scoreDeltaDefTeam);
    const casualBotDeltaNS = (scoreB.contractTeam === 'TeamA' ? scoreB.scoreDeltaBidTeam : scoreB.scoreDeltaDefTeam);

    totalSuperBotPoints += superBotDeltaNS;
    totalCasualBotPoints += casualBotDeltaNS;

    // Contract tracking
    if (scoreA.contractTeam === 'TeamA') {
      superBotContractsAttempted++;
      if (scoreA.bidSuccess) superBotContractsMade++;
    }
    if (scoreB.contractTeam === 'TeamA') {
      casualBotContractsAttempted++;
      if (scoreB.bidSuccess) casualBotContractsMade++;
    }

    if (superBotDeltaNS > casualBotDeltaNS || (superBotDeltaNS === casualBotDeltaNS && superBotTricksAsNS > casualBotTricksAsNS)) {
      superBotWinsBoard++;
    } else if (casualBotDeltaNS > superBotDeltaNS || (superBotDeltaNS === casualBotDeltaNS && casualBotTricksAsNS > superBotTricksAsNS)) {
      casualBotWinsBoard++;
    } else {
      tiesCount++;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  -> Processed ${i + 1}/${numBoards} duplicate boards...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const superWinPct = ((superBotWinsBoard / (superBotWinsBoard + casualBotWinsBoard || 1)) * 100).toFixed(1);
  const avgSuperTricks = (totalSuperBotTricksOnA / numBoards).toFixed(2);
  const avgCasualTricks = (totalCasualBotTricksOnA / numBoards).toFixed(2);

  console.log('\n================ DUPLICATE BENCHMARK RESULTS ================');
  console.log(`Total Duplicate Boards:     ${numBoards} pairs (100 total hands)`);
  console.log(`SuperBot Duplicate Wins:   ${superBotWinsBoard} (${superWinPct}% of decisive boards)`);
  console.log(`CasualBot Duplicate Wins:  ${casualBotWinsBoard}`);
  console.log(`Tied Boards:               ${tiesCount}`);
  console.log(`Net Points Differential:   +${totalSuperBotPoints - totalCasualBotPoints} pts (Super: ${totalSuperBotPoints} vs Casual: ${totalCasualBotPoints})`);
  console.log(`Avg Tricks with SAME Hand: SuperBot ${avgSuperTricks} vs CasualBot ${avgCasualTricks}`);
  console.log(`Contract Success Rate:     SuperBot ${((superBotContractsMade / Math.max(1, superBotContractsAttempted)) * 100).toFixed(1)}% vs CasualBot ${((casualBotContractsMade / Math.max(1, casualBotContractsAttempted)) * 100).toFixed(1)}%`);
  console.log(`Execution Time:            ${durationSec}s`);
  console.log('=============================================================\n');

  // Also run standard 50 full-match simulation
  console.log('Phase 2: Running 50 full match simulations (+11 to -11 match rules)...');
  let matchAWins = 0;
  let matchBWins = 0;
  for (let m = 0; m < 50; m++) {
    const match = simulateSingleMatch('super', 'casual', 25);
    if (match.winner === 'TeamA') matchAWins++;
    else matchBWins++;
  }
  const matchWinRate = ((matchAWins / 50) * 100).toFixed(1);
  console.log(`Match Simulation Result: SuperBot won ${matchAWins}/50 matches (${matchWinRate}% win rate)\n`);

  if (parseFloat(superWinPct) < 55.0) {
    throw new Error(`Duplicate win rate was below threshold: ${superWinPct}%`);
  }
}

runDuplicateBenchmark(50).catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
