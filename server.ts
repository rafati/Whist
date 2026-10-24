import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  Card,
  ClientMessage,
  GameState,
  MisdealInfo,
  Room,
  Seat,
  ServerMessage,
  Suit,
  UserProfile,
  Bid,
  TrumpSuit,
  VoicePeer,
  ThrownObjectEvent,
} from './src/types.ts';
import {
  calculateRoundScores,
  checkMatchEnd,
  createInitialGameState,
  dealHands,
  evaluateTrickWinner,
  findSeatWithoutWinningCards,
  getDealerPrivileges,
  getNextSeat,
  getTeam,
  getTeamName,
  isBidHigher,
  isCardLegal,
  isDealerPrivilegeMatch,
  isLegalBid,
  SEATS,
  startDealRound,
  SUIT_NAMES,
  SUIT_SYMBOLS,
} from './src/logic/gameLogic.ts';
import {
  ANIMATION_CONFIG,
  SERVER_TRICK_RESOLVE_DELAY_MS,
} from './src/logic/animationConfig.ts';
import { getBotBid, getBotCardPlay, getBotDeclaredSuit } from './src/logic/botAi.ts';
import {
  getSuperBotBid,
  getSuperBotCardPlay,
  getSuperBotDeclaredSuit,
} from './src/logic/superBot.ts';
import { runBatchSimulation } from './src/logic/simulator.ts';
import {
  getActiveBotPolicy,
  trainPolicyFromSimulation,
  resetBotPolicy,
} from './src/data/botPolicy.ts';
import { RoomSummary } from './src/types.ts';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// In-memory Room Storage
const rooms = new Map<string, Room>();
const clientSockets = new Map<WebSocket, { roomId?: string; user?: UserProfile }>();
const botTimers = new Map<string, NodeJS.Timeout>();
const turnTimeoutTimers = new Map<string, NodeJS.Timeout>();
const matchmakingTimers = new Map<string, NodeJS.Timeout>();
const misdealTimers = new Map<string, NodeJS.Timeout>();
const disconnectTimers = new Map<string, NodeJS.Timeout>(); // key: `${roomId}:${seat}`
const throwCooldowns = new Map<string, number>();

export const BOT_REPLACE_DELAY_MS = 10000; // 10 seconds before replacing a disconnected human player with a bot
export const DEFAULT_TURN_TIMEOUT_MS = ANIMATION_CONFIG.DEFAULT_TURN_TIMEOUT_MS; // 10 seconds default turn timeout

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  const existingCodes = new Set(
    Array.from(rooms.values())
      .map((r) => r.code?.toUpperCase())
      .filter(Boolean)
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export const BOT_NAME_POOL = ['فاشي الاسرار', 'صف السادس', 'ابو قرون'] as const;

export const BOT_NAMES: Record<Seat, string> = {
  North: 'فاشي الاسرار',
  West: 'صف السادس',
  East: 'ابو قرون',
  South: 'فاشي الاسرار',
};

const BOT_AVATARS: Record<Seat, string> = {
  North: 'https://api.dicebear.com/7.x/bottts/svg?seed=Polaris&backgroundColor=1e293b',
  West: 'https://api.dicebear.com/7.x/bottts/svg?seed=Zephyr&backgroundColor=1e293b',
  South: 'https://api.dicebear.com/7.x/bottts/svg?seed=Atlas&backgroundColor=1e293b',
  East: 'https://api.dicebear.com/7.x/bottts/svg?seed=Orion&backgroundColor=1e293b',
};

function getBotNameForSeat(currentSeats: Record<Seat, UserProfile | null>, seat: Seat): string {
  const preferred = BOT_NAMES[seat];
  const usedNames = new Set(
    SEATS.filter((s) => s !== seat && currentSeats[s]?.isBot).map((s) => currentSeats[s]!.name)
  );
  if (!usedNames.has(preferred)) {
    return preferred;
  }
  for (const candidate of BOT_NAME_POOL) {
    if (!usedNames.has(candidate)) {
      return candidate;
    }
  }
  return preferred;
}

function clearTurnTimeoutTimer(roomId: string) {
  if (turnTimeoutTimers.has(roomId)) {
    clearTimeout(turnTimeoutTimers.get(roomId)!);
    turnTimeoutTimers.delete(roomId);
  }
}

function clearMatchmakingTimer(roomId: string) {
  if (matchmakingTimers.has(roomId)) {
    clearTimeout(matchmakingTimers.get(roomId)!);
    matchmakingTimers.delete(roomId);
  }
}

function clearDisconnectTimer(roomId: string, seat: Seat) {
  const key = `${roomId}:${seat}`;
  if (disconnectTimers.has(key)) {
    clearTimeout(disconnectTimers.get(key)!);
    disconnectTimers.delete(key);
  }
}

function clearAllRoomDisconnectTimers(roomId: string) {
  for (const s of SEATS) {
    clearDisconnectTimer(roomId, s);
  }
}

function replaceDisconnectedPlayerWithBot(roomId: string, seat: Seat) {
  clearDisconnectTimer(roomId, seat);
  const room = rooms.get(roomId);
  if (!room) return;
  const occupant = room.seats[seat];
  if (!occupant || occupant.isBot || !occupant.isDisconnected) return;

  room.seats[seat] = {
    id: `bot_${seat.toLowerCase()}`,
    name: getBotNameForSeat(room.seats, seat),
    email: `${seat.toLowerCase()}@ai.studio`,
    avatar: BOT_AVATARS[seat],
    isBot: true,
  };

  scheduleBotActionIfNeeded(room.id);
  broadcastRoom(room.id);
  broadcastRoomList();
}

function handleHumanPlayerLeftRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Check if this user still has any other active open socket connected to this room
  for (const [sock, info] of clientSockets.entries()) {
    if (info.roomId === roomId && info.user?.id === userId && sock.readyState === WebSocket.OPEN) {
      return;
    }
  }

  // If game is in 'waiting' phase, vacate the seat immediately
  if (room.gameState.phase === 'waiting') {
    let vacated = false;
    for (const s of SEATS) {
      if (room.seats[s]?.id === userId && !room.seats[s]?.isBot) {
        clearDisconnectTimer(roomId, s);
        room.seats[s] = null;
        vacated = true;
      }
    }
    if (vacated) {
      broadcastRoom(room.id);
      broadcastRoomList();
    }
    return;
  }

  // Active game phase: mark player as disconnected and start 10-second bot replacement countdown
  let updated = false;
  const replaceAt = Date.now() + BOT_REPLACE_DELAY_MS;
  for (const s of SEATS) {
    const occupant = room.seats[s];
    if (occupant && !occupant.isBot && occupant.id === userId && !occupant.isDisconnected) {
      occupant.isDisconnected = true;
      occupant.botReplaceAt = replaceAt;
      clearDisconnectTimer(roomId, s);
      const timer = setTimeout(() => {
        replaceDisconnectedPlayerWithBot(roomId, s);
      }, BOT_REPLACE_DELAY_MS);
      disconnectTimers.set(`${roomId}:${s}`, timer);
      updated = true;
    }
  }

  if (updated) {
    broadcastRoom(room.id);
    broadcastRoomList();
  }
}

// Voice Chat Peer State
interface ServerVoicePeer {
  peerId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  seat: Seat | null;
  isMuted: boolean;
  isSpeaking: boolean;
  isDeafened: boolean;
  socket: WebSocket;
}

const roomVoicePeers = new Map<string, Map<string, ServerVoicePeer>>();

function broadcastToVoiceRoom(roomId: string, message: ServerMessage, excludePeerId?: string) {
  const peers = roomVoicePeers.get(roomId);
  if (!peers) return;
  const data = JSON.stringify(message);
  for (const peer of peers.values()) {
    if (excludePeerId && peer.peerId === excludePeerId) continue;
    if (peer.socket.readyState === WebSocket.OPEN) {
      peer.socket.send(data);
    }
  }
}

function removeVoicePeer(roomId: string, peerId: string) {
  const peers = roomVoicePeers.get(roomId);
  if (!peers) return;
  if (peers.has(peerId)) {
    peers.delete(peerId);
    if (peers.size === 0) {
      roomVoicePeers.delete(roomId);
    }
    broadcastToVoiceRoom(roomId, {
      type: 'voice_peer_left',
      roomId,
      peerId,
    });
  }
}

// Helper to broadcast room state to all clients in a room
function broadcastRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const payload: ServerMessage = {
    type: 'room_state',
    room,
  };
  const json = JSON.stringify(payload);

  for (const [ws, info] of clientSockets.entries()) {
    if (info.roomId === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

export function buildPublicRoomsSummary(): RoomSummary[] {
  return Array.from(rooms.values())
    .filter((r) => !r.isPrivate)
    .map((r) => {
      const occupants = Object.values(r.seats).filter(Boolean) as UserProfile[];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        playersCount: occupants.length,
        humansCount: occupants.filter((p) => !p.isBot).length,
        status: r.gameState.phase,
        isPrivate: Boolean(r.isPrivate),
        isMatchmaking: Boolean(r.isMatchmaking),
        turnTimeoutMs: r.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
      };
    });
}

// Broadcast room list to all lobby clients
function broadcastRoomList() {
  const list = buildPublicRoomsSummary();

  const payload: ServerMessage = {
    type: 'room_list',
    rooms: list,
  };
  const json = JSON.stringify(payload);

  for (const [ws, info] of clientSockets.entries()) {
    if (!info.roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

// Check and trigger bot actions if it's a bot's turn, or start the human turn timeout countdown
function scheduleBotActionIfNeeded(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Clear existing bot or turn timeout timers if any
  if (botTimers.has(roomId)) {
    clearTimeout(botTimers.get(roomId)!);
    botTimers.delete(roomId);
  }
  clearTurnTimeoutTimer(roomId);

  const { gameState, seats } = room;
  const turnTimeoutMs =
    typeof room.turnTimeoutMs === 'number' ? room.turnTimeoutMs : DEFAULT_TURN_TIMEOUT_MS;

  const BOT_BID_TIMEOUT_MS = 5000;
  const HUMAN_BID_TIMEOUT_MS = 20000;
  const BOT_DECLARE_TIMEOUT_MS = 5000;
  const HUMAN_DECLARE_TIMEOUT_MS = 20000;

  // 1. Bidding Turn: 5s for bots, 20s for humans
  if (gameState.phase === 'bidding' && gameState.currentBidder) {
    const activeSeat = gameState.currentBidder;
    const bidderProfile = seats[activeSeat];
    if (bidderProfile?.isBot) {
      gameState.turnDeadlineAt = Date.now() + BOT_BID_TIMEOUT_MS;
      gameState.turnDurationMs = BOT_BID_TIMEOUT_MS;
      const timer = setTimeout(() => {
        handleBotBid(roomId, activeSeat, false);
      }, BOT_BID_TIMEOUT_MS);
      botTimers.set(roomId, timer);
      return;
    } else if (turnTimeoutMs > 0) {
      gameState.turnDeadlineAt = Date.now() + HUMAN_BID_TIMEOUT_MS;
      gameState.turnDurationMs = HUMAN_BID_TIMEOUT_MS;
      const timer = setTimeout(() => {
        handleBotBid(roomId, activeSeat, true);
      }, HUMAN_BID_TIMEOUT_MS);
      turnTimeoutTimers.set(roomId, timer);
      return;
    }
  }

  // 2. Declaring Trump Suit Turn: 5s for bots, 20s for humans
  if (gameState.phase === 'declaring' && gameState.declarer) {
    const activeSeat = gameState.declarer;
    const declarerProfile = seats[activeSeat];
    if (declarerProfile?.isBot) {
      gameState.turnDeadlineAt = Date.now() + BOT_DECLARE_TIMEOUT_MS;
      gameState.turnDurationMs = BOT_DECLARE_TIMEOUT_MS;
      const timer = setTimeout(() => {
        handleBotDeclareTrump(roomId, activeSeat, false);
      }, BOT_DECLARE_TIMEOUT_MS);
      botTimers.set(roomId, timer);
      return;
    } else if (turnTimeoutMs > 0) {
      gameState.turnDeadlineAt = Date.now() + HUMAN_DECLARE_TIMEOUT_MS;
      gameState.turnDurationMs = HUMAN_DECLARE_TIMEOUT_MS;
      const timer = setTimeout(() => {
        handleBotDeclareTrump(roomId, activeSeat, true);
      }, HUMAN_DECLARE_TIMEOUT_MS);
      turnTimeoutTimers.set(roomId, timer);
      return;
    }
  }

  // 3. Playing Card Turn
  if (gameState.phase === 'playing' && gameState.currentTurn) {
    const activeSeat = gameState.currentTurn;
    const turnProfile = seats[activeSeat];
    if (turnProfile?.isBot) {
      gameState.turnDeadlineAt = null;
      gameState.turnDurationMs = null;
      const timer = setTimeout(() => {
        handleBotPlayCard(roomId, activeSeat, false);
      }, 950);
      botTimers.set(roomId, timer);
      return;
    } else if (turnTimeoutMs > 0) {
      gameState.turnDeadlineAt = Date.now() + turnTimeoutMs;
      gameState.turnDurationMs = turnTimeoutMs;
      const timer = setTimeout(() => {
        handleBotPlayCard(roomId, activeSeat, true);
      }, turnTimeoutMs);
      turnTimeoutTimers.set(roomId, timer);
      return;
    }
  }

  gameState.turnDeadlineAt = null;
  gameState.turnDurationMs = null;
}

function handleBotBid(roomId: string, seat: Seat, isHumanTimeoutAutoPlay = false) {
  const room = rooms.get(roomId);
  if (!room || room.gameState.phase !== 'bidding' || room.gameState.currentBidder !== seat) return;

  const isSuper = room.botDifficulty !== 'casual'; // default to super bot
  const bid = isSuper
    ? getSuperBotBid(room.gameState, seat)
    : getBotBid(room.gameState, seat);

  if (isHumanTimeoutAutoPlay) {
    const playerName = room.seats[seat]?.name || seat;
    const actionText =
      bid.type === 'pass'
        ? 'Passed'
        : `Bid ${bid.level} ${bid.contractType === 'NT' ? 'No Trump' : 'Suit'}`;
    room.gameState.lastAutoPlayNotice = {
      id: `auto_${Date.now()}_${seat}`,
      seat,
      playerName,
      actionText,
      phase: 'bidding',
      timestamp: Date.now(),
    };
  }

  processBid(room, { ...bid, isBotAutoPlay: isHumanTimeoutAutoPlay });
}

function handleBotDeclareTrump(roomId: string, seat: Seat, isHumanTimeoutAutoPlay = false) {
  const room = rooms.get(roomId);
  if (!room || room.gameState.phase !== 'declaring' || room.gameState.declarer !== seat) return;

  const hand = room.gameState.hands[seat];
  const isSuper = room.botDifficulty !== 'casual';
  const suit = isSuper
    ? getSuperBotDeclaredSuit(hand, room.gameState, seat)
    : getBotDeclaredSuit(hand);

  if (isHumanTimeoutAutoPlay) {
    const playerName = room.seats[seat]?.name || seat;
    room.gameState.lastAutoPlayNotice = {
      id: `auto_${Date.now()}_${seat}`,
      seat,
      playerName,
      actionText: `Declared ${SUIT_SYMBOLS[suit]} ${SUIT_NAMES[suit]}`,
      phase: 'declaring',
      timestamp: Date.now(),
    };
  }

  processDeclareTrump(room, suit, isHumanTimeoutAutoPlay);
}

function handleBotPlayCard(roomId: string, seat: Seat, isHumanTimeoutAutoPlay = false) {
  const room = rooms.get(roomId);
  if (!room || room.gameState.phase !== 'playing' || room.gameState.currentTurn !== seat) return;

  const trump = room.gameState.trumpSuit;
  if (!trump) return;

  const isSuper = room.botDifficulty !== 'casual';
  const card = isSuper
    ? getSuperBotCardPlay(room.gameState, seat, trump)
    : getBotCardPlay(room.gameState, seat, trump);

  if (isHumanTimeoutAutoPlay) {
    const playerName = room.seats[seat]?.name || seat;
    room.gameState.lastAutoPlayNotice = {
      id: `auto_${Date.now()}_${seat}`,
      seat,
      playerName,
      actionText: `Played ${card.rank}${SUIT_SYMBOLS[card.suit]}`,
      phase: 'playing',
      timestamp: Date.now(),
    };
  }

  processPlayCard(room, seat, card, isHumanTimeoutAutoPlay);
}

// Bidding Engine
function processBid(room: Room, bid: Bid) {
  const state = room.gameState;
  const currentSeat = state.currentBidder;
  if (!currentSeat || bid.seat !== currentSeat) return;

  clearTurnTimeoutTimer(room.id);

  const isDealer = state.dealer === currentSeat;
  const isFinalTurn = state.auctionTurnsCount === 3; // 4th turn

  if (bid.type === 'pass') {
    state.bids.push({
      seat: currentSeat,
      type: 'pass',
      isBotAutoPlay: Boolean(bid.isBotAutoPlay),
    });
  } else {
    if (!bid.level || !bid.contractType) return;

    const isLegal = isLegalBid(bid.level, bid.contractType, state.highestBid, isDealer && isFinalTurn);
    if (!isLegal) {
      console.warn(
        `[Bidding] Disallowed bid rejected: seat=${currentSeat}, bid=${bid.level}${bid.contractType}, high=${state.highestBid?.level}${state.highestBid?.contractType}`
      );
      return;
    }

    const isMatch = isDealerPrivilegeMatch(
      bid.level,
      bid.contractType,
      state.highestBid,
      isDealer && isFinalTurn
    );

    const recordedBid: Bid = {
      ...bid,
      isDealerPrivilegeMatch: isMatch,
      isBotAutoPlay: Boolean(bid.isBotAutoPlay),
    };
    state.bids.push(recordedBid);
    state.highestBid = recordedBid;
    state.highestBidder = currentSeat;
  }

  state.auctionTurnsCount++;

  if (state.auctionTurnsCount < 4) {
    // Move counter-clockwise to next bidder
    state.currentBidder = getNextSeat(currentSeat);
    scheduleBotActionIfNeeded(room.id);
    broadcastRoom(room.id);
    return;
  }

  // Exactly 4 turns completed: Auction Over
  state.currentBidder = null;

  if (!state.highestBid || state.highestBid.type === 'pass') {
    // All 4 players passed! Re-deal with next dealer
    const nextDealer = getNextSeat(state.dealer);
    executeDealRound(room, nextDealer);
    return;
  }

  // We have a winner!
  state.winningBid = state.highestBid;
  state.declarer = state.highestBidder;

  if (state.winningBid.contractType === 'Suit') {
    // Phase 3: Contract Declaration
    state.phase = 'declaring';
    scheduleBotActionIfNeeded(room.id);
    broadcastRoom(room.id);
  } else {
    // No Trump: Contract declaration skipped, play begins immediately
    state.phase = 'playing';
    state.trumpSuit = 'NT';
    state.isTrumpAutoDeclared = false;
    // NT Game: The Declarer leads first
    state.currentTurn = state.declarer;
    scheduleBotActionIfNeeded(room.id);
    broadcastRoom(room.id);
  }
}

// Contract Declaration Engine
function processDeclareTrump(room: Room, suit: Suit, isBotAutoPlay = false) {
  const state = room.gameState;
  if (state.phase !== 'declaring' || !state.declarer) return;

  clearTurnTimeoutTimer(room.id);

  state.trumpSuit = suit;
  state.isTrumpAutoDeclared = isBotAutoPlay;
  state.phase = 'playing';

  // Suit Game: Player to the Right of the Declarer leads first
  // Right of Declarer = getNextSeat(declarer) in counter-clockwise order
  state.currentTurn = getNextSeat(state.declarer);

  scheduleBotActionIfNeeded(room.id);
  broadcastRoom(room.id);
}

// Card Play Engine
function processPlayCard(room: Room, seat: Seat, card: Card, isBotAutoPlay = false) {
  const state = room.gameState;
  if (state.phase !== 'playing' || state.currentTurn !== seat) return;

  const hand = state.hands[seat];
  const cardIndex = hand.findIndex((c) => c.id === card.id);
  if (cardIndex === -1) return;

  const isOpeningLead = state.currentTrick.length === 0;
  const ledSuit = isOpeningLead ? null : state.currentTrick[0].card.suit;

  if (!isCardLegal(card, hand, ledSuit)) {
    return;
  }

  clearTurnTimeoutTimer(room.id);

  // Remove card from hand
  const [playedCard] = hand.splice(cardIndex, 1);
  state.cardsCount[seat] = hand.length;

  state.currentTrick.push({ seat, card: playedCard, isBotAutoPlay });

  if (state.currentTrick.length < 4) {
    // Next player counter-clockwise
    state.currentTurn = getNextSeat(seat);
    scheduleBotActionIfNeeded(room.id);
    broadcastRoom(room.id);
    return;
  }

  // Trick is complete! (4 cards played)
  state.currentTurn = null; // Pause turn input while resolving trick
  state.turnDeadlineAt = null;
  state.turnDurationMs = null;
  broadcastRoom(room.id);

  // Evaluate trick winner after short visual delay
  setTimeout(() => {
    const trickWinnerResult = evaluateTrickWinner(state.currentTrick, state.trumpSuit!);
    const winnerSeat = trickWinnerResult.winner;
    const winnerTeam = getTeam(winnerSeat);

    state.tricksWonCount[winnerSeat]++;
    state.teamTricksWon[winnerTeam]++;

    state.tricksHistory.push({
      trickNumber: state.tricksHistory.length + 1,
      leader: state.currentTrick[0].seat,
      cards: [...state.currentTrick],
      winner: winnerSeat,
      winningCard: trickWinnerResult.winningCard,
      ledSuit: state.currentTrick[0].card.suit,
    });

    state.currentTrick = [];

    // Check if round is over (13 tricks completed)
    if (state.tricksHistory.length === 13) {
      resolveRoundEnd(room);
    } else {
      // Winner of the trick leads the next trick
      state.currentTurn = winnerSeat;
      scheduleBotActionIfNeeded(room.id);
      broadcastRoom(room.id);
    }
  }, SERVER_TRICK_RESOLVE_DELAY_MS);
}

// Round End & Scoring Engine
function resolveRoundEnd(room: Room) {
  clearTurnTimeoutTimer(room.id);
  const state = room.gameState;
  state.turnDeadlineAt = null;
  state.turnDurationMs = null;
  const winningBid = state.winningBid!;
  const declarer = state.declarer!;
  const trump = state.trumpSuit!;

  const roundScore = calculateRoundScores(
    winningBid,
    declarer,
    trump,
    state.roundNumber,
    state.teamTricksWon
  );

  state.roundScores.push(roundScore);
  state.isSalpand = Boolean(roundScore.isSalpand);
  state.salpandTeam = roundScore.salpandTeam;

  // Update Match Scores
  state.matchScores.TeamA +=
    roundScore.contractTeam === 'TeamA' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;
  state.matchScores.TeamB +=
    roundScore.contractTeam === 'TeamB' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;

  // Check 2.7 Win/Loss Conditions (+10 victory, -10 elimination)
  const matchEnd = checkMatchEnd(state.matchScores);

  if (matchEnd.isOver) {
    state.phase = 'game_over';
    state.winnerTeam = matchEnd.winnerTeam;
    state.winnerReason = roundScore.isSalpand && roundScore.salpandTeam
      ? `🔥 SALPAND VICTORY! ${getTeamName(roundScore.salpandTeam)} captured all 13 tricks (+11 pts)!`
      : matchEnd.reason;
  } else {
    state.phase = 'round_over';
  }

  broadcastRoom(room.id);
}

// Helper to fill remaining empty seats with bots and start the deal round
function fillBotsAndStartRoom(room: Room, callerUser?: UserProfile) {
  if (room.gameState.phase !== 'waiting') return;

  clearMatchmakingTimer(room.id);
  room.matchmakingAutoStartAt = null;

  if (callerUser) {
    const isAlreadySeated = SEATS.some((s) => room.seats[s]?.id === callerUser.id);
    if (!isAlreadySeated) {
      const firstAvailable = SEATS.find((s) => !room.seats[s]);
      if (firstAvailable) {
        room.seats[firstAvailable] = {
          id: callerUser.id,
          name: callerUser.name,
          email: callerUser.email,
          avatar: callerUser.avatar,
        };
      }
    }
  }

  for (const s of SEATS) {
    if (!room.seats[s]) {
      room.seats[s] = {
        id: `bot_${s.toLowerCase()}`,
        name: getBotNameForSeat(room.seats, s),
        email: `${s.toLowerCase()}@ai.studio`,
        avatar: BOT_AVATARS[s],
        isBot: true,
      };
    }
  }

  const allOccupied = SEATS.every((s) => room.seats[s] !== null);
  if (allOccupied) {
    const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
    executeDealRound(room, randomDealer, 1);
  } else {
    broadcastRoom(room.id);
    broadcastRoomList();
  }
}

// Execute a deal round with unwinnable hand (misdeal) detection and auto re-deal
function executeDealRound(room: Room, dealerSeat: Seat, roundNumber?: number) {
  // Clear any existing misdeal timer, bot timer, turn timer, or matchmaking timer for this room
  if (misdealTimers.has(room.id)) {
    clearTimeout(misdealTimers.get(room.id)!);
    misdealTimers.delete(room.id);
  }
  if (botTimers.has(room.id)) {
    clearTimeout(botTimers.get(room.id)!);
    botTimers.delete(room.id);
  }
  clearTurnTimeoutTimer(room.id);
  clearMatchmakingTimer(room.id);
  room.matchmakingAutoStartAt = null;

  // Deal hands and check if any player has 0 winning cards
  const hands = dealHands();
  const unwinnableSeat = findSeatWithoutWinningCards(hands);

  if (unwinnableSeat) {
    const seatPlayer = room.seats[unwinnableSeat];
    const playerName = seatPlayer?.name || unwinnableSeat;
    const misdealInfo: MisdealInfo = {
      seat: unwinnableSeat,
      playerName,
      hand: hands[unwinnableSeat],
      message: `${playerName} has no winning cards — Re-dealing...`,
      expiresAt: Date.now() + 10000,
    };

    room.gameState = {
      ...room.gameState,
      phase: 'misdeal',
      dealer: dealerSeat,
      hands,
      misdealInfo,
      currentBidder: null,
      openingBidder: null,
      currentTurn: null,
      currentTrick: [],
      turnDeadlineAt: null,
      turnDurationMs: null,
    };
    if (typeof roundNumber === 'number') {
      room.gameState.roundNumber = roundNumber;
    }

    broadcastRoom(room.id);
    broadcastRoomList();

    // Auto re-deal after 10s: pass deal to the next dealer counter-clockwise
    const timer = setTimeout(() => {
      misdealTimers.delete(room.id);
      const nextDealer = getNextSeat(dealerSeat);
      executeDealRound(room, nextDealer, roundNumber);
    }, 10000);
    misdealTimers.set(room.id, timer);
    return;
  }

  // All 4 players have at least one winning card - proceed to bidding
  room.gameState = startDealRound(room.gameState, dealerSeat, hands);
  if (typeof roundNumber === 'number') {
    room.gameState.roundNumber = roundNumber;
  }

  scheduleBotActionIfNeeded(room.id);
  broadcastRoom(room.id);
  broadcastRoomList();
}

// Start Next Round
function advanceToNextRound(room: Room) {
  const state = room.gameState;
  const nextDealer = getNextSeat(state.dealer);
  const nextRoundNumber = state.roundNumber + 1;

  executeDealRound(room, nextDealer, nextRoundNumber);
}

// Reset entire match
function resetMatch(room: Room) {
  const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
  const freshState = createInitialGameState(randomDealer);
  room.gameState = freshState;
  executeDealRound(room, randomDealer, 1);
}

// WebSocket Connection Management
wss.on('connection', (ws) => {
  clientSockets.set(ws, {});

  // Send initial public room list
  const list = buildPublicRoomsSummary();
  ws.send(JSON.stringify({ type: 'room_list', rooms: list } satisfies ServerMessage));

  ws.on('message', (data) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      if (msg.type === 'join_room') {
        const room = rooms.get(msg.roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' } satisfies ServerMessage));
          return;
        }
        clientSockets.set(ws, { roomId: msg.roomId, user: msg.user });

        // If this user was seated in this room and marked as disconnected (within 10s grace window), restore them
        let restored = false;
        if (msg.user) {
          for (const s of SEATS) {
            const occupant = room.seats[s];
            if (occupant && !occupant.isBot && occupant.id === msg.user.id && occupant.isDisconnected) {
              clearDisconnectTimer(room.id, s);
              occupant.isDisconnected = false;
              delete occupant.botReplaceAt;
              restored = true;
            }
          }
        }

        if (restored) {
          broadcastRoom(room.id);
        } else {
          ws.send(JSON.stringify({ type: 'room_state', room } satisfies ServerMessage));
        }
        broadcastRoomList();
        return;
      }

      if (msg.type === 'leave_room') {
        const info = clientSockets.get(ws);
        const roomId = msg.roomId || info?.roomId;
        const userId = info?.user?.id;
        if (info) {
          info.roomId = undefined;
        }
        if (roomId) {
          const peers = roomVoicePeers.get(roomId);
          if (peers) {
            for (const [peerId, peer] of peers.entries()) {
              if (peer.socket === ws) {
                removeVoicePeer(roomId, peerId);
              }
            }
          }
          if (userId) {
            handleHumanPlayerLeftRoom(roomId, userId);
          }
        }
        broadcastRoomList();
        return;
      }

      if (msg.type === 'claim_seat') {
        const room = rooms.get(msg.roomId);
        if (!room) return;

        // If seat already occupied by a human, don't allow
        const currentOccupant = room.seats[msg.seat];
        if (currentOccupant && !currentOccupant.isBot && currentOccupant.id !== msg.user.id) {
          ws.send(JSON.stringify({ type: 'error', message: 'Seat already occupied' } satisfies ServerMessage));
          return;
        }

        // Vacate any previous seat this user was in
        for (const s of SEATS) {
          if (room.seats[s]?.id === msg.user.id) {
            clearDisconnectTimer(room.id, s);
            room.seats[s] = null;
          }
        }

        clearDisconnectTimer(room.id, msg.seat);

        // Claim target seat with Google profile
        room.seats[msg.seat] = {
          id: msg.user.id,
          name: msg.user.name,
          email: msg.user.email,
          avatar: msg.user.avatar,
        };
        clientSockets.set(ws, { roomId: msg.roomId, user: msg.user });

        // 1.2 Start Trigger: Transitions from "Waiting" to "Active" automatically only when all 4 seats are occupied
        const allOccupied = SEATS.every((s) => room.seats[s] !== null);
        if (allOccupied && room.gameState.phase === 'waiting') {
          // Phase 1: The Deal
          // Dealer Selection: Randomized for the first round
          const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
          executeDealRound(room, randomDealer, 1);
        } else {
          broadcastRoom(room.id);
          broadcastRoomList();
        }
        return;
      }

      if (msg.type === 'leave_seat') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        const occupant = room.seats[msg.seat];
        if (room.gameState.phase === 'waiting') {
          clearDisconnectTimer(room.id, msg.seat);
          room.seats[msg.seat] = null;
          broadcastRoom(room.id);
          broadcastRoomList();
        } else if (occupant && !occupant.isBot) {
          handleHumanPlayerLeftRoom(room.id, occupant.id);
        }
        return;
      }

      if (msg.type === 'switch_to_bot') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        const seat = msg.seat;
        clearDisconnectTimer(room.id, seat);
        room.seats[seat] = {
          id: `bot_${seat.toLowerCase()}`,
          name: getBotNameForSeat(room.seats, seat),
          email: `${seat.toLowerCase()}@ai.studio`,
          avatar: BOT_AVATARS[seat],
          isBot: true,
        };
        scheduleBotActionIfNeeded(room.id);
        broadcastRoom(room.id);
        broadcastRoomList();
        return;
      }

      if (msg.type === 'fill_bots') {
        const room = rooms.get(msg.roomId);
        if (!room) return;

        if (room.gameState.phase === 'waiting') {
          const clientInfo = clientSockets.get(ws);
          fillBotsAndStartRoom(room, clientInfo?.user);
        }
        return;
      }

      if (msg.type === 'set_bot_difficulty') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        room.botDifficulty = msg.difficulty;
        broadcastRoom(room.id);
        return;
      }

      if (msg.type === 'set_turn_timeout') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        room.turnTimeoutMs = Math.max(0, Number(msg.turnTimeoutMs) || 0);
        scheduleBotActionIfNeeded(room.id);
        broadcastRoom(room.id);
        broadcastRoomList();
        return;
      }

      if (msg.type === 'make_bid') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        processBid(room, msg.bid);
        return;
      }

      if (msg.type === 'declare_trump') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        processDeclareTrump(room, msg.suit);
        return;
      }

      if (msg.type === 'play_card') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        processPlayCard(room, msg.seat, msg.card);
        return;
      }

      if (msg.type === 'next_round') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        if (room.gameState.phase === 'round_over') {
          advanceToNextRound(room);
        }
        return;
      }

      if (msg.type === 'restart_match') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        resetMatch(room);
        return;
      }

      if (msg.type === 'skip_misdeal') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        if (room.gameState.phase === 'misdeal') {
          if (misdealTimers.has(room.id)) {
            clearTimeout(misdealTimers.get(room.id)!);
            misdealTimers.delete(room.id);
          }
          const nextDealer = getNextSeat(room.gameState.dealer);
          executeDealRound(room, nextDealer, room.gameState.roundNumber);
        }
        return;
      }

      if (msg.type === 'delete_room') {
        const roomId = msg.roomId;
        if (rooms.has(roomId)) {
          const timer = botTimers.get(roomId);
          if (timer) {
            clearTimeout(timer);
            botTimers.delete(roomId);
          }
          const misdealTimer = misdealTimers.get(roomId);
          if (misdealTimer) {
            clearTimeout(misdealTimer);
            misdealTimers.delete(roomId);
          }
          clearTurnTimeoutTimer(roomId);
          clearMatchmakingTimer(roomId);
          clearAllRoomDisconnectTimers(roomId);
          rooms.delete(roomId);
          roomVoicePeers.delete(roomId);
          for (const [socket, info] of clientSockets.entries()) {
            if (info.roomId === roomId) {
              socket.send(JSON.stringify({ type: 'room_deleted', roomId } satisfies ServerMessage));
              info.roomId = undefined;
            }
          }
          broadcastRoomList();
        }
        return;
      }

      if (msg.type === 'throw_object') {
        const room = rooms.get(msg.roomId);
        if (!room) return;

        // Ensure fromSeat and toSeat are occupied seats in this room
        if (!room.seats[msg.fromSeat] || !room.seats[msg.toSeat]) return;

        // Rate limiting cooldown (1.5 seconds per seat)
        const cooldownKey = `${msg.roomId}:${msg.fromSeat}`;
        const now = Date.now();
        const lastThrow = throwCooldowns.get(cooldownKey) || 0;
        if (now - lastThrow < 1500) {
          return;
        }
        throwCooldowns.set(cooldownKey, now);

        const throwEvent: ThrownObjectEvent = {
          id: `throw_${now}_${Math.random().toString(36).substring(2, 7)}`,
          roomId: msg.roomId,
          fromSeat: msg.fromSeat,
          toSeat: msg.toSeat,
          objectType: msg.objectType,
          timestamp: now,
        };

        const payload: ServerMessage = {
          type: 'object_thrown',
          throwEvent,
        };
        const json = JSON.stringify(payload);

        for (const [clientWs, info] of clientSockets.entries()) {
          if (info.roomId === msg.roomId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(json);
          }
        }
        return;
      }

      if (msg.type === 'voice_join') {
        let peers = roomVoicePeers.get(msg.roomId);
        if (!peers) {
          peers = new Map();
          roomVoicePeers.set(msg.roomId, peers);
        }

        const peerInfo: ServerVoicePeer = {
          peerId: msg.peerId,
          userId: msg.user.id,
          userName: msg.user.name,
          userAvatar: msg.user.avatar,
          seat: msg.seat || null,
          isMuted: false,
          isSpeaking: false,
          isDeafened: false,
          socket: ws,
        };

        peers.set(msg.peerId, peerInfo);

        // Send existing peers list to the newly joined peer
        const existingList: VoicePeer[] = Array.from(peers.values()).map((p) => ({
          peerId: p.peerId,
          userId: p.userId,
          userName: p.userName,
          userAvatar: p.userAvatar,
          seat: p.seat,
          isMuted: p.isMuted,
          isSpeaking: p.isSpeaking,
          isDeafened: p.isDeafened,
        }));

        ws.send(
          JSON.stringify({
            type: 'voice_peers_list',
            roomId: msg.roomId,
            peers: existingList,
          } satisfies ServerMessage)
        );

        // Notify other peers in this room
        broadcastToVoiceRoom(
          msg.roomId,
          {
            type: 'voice_peer_joined',
            roomId: msg.roomId,
            peer: {
              peerId: peerInfo.peerId,
              userId: peerInfo.userId,
              userName: peerInfo.userName,
              userAvatar: peerInfo.userAvatar,
              seat: peerInfo.seat,
              isMuted: peerInfo.isMuted,
              isSpeaking: peerInfo.isSpeaking,
              isDeafened: peerInfo.isDeafened,
            },
          },
          msg.peerId
        );
        return;
      }

      if (msg.type === 'voice_leave') {
        removeVoicePeer(msg.roomId, msg.peerId);
        return;
      }

      if (msg.type === 'voice_signal') {
        const peers = roomVoicePeers.get(msg.roomId);
        if (!peers) return;
        const targetPeer = peers.get(msg.toPeerId);
        if (targetPeer && targetPeer.socket.readyState === WebSocket.OPEN) {
          targetPeer.socket.send(
            JSON.stringify({
              type: 'voice_signal',
              roomId: msg.roomId,
              fromPeerId: msg.fromPeerId,
              toPeerId: msg.toPeerId,
              signal: msg.signal,
            } satisfies ServerMessage)
          );
        }
        return;
      }

      if (msg.type === 'voice_status') {
        const peers = roomVoicePeers.get(msg.roomId);
        if (!peers) return;
        const peer = peers.get(msg.peerId);
        if (peer) {
          peer.isMuted = msg.isMuted;
          peer.isDeafened = msg.isDeafened;
          if (msg.isMuted) {
            peer.isSpeaking = false;
          }
          broadcastToVoiceRoom(msg.roomId, {
            type: 'voice_peer_status',
            roomId: msg.roomId,
            peerId: msg.peerId,
            isMuted: msg.isMuted,
            isDeafened: msg.isDeafened,
          });
        }
        return;
      }

      if (msg.type === 'voice_speaking') {
        const peers = roomVoicePeers.get(msg.roomId);
        if (!peers) return;
        const peer = peers.get(msg.peerId);
        if (peer && !peer.isMuted) {
          peer.isSpeaking = msg.isSpeaking;
          broadcastToVoiceRoom(msg.roomId, {
            type: 'voice_peer_speaking',
            roomId: msg.roomId,
            peerId: msg.peerId,
            isSpeaking: msg.isSpeaking,
          });
        }
        return;
      }
    } catch (err) {
      console.error('Error handling socket message:', err);
    }
  });

  ws.on('close', () => {
    const info = clientSockets.get(ws);
    const closedRoomId = info?.roomId;
    const closedUserId = info?.user?.id;
    clientSockets.delete(ws);

    if (closedRoomId && closedUserId) {
      handleHumanPlayerLeftRoom(closedRoomId, closedUserId);
    }

    // Remove peer from any voice room
    for (const [roomId, peers] of roomVoicePeers.entries()) {
      for (const [peerId, peer] of peers.entries()) {
        if (peer.socket === ws) {
          peers.delete(peerId);
          broadcastToVoiceRoom(roomId, {
            type: 'voice_peer_left',
            roomId,
            peerId,
          });
        }
      }
      if (peers.size === 0) {
        roomVoicePeers.delete(roomId);
      }
    }
  });
});

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Get public rooms
app.get('/api/rooms', (req, res) => {
  res.json(buildPublicRoomsSummary());
});

app.post('/api/rooms', (req, res) => {
  const {
    name,
    hostId,
    user,
    botDifficulty = 'super',
    autoFillBots = false,
    watchBots = false,
    isPrivate = false,
    turnTimeoutMs = ANIMATION_CONFIG.DEFAULT_TURN_TIMEOUT_MS,
  } = req.body;
  const roomId = 'room_' + Math.random().toString(36).substring(2, 8);
  const code = generateRoomCode();
  const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];

  const initialSouth =
    user && !watchBots
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        }
      : null;

  const shouldAutoFill = Boolean(autoFillBots || watchBots);

  const seats: Record<Seat, UserProfile | null> = {
    North: shouldAutoFill
      ? { id: 'bot_north', name: BOT_NAMES.North, email: 'north@ai.studio', avatar: BOT_AVATARS.North, isBot: true }
      : null,
    West: shouldAutoFill
      ? { id: 'bot_west', name: BOT_NAMES.West, email: 'west@ai.studio', avatar: BOT_AVATARS.West, isBot: true }
      : null,
    South:
      initialSouth ||
      (shouldAutoFill
        ? { id: 'bot_south', name: BOT_NAMES.South, email: 'south@ai.studio', avatar: BOT_AVATARS.South, isBot: true }
        : null),
    East: shouldAutoFill
      ? { id: 'bot_east', name: BOT_NAMES.East, email: 'east@ai.studio', avatar: BOT_AVATARS.East, isBot: true }
      : null,
  };

  const newRoom: Room = {
    id: roomId,
    code,
    name: name || `${isPrivate ? 'Private' : 'Table'} #${code}`,
    createdAt: Date.now(),
    hostId: hostId || user?.id || 'host',
    isPrivate: Boolean(isPrivate),
    turnTimeoutMs:
      typeof turnTimeoutMs === 'number' && !Number.isNaN(turnTimeoutMs)
        ? Math.max(0, turnTimeoutMs)
        : ANIMATION_CONFIG.DEFAULT_TURN_TIMEOUT_MS,
    seats,
    gameState: createInitialGameState(randomDealer),
    botDifficulty: botDifficulty === 'casual' ? 'casual' : 'super',
  };

  rooms.set(roomId, newRoom);
  if (shouldAutoFill && SEATS.every((s) => seats[s] !== null)) {
    executeDealRound(newRoom, randomDealer, 1);
  } else {
    broadcastRoomList();
  }
  res.json(newRoom);
});

// Join a room by 4-character room code (or room ID)
app.post('/api/rooms/join-code', (req, res) => {
  const { code, user } = req.body;
  const rawCode = String(code || '').trim();
  if (!rawCode) {
    return res.status(400).json({ error: 'Please enter a room code.' });
  }
  const normalizedCode = rawCode.toUpperCase();

  const room = Array.from(rooms.values()).find(
    (r) => r.code?.toUpperCase() === normalizedCode || r.id.toLowerCase() === rawCode.toLowerCase()
  );

  if (!room) {
    return res.status(404).json({ error: `No table found with code "${normalizedCode}".` });
  }

  // If user is provided and the game is still waiting for players, automatically seat them in the first available seat
  if (user && room.gameState.phase === 'waiting') {
    const alreadySeated = SEATS.some((s) => room.seats[s]?.id === user.id);
    if (!alreadySeated) {
      const preferredOrder: Seat[] = ['South', 'North', 'East', 'West'];
      const emptySeat = preferredOrder.find((s) => !room.seats[s]);
      if (emptySeat) {
        room.seats[emptySeat] = {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        };
      }
    }

    const allOccupied = SEATS.every((s) => room.seats[s] !== null);
    if (allOccupied) {
      const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
      executeDealRound(room, randomDealer, 1);
    } else {
      broadcastRoom(room.id);
      broadcastRoomList();
    }
  }

  res.json(room);
});

// Online Matchmaking Queue: Pair online players or auto-fill remaining seats with AI bots after countdown
app.post('/api/matchmaking', (req, res) => {
  const {
    user,
    botDifficulty = 'super',
    turnTimeoutMs = ANIMATION_CONFIG.DEFAULT_TURN_TIMEOUT_MS,
  } = req.body;

  if (!user || !user.id) {
    return res.status(400).json({ error: 'User profile is required for matchmaking.' });
  }

  // Look for an open matchmaking table waiting for players
  let targetRoom = Array.from(rooms.values()).find(
    (r) =>
      r.isMatchmaking &&
      !r.isPrivate &&
      r.gameState.phase === 'waiting' &&
      (SEATS.some((s) => r.seats[s]?.id === user.id) || SEATS.some((s) => !r.seats[s]))
  );

  if (targetRoom) {
    const alreadySeated = SEATS.some((s) => targetRoom!.seats[s]?.id === user.id);
    if (!alreadySeated) {
      const preferredOrder: Seat[] = ['South', 'North', 'East', 'West'];
      const emptySeat = preferredOrder.find((s) => !targetRoom!.seats[s]);
      if (emptySeat) {
        targetRoom.seats[emptySeat] = {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        };
      }
    }

    const allOccupied = SEATS.every((s) => targetRoom!.seats[s] !== null);
    if (allOccupied) {
      const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
      executeDealRound(targetRoom, randomDealer, 1);
    } else {
      broadcastRoom(targetRoom.id);
      broadcastRoomList();
    }

    return res.json(targetRoom);
  }

  // Otherwise create a new public matchmaking table with an auto-start countdown
  const roomId = 'mm_' + Math.random().toString(36).substring(2, 8);
  const code = generateRoomCode();
  const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
  const autoStartDelay = ANIMATION_CONFIG.MATCHMAKING_AUTO_START_MS;
  const autoStartAt = Date.now() + autoStartDelay;

  const newRoom: Room = {
    id: roomId,
    code,
    name: `Online Match #${code}`,
    createdAt: Date.now(),
    hostId: user.id,
    isPrivate: false,
    isMatchmaking: true,
    matchmakingAutoStartAt: autoStartAt,
    turnTimeoutMs:
      typeof turnTimeoutMs === 'number' && !Number.isNaN(turnTimeoutMs)
        ? Math.max(0, turnTimeoutMs)
        : ANIMATION_CONFIG.DEFAULT_TURN_TIMEOUT_MS,
    seats: {
      North: null,
      West: null,
      South: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      East: null,
    },
    gameState: createInitialGameState(randomDealer),
    botDifficulty: botDifficulty === 'casual' ? 'casual' : 'super',
  };

  rooms.set(roomId, newRoom);

  const mmTimer = setTimeout(() => {
    matchmakingTimers.delete(roomId);
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || currentRoom.gameState.phase !== 'waiting') return;
    const hasHuman = SEATS.some((s) => {
      const p = currentRoom.seats[s];
      return p !== null && !p.isBot;
    });
    if (hasHuman) {
      fillBotsAndStartRoom(currentRoom);
    } else {
      currentRoom.matchmakingAutoStartAt = null;
      broadcastRoom(roomId);
      broadcastRoomList();
    }
  }, autoStartDelay);

  matchmakingTimers.set(roomId, mmTimer);
  broadcastRoomList();
  res.json(newRoom);
});

app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const timer = botTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(roomId);
  }

  const misdealTimer = misdealTimers.get(roomId);
  if (misdealTimer) {
    clearTimeout(misdealTimer);
    misdealTimers.delete(roomId);
  }

  clearTurnTimeoutTimer(roomId);
  clearMatchmakingTimer(roomId);
  clearAllRoomDisconnectTimers(roomId);

  rooms.delete(roomId);
  roomVoicePeers.delete(roomId);

  for (const [socket, info] of clientSockets.entries()) {
    if (info.roomId === roomId) {
      socket.send(JSON.stringify({ type: 'room_deleted', roomId } satisfies ServerMessage));
      info.roomId = undefined;
    }
  }

  broadcastRoomList();
  res.json({ success: true, roomId });
});

// Simulation Benchmarking & Training Endpoint
app.post('/api/simulate', async (req, res) => {
  try {
    const {
      totalMatches = 20,
      teamAStrategy = 'super',
      teamBStrategy = 'casual',
      maxRoundsPerMatch = 20,
      saveToBrain = true,
    } = req.body;

    const count = Math.min(5000, Math.max(1, Number(totalMatches)));
    const result = await runBatchSimulation({
      totalMatches: count,
      teamAStrategy,
      teamBStrategy,
      maxRoundsPerMatch,
    });

    let activePolicy = getActiveBotPolicy();
    if (saveToBrain && teamAStrategy === 'super') {
      activePolicy = trainPolicyFromSimulation(
        result.totalMatches,
        result.totalRounds,
        result.teamAWins,
        result.teamABidSuccessRate
      );
    }

    res.json({
      ...result,
      policy: activePolicy,
    });
  } catch (err) {
    console.error('Simulation failed:', err);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// Bot Brain Status & Inspection API
app.get('/api/bot-brain', (req, res) => {
  res.json(getActiveBotPolicy());
});

// Reset Bot Brain API
app.post('/api/bot-brain/reset', (req, res) => {
  const resetPolicy = resetBotPolicy();
  res.json(resetPolicy);
});

// AI Autonomous Strategy Optimizer Endpoint
app.post('/api/ai-optimize', async (req, res) => {
  try {
    const { totalMatches = 500 } = req.body;
    const count = Math.min(2000, Math.max(100, Number(totalMatches)));

    const baseline = await runBatchSimulation({
      totalMatches: count,
      teamAStrategy: 'super',
      teamBStrategy: 'casual',
      maxRoundsPerMatch: 25,
    });

    const currentPolicy = getActiveBotPolicy();

    const prompt = `You are a Grandmaster Bridge and Tarneeb AI Engineer.
Simulation result of ${baseline.totalMatches} matches (${baseline.totalRounds} hands):
- Super Bot Wins: ${baseline.teamAWins} (${baseline.teamAWinRate}%) vs Casual: ${baseline.teamBWins} (${baseline.teamBWinRate}%).
- Super Bot Contracts: ${baseline.teamASuccessfulContracts}/${baseline.teamATotalContracts} (${baseline.teamABidSuccessRate}% success).
- Casual Bot Contracts: ${baseline.teamBSuccessfulContracts}/${baseline.teamBTotalContracts} (${baseline.teamBBidSuccessRate}% success).
- Tricks Average: Super Bot ${baseline.teamAAverageTricks} vs Casual ${baseline.teamBAverageTricks}.
Current Policy:
${JSON.stringify(currentPolicy, null, 2)}

Provide strategic analysis and optimal parameter adjustments to maximize partnership win rate.
Return ONLY valid JSON (no markdown fences):
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

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({});
    const aiRes = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
    });

    let raw = aiRes.text || '';
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);

    const { saveBotPolicy } = await import('./src/data/botPolicy.ts');
    const newPolicy = {
      ...currentPolicy,
      version: `3.5.${Date.now().toString().slice(-4)}`,
      lastUpdated: new Date().toISOString(),
      biddingMatrix: { ...currentPolicy.biddingMatrix, ...parsed.updatedPolicy.biddingMatrix },
      partnershipCoefficients: { ...currentPolicy.partnershipCoefficients, ...parsed.updatedPolicy.partnershipCoefficients },
      tacticalParameters: { ...currentPolicy.tacticalParameters, ...parsed.updatedPolicy.tacticalParameters },
    };
    saveBotPolicy(newPolicy);

    res.json({
      baseline,
      analysis: parsed.strategicAnalysis,
      adjustments: parsed.recommendedAdjustments,
      policy: newPolicy,
    });
  } catch (err: any) {
    console.error('AI optimization failed:', err);
    res.status(500).json({ error: 'AI optimization failed: ' + (err?.message || err) });
  }
});

// Seed an initial demo public table if empty
if (rooms.size === 0) {
  const initialId = 'grand-table-1';
  rooms.set(initialId, {
    id: initialId,
    code: 'PLAY',
    name: 'Grand Table 1 (Public)',
    createdAt: Date.now(),
    hostId: 'system',
    isPrivate: false,
    turnTimeoutMs: ANIMATION_CONFIG.DEFAULT_TURN_TIMEOUT_MS,
    seats: {
      North: null,
      West: null,
      South: null,
      East: null,
    },
    gameState: createInitialGameState('North'),
    botDifficulty: 'super',
  });
}

// Vite & Static Middleware Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Card Game Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
