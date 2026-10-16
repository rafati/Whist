import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/authContext.tsx';
import { useSocket } from '../lib/socketContext.tsx';
import {
  Card,
  PlayedCard,
  Room,
  Seat,
} from '../types.ts';
import {
  getTeam,
  getNextSeat,
  getPrevSeat,
  getPartner,
  isCardLegal,
  evaluateTrickWinner,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  sortHand,
} from '../logic/gameLogic.ts';
import { ANIMATION_CONFIG } from '../logic/animationConfig.ts';
import { CardView } from './CardView.tsx';
import { BiddingPanel } from './BiddingPanel.tsx';
import { SuitDeclarationModal } from './SuitDeclarationModal.tsx';
import { RoundSummaryModal } from './RoundSummaryModal.tsx';
import { GameOverModal } from './GameOverModal.tsx';
import { ScoreBoard } from './ScoreBoard.tsx';
import { SimulationModal } from './SimulationModal.tsx';
import { VoiceChatBar } from './VoiceChatBar.tsx';
import { useVoiceChat } from '../lib/useVoiceChat.ts';
import {
  ArrowLeft,
  Bot,
  Cpu,
  Crown,
  Sparkles,
  Trophy,
  Users,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  Headphones,
  MoreVertical,
  Smartphone,
  LogOut,
} from 'lucide-react';

// Physical flight offset vectors based on visual position
function getVisualEntryVector(pos: 'bottom' | 'top' | 'left' | 'right'): { x: number; y: number; rotate: number } {
  switch (pos) {
    case 'top': return { x: 0, y: -120, rotate: -4 };
    case 'bottom': return { x: 0, y: 135, rotate: 4 };
    case 'left': return { x: -135, y: 0, rotate: -6 };
    case 'right': return { x: 135, y: 0, rotate: 6 };
  }
}

// Physical sweep offset vectors from trick slot to winner's visual seat
function getVisualGatherVector(
  cardPos: 'bottom' | 'top' | 'left' | 'right',
  winnerPos: 'bottom' | 'top' | 'left' | 'right'
): { x: number; y: number; rotate: number } {
  if (winnerPos === 'top') {
    switch (cardPos) {
      case 'top': return { x: 0, y: -120, rotate: 0 };
      case 'bottom': return { x: 0, y: -210, rotate: 8 };
      case 'left': return { x: 55, y: -165, rotate: -12 };
      case 'right': return { x: -55, y: -165, rotate: 12 };
    }
  }
  if (winnerPos === 'bottom') {
    switch (cardPos) {
      case 'bottom': return { x: 0, y: 130, rotate: 0 };
      case 'top': return { x: 0, y: 220, rotate: -8 };
      case 'left': return { x: 55, y: 175, rotate: 12 };
      case 'right': return { x: -55, y: 175, rotate: -12 };
    }
  }
  if (winnerPos === 'left') {
    switch (cardPos) {
      case 'left': return { x: -130, y: 0, rotate: 0 };
      case 'right': return { x: -230, y: 0, rotate: -10 };
      case 'top': return { x: -175, y: 50, rotate: 12 };
      case 'bottom': return { x: -175, y: -50, rotate: -12 };
    }
  }
  if (winnerPos === 'right') {
    switch (cardPos) {
      case 'right': return { x: 130, y: 0, rotate: 0 };
      case 'left': return { x: 230, y: 0, rotate: 10 };
      case 'top': return { x: 175, y: 50, rotate: -12 };
      case 'bottom': return { x: 175, y: -50, rotate: 12 };
    }
  }
  return { x: 0, y: 0, rotate: 0 };
}

interface TrickCardItemProps {
  played: PlayedCard;
  isGathering: boolean;
  visualPos: 'bottom' | 'top' | 'left' | 'right';
  winnerVisualPos: 'bottom' | 'top' | 'left' | 'right' | null;
  isWinningCard: boolean;
  isLeadCard: boolean;
}

const TrickCardItem: React.FC<TrickCardItemProps> = ({
  played,
  isGathering,
  visualPos,
  winnerVisualPos,
  isWinningCard,
  isLeadCard,
}) => {
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasEntered(true);
    }, 20);
    return () => clearTimeout(timer);
  }, []);

  const entry = getVisualEntryVector(visualPos);
  const gather = winnerVisualPos ? getVisualGatherVector(visualPos, winnerVisualPos) : { x: 0, y: 0, rotate: 0 };

  let transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
  let opacity = 1;
  let transition = `transform ${ANIMATION_CONFIG.CARD_PLAY_DURATION_MS}ms ${ANIMATION_CONFIG.CARD_FLIGHT_EASING}, opacity ${ANIMATION_CONFIG.CARD_PLAY_DURATION_MS}ms ease-out`;

  if (isGathering && winnerVisualPos) {
    transform = `translate3d(${gather.x}px, ${gather.y}px, 0) scale(0.35) rotate(${gather.rotate}deg)`;
    opacity = 0;
    transition = `transform ${ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS}ms ${ANIMATION_CONFIG.TRICK_SWEEP_EASING}, opacity ${ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS}ms ease-in`;
  } else if (!hasEntered) {
    transform = `translate3d(${entry.x}px, ${entry.y}px, 0) scale(0.88) rotate(${entry.rotate}deg)`;
    opacity = 0.2;
  }

  const posClass = {
    top: 'top-1 sm:top-1.5 left-1/2 -translate-x-1/2',
    bottom: 'bottom-1 sm:bottom-1.5 left-1/2 -translate-x-1/2',
    left: 'left-1 sm:left-2 top-1/2 -translate-y-1/2',
    right: 'right-1 sm:right-2 top-1/2 -translate-y-1/2',
  }[visualPos];

  const team = getTeam(played.seat);

  return (
    <div
      style={{
        transform,
        opacity,
        transition,
        willChange: 'transform, opacity',
      }}
      className={`absolute ${posClass} z-10 flex flex-col items-center select-none pointer-events-none`}
    >
      <div
        className={`relative transition-all duration-200 ${
          isWinningCard
            ? 'ring-2 sm:ring-3 ring-amber-400 rounded-lg sm:rounded-xl shadow-[0_0_22px_rgba(251,191,36,0.9)] scale-105 z-20'
            : 'shadow-md'
        }`}
      >
        <CardView card={played.card} size="sm" />
        {isWinningCard ? (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 font-black text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow-md flex items-center gap-0.5 whitespace-nowrap animate-pulse">
            <Crown className="w-2.5 h-2.5 text-slate-950 fill-current" />
            <span>Winner</span>
          </div>
        ) : isLeadCard ? (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-600 text-slate-200 font-bold text-[7px] sm:text-[8px] px-1.5 py-[1px] rounded-full shadow whitespace-nowrap">
            Led
          </div>
        ) : null}
      </div>
      <span
        className={`text-[7px] sm:text-[8px] px-1.5 py-[1px] rounded font-bold mt-0.5 shadow-xs border leading-tight ${
          team === 'TeamA'
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/40'
            : 'bg-blue-950/90 text-blue-300 border-blue-600/40'
        }`}
      >
        {team === 'TeamA' ? 'Team 1' : 'Team 2'}
      </span>
    </div>
  );
};

interface VirtualTableProps {
  room: Room;
  onLeaveRoom: () => void;
}

export const VirtualTable: React.FC<VirtualTableProps> = ({ room, onLeaveRoom }) => {
  const { user } = useAuth();
  const {
    claimSeat,
    fillBots,
    setBotDifficulty,
    makeBid,
    declareTrump,
    playCard,
    nextRound,
    restartMatch,
    deleteRoom,
  } = useSocket();

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Developer-only flag to access AI Simulation Lab (?dev=true)
  const isDevMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('dev') === 'true';

  // Animation state for played tricks and card flight
  const [displayTrick, setDisplayTrick] = useState<PlayedCard[]>(room.gameState.currentTrick);
  const [isGathering, setIsGathering] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{ winner: Seat; winningCard: Card } | null>(null);
  const [celebratedSeat, setCelebratedSeat] = useState<Seat | null>(null);
  const [justPlayedHandCardId, setJustPlayedHandCardId] = useState<string | null>(null);

  const isProBot = room.botDifficulty !== 'casual';
  const gameState = room.gameState;
  const seats = room.seats;

  // Clear selected card when turn or phase changes
  useEffect(() => {
    setSelectedCardId(null);
  }, [gameState.currentTurn, gameState.phase, gameState.roundNumber]);

  // Synchronize trick state with gameState.currentTrick and run card/trick animations
  useEffect(() => {
    const trick = gameState.currentTrick;

    if (trick.length === 4) {
      setDisplayTrick(trick);
      setIsGathering(false);

      if (gameState.trumpSuit) {
        const result = evaluateTrickWinner(trick, gameState.trumpSuit);
        setWinnerInfo(result);

        const gatherTimer = setTimeout(() => {
          setIsGathering(true);
        }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS + ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS);

        const finishTimer = setTimeout(() => {
          setIsGathering(false);
          setDisplayTrick([]);
          setWinnerInfo(null);
          setCelebratedSeat(result.winner);
        }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS + ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS + ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS);

        const clearCelebrateTimer = setTimeout(() => {
          setCelebratedSeat(null);
        }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS + ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS + ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS + ANIMATION_CONFIG.WINNER_CELEBRATION_DURATION_MS);

        return () => {
          clearTimeout(gatherTimer);
          clearTimeout(finishTimer);
          clearTimeout(clearCelebrateTimer);
        };
      }
    } else if (trick.length > 0) {
      setDisplayTrick(trick);
      setIsGathering(false);
      setWinnerInfo(null);
    } else {
      if (!isGathering && !winnerInfo) {
        setDisplayTrick([]);
      }
    }
  }, [gameState.currentTrick, gameState.trumpSuit]);

  // Determine current user's seat
  const mySeat: Seat | null =
    (Object.keys(seats) as Seat[]).find((s) => seats[s]?.id === user?.id) || null;

  // Table Voice Chat (Mesh WebRTC)
  const voice = useVoiceChat({
    roomId: room.id,
    user:
      user || {
        id: 'anonymous',
        name: 'Player',
        email: '',
        avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Player',
      },
    seat: mySeat,
  });

  const getSeatVoiceState = (seatName: Seat) => {
    const occupant = seats[seatName];
    if (!occupant || occupant.isBot) return null;

    if (occupant.id === user?.id) {
      if (!voice.isInVoice) return null;
      return {
        isInVoice: true,
        isMuted: voice.isMuted,
        isSpeaking: voice.isSpeaking,
        isDeafened: voice.isDeafened,
      };
    }

    const peer = voice.peers.find((p) => p.userId === occupant.id || p.seat === seatName);
    if (!peer) return null;
    return {
      isInVoice: true,
      isMuted: peer.isMuted,
      isSpeaking: peer.isSpeaking,
      isDeafened: peer.isDeafened,
    };
  };

  const isMyTurnToPlay = Boolean(
    mySeat && gameState.phase === 'playing' && gameState.currentTurn === mySeat
  );

  const myHand = mySeat ? gameState.hands[mySeat] || [] : [];
  const sortedMyHand = sortHand(myHand, gameState.trumpSuit);

  const currentLedSuit = displayTrick.length > 0 ? displayTrick[0].card.suit : null;

  const executePlayCard = (card: Card) => {
    if (!mySeat || !isMyTurnToPlay) return;
    if (!isCardLegal(card, myHand, currentLedSuit)) return;
    setSelectedCardId(null);
    setJustPlayedHandCardId(card.id);
    playCard(room.id, mySeat, card);
    setTimeout(() => {
      setJustPlayedHandCardId(null);
    }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS);
  };

  const handleCardInteraction = (card: Card) => {
    if (!mySeat || !isMyTurnToPlay) return;
    if (!isCardLegal(card, myHand, currentLedSuit)) return;

    // Use 2-tap confirmation on touch devices (coarse pointer) to prevent mis-taps,
    // and instant 1-click play on desktop pointers.
    const isTouchDevice =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;

    if (isTouchDevice) {
      if (selectedCardId === card.id) {
        executePlayCard(card);
      } else {
        setSelectedCardId(card.id);
      }
    } else {
      executePlayCard(card);
    }
  };

  const handleSeatClick = (seat: Seat) => {
    if (!user) return;
    if (gameState.phase !== 'waiting') return;
    if (seats[seat] && !seats[seat]?.isBot && seats[seat]?.id !== user.id) return;
    claimSeat(room.id, seat, user);
  };

  // Dynamic table seat mapping: active human player is ALWAYS oriented at the bottom location
  const bottomSeat: Seat = mySeat || 'South';
  const topSeat: Seat = mySeat ? getPartner(mySeat) : 'North';
  const leftSeat: Seat = mySeat ? getPrevSeat(mySeat) : 'West';
  const rightSeat: Seat = mySeat ? getNextSeat(mySeat) : 'East';

  const getSeatVisualPos = (seat: Seat): 'bottom' | 'top' | 'left' | 'right' => {
    if (seat === bottomSeat) return 'bottom';
    if (seat === topSeat) return 'top';
    if (seat === leftSeat) return 'left';
    return 'right';
  };

  // Compute live contract & defense trick goals during playing phase
  const contractTeam = gameState.declarer ? getTeam(gameState.declarer) : null;
  const defendingTeam = contractTeam ? (contractTeam === 'TeamA' ? 'TeamB' : 'TeamA') : null;
  const contractGoalTricks = gameState.winningBid?.level ? 6 + gameState.winningBid.level : 7;
  const defenseSetGoalTricks = 14 - contractGoalTricks;
  const contractTricksWon = contractTeam ? gameState.teamTricksWon[contractTeam] : 0;
  const defenseTricksWon = defendingTeam ? gameState.teamTricksWon[defendingTeam] : 0;

  // Trump suit presentation badge
  const renderTrumpBadge = () => {
    if (!gameState.trumpSuit) return null;

    if (gameState.trumpSuit === 'NT') {
      return (
        <span className="text-[10px] sm:text-[11px] font-black text-indigo-200 bg-indigo-950/90 border border-indigo-500/70 px-1.5 py-[1px] rounded-md shadow-xs">
          NT
        </span>
      );
    }

    const suit = gameState.trumpSuit;
    const isRed = suit === 'H' || suit === 'D';
    const suitColor = isRed ? '#ef4444' : '#ffffff';

    return (
      <div className="flex items-center gap-1 bg-slate-900/95 border border-emerald-500/70 px-1.5 py-[1px] rounded-md shadow-xs text-[10px] sm:text-[11px]">
        <span style={{ color: suitColor }} className="font-black leading-none drop-shadow">
          {SUIT_SYMBOLS[suit]}
        </span>
        <span className="font-bold text-white hidden lg:inline">{SUIT_NAMES[suit]}</span>
      </div>
    );
  };

  // Helper to render Seat Pod (Clean, compact, without 13-card face-down clutter)
  const renderSeat = (seat: Seat, positionClasses: string) => {
    const player = seats[seat];
    const isDealer = gameState.dealer === seat;
    const isCurrentBidder =
      gameState.phase === 'bidding' && gameState.currentBidder === seat;
    const isCurrentPlayer =
      gameState.phase === 'playing' && gameState.currentTurn === seat;
    const isDeclarer = gameState.declarer === seat;
    const team = getTeam(seat);
    const tricksWon = gameState.tricksWonCount[seat] || 0;

    const isThisMySeat = mySeat === seat;
    const isPartner = Boolean(mySeat && getPartner(mySeat) === seat);
    const isCelebrated = celebratedSeat === seat;
    const seatBid = gameState.bids.find((b) => b.seat === seat);
    const seatVoice = getSeatVoiceState(seat);

    return (
      <div className={`absolute ${positionClasses} flex flex-col items-center z-20`}>
        {player ? (
          <div
            className={`
              flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-2xl transition-all duration-200 relative
              ${isCelebrated ? 'ring-3 ring-amber-400 bg-amber-950/90 shadow-[0_0_22px_rgba(251,191,36,0.9)] scale-110 z-30' : ''}
              ${!isCelebrated && (isCurrentBidder || isCurrentPlayer) ? 'ring-2 ring-amber-400 bg-amber-950/85 shadow-lg scale-105' : ''}
              ${!isCelebrated && !(isCurrentBidder || isCurrentPlayer) ? 'bg-slate-950/90 border border-emerald-800/50 shadow-md' : ''}
              ${isThisMySeat && !isCelebrated ? 'border-emerald-400/80' : ''}
            `}
          >
            {/* Trick Winner Celebration Badge */}
            {isCelebrated && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-40 whitespace-nowrap animate-bounce pointer-events-none">
                <span className="bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black text-[9px] px-2 py-[1px] rounded-full shadow-lg border border-white flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5 fill-current" />
                  <span>+1 Trick!</span>
                </span>
              </div>
            )}

            {/* Bid Speech Bubble During & After Bidding */}
            {gameState.phase === 'bidding' ? (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap pointer-events-none">
                {isCurrentBidder ? (
                  <span className="bg-amber-400 text-slate-950 font-extrabold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow animate-pulse">
                    Bidding...
                  </span>
                ) : seatBid ? (
                  seatBid.type === 'pass' ? (
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow">
                      Passed
                    </span>
                  ) : (
                    <span className="bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow">
                      Bid {seatBid.level} {seatBid.contractType}
                    </span>
                  )
                ) : null}
              </div>
            ) : (gameState.phase === 'playing' || gameState.phase === 'declaring') && isDeclarer && seatBid ? (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap pointer-events-none">
                <span className="bg-amber-400 text-slate-950 font-black text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5 text-slate-950" />
                  <span>Declarer ({seatBid.level}{seatBid.contractType === 'NT' ? 'NT' : 'S'})</span>
                </span>
              </div>
            ) : null}

            {/* Avatar & Status Badges */}
            <div className="relative shrink-0">
              <img
                src={player.avatar}
                alt={player.name}
                referrerPolicy="no-referrer"
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border object-cover shadow bg-slate-800 transition-all ${
                  seatVoice?.isSpeaking
                    ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900 border-emerald-300 animate-pulse'
                    : team === 'TeamA'
                    ? 'border-emerald-400/80'
                    : 'border-blue-400/80'
                }`}
              />

              {/* Voice Status Badge */}
              {seatVoice?.isInVoice && (
                <div
                  className={`absolute -bottom-1 -left-1 rounded-full p-0.5 shadow flex items-center justify-center border z-20 ${
                    seatVoice.isSpeaking
                      ? 'bg-emerald-500 border-white text-slate-950'
                      : seatVoice.isMuted
                      ? 'bg-rose-950 border-rose-600 text-rose-300'
                      : seatVoice.isDeafened
                      ? 'bg-amber-950 border-amber-600 text-amber-300'
                      : 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  }`}
                >
                  {seatVoice.isSpeaking ? (
                    <Volume2 className="w-2 h-2 text-slate-950" />
                  ) : seatVoice.isMuted ? (
                    <MicOff className="w-2 h-2 text-rose-300" />
                  ) : seatVoice.isDeafened ? (
                    <Headphones className="w-2 h-2 text-amber-300" />
                  ) : (
                    <Mic className="w-2 h-2 text-emerald-300" />
                  )}
                </div>
              )}

              {/* Subtle Bot Indicator */}
              {player.isBot && (
                <div
                  className="absolute -top-1 -left-1 rounded-full p-0.5 bg-slate-900 border border-slate-600 text-slate-300 shadow flex items-center justify-center"
                  title="AI Partner / Opponent"
                >
                  <Bot className="w-2 h-2 text-slate-300" />
                </div>
              )}

              {/* Dealer Button */}
              {isDealer && (
                <div
                  className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 font-black text-[8px] flex items-center justify-center border border-white shadow font-mono"
                  title="Dealer"
                >
                  D
                </div>
              )}
            </div>

            {/* Name, Team & Tricks Won */}
            <div className="text-left min-w-0 max-w-[82px] sm:max-w-[105px] leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-white truncate">
                  {isThisMySeat ? 'You' : player.name.replace(/^Bot\s+/i, '')}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-semibold">
                <span className={team === 'TeamA' ? 'text-emerald-400' : 'text-blue-400'}>
                  {isPartner ? 'Partner' : team === 'TeamA' ? 'Team 1' : 'Team 2'}
                </span>
                {gameState.phase === 'playing' && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-amber-300 font-mono font-bold">{tricksWon}T</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty Seat Claim Button */
          <button
            onClick={() => handleSeatClick(seat)}
            disabled={gameState.phase !== 'waiting'}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border-2 flex items-center gap-1.5 transition-all cursor-pointer group active:scale-95 shadow-lg ${
              team === 'TeamA'
                ? 'border-emerald-500/80 bg-emerald-950/85 hover:bg-emerald-900/90 text-emerald-200'
                : 'border-blue-500/80 bg-blue-950/85 hover:bg-blue-900/90 text-blue-200'
            }`}
            title={`Click to sit in ${team === 'TeamA' ? 'Team 1' : 'Team 2'}`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <div className="text-left leading-tight">
              <div className="text-[9px] sm:text-[10px] font-bold text-white">
                {team === 'TeamA' ? 'Team 1' : 'Team 2'}
              </div>
              <div className="text-[8px] text-amber-300 font-bold">Sit Here</div>
            </div>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#07130e] table-felt-radial flex flex-col text-slate-100 overflow-clip select-none relative">
      {/* Mobile Portrait Orientation Prompt Overlay (Only visible on <768px in portrait) */}
      <div className="mobile-portrait-overlay fixed inset-0 z-50 bg-[#06110c]/95 backdrop-blur-lg flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 flex items-center justify-center mb-4 shadow-xl">
          <Smartphone className="w-8 h-8 text-amber-400 animate-pulse -rotate-90" />
        </div>
        <h2 className="text-lg font-bold font-serif-display text-white mb-2">
          Rotate Device to Landscape
        </h2>
        <p className="text-xs text-slate-300 max-w-xs leading-relaxed mb-6">
          Royal Whist is designed for <strong className="text-emerald-300">Mobile Landscape</strong> so all 4 seats and your 13-card hand fit comfortably in a single row.
        </p>
        <button
          onClick={onLeaveRoom}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-emerald-800/50 text-emerald-300 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Lobby</span>
        </button>
      </div>

      {/* Slim, Always-Visible Top HUD Bar */}
      <header className="landscape-compact-header h-10 sm:h-11 shrink-0 border-b border-emerald-900/50 bg-[#0a2016]/95 backdrop-blur-md px-2 sm:px-4 flex items-center justify-between gap-2 shadow-md z-30">
        {/* Left: Leave / Table Menu + Room Title */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            onClick={onLeaveRoom}
            className="py-1 px-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-emerald-800/50 text-emerald-300 transition-all cursor-pointer flex items-center gap-1 text-[11px] sm:text-xs font-semibold shrink-0"
            title="Leave table and return to lobby"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Lobby</span>
          </button>

          <div className="min-w-0 hidden md:block">
            <h1 className="text-xs sm:text-sm font-bold font-serif-display text-white truncate max-w-[110px] lg:max-w-[180px] leading-tight">
              {room.name}
            </h1>
            <div className="text-[8px] sm:text-[9px] text-emerald-400 font-mono leading-none">
              R{gameState.roundNumber} • Dealer:{' '}
              {gameState.dealer === mySeat
                ? 'You'
                : seats[gameState.dealer]?.name.replace(/^Bot\s+/i, '') ||
                  (getTeam(gameState.dealer) === 'TeamA' ? 'Team 1' : 'Team 2')}
            </div>
          </div>
        </div>

        {/* Center: Always-Visible Match Score + Live Contract & Trick Progress */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {/* Team Match Scores Pill (Always visible on mobile & desktop) */}
          <button
            onClick={() => setShowScoreModal(true)}
            className="flex items-center gap-1.5 bg-slate-950/90 hover:bg-slate-900 border border-emerald-800/60 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-mono transition-all cursor-pointer shrink-0"
            title="View Full Match Standings (Target: +11)"
          >
            <span className="text-emerald-400 font-bold">
              T1: {gameState.matchScores.TeamA >= 0 ? `+${gameState.matchScores.TeamA}` : gameState.matchScores.TeamA}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-blue-400 font-bold">
              T2: {gameState.matchScores.TeamB >= 0 ? `+${gameState.matchScores.TeamB}` : gameState.matchScores.TeamB}
            </span>
          </button>

          {/* Phase-Specific Live Contract / Auction Progress Pill */}
          {gameState.phase === 'playing' && contractTeam && (
            <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-950/90 border border-amber-500/40 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg shadow-xs text-[10px] sm:text-[11px] shrink-0">
              {renderTrumpBadge()}
              <span className="text-slate-600">•</span>
              <span className="font-mono font-bold text-amber-300" title="Declaring team tricks won vs. contract target">
                {contractTeam === 'TeamA' ? 'T1' : 'T2'}({gameState.winningBid?.level}
                {gameState.winningBid?.contractType === 'NT' ? 'NT' : 'S'}): {contractTricksWon}/{contractGoalTricks}
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono text-slate-300" title="Defending team tricks won vs. tricks needed to set contract">
                Def: {defenseTricksWon}/{defenseSetGoalTricks}
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono text-emerald-400 font-bold" title="Current trick">
                Tk {gameState.tricksHistory.length + 1}/13
              </span>
              {currentLedSuit && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-300 text-[10px]" title="Led suit">
                    Led:{' '}
                    <strong
                      style={{
                        color:
                          currentLedSuit === 'H' || currentLedSuit === 'D'
                            ? '#ef4444'
                            : '#ffffff',
                      }}
                    >
                      {SUIT_SYMBOLS[currentLedSuit]}
                    </strong>
                  </span>
                </>
              )}
            </div>
          )}

          {gameState.phase === 'bidding' && (
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] shrink-0">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-mono font-bold">
                Auction {gameState.auctionTurnsCount + 1}/4
              </span>
            </div>
          )}

          {gameState.phase === 'declaring' && (
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] shrink-0">
              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-bold">Naming Trump</span>
            </div>
          )}
        </div>

        {/* Right: Voice Chat + Standings & Overflow Table Menu */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
          <VoiceChatBar
            isInVoice={voice.isInVoice}
            isConnecting={voice.isConnecting}
            isMuted={voice.isMuted}
            isDeafened={voice.isDeafened}
            isSpeaking={voice.isSpeaking}
            permissionError={voice.permissionError}
            clearPermissionError={voice.clearPermissionError}
            peers={voice.peers}
            onJoinVoice={voice.joinVoice}
            onLeaveVoice={voice.leaveVoice}
            onToggleMute={voice.toggleMute}
            onToggleDeafen={voice.toggleDeafen}
          />

          <button
            onClick={() => setShowScoreModal(true)}
            className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-emerald-800/50 rounded-lg text-[11px] sm:text-xs text-emerald-300 flex items-center gap-1 transition-all cursor-pointer"
            title="Match Standings"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Standings</span>
          </button>

          {/* Secondary Table Actions Menu */}
          <button
            onClick={() => setShowTableMenu((prev) => !prev)}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/70 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Table Options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {showTableMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowTableMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-slate-950 border border-emerald-700/60 rounded-xl shadow-2xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-slate-800/80 text-[10px] text-slate-400 font-mono">
                  {room.name} • Round {gameState.roundNumber}
                </div>

                {/* Bot Skill Switcher inside Table Options */}
                <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Bot Skill</span>
                  </span>
                  <div className="inline-flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setBotDifficulty(room.id, 'casual')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        !isProBot ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Casual
                    </button>
                    <button
                      type="button"
                      onClick={() => setBotDifficulty(room.id, 'super')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        isProBot ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Pro
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowTableMenu(false);
                    setShowScoreModal(true);
                  }}
                  className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-900 flex items-center gap-2 cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Full Match Standings</span>
                </button>

                {isDevMode && (
                  <button
                    onClick={() => {
                      setShowTableMenu(false);
                      setShowSimModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-cyan-300 hover:bg-slate-900 flex items-center gap-2 cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Dev AI Simulation Lab</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowTableMenu(false);
                    onLeaveRoom();
                  }}
                  className="w-full px-3 py-2 text-left text-slate-300 hover:bg-slate-900 flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                  <span>Leave to Lobby</span>
                </button>

                <div className="my-1 border-t border-slate-800/80" />

                <button
                  onClick={() => {
                    setShowTableMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-950/50 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Table</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Table Arena */}
      <main
        onClick={() => {
          if (selectedCardId) setSelectedCardId(null);
        }}
        className="flex-1 min-h-0 relative flex items-center justify-center p-1 sm:p-1.5 overflow-clip"
      >
        {/* Table Stage: Rich Hardwood Rail Borders with Casino Green Felt */}
        <div className="landscape-compact-table-wrap relative w-full max-w-5xl h-full md:aspect-[16/10] rounded-[24px] sm:rounded-[36px] md:rounded-[52px] table-wood-rail table-brass-bevel p-1 sm:p-2.5 md:p-3.5 shadow-2xl overflow-visible flex items-center justify-center">
          {/* Inner Casino Green Felt Surface */}
          <div className="landscape-compact-felt w-full h-full rounded-[20px] sm:rounded-[30px] md:rounded-[44px] table-felt-radial table-felt-rim table-felt-stitch relative flex items-center justify-center p-1 sm:p-2 overflow-visible">
            {/* Cardinal Seats (Dynamically oriented with active player at the bottom) */}
            {renderSeat(
              topSeat,
              `landscape-seat-top top-1 sm:top-1.5 left-1/2 -translate-x-1/2 ${
                gameState.phase !== 'playing' ? 'landscape-console-top-seat' : ''
              }`
            )}
            {renderSeat(leftSeat, 'landscape-seat-left left-1 sm:left-2 top-1/2 -translate-y-1/2')}
            {renderSeat(
              bottomSeat,
              `bottom-1 sm:bottom-1.5 left-1/2 -translate-x-1/2 ${
                mySeat ? 'landscape-hide-bottom-seat' : ''
              } ${gameState.phase !== 'playing' ? 'landscape-console-bottom-seat' : ''}`
            )}
            {renderSeat(rightSeat, 'landscape-seat-right right-1 sm:right-2 top-1/2 -translate-y-1/2')}

            {/* Center Table Stage */}
            <div className="landscape-compact-center-stage relative w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-80 lg:h-80 rounded-full border border-emerald-600/20 bg-black/25 flex items-center justify-center p-1 overflow-visible">
              <div className="absolute inset-0 pointer-events-none opacity-20 flex items-center justify-center">
                <div className="w-full h-full rounded-full border border-dashed border-emerald-400 animate-spin [animation-duration:60s]" />
              </div>

              {/* Waiting Phase: Pre-Game Seating & Bot Setup Card */}
              {gameState.phase === 'waiting' && (
                <div className="landscape-compact-console text-center z-20 p-2.5 sm:p-3.5 bg-slate-950/95 border border-emerald-600/60 rounded-2xl w-[250px] sm:w-[260px] shrink-0 shadow-2xl">
                  <div className="text-xs font-bold text-amber-300 mb-1 flex items-center justify-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Table Seating Setup</span>
                  </div>

                  {/* Pre-Game Bot Skill Selector */}
                  <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 mb-2">
                    <span className="text-[10px] text-slate-300 font-medium flex items-center gap-1">
                      <Bot className="w-3 h-3 text-emerald-400" />
                      <span>AI Skill:</span>
                    </span>
                    <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setBotDifficulty(room.id, 'casual')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          !isProBot
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Casual
                      </button>
                      <button
                        type="button"
                        onClick={() => setBotDifficulty(room.id, 'super')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-0.5 ${
                          isProBot
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Crown className="w-2.5 h-2.5" />
                        <span>Pro</span>
                      </button>
                    </div>
                  </div>

                  {!mySeat ? (
                    <>
                      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                        <button
                          onClick={() => {
                            if (!user) return;
                            const t1Seat: Seat = !seats.South || seats.South.isBot ? 'South' : 'North';
                            claimSeat(room.id, t1Seat, user);
                          }}
                          className="py-1.5 px-2 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-[11px] rounded-xl shadow transition-all cursor-pointer active:scale-95"
                        >
                          Sit Team 1
                        </button>
                        <button
                          onClick={() => {
                            if (!user) return;
                            const t2Seat: Seat = !seats.West || seats.West.isBot ? 'West' : 'East';
                            claimSeat(room.id, t2Seat, user);
                          }}
                          className="py-1.5 px-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-[11px] rounded-xl shadow transition-all cursor-pointer active:scale-95"
                        >
                          Sit Team 2
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          if (user && !mySeat) {
                            const openSeat =
                              (['South', 'North', 'West', 'East'] as Seat[]).find(
                                (s) => !seats[s] || seats[s]?.isBot
                              ) || 'South';
                            claimSeat(room.id, openSeat, user);
                          }
                          fillBots(room.id);
                        }}
                        className="w-full py-1.5 px-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Sit &amp; Deal with AI Bots</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-slate-300 mb-2 leading-tight">
                        Seated on{' '}
                        <strong
                          className={
                            getTeam(mySeat) === 'TeamA' ? 'text-emerald-400' : 'text-blue-400'
                          }
                        >
                          {getTeam(mySeat) === 'TeamA' ? 'Team 1' : 'Team 2'}
                        </strong>
                        . Ready to fill empty seats and deal?
                      </p>
                      <button
                        onClick={() => fillBots(room.id)}
                        className="w-full py-2 px-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Fill Bots &amp; Deal Cards</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Bidding Phase: Centered Bidding Console */}
              {gameState.phase === 'bidding' && (
                <div className="landscape-compact-console w-[320px] sm:w-[350px] shrink-0 z-20">
                  <BiddingPanel
                    gameState={gameState}
                    mySeat={mySeat}
                    myHand={myHand}
                    onMakeBid={(bid) => makeBid(room.id, bid)}
                  />
                </div>
              )}

              {/* Declaring Phase: Centered Suit Declaration Console (keeps hand 100% visible!) */}
              {gameState.phase === 'declaring' && (
                <div className="landscape-compact-console w-[320px] sm:w-[350px] shrink-0 z-20">
                  <SuitDeclarationModal
                    gameState={gameState}
                    mySeat={mySeat}
                    myHand={myHand}
                    onDeclareSuit={(suit) => declareTrump(room.id, suit)}
                  />
                </div>
              )}

              {/* Playing Phase: Current Trick Center Arena */}
              {gameState.phase === 'playing' && (
                <div className="relative w-full h-full flex items-center justify-center">
                  {/* 4 Cards Placement in Trick with Smooth Play & Collect Animations */}
                  {displayTrick.map((played, idx) => {
                    const isWinningCard = Boolean(
                      winnerInfo && winnerInfo.winningCard.id === played.card.id
                    );
                    const visualPos = getSeatVisualPos(played.seat);
                    const winnerVisualPos = winnerInfo
                      ? getSeatVisualPos(winnerInfo.winner)
                      : null;
                    return (
                      <TrickCardItem
                        key={played.card.id}
                        played={played}
                        isGathering={isGathering}
                        visualPos={visualPos}
                        winnerVisualPos={winnerVisualPos}
                        isWinningCard={isWinningCard}
                        isLeadCard={idx === 0}
                      />
                    );
                  })}

                  {/* Winner announcement bubble during review pause */}
                  {winnerInfo && !isGathering && (
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-950/95 border border-amber-400 text-amber-300 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold shadow-lg flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap pointer-events-none">
                      <Crown className="w-2.5 h-2.5 text-amber-400 fill-current" />
                      <span>
                        {winnerInfo.winner === mySeat
                          ? 'You'
                          : seats[winnerInfo.winner]?.name.replace(/^Bot\s+/i, '') || 'Player'}{' '}
                        won trick!
                      </span>
                    </div>
                  )}

                  {displayTrick.length === 0 && (
                    <div className="text-center text-[10px] sm:text-xs text-slate-300 bg-slate-950/75 px-3 py-1 rounded-full border border-slate-800/80 shadow-inner">
                      <span>
                        {gameState.currentTurn === mySeat ? (
                          <strong className="text-amber-300">Your turn to lead any card</strong>
                        ) : (
                          <>
                            Waiting for{' '}
                            <strong className="text-amber-300">
                              {(gameState.currentTurn &&
                                seats[gameState.currentTurn]?.name.replace(/^Bot\s+/i, '')) ||
                                'Player'}
                            </strong>{' '}
                            to lead...
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Docked Player Hand Bar (Single-row 13-card spread optimized for Mobile Landscape & Desktop) */}
      {(gameState.phase === 'bidding' ||
        gameState.phase === 'declaring' ||
        gameState.phase === 'playing') &&
        mySeat && (
          <footer className="landscape-compact-hand-footer shrink-0 w-full max-w-5xl mx-auto px-1.5 sm:px-3 pb-1 sm:pb-1.5 z-20">
            <div className="landscape-compact-hand-box bg-slate-950/92 backdrop-blur-md border border-emerald-800/40 rounded-xl sm:rounded-2xl px-2 py-1 sm:p-2 shadow-2xl">
              {/* Compact Hand Status Header Row */}
              <div className="flex items-center justify-between text-xs px-1 mb-0.5">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  {/* Player Profile & Identity Pill */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative shrink-0">
                      <img
                        src={user?.avatar || seats[mySeat]?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=You'}
                        alt="You"
                        referrerPolicy="no-referrer"
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border object-cover shadow bg-slate-800 ${
                          getTeam(mySeat) === 'TeamA' ? 'border-emerald-400' : 'border-blue-400'
                        }`}
                      />
                      {gameState.dealer === mySeat && (
                        <div
                          className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-amber-500 text-slate-950 font-black text-[7px] flex items-center justify-center border border-white shadow font-mono"
                          title="Dealer"
                        >
                          D
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-2 py-[1px] rounded-full border flex items-center gap-1 ${
                        getTeam(mySeat) === 'TeamA'
                          ? 'text-emerald-300 bg-emerald-950/80 border-emerald-700/50'
                          : 'text-blue-300 bg-blue-950/80 border-blue-700/50'
                      }`}
                    >
                      <span>{getTeam(mySeat) === 'TeamA' ? 'Team 1' : 'Team 2'}</span>
                      {gameState.phase === 'playing' && (
                        <>
                          <span className="text-slate-500">•</span>
                          <span className="text-amber-300 font-mono font-bold" title="Tricks won by you this round">
                            {gameState.tricksWonCount?.[mySeat] || 0}T
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <span className="text-slate-500 text-[10px] hidden sm:inline">•</span>
                  <span className="text-slate-400 text-[10px] hidden sm:inline">
                    {myHand.length} {myHand.length === 1 ? 'card' : 'cards'}
                  </span>

                  {/* Suit distribution pills */}
                  <div className="hidden md:flex items-center gap-1 text-[10px] font-mono font-semibold">
                    <span className="bg-slate-900 border border-slate-800 px-1.5 py-[1px] rounded text-slate-200">
                      ♠ {myHand.filter((c) => c.suit === 'S').length}
                    </span>
                    <span className="bg-slate-900 border border-slate-800 px-1.5 py-[1px] rounded text-red-400">
                      ♥ {myHand.filter((c) => c.suit === 'H').length}
                    </span>
                    <span className="bg-slate-900 border border-slate-800 px-1.5 py-[1px] rounded text-red-400">
                      ♦ {myHand.filter((c) => c.suit === 'D').length}
                    </span>
                    <span className="bg-slate-900 border border-slate-800 px-1.5 py-[1px] rounded text-slate-200">
                      ♣ {myHand.filter((c) => c.suit === 'C').length}
                    </span>
                  </div>
                </div>

                {/* Live Turn Prompt */}
                <div>
                  {gameState.phase === 'playing' ? (
                    isMyTurnToPlay ? (
                      <span className="text-slate-950 font-extrabold text-[9px] sm:text-[10px] flex items-center gap-1 bg-amber-400 px-2 py-0.5 rounded-full shadow animate-pulse">
                        <span>
                          {selectedCardId
                            ? 'TAP SELECTED CARD AGAIN TO PLAY'
                            : currentLedSuit
                            ? `YOUR TURN • FOLLOW ${SUIT_NAMES[currentLedSuit].toUpperCase()}`
                            : 'YOUR TURN • PLAY A CARD'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[9px] sm:text-[11px]">
                        Waiting for{' '}
                        <strong className="text-slate-200">
                          {(gameState.currentTurn &&
                            seats[gameState.currentTurn]?.name.replace(/^Bot\s+/i, '')) ||
                            'Player'}
                        </strong>
                        ...
                      </span>
                    )
                  ) : gameState.phase === 'bidding' ? (
                    <span className="text-amber-300 font-semibold text-[9px] sm:text-[10px] flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      <span>
                        {gameState.currentBidder === mySeat
                          ? 'Your turn to bid above!'
                          : 'Inspect your hand during the auction'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-300 font-semibold text-[9px] sm:text-[10px]">
                      {gameState.declarer === mySeat
                        ? 'Select Trump Suit in the center console'
                        : 'Waiting for Declarer to name Trump'}
                    </span>
                  )}
                </div>
              </div>

              {/* 13-Card Single-Row Spread */}
              <div className="landscape-compact-hand-row flex justify-center items-center pt-1.5 pb-0.5 overflow-visible min-h-[82px] sm:min-h-[100px] md:min-h-[118px] lg:min-h-[140px]">
                {sortedMyHand.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2">All cards played for this round.</div>
                ) : (
                  sortedMyHand.map((card, idx) => {
                    const isLegal =
                      gameState.phase === 'playing' &&
                      isCardLegal(card, myHand, currentLedSuit);
                    const canPlay =
                      gameState.phase === 'playing' && isMyTurnToPlay && isLegal;
                    const isJustPlayed = justPlayedHandCardId === card.id;
                    const isSelected = selectedCardId === card.id;

                    return (
                      <div
                        key={card.id}
                        className={`
                          landscape-compact-card-slot transition-all relative shrink-0
                          ${idx !== 0 ? '-ml-5 sm:-ml-6 md:-ml-8 lg:-ml-9' : ''}
                          ${
                            isJustPlayed
                              ? '-translate-y-6 scale-105 opacity-50 ring-2 ring-amber-400 z-30 duration-150'
                              : isSelected
                              ? 'z-40 duration-150'
                              : canPlay
                              ? 'hover:-translate-y-3 hover:z-30 hover:scale-105 duration-150'
                              : ''
                          }
                        `}
                      >
                        <CardView
                          card={card}
                          size="hand"
                          isPlayable={Boolean(canPlay && !isJustPlayed)}
                          isSelected={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (gameState.phase === 'playing') {
                              handleCardInteraction(card);
                            }
                          }}
                          className={
                            gameState.phase === 'playing' && !isLegal && isMyTurnToPlay
                              ? 'opacity-40 brightness-75 cursor-not-allowed'
                              : ''
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </footer>
        )}

      {/* End-of-Round & End-of-Match Modals */}
      <RoundSummaryModal
        gameState={gameState}
        onNextRound={() => nextRound(room.id)}
      />

      <GameOverModal
        gameState={gameState}
        onRestartMatch={() => restartMatch(room.id)}
        onLeaveRoom={onLeaveRoom}
      />

      {/* Standings Modal */}
      {showScoreModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-950 border border-emerald-700/60 rounded-2xl sm:rounded-3xl p-4 sm:p-5 max-w-md w-full max-h-[90dvh] scrollable-panel shadow-2xl">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold font-serif-display text-white">
                Match Standings
              </h3>
              <button
                onClick={() => setShowScoreModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer text-sm font-bold px-2 py-0.5 rounded-lg hover:bg-slate-900"
              >
                ✕
              </button>
            </div>
            <ScoreBoard gameState={gameState} />
          </div>
        </div>
      )}

      {/* Developer-only AI Simulation Lab Modal */}
      {isDevMode && (
        <SimulationModal
          isOpen={showSimModal}
          onClose={() => setShowSimModal(false)}
        />
      )}

      {/* Delete Table Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-rose-800/60 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-700/60 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Table</h3>
                <p className="text-xs text-slate-400">End match and close table</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">{room.name}</strong>? All players will be returned to the lobby immediately.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteRoom(room.id);
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer active:scale-95"
              >
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
