import { runBatchSimulation } from '../src/logic/simulator.ts';
import { getActiveBotPolicy, trainPolicyFromSimulation } from '../src/data/botPolicy.ts';

async function main() {
  const matchesToTrain = parseInt(process.argv[2] || '50', 10);
  console.log(`\n🧠 Starting Super Bot Training Run: ${matchesToTrain} matches...\n`);

  const initialPolicy = getActiveBotPolicy();
  console.log(`Current Policy: Version ${initialPolicy.version} (${initialPolicy.totalSimulatedHands.toLocaleString()} hands trained)`);

  const startTime = Date.now();
  const result = await runBatchSimulation({
    totalMatches: matchesToTrain,
    teamAStrategy: 'super',
    teamBStrategy: 'casual',
    maxRoundsPerMatch: 20,
  });

  const updatedPolicy = trainPolicyFromSimulation(
    result.totalMatches,
    result.totalRounds,
    result.teamAWins,
    result.teamABidSuccessRate
  );

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n================ TRAINING RESULTS ================`);
  console.log(`Total Matches:        ${result.totalMatches}`);
  console.log(`Total Hands/Rounds:   ${result.totalRounds}`);
  console.log(`Team A (Super Bot):   ${result.teamAWins} Wins (${result.teamAWinRate}%)`);
  console.log(`Team B (Casual Bot):  ${result.teamBWins} Wins (${result.teamBWinRate}%)`);
  console.log(`Bid Success Rate:     ${result.teamABidSuccessRate}%`);
  console.log(`Avg Tricks per Round: ${result.teamAAverageTricks} tricks`);
  console.log(`Training Time:        ${durationSec}s`);
  console.log(`==================================================`);
  console.log(`\n💾 Saved to Disk: src/data/learnedPolicy.json`);
  console.log(`New Brain Version:    ${updatedPolicy.version}`);
  console.log(`Total Lifetime Hands: ${updatedPolicy.totalSimulatedHands.toLocaleString()} hands`);
  console.log(`Total Lifetime Games: ${updatedPolicy.totalMatchesTrained.toLocaleString()} matches\n`);
}

main().catch(console.error);
