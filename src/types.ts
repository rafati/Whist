export type Seat = 'North' | 'South' | 'East' | 'West';

export type Team = 'TeamA' | 'TeamB'; // Team A = North & South, Team B = East & West

export type Suit = 'S' | 'H' | 'D' | 'C'; // Spades, Hearts, Diamonds, Clubs
export type TrumpSuit = Suit | 'NT';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string; // e.g. "AS", "10H"
  suit: Suit;
  rank: Rank;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  isBot?: boolean;
  isDisconnected?: boolean;
  botReplaceAt?: number;
}

export type ContractType = 'Suit' | 'NT';

export interface Bid {
  seat: Seat;
  type: 'bid' | 'pass';
  level?: number; // 1 to 7
  contractType?: ContractType; // 'Suit' | 'NT'
  isDealerPrivilegeMatch?: boolean; // dealer matching highest numeric level to declare Suit or NT
  isDealerPrivilegeMatchExceedNT?: boolean;
  isBotAutoPlay?: boolean; // true when a bot automatically made this bid due to human turn timeout
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
  isBotAutoPlay?: boolean; // true when a bot automatically played this card due to human turn timeout
}

export interface AutoPlayNotice {
  id: string;
  seat: Seat;
  playerName: string;
  actionText: string;
  phase: 'bidding' | 'declaring' | 'playing';
  timestamp: number;
}

export interface TrickResult {
  trickNumber: number;
  leader: Seat;
  cards: PlayedCard[];
  winner: Seat;
  winningCard: Card;
  ledSuit: Suit;
}

export interface RoundScoreBreakdown {
  roundNumber: number;
  declarer: Seat;
  contractTeam: Team;
  defendingTeam: Team;
  bidLevel: number;
  contractType: ContractType;
  trumpSuit: TrumpSuit;
  tricksWonBidTeam: number;
  tricksWonDefTeam: number;
  bidSuccess: boolean;
  scoreDeltaBidTeam: number;
  scoreDeltaDefTeam: number;
  explanation: string[];
}

export interface MisdealInfo {
  seat: Seat;
  playerName: string;
  hand: Card[];
  message: string;
  expiresAt: number;
}

export type GamePhase = 'waiting' | 'bidding' | 'declaring' | 'playing' | 'round_over' | 'game_over' | 'misdeal';

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  dealer: Seat;
  misdealInfo?: MisdealInfo | null;

  // Turn Timer & Bot Auto-Play Feedback
  turnDeadlineAt?: number | null;
  turnDurationMs?: number | null;
  lastAutoPlayNotice?: AutoPlayNotice | null;

  // Hands
  hands: Record<Seat, Card[]>;
  cardsCount: Record<Seat, number>;

  // Bidding Phase
  auctionTurnsCount: number; // 0 to 4
  currentBidder: Seat | null;
  openingBidder: Seat | null;
  bids: Bid[];
  highestBid: Bid | null;
  highestBidder: Seat | null;

  // Contract
  winningBid: Bid | null;
  declarer: Seat | null;
  trumpSuit: TrumpSuit | null;
  isTrumpAutoDeclared?: boolean;

  // Play Phase
  currentTurn: Seat | null;
  currentTrick: PlayedCard[];
  tricksHistory: TrickResult[];
  tricksWonCount: Record<Seat, number>;
  teamTricksWon: {
    TeamA: number; // North & South
    TeamB: number; // East & West
  };

  // Scores
  matchScores: {
    TeamA: number; // starts at 0, win at +11, eliminate at -11
    TeamB: number;
  };
  roundScores: RoundScoreBreakdown[];
  winnerTeam: Team | null;
  winnerReason: string | null;
}

export interface Room {
  id: string;
  code?: string; // 4-character invite code (e.g. "K7M2")
  name: string;
  createdAt: number;
  hostId: string;
  seats: Record<Seat, UserProfile | null>;
  gameState: GameState;
  botDifficulty?: 'casual' | 'super';
  isPrivate?: boolean; // Private friend rooms are hidden from public lobby list and joined via code/link
  isMatchmaking?: boolean; // Public matchmaking queue table
  matchmakingAutoStartAt?: number | null; // Timestamp when remaining matchmaking seats auto-fill with bots
  turnTimeoutMs?: number; // Configurable turn timer (default 10000ms = 10s; 0 = unlimited)
}

export type ThrowableObjectType = 'shoe' | 'beer' | 'medal';

export interface ThrownObjectEvent {
  id: string;
  roomId: string;
  fromSeat: Seat;
  toSeat: Seat;
  objectType: ThrowableObjectType;
  timestamp: number;
}

// Client to Server Messages
export type ClientMessage =
  | { type: 'join_room'; roomId: string; user: UserProfile }
  | { type: 'leave_room'; roomId: string; user: UserProfile }
  | { type: 'claim_seat'; roomId: string; seat: Seat; user: UserProfile }
  | { type: 'leave_seat'; roomId: string; seat: Seat }
  | { type: 'fill_bots'; roomId: string }
  | { type: 'set_bot_difficulty'; roomId: string; difficulty: 'casual' | 'super' }
  | { type: 'set_turn_timeout'; roomId: string; turnTimeoutMs: number }
  | { type: 'make_bid'; roomId: string; bid: Bid }
  | { type: 'declare_trump'; roomId: string; suit: Suit }
  | { type: 'play_card'; roomId: string; seat: Seat; card: Card }
  | { type: 'next_round'; roomId: string }
  | { type: 'restart_match'; roomId: string }
  | { type: 'skip_misdeal'; roomId: string }
  | { type: 'delete_room'; roomId: string }
  | { type: 'throw_object'; roomId: string; fromSeat: Seat; toSeat: Seat; objectType: ThrowableObjectType }
  | { type: 'voice_join'; roomId: string; peerId: string; user: UserProfile; seat?: Seat | null }
  | { type: 'voice_leave'; roomId: string; peerId: string }
  | { type: 'voice_signal'; roomId: string; toPeerId: string; fromPeerId: string; signal: any }
  | { type: 'voice_status'; roomId: string; peerId: string; isMuted: boolean; isDeafened: boolean }
  | { type: 'voice_speaking'; roomId: string; peerId: string; isSpeaking: boolean };

export interface VoicePeer {
  peerId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  seat: Seat | null;
  isMuted: boolean;
  isSpeaking: boolean;
  isDeafened: boolean;
}

export interface RoomSummary {
  id: string;
  code?: string;
  name: string;
  playersCount: number;
  humansCount?: number;
  status: GamePhase;
  isPrivate?: boolean;
  isMatchmaking?: boolean;
  turnTimeoutMs?: number;
}

// Server to Client Messages
export type ServerMessage =
  | { type: 'room_list'; rooms: RoomSummary[] }
  | { type: 'room_state'; room: Room }
  | { type: 'room_deleted'; roomId: string }
  | { type: 'object_thrown'; throwEvent: ThrownObjectEvent }
  | { type: 'voice_peers_list'; roomId: string; peers: VoicePeer[] }
  | { type: 'voice_peer_joined'; roomId: string; peer: VoicePeer }
  | { type: 'voice_peer_left'; roomId: string; peerId: string }
  | { type: 'voice_signal'; roomId: string; fromPeerId: string; toPeerId: string; signal: any }
  | { type: 'voice_peer_status'; roomId: string; peerId: string; isMuted: boolean; isDeafened: boolean }
  | { type: 'voice_peer_speaking'; roomId: string; peerId: string; isSpeaking: boolean }
  | { type: 'error'; message: string };
