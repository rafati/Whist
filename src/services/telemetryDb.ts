/**
 * Flight Recorder & RLHF Telemetry Service
 * 
 * Supports:
 * - PostgreSQL via DATABASE_URL (for production on Render.com)
 * - Automatic table creation on boot
 * - Asynchronous, non-blocking writes (ZERO impact on real-time bot play or game performance)
 * - Local JSONL fallback when running in development without DATABASE_URL
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { Card, ContractType, PlayedCard, Seat, ThrowableObjectType, TrumpSuit } from '../types.ts';

export interface MatchReplayRecord {
  id: string;
  roomId: string;
  roundNumber: number;
  dealer: Seat;
  declarer: Seat | null;
  trumpSuit: TrumpSuit | null;
  contractLevel?: number;
  contractType?: ContractType;
  winningTeam: 'TeamA' | 'TeamB' | null;
  tricksWonTeamA: number;
  tricksWonTeamB: number;
  matchScoreTeamA: number;
  matchScoreTeamB: number;
  initialHands: Record<Seat, Card[]>;
  auctionHistory?: any[];
  tricksHistory: any[];
  timestamp: number;
}

export interface BotFeedbackRecord {
  id: string;
  roomId: string;
  matchId?: string;
  timestamp: number;
  fromSeat: Seat;
  toSeat: Seat;
  isPartner: boolean;
  objectType: ThrowableObjectType;
  sentiment: 'bad_move' | 'good_move' | 'neutral'; // 'shoe' = bad_move, 'medal' = good_move, 'beer' = neutral
  botEngine: 'casual' | 'super' | string;
  actionType: 'play_card' | 'bid' | 'declare_trump' | 'unknown';
  actionDetails: {
    lastReasoning?: {
      seat: Seat;
      action: string;
      cardId?: string;
      bidText?: string;
      reason: string;
      timestamp: number;
    };
    botHandRemaining?: Card[];
    currentTrick?: PlayedCard[];
    contract?: {
      declarer: Seat | null;
      trumpSuit: TrumpSuit | null;
      level?: number;
      contractType?: ContractType;
    };
  };
}

let pool: pg.Pool | null = null;
let isInitialized = false;

export function getTelemetryPool(): pg.Pool | null {
  return pool;
}

/**
 * Initializes the database connection and tables.
 * Safe to call multiple times.
 */
export async function initTelemetryDatabase(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    try {
      if (!pool) {
        const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
        pool = new pg.Pool({
          connectionString: dbUrl,
          ssl: isLocalhost ? false : { rejectUnauthorized: false },
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      }

      // Automatically migrate / create tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS match_replays (
          id VARCHAR(64) PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL,
          round_number INT DEFAULT 1,
          dealer VARCHAR(16) NOT NULL,
          declarer VARCHAR(16),
          trump_suit VARCHAR(8),
          contract_level INT,
          contract_type VARCHAR(16),
          winning_team VARCHAR(16),
          tricks_won_team_a INT,
          tricks_won_team_b INT,
          match_score_team_a INT,
          match_score_team_b INT,
          initial_hands JSONB NOT NULL,
          auction_history JSONB NOT NULL,
          tricks_history JSONB NOT NULL,
          timestamp BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_feedback (
          id VARCHAR(64) PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL,
          match_id VARCHAR(64),
          timestamp BIGINT NOT NULL,
          from_seat VARCHAR(16) NOT NULL,
          to_seat VARCHAR(16) NOT NULL,
          is_partner BOOLEAN NOT NULL,
          object_type VARCHAR(16) NOT NULL,
          sentiment VARCHAR(16) NOT NULL,
          bot_engine VARCHAR(32) NOT NULL,
          action_type VARCHAR(16) NOT NULL,
          action_details JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_bot_feedback_sentiment ON bot_feedback(sentiment);
        CREATE INDEX IF NOT EXISTS idx_bot_feedback_to_seat ON bot_feedback(to_seat);
        CREATE INDEX IF NOT EXISTS idx_bot_feedback_partner ON bot_feedback(is_partner);
        CREATE INDEX IF NOT EXISTS idx_match_replays_room ON match_replays(room_id);
      `);

      isInitialized = true;
      console.log('✅ [TelemetryDB] Connected to PostgreSQL and tables verified.');
      return true;
    } catch (err) {
      console.warn('⚠️ [TelemetryDB] Could not connect to PostgreSQL. Falling back to local file storage.', err);
      pool = null;
    }
  }

  // Fallback to local files
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      // Ignore if dir exists or read-only
    }
  }
  isInitialized = true;
  console.log('📁 [TelemetryDB] Local file storage mode enabled (./data).');
  return false;
}

/**
 * Asynchronously saves a completed round replay.
 * Completely non-blocking and fire-and-forget.
 */
export async function saveMatchReplay(replay: MatchReplayRecord): Promise<void> {
  try {
    if (pool) {
      await pool.query(
        `INSERT INTO match_replays (
          id, room_id, round_number, dealer, declarer, trump_suit, contract_level, contract_type,
          winning_team, tricks_won_team_a, tricks_won_team_b, match_score_team_a, match_score_team_b,
          initial_hands, auction_history, tricks_history, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO NOTHING`,
        [
          replay.id,
          replay.roomId,
          replay.roundNumber,
          replay.dealer,
          replay.declarer,
          replay.trumpSuit,
          replay.contractLevel,
          replay.contractType,
          replay.winningTeam,
          replay.tricksWonTeamA,
          replay.tricksWonTeamB,
          replay.matchScoreTeamA,
          replay.matchScoreTeamB,
          JSON.stringify(replay.initialHands),
          JSON.stringify(replay.auctionHistory),
          JSON.stringify(replay.tricksHistory),
          replay.timestamp,
        ]
      );
    } else {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.appendFileSync(
        path.join(dataDir, 'telemetry_replays.jsonl'),
        JSON.stringify(replay) + '\n',
        'utf8'
      );
    }
  } catch (err) {
    console.error('[TelemetryDB] Error saving match replay:', err);
  }
}

/**
 * Asynchronously saves human feedback (shoe, medal, etc.) given to a bot.
 * Completely non-blocking and fire-and-forget.
 */
export async function saveBotFeedback(feedback: BotFeedbackRecord): Promise<void> {
  try {
    if (pool) {
      await pool.query(
        `INSERT INTO bot_feedback (
          id, room_id, match_id, timestamp, from_seat, to_seat, is_partner,
          object_type, sentiment, bot_engine, action_type, action_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING`,
        [
          feedback.id,
          feedback.roomId,
          feedback.matchId || null,
          feedback.timestamp,
          feedback.fromSeat,
          feedback.toSeat,
          feedback.isPartner,
          feedback.objectType,
          feedback.sentiment,
          feedback.botEngine,
          feedback.actionType,
          JSON.stringify(feedback.actionDetails),
        ]
      );
    } else {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.appendFileSync(
        path.join(dataDir, 'telemetry_feedback.jsonl'),
        JSON.stringify(feedback) + '\n',
        'utf8'
      );
    }
  } catch (err) {
    console.error('[TelemetryDB] Error saving bot feedback:', err);
  }
}

/**
 * Queries overall summary statistics.
 */
export async function getTelemetryStats(): Promise<{
  totalReplays: number;
  totalFeedback: number;
  shoesBadMoves: number;
  medalsGoodMoves: number;
  partnerShoesCount: number;
  storageType: 'postgres' | 'local_file';
}> {
  if (pool) {
    try {
      const replaysRes = await pool.query('SELECT COUNT(*) AS count FROM match_replays');
      const feedbackRes = await pool.query(`
        SELECT 
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE sentiment = 'bad_move') AS shoes,
          COUNT(*) FILTER (WHERE sentiment = 'good_move') AS medals,
          COUNT(*) FILTER (WHERE sentiment = 'bad_move' AND is_partner = true) AS partner_shoes
        FROM bot_feedback
      `);
      return {
        totalReplays: parseInt(replaysRes.rows[0]?.count || '0', 10),
        totalFeedback: parseInt(feedbackRes.rows[0]?.total || '0', 10),
        shoesBadMoves: parseInt(feedbackRes.rows[0]?.shoes || '0', 10),
        medalsGoodMoves: parseInt(feedbackRes.rows[0]?.medals || '0', 10),
        partnerShoesCount: parseInt(feedbackRes.rows[0]?.partner_shoes || '0', 10),
        storageType: 'postgres',
      };
    } catch (err) {
      console.error('[TelemetryDB] Error getting stats from postgres:', err);
    }
  }

  // Local file aggregation
  const dataDir = path.resolve(process.cwd(), 'data');
  const replaysFile = path.join(dataDir, 'telemetry_replays.jsonl');
  const feedbackFile = path.join(dataDir, 'telemetry_feedback.jsonl');

  let totalReplays = 0;
  let totalFeedback = 0;
  let shoesBadMoves = 0;
  let medalsGoodMoves = 0;
  let partnerShoesCount = 0;

  if (fs.existsSync(replaysFile)) {
    const lines = fs.readFileSync(replaysFile, 'utf8').trim().split('\n').filter(Boolean);
    totalReplays = lines.length;
  }

  if (fs.existsSync(feedbackFile)) {
    const lines = fs.readFileSync(feedbackFile, 'utf8').trim().split('\n').filter(Boolean);
    totalFeedback = lines.length;
    for (const line of lines) {
      try {
        const item: BotFeedbackRecord = JSON.parse(line);
        if (item.sentiment === 'bad_move') shoesBadMoves++;
        if (item.sentiment === 'good_move') medalsGoodMoves++;
        if (item.sentiment === 'bad_move' && item.isPartner) partnerShoesCount++;
      } catch {
        // ignore invalid lines
      }
    }
  }

  return {
    totalReplays,
    totalFeedback,
    shoesBadMoves,
    medalsGoodMoves,
    partnerShoesCount,
    storageType: pool ? 'postgres' : 'local_file',
  };
}

/**
 * Returns recent bot feedback records with optional filtering.
 */
export async function getBotFeedbackList(options?: {
  sentiment?: 'bad_move' | 'good_move';
  partnerOnly?: boolean;
  limit?: number;
}): Promise<BotFeedbackRecord[]> {
  const limit = options?.limit ?? 50;
  if (pool) {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (options?.sentiment) {
        conditions.push(`sentiment = $${idx++}`);
        values.push(options.sentiment);
      }
      if (options?.partnerOnly) {
        conditions.push(`is_partner = true`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      values.push(limit);
      const query = `
        SELECT 
          id, room_id AS "roomId", match_id AS "matchId", timestamp,
          from_seat AS "fromSeat", to_seat AS "toSeat", is_partner AS "isPartner",
          object_type AS "objectType", sentiment, bot_engine AS "botEngine",
          action_type AS "actionType", action_details AS "actionDetails"
        FROM bot_feedback
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${idx}
      `;
      const res = await pool.query(query, values);
      return res.rows;
    } catch (err) {
      console.error('[TelemetryDB] Error querying bot feedback:', err);
      return [];
    }
  }

  // Local file fallback
  const dataDir = path.resolve(process.cwd(), 'data');
  const feedbackFile = path.join(dataDir, 'telemetry_feedback.jsonl');
  if (!fs.existsSync(feedbackFile)) return [];

  const results: BotFeedbackRecord[] = [];
  const lines = fs.readFileSync(feedbackFile, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
    try {
      const item: BotFeedbackRecord = JSON.parse(lines[i]);
      if (options?.sentiment && item.sentiment !== options.sentiment) continue;
      if (options?.partnerOnly && !item.isPartner) continue;
      results.push(item);
    } catch {
      // ignore
    }
  }
  return results;
}

/**
 * Returns recent match replays.
 */
export async function getMatchReplaysList(limit = 50): Promise<MatchReplayRecord[]> {
  if (pool) {
    try {
      const query = `
        SELECT 
          id, room_id AS "roomId", round_number AS "roundNumber", dealer, declarer,
          trump_suit AS "trumpSuit", contract_level AS "contractLevel", contract_type AS "contractType",
          winning_team AS "winningTeam", tricks_won_team_a AS "tricksWonTeamA", tricks_won_team_b AS "tricksWonTeamB",
          match_score_team_a AS "matchScoreTeamA", match_score_team_b AS "matchScoreTeamB",
          initial_hands AS "initialHands", auction_history AS "auctionHistory", tricks_history AS "tricksHistory",
          timestamp
        FROM match_replays
        ORDER BY timestamp DESC
        LIMIT $1
      `;
      const res = await pool.query(query, [limit]);
      return res.rows;
    } catch (err) {
      console.error('[TelemetryDB] Error querying match replays:', err);
      return [];
    }
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const replaysFile = path.join(dataDir, 'telemetry_replays.jsonl');
  if (!fs.existsSync(replaysFile)) return [];

  const results: MatchReplayRecord[] = [];
  const lines = fs.readFileSync(replaysFile, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
    try {
      results.push(JSON.parse(lines[i]));
    } catch {
      // ignore
    }
  }
  return results;
}
