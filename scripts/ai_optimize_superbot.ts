import { GoogleGenAI } from '@google/genai';
import { simulateSingleMatch } from '../src/logic/simulator.ts';
import { getActiveBotPolicy, saveBotPolicy, BotPolicyData } from '../src/data/botPolicy.ts';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('\n============================================================');
  console.log('🤖 AI-POWERED SUPER BOT ANALYZER & STRATEGY SYNTHESIZER');
  console.log('============================================================\n');

  console.log('Phase 1: Simulating 2,500 games to collect game-theory telemetry...');
  const startTime = Date.now();

  let teamAWins = 0;
  let teamBWins = 0;
  let teamATricks = 0;
  let teamBTricks = 0;
  let teamAContracts = 0;
  let teamBContracts = 0;
  let teamAMade = 0;
  let teamBMade = 0;
  let totalRounds = 0;

  for (let i = 0; i < 2500; i++) {
    const match = simulateSingleMatch('super', 'casual', 25);
    if (match.winner === 'TeamA') teamAWins++;
    else teamBWins++;

    teamATricks += match.teamATricks;
    teamBTricks += match.teamBTricks;
    teamAContracts += match.teamABidsAttempted;
    teamBContracts += match.teamBBidsAttempted;
    teamAMade += match.teamABidsWon;
    teamBMade += match.teamBBidsWon;
    totalRounds += match.roundsPlayed;

    if ((i + 1) % 500 === 0) {
      console.log(`  -> Completed ${i + 1}/2,500 matches (${totalRounds} hands)`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const baselineWinRate = ((teamAWins / 2500) * 100).toFixed(1);
  const teamASuccessRate = ((teamAMade / Math.max(1, teamAContracts)) * 100).toFixed(1);
  const teamBSuccessRate = ((teamBMade / Math.max(1, teamBContracts)) * 100).toFixed(1);

  console.log(`\nBaseline Performance (2,500 Matches in ${durationSec}s):`);
  console.log(`- Super Bot Win Rate: ${baselineWinRate}% (${teamAWins} wins)`);
  console.log(`- Super Bot Contracts: ${teamAMade}/${teamAContracts} Made (${teamASuccessRate}%)`);
  console.log(`- Casual Bot Contracts: ${teamBMade}/${teamBContracts} Made (${teamBSuccessRate}%)`);
  console.log(`- Super Bot Avg Tricks: ${(teamATricks / totalRounds).toFixed(2)} vs Casual ${(teamBTricks / totalRounds).toFixed(2)}`);

  console.log('\nPhase 2: Sending diagnostic telemetry to Gemini AI for strategic analysis...');
  const currentPolicy = getActiveBotPolicy();

  const prompt = `You are a Grandmaster Bridge and Tarneeb AI Engineer specializing in imperfect information trick-taking card games.
We ran an empirical simulation of 2,500 matches (${totalRounds} complete rounds of 13 tricks) between our "Super Bot" (North & South) and a heuristic "Casual Bot" (East & West).

### Game Rules Summary:
- 4 players, 2 fixed partnerships (North-South vs East-West), 13 cards each from standard 52-card deck. Counter-clockwise play.
- Mandatory follow suit. If void, player can discard or play trump.
- Scoring:
  - Suit Contracts: Level L requires 6 + L tricks. If made, bidding team gets (Tricks - 6) points. If failed, bidding team loses L points, and defenders get (Defending Tricks - 6) points.
  - No Trump (NT): Doubled score! Base reward is L * 2 + overtricks. If failed, penalty is -(L * 2).
  - Target: First team to reach +11 points wins. Elimination at -11 points.
- Bidding hierarchy: 1 Suit < 1 NT < 2 Suit < 2 NT < 3 Suit < ...
- 4th turn Dealer Privilege: Dealer can match highest bid (Match Suit or Match NT).

### Empirical Telemetry:
- Total Matches: 2,500 matches (${totalRounds} hands).
- Super Bot Wins: ${teamAWins} (${baselineWinRate}%) vs Casual: ${teamBWins}.
- Super Bot Contracts Declared: ${teamAContracts} (Made: ${teamAMade}, ${teamASuccessRate}% success).
- Casual Bot Contracts Declared: ${teamBContracts} (Made: ${teamBMade}, ${teamBSuccessRate}% success).
- Tricks Average: Super Bot ${(teamATricks / totalRounds).toFixed(2)} vs Casual ${(teamBTricks / totalRounds).toFixed(2)}.
- Current Policy Parameters:
${JSON.stringify(currentPolicy, null, 2)}

### Your Task:
Analyze why the win rate is around ${baselineWinRate}%.
Derive the optimal adjustments to maximize win rate against Casual Bot.
Specifically focus on:
1. Optimal minimum HCP and suit length thresholds for 1_Suit, 1_NT, 2_Suit, 2_NT.
2. Partnership fit bonuses and distribution point valuation.
3. Tactical weights (partner void ruffing, finesse aggression, trump extraction power).

Return ONLY valid JSON with this structure (no markdown fences, just pure JSON):
{
  "strategicAnalysis": "Your 2-3 sentence diagnosis of current performance bottlenecks",
  "recommendedAdjustments": [
    "Key adjustment 1",
    "Key adjustment 2",
    "Key adjustment 3"
  ],
  "updatedPolicy": {
    "biddingMatrix": {
      "1_Suit": { "minHCP": number, "minSuitLength": number, "empiricalWinRate": number, "empiricalEV": number },
      "1_NT": { "minHCP": number, "minSuitLength": number, "empiricalWinRate": number, "empiricalEV": number },
      "2_Suit": { "minHCP": number, "minSuitLength": number, "empiricalWinRate": number, "empiricalEV": number },
      "2_NT": { "minHCP": number, "minSuitLength": number, "empiricalWinRate": number, "empiricalEV": number },
      "3_Suit": { "minHCP": number, "minSuitLength": number, "empiricalWinRate": number, "empiricalEV": number },
      "3_NT": { "minHCP": number, "minSuitLength": number, "empiricalWinRate": number, "empiricalEV": number }
    },
    "partnershipCoefficients": {
      "fitBonus8Trumps": number,
      "fitBonus9PlusTrumps": number,
      "voidBonus": number,
      "singletonBonus": number,
      "doubletonBonus": number,
      "supportRaiseMinHCP": number
    },
    "tacticalParameters": {
      "finesseAggression": number,
      "partnerVoidLeadPriority": number,
      "declarerTrumpDrawPower": number,
      "thirdHandHighMultiplier": number,
      "secondHandLowMultiplier": number
    }
  }
}`;

  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let analysis: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting analysis with ${modelName}...`);
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });

      let rawText = response.text || '';
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      analysis = JSON.parse(rawText);
      console.log(`✓ Analysis successfully generated using ${modelName}!`);
      break;
    } catch (err: any) {
      console.warn(`  Model ${modelName} unavailable (${err?.message || err}), trying next model...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!analysis) {
    console.error('All AI models unavailable. Please check connection and try again.');
    return;
  }

  try {
    console.log('\n================ AI ANALYSIS & RECOMMENDATIONS ================');
    console.log(analysis.strategicAnalysis);
    console.log('\nActionable Adjustments:');
    analysis.recommendedAdjustments.forEach((adj: string, idx: number) => {
      console.log(`  ${idx + 1}. ${adj}`);
    });
    console.log('================================================================');

    // Merge AI-recommended policy
    const newPolicy: BotPolicyData = {
      ...currentPolicy,
      version: '3.5.0-ai-optimized',
      lastUpdated: new Date().toISOString(),
      biddingMatrix: {
        ...currentPolicy.biddingMatrix,
        ...analysis.updatedPolicy.biddingMatrix,
      },
      partnershipCoefficients: {
        ...currentPolicy.partnershipCoefficients,
        ...analysis.updatedPolicy.partnershipCoefficients,
      },
      tacticalParameters: {
        ...currentPolicy.tacticalParameters,
        ...analysis.updatedPolicy.tacticalParameters,
      },
    };

    saveBotPolicy(newPolicy);
    console.log('\n💾 Successfully saved AI-optimized policy to src/data/learnedPolicy.json!');

    console.log('\nPhase 3: Verifying performance with AI-optimized policy over 1,000 matches...');
    let testAWins = 0;
    let testBWins = 0;
    for (let i = 0; i < 1000; i++) {
      const match = simulateSingleMatch('super', 'casual', 25);
      if (match.winner === 'TeamA') testAWins++;
      else testBWins++;
    }

    const newWinRate = ((testAWins / 1000) * 100).toFixed(1);
    console.log(`\n🏆 Post-Optimization Results:`);
    console.log(`Super Bot Win Rate: ${newWinRate}% (${testAWins}/1000 wins)`);
    console.log(`Casual Bot Win Rate: ${(100 - parseFloat(newWinRate)).toFixed(1)}% (${testBWins}/1000 wins)`);

  } catch (err) {
    console.error('Failed to run AI analysis:', err);
  }
}

main().catch(console.error);
