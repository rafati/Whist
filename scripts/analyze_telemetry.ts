/**
 * Telemetry & RLHF Analysis Tool
 * 
 * Analyzes real matches and human object throws (👞 Shoe = bad move, 🏅 Medal = good move)
 * captured in PostgreSQL (Render) or local telemetry files.
 * 
 * Usage:
 *   npx tsx scripts/analyze_telemetry.ts
 *   npx tsx scripts/analyze_telemetry.ts --export-rlhf
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { BotFeedbackRecord, MatchReplayRecord } from '../src/services/telemetryDb.ts';

async function runAnalysis() {
  console.log('============================================================');
  console.log('📊 WHIST 400 TELEMETRY & HUMAN FEEDBACK (RLHF) ANALYZER');
  console.log('============================================================\n');

  const dbUrl = process.env.DATABASE_URL;
  let replays: MatchReplayRecord[] = [];
  let feedback: BotFeedbackRecord[] = [];

  const remoteArgIdx = process.argv.indexOf('--remote');
  const urlArgIdx = process.argv.indexOf('--url');
  const remoteUrl =
    urlArgIdx !== -1 && process.argv[urlArgIdx + 1]
      ? process.argv[urlArgIdx + 1]
      : remoteArgIdx !== -1
      ? 'https://whist-jfvx.onrender.com'
      : process.env.RENDER_URL;

  if (remoteUrl) {
    console.log(`🌐 Fetching live production telemetry from ${remoteUrl}...`);
    try {
      const statsRes = await fetch(`${remoteUrl}/api/telemetry/stats`).then((r) => r.json());
      const fbRes = await fetch(`${remoteUrl}/api/telemetry/feedback?limit=500`).then((r) => r.json());
      if (fbRes.success && fbRes.feedback) {
        feedback = fbRes.feedback;
      }
      try {
        const repRes = await fetch(`${remoteUrl}/api/telemetry/replays?limit=500`).then((r) => r.json());
        if (repRes.success && repRes.replays) {
          replays = repRes.replays;
        }
      } catch {
        // endpoint may be deploying
      }
      console.log(`✅ Loaded ${feedback.length} feedback records and ${replays.length} match replays live from Render (${statsRes.stats?.storageType || 'unknown'}).\n`);
    } catch (err) {
      console.error(`❌ Failed to fetch from remote URL ${remoteUrl}:`, err);
    }
  } else if (dbUrl) {
    console.log('🌐 Connecting to PostgreSQL via DATABASE_URL...');
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    });
    try {
      const replaysRes = await pool.query('SELECT * FROM match_replays ORDER BY timestamp DESC LIMIT 500');
      const feedbackRes = await pool.query('SELECT * FROM bot_feedback ORDER BY timestamp DESC LIMIT 500');
      replays = replaysRes.rows.map((r: any) => ({
        id: r.id,
        roomId: r.room_id,
        roundNumber: r.round_number,
        dealer: r.dealer,
        declarer: r.declarer,
        trumpSuit: r.trump_suit,
        contractLevel: r.contract_level,
        contractType: r.contract_type,
        winningTeam: r.winning_team,
        tricksWonTeamA: r.tricks_won_team_a,
        tricksWonTeamB: r.tricks_won_team_b,
        matchScoreTeamA: r.match_score_team_a,
        matchScoreTeamB: r.match_score_team_b,
        initialHands: typeof r.initial_hands === 'string' ? JSON.parse(r.initial_hands) : r.initial_hands,
        auctionHistory: typeof r.auction_history === 'string' ? JSON.parse(r.auction_history) : r.auction_history,
        tricksHistory: typeof r.tricks_history === 'string' ? JSON.parse(r.tricks_history) : r.tricks_history,
        timestamp: Number(r.timestamp),
      }));
      feedback = feedbackRes.rows.map((f: any) => ({
        id: f.id,
        roomId: f.room_id,
        matchId: f.match_id,
        timestamp: Number(f.timestamp),
        fromSeat: f.from_seat,
        toSeat: f.to_seat,
        isPartner: f.is_partner,
        objectType: f.object_type,
        sentiment: f.sentiment,
        botEngine: f.bot_engine,
        actionType: f.action_type,
        actionDetails: typeof f.action_details === 'string' ? JSON.parse(f.action_details) : f.action_details,
      }));
      console.log(`✅ Loaded ${replays.length} match replays and ${feedback.length} feedback events from database.\n`);
    } catch (err) {
      console.error('❌ Failed to fetch from PostgreSQL:', err);
    } finally {
      await pool.end();
    }
  } else {
    console.log('📁 Reading local file telemetry (./data/)...');
    const dataDir = path.resolve(process.cwd(), 'data');
    const replaysPath = path.join(dataDir, 'telemetry_replays.jsonl');
    const feedbackPath = path.join(dataDir, 'telemetry_feedback.jsonl');

    if (fs.existsSync(replaysPath)) {
      const lines = fs.readFileSync(replaysPath, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try { replays.push(JSON.parse(line)); } catch {}
      }
    }
    if (fs.existsSync(feedbackPath)) {
      const lines = fs.readFileSync(feedbackPath, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try { feedback.push(JSON.parse(line)); } catch {}
      }
    }
    console.log(`✅ Loaded ${replays.length} match replays and ${feedback.length} feedback events from local files.\n`);
  }

  // Aggregate Metrics
  const totalThrows = feedback.length;
  const shoes = feedback.filter((f) => f.sentiment === 'bad_move');
  const medals = feedback.filter((f) => f.sentiment === 'good_move');
  const partnerShoes = shoes.filter((f) => f.isPartner);

  console.log('--- 1. Summary Statistics ---');
  console.log(`Total Match Replays Recorded : ${replays.length}`);
  console.log(`Total Human Object Throws    : ${totalThrows}`);
  console.log(`  👞 Shoes (Bad Moves)       : ${shoes.length} (${totalThrows > 0 ? ((shoes.length / totalThrows) * 100).toFixed(1) : 0}%)`);
  console.log(`  🏅 Medals (Good Moves)     : ${medals.length} (${totalThrows > 0 ? ((medals.length / totalThrows) * 100).toFixed(1) : 0}%)`);
  console.log(`  💔 Partner Shoes (Blunders): ${partnerShoes.length}`);

  // Blunder Pattern Grouping
  console.log('\n--- 2. Partner Blunder Analysis (Shoes thrown by Teammate) ---');
  if (partnerShoes.length === 0) {
    console.log('🎉 No partner shoes recorded yet! Players are satisfied with bot play.');
  } else {
    const reasonCounts: Record<string, number> = {};
    const sampleDetails: Record<string, BotFeedbackRecord> = {};

    for (const s of partnerShoes) {
      const reasonKey = s.actionDetails?.lastReasoning?.reason || 'Unknown reason / no telemetry';
      reasonCounts[reasonKey] = (reasonCounts[reasonKey] || 0) + 1;
      if (!sampleDetails[reasonKey]) sampleDetails[reasonKey] = s;
    }

    const sortedPatterns = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    for (const [pattern, count] of sortedPatterns) {
      console.log(`\n🔴 [${count}x Shoes] ${pattern}`);
      const sample = sampleDetails[pattern];
      if (sample && sample.actionDetails) {
        console.log(`   Bot Seat : ${sample.toSeat} (${sample.botEngine})`);
        console.log(`   Thrower  : ${sample.fromSeat} (Human Partner)`);
        if (sample.actionDetails.lastReasoning?.cardId) {
          console.log(`   Card Played: ${sample.actionDetails.lastReasoning.cardId}`);
        }
        if (sample.actionDetails.botHandRemaining) {
          console.log(`   Hand     : ${sample.actionDetails.botHandRemaining.map((c) => c.id).join(' ')}`);
        }
      }
    }
  }

  // Praise Analysis
  console.log('\n--- 3. Praise Analysis (Medals thrown by Players) ---');
  if (medals.length === 0) {
    console.log('No medals recorded yet.');
  } else {
    const medalReasons: Record<string, number> = {};
    for (const m of medals) {
      const r = m.actionDetails?.lastReasoning?.reason || 'General approval';
      medalReasons[r] = (medalReasons[r] || 0) + 1;
    }
    for (const [reason, count] of Object.entries(medalReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`🟢 [${count}x Medals] ${reason}`);
    }
  }

  // RLHF Export
  if (process.argv.includes('--export-rlhf')) {
    const rlhfData = feedback.map((f) => ({
      timestamp: f.timestamp,
      botEngine: f.botEngine,
      reward: f.sentiment === 'good_move' ? 1.0 : f.sentiment === 'bad_move' ? -1.0 : 0.0,
      isPartner: f.isPartner,
      action: f.actionDetails?.lastReasoning?.action,
      cardOrBid: f.actionDetails?.lastReasoning?.cardId || f.actionDetails?.lastReasoning?.bidText,
      reason: f.actionDetails?.lastReasoning?.reason,
      remainingHand: f.actionDetails?.botHandRemaining?.map((c) => c.id),
    }));

    const outPath = path.resolve(process.cwd(), 'data', 'rlhf_dataset.json');
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(rlhfData, null, 2), 'utf8');
    console.log(`\n💾 Exported ${rlhfData.length} RLHF samples to ${outPath}`);
  }

  console.log('\n============================================================');
  console.log('🏁 ANALYSIS COMPLETE');
  console.log('============================================================\n');
}

runAnalysis().catch((err) => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
