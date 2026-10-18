import { calculateRoundScores } from '../src/logic/gameLogic.ts';
import { Bid, Team } from '../src/types.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

console.log('--- RUNNING SALPAND SCORING RULE TEST SUITE ---');

// 1. Suit Contracts with 13 tricks (Salpand)
{
  const bid1Suit: Bid = { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' };
  const res1Suit = calculateRoundScores(bid1Suit, 'North', 'S', 1, { TeamA: 13, TeamB: 0 });
  assert(res1Suit.isSalpand === true, '1 Suit 13 tricks isSalpand should be true');
  assert(res1Suit.salpandTeam === 'TeamA', '1 Suit 13 tricks salpandTeam should be TeamA');
  assert(res1Suit.scoreDeltaBidTeam === 11, '1 Suit 13 tricks score should be 11 (Salpand rule)');
  assert(res1Suit.scoreDeltaDefTeam === 0, '1 Suit 13 tricks def score should be 0');

  const bid4Suit: Bid = { seat: 'North', type: 'bid', level: 4, contractType: 'Suit' };
  const res4Suit = calculateRoundScores(bid4Suit, 'North', 'H', 1, { TeamA: 13, TeamB: 0 });
  assert(res4Suit.isSalpand === true, '4 Suit 13 tricks isSalpand should be true');
  assert(res4Suit.scoreDeltaBidTeam === 11, '4 Suit 13 tricks score should be 11');

  const bid7Suit: Bid = { seat: 'North', type: 'bid', level: 7, contractType: 'Suit' };
  const res7Suit = calculateRoundScores(bid7Suit, 'North', 'C', 1, { TeamA: 13, TeamB: 0 });
  assert(res7Suit.isSalpand === true, '7 Suit 13 tricks isSalpand should be true');
  assert(res7Suit.scoreDeltaBidTeam === 11, '7 Suit 13 tricks score should be 11');
}

// 2. Non-Salpand Suit contract (e.g. 12 tricks)
{
  const bid1Suit: Bid = { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' };
  const res12Tricks = calculateRoundScores(bid1Suit, 'North', 'S', 1, { TeamA: 12, TeamB: 1 });
  assert(res12Tricks.isSalpand === false, '12 tricks is not a Salpand');
  assert(res12Tricks.scoreDeltaBidTeam === 6, '12 tricks on 1 Suit gives 12 - 6 = 6 points');
}

// 3. No Trump Contracts with 13 tricks (1NT through 7NT)
// In NT: if points exceed 11 points, counted as 11 points as well.
for (let level = 1; level <= 7; level++) {
  const bidNT: Bid = { seat: 'North', type: 'bid', level, contractType: 'NT' };
  const resNT = calculateRoundScores(bidNT, 'North', 'NT', 1, { TeamA: 13, TeamB: 0 });
  assert(resNT.isSalpand === true, `${level} NT 13 tricks isSalpand should be true`);
  assert(resNT.salpandTeam === 'TeamA', `${level} NT 13 tricks salpandTeam should be TeamA`);
  assert(
    resNT.scoreDeltaBidTeam === 11,
    `${level} NT with 13 tricks must award exactly 11 points (even when formula exceeds 11 points)`
  );
  assert(resNT.scoreDeltaDefTeam === 0, `${level} NT 13 tricks def score should be 0`);
}

// 4. Defensive Salpand (defenders capture all 13 tricks)
{
  // Declaring TeamA bid 1 Suit, won 0 tricks; Defending TeamB won all 13 tricks
  const bid1Suit: Bid = { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' };
  const resDefSuit = calculateRoundScores(bid1Suit, 'North', 'S', 1, { TeamA: 0, TeamB: 13 });
  assert(resDefSuit.isSalpand === true, 'Defensive 13 tricks isSalpand should be true');
  assert(resDefSuit.salpandTeam === 'TeamB', 'Defensive 13 tricks salpandTeam should be TeamB');
  assert(resDefSuit.scoreDeltaDefTeam === 11, 'Defending team gets 11 points for Defensive Salpand');
  assert(resDefSuit.scoreDeltaBidTeam === -1, 'Declarer gets -1 penalty for failing 1 Suit');

  // Declaring TeamA bid 3 NT, won 0 tricks; Defending TeamB won all 13 tricks
  const bid3NT: Bid = { seat: 'North', type: 'bid', level: 3, contractType: 'NT' };
  const resDefNT = calculateRoundScores(bid3NT, 'North', 'NT', 1, { TeamA: 0, TeamB: 13 });
  assert(resDefNT.isSalpand === true, 'Defensive NT 13 tricks isSalpand should be true');
  assert(resDefNT.salpandTeam === 'TeamB', 'Defensive NT 13 tricks salpandTeam should be TeamB');
  assert(resDefNT.scoreDeltaDefTeam === 11, 'Defending team gets 11 points for Defensive NT Salpand');
  assert(resDefNT.scoreDeltaBidTeam === -6, 'Declarer gets -(3*2) = -6 penalty for failing 3 NT');
}

// 5. Normal Contracts Non-Salpand Regression Checks
{
  // 1 Suit, 7 tricks made (exact) -> +1 pt
  const bid1S: Bid = { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' };
  const res1S = calculateRoundScores(bid1S, 'North', 'S', 1, { TeamA: 7, TeamB: 6 });
  assert(res1S.isSalpand === false, '1S 7 tricks is not Salpand');
  assert(res1S.scoreDeltaBidTeam === 1, '1S 7 tricks gives +1');

  // 2 NT, 9 tricks made (1 overtrick) -> (2*2) + 1 = 5 pts
  const bid2NT: Bid = { seat: 'North', type: 'bid', level: 2, contractType: 'NT' };
  const res2NT = calculateRoundScores(bid2NT, 'North', 'NT', 1, { TeamA: 9, TeamB: 4 });
  assert(res2NT.isSalpand === false, '2NT 9 tricks is not Salpand');
  assert(res2NT.scoreDeltaBidTeam === 5, '2NT 9 tricks gives +5');
}

console.log('🎉 ALL SALPAND RULES TESTS PASSED COMPLETELY!');
