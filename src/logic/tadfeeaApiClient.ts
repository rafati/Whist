import { Bid, Card, ContractType, Seat, TrumpSuit } from '../types.ts';

const DEFAULT_BASE_URL = process.env.TADFEEA_AI_URL || 'http://localhost:8008/api/v1';

/**
 * Mapping between our game seats ('North', 'West', 'South', 'East')
 * and the WhistAPI counter-clockwise player indices (0, 1, 2, 3):
 * - Player 0 = North (Team A)
 * - Player 1 = West  (Team B)
 * - Player 2 = South (Team A)
 * - Player 3 = East  (Team B)
 */
export function seatToPlayerIndex(seat: Seat): number {
  switch (seat) {
    case 'North': return 0;
    case 'West':  return 1;
    case 'South': return 2;
    case 'East':  return 3;
  }
}

export function playerIndexToSeat(idx: number): Seat {
  switch (((idx % 4) + 4) % 4) {
    case 0: return 'North';
    case 1: return 'West';
    case 2: return 'South';
    case 3: return 'East';
    default: return 'North';
  }
}

export function getBotSessionId(roomId: string, seat: Seat): string {
  return `${roomId}-seat${seat}`;
}

export interface ApiHealthStatus {
  ready: boolean;
  version?: string;
  model?: string;
}

export async function checkApiHealth(baseUrl: string = DEFAULT_BASE_URL): Promise<ApiHealthStatus> {
  const url = baseUrl.replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ready: false };
    const data = await res.json();
    return {
      ready: Boolean(data.ready),
      version: data.api_version,
      model: data.model_version,
    };
  } catch {
    return { ready: false };
  }
}

/**
 * Initialize an AI bot session on deal with its 13-card hand.
 */
export async function initBotSession(params: {
  roomId: string;
  seat: Seat;
  dealer: Seat;
  hand: Card[];
  matchScores?: { TeamA: number; TeamB: number };
  agentMode?: 'hybrid' | 'heuristic' | 'pimc' | 'simulation';
  baseUrl?: string;
}): Promise<boolean> {
  const url = (params.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const sessionId = getBotSessionId(params.roomId, params.seat);
  const playerIdx = seatToPlayerIndex(params.seat);
  const dealerIdx = seatToPlayerIndex(params.dealer);
  const scores = params.matchScores || { TeamA: 0, TeamB: 0 };
  const mode = params.agentMode || 'hybrid';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${url}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: sessionId,
        player: playerIdx,
        dealer: dealerIdx,
        agent_mode: mode,
        match_scores: {
          team_1: scores.TeamA,
          team_2: scores.TeamB,
        },
        initial_hand: params.hand.map((c) => c.id),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // If session already existed in WhistAPI, ensure its hand and state are cleanly reset for the new deal
    if (res.ok) {
      await fetch(`${url}/games/${sessionId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_hand: params.hand.map((c) => c.id),
          new_dealer: dealerIdx,
          match_scores: {
            team_1: scores.TeamA,
            team_2: scores.TeamB,
          },
        }),
      }).catch(() => {});
    }

    return res.ok;
  } catch (err) {
    console.warn(`[TadfeeaAPI] Failed to init session for ${sessionId}:`, err);
    return false;
  }
}

/**
 * Query the API bot for its bidding decision.
 */
export async function requestBotBid(params: {
  roomId: string;
  seat: Seat;
  turnIndex: number;
  hand?: Card[];
  dealer?: Seat;
  baseUrl?: string;
}): Promise<Bid | null> {
  const url = (params.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const sessionId = getBotSessionId(params.roomId, params.seat);
  const playerIdx = seatToPlayerIndex(params.seat);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${url}/games/${sessionId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: `bid-${params.roomId}-${params.seat}-${params.turnIndex}-${Date.now()}`,
        turn_id: params.turnIndex,
        turn_index: params.turnIndex,
        player: playerIdx,
        dealer: params.dealer ? seatToPlayerIndex(params.dealer) : undefined,
        hand: params.hand ? params.hand.map((c) => c.id) : undefined,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[TadfeeaAPI] Bid request returned status ${res.status} for ${sessionId}`);
      return null;
    }

    const data = await res.json();
    const action = data.action;
    if (!action) return null;

    if (action.type === 'PASS') {
      return {
        seat: params.seat,
        type: 'pass',
      };
    }

    if (action.type === 'BID' || action.type === 'MATCH') {
      const isMatch = action.type === 'MATCH';
      const contractType: ContractType = action.contract_type === 'NT' ? 'NT' : 'Suit';
      return {
        seat: params.seat,
        type: 'bid',
        level: Number(action.level) || 1,
        contractType,
        isDealerPrivilegeMatch: isMatch,
      };
    }

    return null;
  } catch (err) {
    console.warn(`[TadfeeaAPI] Request bid failed for ${sessionId}:`, err);
    return null;
  }
}

/**
 * Query the API bot for its card play decision.
 */
export async function requestBotPlay(params: {
  roomId: string;
  seat: Seat;
  trickNum: number;
  contract: {
    level: number;
    type: 'Suit' | 'NT';
    trump: TrumpSuit | null;
    declarer: Seat;
  };
  hand?: Card[];
  legalCards?: Card[];
  baseUrl?: string;
}): Promise<string | null> {
  const url = (params.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const sessionId = getBotSessionId(params.roomId, params.seat);
  const playerIdx = seatToPlayerIndex(params.seat);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${url}/games/${sessionId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: `play-${params.roomId}-${params.seat}-${params.trickNum}-${Date.now()}`,
        turn_id: params.trickNum,
        player: playerIdx,
        hand: params.hand ? params.hand.map((c) => c.id) : undefined,
        legal_actions: params.legalCards ? params.legalCards.map((c) => c.id) : undefined,
        contract: {
          level: params.contract.level,
          type: params.contract.type === 'NT' ? 'NT' : 'SUIT',
          trump: params.contract.trump && params.contract.trump !== 'NT' ? params.contract.trump : null,
          declarer: seatToPlayerIndex(params.contract.declarer),
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[TadfeeaAPI] Play request returned status ${res.status} for ${sessionId}`);
      return null;
    }

    const data = await res.json();
    return data?.action?.card || null;
  } catch (err) {
    console.warn(`[TadfeeaAPI] Request play failed for ${sessionId}:`, err);
    return null;
  }
}

let actionSequenceCounter = 1;

/**
 * Broadcast an observed move (Bid, Trump Selection, or Card Play)
 * to all active API bot sessions in the room to keep their tracking synchronized.
 */
export async function broadcastActionToApiBots(params: {
  roomId: string;
  botSeats: Seat[];
  actionType: 'BID' | 'TRUMP_SELECTION' | 'PLAY_CARD';
  payload: Record<string, any>;
  baseUrl?: string;
}): Promise<void> {
  if (!params.botSeats || params.botSeats.length === 0) return;
  const url = (params.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const seq = actionSequenceCounter++;
  const actionId = `act-${params.roomId}-seq${seq}-${Date.now()}`;

  const promises = params.botSeats.map(async (seat) => {
    const sessionId = getBotSessionId(params.roomId, seat);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      await fetch(`${url}/games/${sessionId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_id: actionId,
          sequence_number: seq,
          action_type: params.actionType,
          payload: params.payload,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      // Non-blocking best-effort memory broadcast
    }
  });

  await Promise.allSettled(promises);
}

/**
 * Clean up / delete bot sessions when a room is destroyed or reset.
 */
export async function cleanupBotSessions(params: {
  roomId: string;
  botSeats?: Seat[];
  baseUrl?: string;
}): Promise<void> {
  const seats: Seat[] = params.botSeats || ['North', 'East', 'South', 'West'];
  const url = (params.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

  const promises = seats.map(async (seat) => {
    const sessionId = getBotSessionId(params.roomId, seat);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      await fetch(`${url}/games/${sessionId}`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      // Silent cleanup
    }
  });

  await Promise.allSettled(promises);
}
