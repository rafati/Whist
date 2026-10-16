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
  isBidHigher,
  isCardLegal,
  SEATS,
  startDealRound,
} from './src/logic/gameLogic.ts';
import { SERVER_TRICK_RESOLVE_DELAY_MS } from './src/logic/animationConfig.ts';
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

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// In-memory Room Storage
const rooms = new Map<string, Room>();
const clientSockets = new Map<WebSocket, { roomId?: string; user?: UserProfile }>();
const botTimers = new Map<string, NodeJS.Timeout>();
const misdealTimers = new Map<string, NodeJS.Timeout>();

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

// Broadcast room list to all lobby clients
function broadcastRoomList() {
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    playersCount: Object.values(r.seats).filter(Boolean).length,
    status: r.gameState.phase,
  }));

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

// Check and trigger bot actions if it's a bot's turn
function scheduleBotActionIfNeeded(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Clear existing timer if any
  if (botTimers.has(roomId)) {
    clearTimeout(botTimers.get(roomId)!);
    botTimers.delete(roomId);
  }

  const { gameState, seats } = room;

  // 1. Bot Bidding Turn
  if (gameState.phase === 'bidding' && gameState.currentBidder) {
    const bidderProfile = seats[gameState.currentBidder];
    if (bidderProfile?.isBot) {
      const timer = setTimeout(() => {
        handleBotBid(roomId, gameState.currentBidder!);
      }, 900);
      botTimers.set(roomId, timer);
      return;
    }
  }

  // 2. Bot Declaring Trump Suit
  if (gameState.phase === 'declaring' && gameState.declarer) {
    const declarerProfile = seats[gameState.declarer];
    if (declarerProfile?.isBot) {
      const timer = setTimeout(() => {
        handleBotDeclareTrump(roomId, gameState.declarer!);
      }, 1000);
      botTimers.set(roomId, timer);
      return;
    }
  }

  // 3. Bot Playing Card
  if (gameState.phase === 'playing' && gameState.currentTurn) {
    const turnProfile = seats[gameState.currentTurn];
    if (turnProfile?.isBot) {
      const timer = setTimeout(() => {
        handleBotPlayCard(roomId, gameState.currentTurn!);
      }, 950);
      botTimers.set(roomId, timer);
      return;
    }
  }
}

function handleBotBid(roomId: string, seat: Seat) {
  const room = rooms.get(roomId);
  if (!room || room.gameState.phase !== 'bidding' || room.gameState.currentBidder !== seat) return;

  const isSuper = room.botDifficulty !== 'casual'; // default to super bot
  const bid = isSuper
    ? getSuperBotBid(room.gameState, seat)
    : getBotBid(room.gameState, seat);
  processBid(room, bid);
}

function handleBotDeclareTrump(roomId: string, seat: Seat) {
  const room = rooms.get(roomId);
  if (!room || room.gameState.phase !== 'declaring' || room.gameState.declarer !== seat) return;

  const hand = room.gameState.hands[seat];
  const isSuper = room.botDifficulty !== 'casual';
  const suit = isSuper
    ? getSuperBotDeclaredSuit(hand, room.gameState, seat)
    : getBotDeclaredSuit(hand);
  processDeclareTrump(room, suit);
}

function handleBotPlayCard(roomId: string, seat: Seat) {
  const room = rooms.get(roomId);
  if (!room || room.gameState.phase !== 'playing' || room.gameState.currentTurn !== seat) return;

  const trump = room.gameState.trumpSuit;
  if (!trump) return;

  const isSuper = room.botDifficulty !== 'casual';
  const card = isSuper
    ? getSuperBotCardPlay(room.gameState, seat, trump)
    : getBotCardPlay(room.gameState, seat, trump);
  processPlayCard(room, seat, card);
}

// Bidding Engine
function processBid(room: Room, bid: Bid) {
  const state = room.gameState;
  const currentSeat = state.currentBidder;
  if (!currentSeat || bid.seat !== currentSeat) return;

  const isDealer = state.dealer === currentSeat;
  const isFinalTurn = state.auctionTurnsCount === 3; // 4th turn

  if (bid.type === 'pass') {
    state.bids.push({ seat: currentSeat, type: 'pass' });
  } else {
    const isDealerSuitMatch = Boolean(
      isDealer &&
      isFinalTurn &&
      state.highestBid &&
      state.highestBid.type === 'bid' &&
      state.highestBid.level &&
      bid.contractType === 'Suit' &&
      bid.level === state.highestBid.level
    );

    // Validate bid
    if (isDealer && isFinalTurn && (bid.isDealerPrivilegeMatch || isDealerSuitMatch)) {
      // Dealer privilege match: matches highest suit bid
      const matchBid: Bid = {
        ...bid,
        isDealerPrivilegeMatch: true,
      };
      state.bids.push(matchBid);
      state.highestBid = matchBid;
      state.highestBidder = currentSeat;
    } else {
      // Check higher
      if (!bid.level || !bid.contractType) return;
      if (!isBidHigher(bid.level, bid.contractType, state.highestBid)) {
        return;
      }
      state.bids.push(bid);
      state.highestBid = bid;
      state.highestBidder = currentSeat;
    }
  }

  state.auctionTurnsCount++;

  if (state.auctionTurnsCount < 4) {
    // Move counter-clockwise to next bidder
    state.currentBidder = getNextSeat(currentSeat);
    broadcastRoom(room.id);
    scheduleBotActionIfNeeded(room.id);
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
    broadcastRoom(room.id);
    scheduleBotActionIfNeeded(room.id);
  } else {
    // No Trump: Contract declaration skipped, play begins immediately
    state.phase = 'playing';
    state.trumpSuit = 'NT';
    // NT Game: The Declarer leads first
    state.currentTurn = state.declarer;
    broadcastRoom(room.id);
    scheduleBotActionIfNeeded(room.id);
  }
}

// Contract Declaration Engine
function processDeclareTrump(room: Room, suit: Suit) {
  const state = room.gameState;
  if (state.phase !== 'declaring' || !state.declarer) return;

  state.trumpSuit = suit;
  state.phase = 'playing';

  // Suit Game: Player to the Right of the Declarer leads first
  // Right of Declarer = getNextSeat(declarer) in counter-clockwise order
  state.currentTurn = getNextSeat(state.declarer);

  broadcastRoom(room.id);
  scheduleBotActionIfNeeded(room.id);
}

// Card Play Engine
function processPlayCard(room: Room, seat: Seat, card: Card) {
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

  // Remove card from hand
  const [playedCard] = hand.splice(cardIndex, 1);
  state.cardsCount[seat] = hand.length;

  state.currentTrick.push({ seat, card: playedCard });

  if (state.currentTrick.length < 4) {
    // Next player counter-clockwise
    state.currentTurn = getNextSeat(seat);
    broadcastRoom(room.id);
    scheduleBotActionIfNeeded(room.id);
    return;
  }

  // Trick is complete! (4 cards played)
  state.currentTurn = null; // Pause turn input while resolving trick
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
      broadcastRoom(room.id);
      scheduleBotActionIfNeeded(room.id);
    }
  }, SERVER_TRICK_RESOLVE_DELAY_MS);
}

// Round End & Scoring Engine
function resolveRoundEnd(room: Room) {
  const state = room.gameState;
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

  // Update Match Scores
  state.matchScores.TeamA +=
    roundScore.contractTeam === 'TeamA' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;
  state.matchScores.TeamB +=
    roundScore.contractTeam === 'TeamB' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;

  // Check 2.7 Win/Loss Conditions (+10 victory, -10 elimination, +10 priority)
  const matchEnd = checkMatchEnd(state.matchScores);

  if (matchEnd.isOver) {
    state.phase = 'game_over';
    state.winnerTeam = matchEnd.winnerTeam;
    state.winnerReason = matchEnd.reason;
  } else {
    state.phase = 'round_over';
  }

  broadcastRoom(room.id);
}

// Execute a deal round with unwinnable hand (misdeal) detection and auto re-deal
function executeDealRound(room: Room, dealerSeat: Seat, roundNumber?: number) {
  // Clear any existing misdeal timer or bot timer for this room
  if (misdealTimers.has(room.id)) {
    clearTimeout(misdealTimers.get(room.id)!);
    misdealTimers.delete(room.id);
  }
  if (botTimers.has(room.id)) {
    clearTimeout(botTimers.get(room.id)!);
    botTimers.delete(room.id);
  }

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

  broadcastRoom(room.id);
  broadcastRoomList();
  scheduleBotActionIfNeeded(room.id);
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

  // Send initial room list
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    playersCount: Object.values(r.seats).filter(Boolean).length,
    status: r.gameState.phase,
  }));
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
        ws.send(JSON.stringify({ type: 'room_state', room } satisfies ServerMessage));
        broadcastRoomList();
        return;
      }

      if (msg.type === 'leave_room') {
        const info = clientSockets.get(ws);
        const roomId = msg.roomId || info?.roomId;
        if (roomId) {
          const room = rooms.get(roomId);
          if (room && room.gameState.phase === 'waiting' && info?.user) {
            let vacated = false;
            for (const s of SEATS) {
              if (room.seats[s]?.id === info.user.id) {
                room.seats[s] = null;
                vacated = true;
              }
            }
            if (vacated) {
              broadcastRoom(room.id);
            }
          }
          const peers = roomVoicePeers.get(roomId);
          if (peers) {
            for (const [peerId, peer] of peers.entries()) {
              if (peer.socket === ws) {
                removeVoicePeer(roomId, peerId);
              }
            }
          }
        }
        if (info) {
          info.roomId = undefined;
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
            room.seats[s] = null;
          }
        }

        // Claim target seat with Google profile
        room.seats[msg.seat] = {
          id: msg.user.id,
          name: msg.user.name,
          email: msg.user.email,
          avatar: msg.user.avatar,
        };

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
        if (room.gameState.phase === 'waiting') {
          room.seats[msg.seat] = null;
          broadcastRoom(room.id);
          broadcastRoomList();
        }
        return;
      }

      if (msg.type === 'fill_bots') {
        const room = rooms.get(msg.roomId);
        if (!room) return;

        if (room.gameState.phase === 'waiting') {
          // If the calling human client is in this room and not seated yet, place them in first available seat
          const clientInfo = clientSockets.get(ws);
          const currentUser = clientInfo?.user;
          const isAlreadySeated = Boolean(currentUser && SEATS.some((s) => room.seats[s]?.id === currentUser.id));
          if (currentUser && !isAlreadySeated) {
            const firstAvailable = SEATS.find((s) => !room.seats[s]);
            if (firstAvailable) {
              room.seats[firstAvailable] = {
                id: currentUser.id,
                name: currentUser.name,
                email: currentUser.email,
                avatar: currentUser.avatar,
              };
            }
          }

          const botNames: Record<Seat, string> = {
            North: 'Bot Polaris',
            West: 'Bot Zephyr',
            South: 'Bot Atlas',
            East: 'Bot Orion',
          };
          const botAvatars: Record<Seat, string> = {
            North: 'https://api.dicebear.com/7.x/bottts/svg?seed=Polaris&backgroundColor=1e293b',
            West: 'https://api.dicebear.com/7.x/bottts/svg?seed=Zephyr&backgroundColor=1e293b',
            South: 'https://api.dicebear.com/7.x/bottts/svg?seed=Atlas&backgroundColor=1e293b',
            East: 'https://api.dicebear.com/7.x/bottts/svg?seed=Orion&backgroundColor=1e293b',
          };

          for (const s of SEATS) {
            if (!room.seats[s]) {
              room.seats[s] = {
                id: `bot_${s.toLowerCase()}`,
                name: botNames[s],
                email: `${s.toLowerCase()}@ai.studio`,
                avatar: botAvatars[s],
                isBot: true,
              };
            }
          }

          // Check all occupied
          const allOccupied = SEATS.every((s) => room.seats[s] !== null);
          if (allOccupied) {
            const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];
            executeDealRound(room, randomDealer, 1);
          } else {
            broadcastRoom(room.id);
            broadcastRoomList();
          }
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
    clientSockets.delete(ws);
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

// Get or Create public rooms
app.get('/api/rooms', (req, res) => {
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    playersCount: Object.values(r.seats).filter(Boolean).length,
    status: r.gameState.phase,
  }));
  res.json(list);
});

app.post('/api/rooms', (req, res) => {
  const { name, hostId, user, botDifficulty = 'super', autoFillBots = false } = req.body;
  const roomId = 'room_' + Math.random().toString(36).substring(2, 8);
  const randomDealer = SEATS[Math.floor(Math.random() * SEATS.length)];

  const initialSouth = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      }
    : null;

  const botNames: Record<Seat, string> = {
    North: 'Bot Polaris',
    West: 'Bot Zephyr',
    South: 'Bot Atlas',
    East: 'Bot Orion',
  };
  const botAvatars: Record<Seat, string> = {
    North: 'https://api.dicebear.com/7.x/bottts/svg?seed=Polaris&backgroundColor=1e293b',
    West: 'https://api.dicebear.com/7.x/bottts/svg?seed=Zephyr&backgroundColor=1e293b',
    South: 'https://api.dicebear.com/7.x/bottts/svg?seed=Atlas&backgroundColor=1e293b',
    East: 'https://api.dicebear.com/7.x/bottts/svg?seed=Orion&backgroundColor=1e293b',
  };

  const seats: Record<Seat, UserProfile | null> = {
    North: autoFillBots
      ? { id: 'bot_north', name: botNames.North, email: 'north@ai.studio', avatar: botAvatars.North, isBot: true }
      : null,
    West: autoFillBots
      ? { id: 'bot_west', name: botNames.West, email: 'west@ai.studio', avatar: botAvatars.West, isBot: true }
      : null,
    South: initialSouth || (autoFillBots
      ? { id: 'bot_south', name: botNames.South, email: 'south@ai.studio', avatar: botAvatars.South, isBot: true }
      : null),
    East: autoFillBots
      ? { id: 'bot_east', name: botNames.East, email: 'east@ai.studio', avatar: botAvatars.East, isBot: true }
      : null,
  };

  const newRoom: Room = {
    id: roomId,
    name: name || `Table #${roomId.slice(-4).toUpperCase()}`,
    createdAt: Date.now(),
    hostId: hostId || 'host',
    seats,
    gameState: createInitialGameState(randomDealer),
    botDifficulty: botDifficulty === 'casual' ? 'casual' : 'super',
  };

  rooms.set(roomId, newRoom);
  if (autoFillBots && SEATS.every((s) => seats[s] !== null)) {
    executeDealRound(newRoom, randomDealer, 1);
  } else {
    broadcastRoomList();
  }
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
    name: 'Grand Table 1 (Public)',
    createdAt: Date.now(),
    hostId: 'system',
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
