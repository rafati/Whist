import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useAuth } from '../lib/authContext.tsx';
import { useSocket } from '../lib/socketContext.tsx';
import {
  Card,
  PlayedCard,
  Room,
  Seat,
  ThrowableObjectType,
  ThrownObjectEvent,
  UserProfile,
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
import { CardView, CardReleaseGesture } from './CardView.tsx';
import { BiddingPanel } from './BiddingPanel.tsx';
import { SuitDeclarationModal } from './SuitDeclarationModal.tsx';
import { RoundSummaryModal } from './RoundSummaryModal.tsx';
import { GameOverModal } from './GameOverModal.tsx';
import { MisdealModal } from './MisdealModal.tsx';
import { ScoreBoard } from './ScoreBoard.tsx';
import { SimulationModal } from './SimulationModal.tsx';
import { VoiceChatBar } from './VoiceChatBar.tsx';
import { ThrowableDock } from './ThrowableDock.tsx';
import { ThrowableOverlay } from './ThrowableOverlay.tsx';
import { LastTrickCross } from './LastTrickCross.tsx';
import { ContractHud } from './ContractHud.tsx';
import { useVoiceChat } from '../lib/useVoiceChat.ts';
import { playCardSnapSound, useSoundSetting, playClickSound } from '../lib/throwSounds.ts';
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
  VolumeX,
  Headphones,
  MoreVertical,
  LogOut,
  Copy,
  Check,
  Share2,
  Clock,
  Lock,
  Globe,
} from 'lucide-react';

// Physical flight offset vectors based on visual position
function getVisualEntryVector(pos: 'bottom' | 'top' | 'left' | 'right'): { x: number; y: number; rotate: number } {
  switch (pos) {
    case 'top': return { x: 0, y: -160, rotate: -4 };
    case 'bottom': return { x: 0, y: 220, rotate: 4 };
    case 'left': return { x: -180, y: 0, rotate: -6 };
    case 'right': return { x: 180, y: 0, rotate: 6 };
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
  isLocallyFlying?: boolean;
  wasLocallyPlayed?: boolean;
}

const TrickCardItem: React.FC<TrickCardItemProps> = ({
  played,
  isGathering,
  visualPos,
  winnerVisualPos,
  isWinningCard,
  isLeadCard,
  isLocallyFlying,
  wasLocallyPlayed,
}) => {
  const [hasEntered, setHasEntered] = useState(() => Boolean(wasLocallyPlayed || isLocallyFlying));

  useEffect(() => {
    if (wasLocallyPlayed || isLocallyFlying) {
      setHasEntered(true);
      return;
    }
    const timer = setTimeout(() => {
      setHasEntered(true);
    }, 20);
    return () => clearTimeout(timer);
  }, [wasLocallyPlayed, isLocallyFlying]);

  const entry = getVisualEntryVector(visualPos);
  const gather = winnerVisualPos ? getVisualGatherVector(visualPos, winnerVisualPos) : { x: 0, y: 0, rotate: 0 };

  let transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
  let opacity = 1;
  let transition = `transform ${ANIMATION_CONFIG.CARD_PLAY_DURATION_MS}ms ${ANIMATION_CONFIG.CARD_FLIGHT_EASING}, opacity ${ANIMATION_CONFIG.CARD_PLAY_DURATION_MS}ms ease-out`;

  if (isGathering && winnerVisualPos) {
    transform = `translate3d(${gather.x}px, ${gather.y}px, 0) scale(0.35) rotate(${gather.rotate}deg)`;
    opacity = 0;
    transition = `transform ${ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS}ms ${ANIMATION_CONFIG.TRICK_SWEEP_EASING}, opacity ${ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS}ms ease-in`;
  } else if (isLocallyFlying) {
    opacity = 0;
    transition = 'none';
  } else if (wasLocallyPlayed) {
    // Seamless single-frame handoff from FlyingCardOverlay without re-running entry transition or opacity fade
    transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
    opacity = 1;
    transition = 'none';
  } else if (!hasEntered) {
    transform = `translate3d(${entry.x}px, ${entry.y}px, 0) scale(0.88) rotate(${entry.rotate}deg)`;
    opacity = 0.2;
  }

  const posClass = {
    top: 'top-3.5 sm:top-4 left-1/2 -translate-x-1/2',
    bottom: 'bottom-3.5 sm:bottom-4 left-1/2 -translate-x-1/2',
    left: 'left-3.5 sm:left-4 top-1/2 -translate-y-1/2',
    right: 'right-3.5 sm:right-4 top-1/2 -translate-y-1/2',
  }[visualPos];

  const naturalTilt = {
    top: -1.5,
    bottom: 1,
    left: -2.5,
    right: 2,
  }[visualPos] || 0;

  return (
    <div
      data-trick-slot={visualPos}
      style={{
        transform,
        opacity,
        transition,
        willChange: 'transform, opacity',
      }}
      className={`absolute ${posClass} z-10 flex flex-col items-center select-none pointer-events-none`}
    >
      <div
        style={{
          transform: `rotate(${naturalTilt}deg)`,
        }}
        className={`relative transition-all duration-200 ${
          isWinningCard
            ? 'ring-2 sm:ring-3 ring-amber-400 rounded-lg sm:rounded-xl shadow-[0_0_26px_rgba(251,191,36,0.95)] scale-105 z-20'
            : played.isBotAutoPlay
            ? 'ring-2 ring-cyan-400/90 rounded-lg sm:rounded-xl shadow-[0_12px_28px_-4px_rgba(0,0,0,0.65),0_0_16px_rgba(34,211,238,0.45)]'
            : 'shadow-[0_12px_28px_-4px_rgba(0,0,0,0.65),0_4px_10px_-2px_rgba(0,0,0,0.45)]'
        }`}
      >
        <CardView card={played.card} size="sm" />
        {isWinningCard && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 font-black text-[8px] sm:text-[9px] px-2 py-[1px] rounded-full shadow-lg flex items-center gap-0.5 whitespace-nowrap animate-pulse border border-white z-30">
            <Crown className="w-2.5 h-2.5 text-slate-950 fill-current" />
            <span>Winner</span>
          </div>
        )}
        {played.isBotAutoPlay && (
          <div
            data-testid="trick-card-bot-badge"
            className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-cyan-950/95 border border-cyan-400 text-cyan-200 font-extrabold text-[7px] sm:text-[8px] px-1.5 py-[1px] rounded-full shadow-lg flex items-center gap-0.5 whitespace-nowrap z-30"
          >
            <Bot className="w-2.5 h-2.5 text-cyan-300 shrink-0" />
            <span>Bot Move</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface FlyingCardState {
  id: string;
  card: Card;
  startCenterX: number;
  startCenterY: number;
  startWidth: number;
  startHeight: number;
  startScale: number;
  startRotateDeg: number;
  targetCenterX: number;
  targetCenterY: number;
  targetWidth: number;
  targetHeight: number;
  targetRotateDeg: number;
  vx: number;
  vy: number;
  wasDragged: boolean;
  duration: number;
}

const FlyingCardOverlay: React.FC<{
  flight: FlyingCardState;
  onComplete: (flightId: string) => void;
}> = ({ flight, onComplete }) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);

  useLayoutEffect(() => {
    const el = overlayRef.current;
    completedRef.current = false;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete(flight.id);
    };

    const dx = flight.targetCenterX - flight.startCenterX;
    const dy = flight.targetCenterY - flight.startCenterY;
    const targetScale = flight.targetWidth / Math.max(1, flight.startWidth);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const effectiveDuration = prefersReducedMotion ? 40 : flight.duration;

    // Pure 2-keyframe momentum curve: eliminates any mid-air piecewise kink while
    // smoothly decelerating along a single exponential out-curve into the trick slot.
    const startTransform = `translate3d(0px, 0px, 0) scale(${flight.startScale}) rotate(${flight.startRotateDeg}deg)`;
    const endTransform = `translate3d(${dx}px, ${dy}px, 0) scale(${targetScale}) rotate(${flight.targetRotateDeg}deg)`;

    let anim: Animation | null = null;
    if (el && typeof el.animate === 'function' && !prefersReducedMotion) {
      anim = el.animate(
        [
          {
            transform: startTransform,
            boxShadow: '0 24px 48px -8px rgba(0, 0, 0, 0.72), 0 6px 16px -2px rgba(0, 0, 0, 0.48)',
          },
          {
            transform: endTransform,
            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.65), 0 4px 10px -2px rgba(0, 0, 0, 0.45)',
          },
        ],
        {
          duration: effectiveDuration,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards',
        }
      );
      anim.onfinish = finish;
    } else if (el) {
      el.style.transform = endTransform;
    }

    const fallbackTimer = setTimeout(finish, effectiveDuration + 35);
    return () => {
      clearTimeout(fallbackTimer);
      if (anim) {
        anim.onfinish = null;
        anim.cancel();
      }
    };
  }, [flight, onComplete]);

  return (
    <div
      ref={overlayRef}
      className="fixed pointer-events-none z-[80] rounded-lg sm:rounded-xl"
      style={{
        left: flight.startCenterX - flight.startWidth / 2,
        top: flight.startCenterY - flight.startHeight / 2,
        width: flight.startWidth,
        height: flight.startHeight,
        transformOrigin: 'center center',
        transform: `translate3d(0px, 0px, 0) scale(${flight.startScale}) rotate(${flight.startRotateDeg}deg)`,
        boxShadow: '0 24px 48px -8px rgba(0, 0, 0, 0.72), 0 6px 16px -2px rgba(0, 0, 0, 0.48)',
        willChange: 'transform',
      }}
    >
      <CardView card={flight.card} size="hand" />
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
    setTurnTimeout,
    makeBid,
    declareTrump,
    playCard,
    nextRound,
    restartMatch,
    skipMisdeal,
    deleteRoom,
    throwObject,
    addSocketListener,
  } = useSocket();

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [soundEnabled, toggleSoundSetting] = useSoundSetting();

  // Developer-only flag to access AI Simulation Lab (?dev=true)
  const isDevMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('dev') === 'true';

  const isProBot = room.botDifficulty !== 'casual';
  const gameState = room.gameState;
  const seats = room.seats;

  // Determine current user's seat
  const mySeat: Seat | null =
    (Object.keys(seats) as Seat[]).find((s) => seats[s]?.id === user?.id) || null;

  // Animation state for played tricks and card flight
  const [displayTrick, setDisplayTrick] = useState<PlayedCard[]>(room.gameState.currentTrick);
  const [isGathering, setIsGathering] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{ winner: Seat; winningCard: Card } | null>(null);
  const [celebratedSeat, setCelebratedSeat] = useState<Seat | null>(null);
  const [justPlayedHandCardId, setJustPlayedHandCardId] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [flyingCard, setFlyingCard] = useState<FlyingCardState | null>(null);
  const locallyPlayedCardIdsRef = useRef<Set<string>>(new Set());

  // Responsive viewport dimensions for dynamic hand accordion spacing
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live timer tick for:
  // 1) Human turn countdown (10s default)
  // 2) Matchmaking auto-start countdown
  // 3) Disconnected human player 10-second bot replacement countdown
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [botReplacementNotice, setBotReplacementNotice] = useState<{ id: string; text: string } | null>(null);
  const [autoPlayToast, setAutoPlayToast] = useState<{
    id: string;
    playerName: string;
    actionText: string;
    seat: Seat;
  } | null>(null);
  const lastSeenAutoPlayIdRef = useRef<string | null>(gameState.lastAutoPlayNotice?.id || null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botReplacementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSeatsRef = useRef<Record<Seat, UserProfile | null>>(seats);

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      if (botReplacementTimerRef.current) clearTimeout(botReplacementTimerRef.current);
    };
  }, []);

  const hasDisconnectedPlayers = (Object.keys(seats) as Seat[]).some(
    (s) => Boolean(seats[s]?.isDisconnected && seats[s]?.botReplaceAt)
  );
  const hasActiveTurnDeadline = Boolean(
    gameState.turnDeadlineAt &&
      (gameState.phase === 'bidding' ||
        gameState.phase === 'declaring' ||
        gameState.phase === 'playing')
  );
  const hasMatchmakingCountdown = Boolean(
    room.matchmakingAutoStartAt && gameState.phase === 'waiting'
  );

  useEffect(() => {
    if (!hasDisconnectedPlayers && !hasActiveTurnDeadline && !hasMatchmakingCountdown) return;
    setNowTick(Date.now());
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, [
    hasDisconnectedPlayers,
    hasActiveTurnDeadline,
    hasMatchmakingCountdown,
    gameState.turnDeadlineAt,
    room.matchmakingAutoStartAt,
  ]);

  // Show prominent toast banner whenever a human player's turn expires and the Bot plays on their behalf
  useEffect(() => {
    const notice = gameState.lastAutoPlayNotice;
    if (!notice || notice.id === lastSeenAutoPlayIdRef.current) return;
    lastSeenAutoPlayIdRef.current = notice.id;

    // Ignore stale notices if joining a room long after the notice occurred
    if (Date.now() - notice.timestamp > 5000) return;

    setAutoPlayToast({
      id: notice.id,
      playerName: notice.playerName,
      actionText: notice.actionText,
      seat: notice.seat,
    });
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
    }
    const noticeId = notice.id;
    autoPlayTimerRef.current = setTimeout(() => {
      setAutoPlayToast((latest) => (latest?.id === noticeId ? null : latest));
      autoPlayTimerRef.current = null;
    }, 3200);
  }, [gameState.lastAutoPlayNotice?.id]);

  useEffect(() => {
    const prevSeats = prevSeatsRef.current;
    for (const s of ['North', 'West', 'South', 'East'] as Seat[]) {
      const prev = prevSeats[s];
      const curr = seats[s];
      if (prev && !prev.isBot && prev.isDisconnected && curr && curr.isBot) {
        const noticeId = `bot_replace_${Date.now()}_${s}`;
        setBotReplacementNotice({
          id: noticeId,
          text: `${prev.name} did not return — replaced by ${curr.name}`,
        });
        if (botReplacementTimerRef.current) {
          clearTimeout(botReplacementTimerRef.current);
        }
        botReplacementTimerRef.current = setTimeout(() => {
          setBotReplacementNotice((latest) => (latest?.id === noticeId ? null : latest));
          botReplacementTimerRef.current = null;
        }, 4000);
        break;
      }
    }
    prevSeatsRef.current = seats;
  }, [seats]);

  // Interactive throwable objects state
  const [selectedThrowable, setSelectedThrowable] = useState<ThrowableObjectType | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [activeThrows, setActiveThrows] = useState<ThrownObjectEvent[]>([]);
  const [recoiledSeats, setRecoiledSeats] = useState<Set<Seat>>(new Set());

  // Listen for multiplayer thrown objects from other players
  useEffect(() => {
    const unsubscribe = addSocketListener((msg) => {
      if (msg.type === 'object_thrown') {
        // Skip echo if thrown by local player to avoid duplicate animation
        if (mySeat && msg.throwEvent.fromSeat === mySeat) return;
        setActiveThrows((prev) => [...prev, msg.throwEvent]);
        setTimeout(() => {
          setActiveThrows((prev) => prev.filter((ev) => ev.id !== msg.throwEvent.id));
        }, 3500);
      }
    });
    return unsubscribe;
  }, [addSocketListener, mySeat]);

  const handleTriggerRecoil = (seat: Seat) => {
    setRecoiledSeats((prev) => new Set(prev).add(seat));
    setTimeout(() => {
      setRecoiledSeats((prev) => {
        const next = new Set(prev);
        next.delete(seat);
        return next;
      });
    }, 600);
  };

  const gatherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTrickAnimationTimers = () => {
    if (gatherTimerRef.current) {
      clearTimeout(gatherTimerRef.current);
      gatherTimerRef.current = null;
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (celebrateTimerRef.current) {
      clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTrickAnimationTimers();
    };
  }, []);

  // Clear any lingering celebration badges whenever phase or round changes
  useEffect(() => {
    clearTrickAnimationTimers();
    locallyPlayedCardIdsRef.current.clear();
    setDraggingCardId(null);
    setFlyingCard(null);
    setCelebratedSeat(null);
    setWinnerInfo(null);
    setIsGathering(false);
    if (gameState.phase !== 'playing') {
      setDisplayTrick([]);
    }
  }, [gameState.phase, gameState.roundNumber, room.id]);

  // Synchronize trick state with gameState.currentTrick and run card/trick animations
  useEffect(() => {
    const trick = gameState.currentTrick;

    if (trick.length === 4) {
      clearTrickAnimationTimers();
      setDisplayTrick(trick);
      setIsGathering(false);

      if (gameState.trumpSuit) {
        const result = evaluateTrickWinner(trick, gameState.trumpSuit);
        setWinnerInfo(result);

        gatherTimerRef.current = setTimeout(() => {
          gatherTimerRef.current = null;
          setIsGathering(true);
        }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS + ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS);

        finishTimerRef.current = setTimeout(() => {
          finishTimerRef.current = null;
          setIsGathering(false);
          setDisplayTrick([]);
          setWinnerInfo(null);
          setCelebratedSeat(result.winner);
        }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS + ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS + ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS);

        celebrateTimerRef.current = setTimeout(() => {
          celebrateTimerRef.current = null;
          setCelebratedSeat(null);
        }, ANIMATION_CONFIG.CARD_PLAY_DURATION_MS + ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS + ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS + ANIMATION_CONFIG.WINNER_CELEBRATION_DURATION_MS);
      }
    } else if (trick.length > 0) {
      if (gatherTimerRef.current) {
        clearTimeout(gatherTimerRef.current);
        gatherTimerRef.current = null;
      }
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      setDisplayTrick(trick);
      setIsGathering(false);
      setWinnerInfo(null);
    } else {
      // Server resolved the trick (after SERVER_TRICK_RESOLVE_DELAY_MS) and reset gameState.currentTrick to []
      if (gatherTimerRef.current) {
        clearTimeout(gatherTimerRef.current);
        gatherTimerRef.current = null;
      }
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      setIsGathering(false);
      setDisplayTrick([]);
      setWinnerInfo(null);
    }
  }, [gameState.currentTrick, gameState.trumpSuit]);

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

  // Authoritative led suit must always come from gameState.currentTrick so opening leads never inherit a stale suit from displayTrick
  const currentLedSuit =
    gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null;

  const getTrickTargetRect = (visualPos: 'bottom' | 'top' | 'left' | 'right') => {
    // 1. Measure permanent unrotated slot anchor in the DOM (pixel-exact across all viewports)
    const anchorEl = document.querySelector(
      `[data-trick-anchor="${visualPos}"]`
    ) as HTMLElement | null;
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          width: anchorEl.offsetWidth || rect.width,
          height: anchorEl.offsetHeight || rect.height,
        };
      }
    }

    // 2. Fallback to existing slot element if present
    const slotEl = document.querySelector(`[data-trick-slot="${visualPos}"]`) as HTMLElement | null;
    if (slotEl) {
      const rect = slotEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          width: slotEl.offsetWidth || rect.width,
          height: slotEl.offsetHeight || rect.height,
        };
      }
    }

    // 3. Center stage / arena fallback calculation
    const arenaEl = document.querySelector('[data-trick-arena]');
    const cardW = 72;
    const cardH = 100;
    if (arenaEl) {
      const arenaRect = arenaEl.getBoundingClientRect();
      const centerX = arenaRect.left + arenaRect.width / 2;
      const centerY = arenaRect.top + arenaRect.height / 2;
      switch (visualPos) {
        case 'bottom':
          return {
            centerX,
            centerY: arenaRect.bottom - cardH / 2 - 14,
            width: cardW,
            height: cardH,
          };
        case 'top':
          return {
            centerX,
            centerY: arenaRect.top + cardH / 2 + 14,
            width: cardW,
            height: cardH,
          };
        case 'left':
          return {
            centerX: arenaRect.left + cardW / 2 + 14,
            centerY,
            width: cardW,
            height: cardH,
          };
        case 'right':
          return {
            centerX: arenaRect.right - cardW / 2 - 14,
            centerY,
            width: cardW,
            height: cardH,
          };
      }
    }

    const w = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const h = typeof window !== 'undefined' ? window.innerHeight : 700;
    return {
      centerX: w * 0.5,
      centerY: h * 0.54,
      width: 72,
      height: 100,
    };
  };

  const handleCompleteFlight = React.useCallback((flightId: string) => {
    setFlyingCard((prev) => {
      if (!prev || prev.id !== flightId) return prev;
      playCardSnapSound();
      return null;
    });
  }, []);

  const handleCardInteraction = (card: Card, gesture?: CardReleaseGesture) => {
    if (!mySeat || !isMyTurnToPlay) return;
    if (!isCardLegal(card, myHand, currentLedSuit)) return;

    const target = getTrickTargetRect('bottom');
    const fallbackW = 76;
    const fallbackH = 108;
    const startCenterX =
      gesture?.centerX ?? (typeof window !== 'undefined' ? window.innerWidth * 0.5 : 500);
    const startCenterY =
      gesture?.centerY ?? (typeof window !== 'undefined' ? window.innerHeight - 80 : 620);
    const startWidth = gesture?.width || fallbackW;
    const startHeight = gesture?.height || fallbackH;
    const startScale = gesture?.scale ?? 1;
    const startRotateDeg = gesture?.rotateDeg ?? 0;
    const vx = gesture?.vx ?? 0;
    const vy = gesture?.vy ?? -0.5;
    const wasDragged = Boolean(gesture?.wasDragged);

    const dx = target.centerX - startCenterX;
    const dy = target.centerY - startCenterY;
    const dist = Math.hypot(dx, dy);

    // Velocity-aware flight duration:
    // - Dropped directly onto or near the trick slot: crisp 120-160ms settle
    // - Fast upward flick: scales down duration with upward release velocity
    // - Tap/click from hand: smooth 220-310ms dealer toss
    const upwardSpeed = Math.max(0.25, -vy);
    let flightDuration: number;
    if (dist < 42) {
      flightDuration = 125;
    } else if (wasDragged) {
      const speedAdjusted = (dist / Math.min(2.2, Math.max(0.55, upwardSpeed * 1.1))) * 0.48;
      flightDuration = Math.round(Math.max(135, Math.min(300, 95 + speedAdjusted)));
    } else {
      flightDuration = Math.round(Math.max(210, Math.min(315, 145 + dist * 0.45)));
    }

    const flightId = `flight_${Date.now()}_${card.id}`;
    locallyPlayedCardIdsRef.current.add(card.id);
    setDraggingCardId(null);

    setFlyingCard({
      id: flightId,
      card,
      startCenterX,
      startCenterY,
      startWidth,
      startHeight,
      startScale,
      startRotateDeg,
      targetCenterX: target.centerX,
      targetCenterY: target.centerY,
      targetWidth: target.width,
      targetHeight: target.height,
      targetRotateDeg: 1, // Matches bottom slot naturalTilt
      vx,
      vy,
      wasDragged,
      duration: flightDuration,
    });

    setJustPlayedHandCardId(card.id);
    playCard(room.id, mySeat, card);
    setTimeout(() => {
      setJustPlayedHandCardId((prev) => (prev === card.id ? null : prev));
    }, flightDuration + 90);
  };

  const handleSeatClick = (seat: Seat) => {
    if (!user) return;
    if (gameState.phase !== 'waiting') return;
    if (seats[seat] && !seats[seat]?.isBot && seats[seat]?.id !== user.id) return;
    claimSeat(room.id, seat, user);
  };

  const handleThrowAtSeat = (targetSeat: Seat) => {
    if (!mySeat || !selectedThrowable || !room) return;
    if (targetSeat === mySeat) return;
    if (!seats[targetSeat]) return;
    if (Date.now() < cooldownUntil) return;

    // 1. Fire optimistic local animation immediately for instant responsive UX
    const localEventId = `throw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const localThrowEvent: ThrownObjectEvent = {
      id: localEventId,
      roomId: room.id,
      fromSeat: mySeat,
      toSeat: targetSeat,
      objectType: selectedThrowable,
      timestamp: Date.now(),
    };
    setActiveThrows((prev) => [...prev, localThrowEvent]);
    setTimeout(() => {
      setActiveThrows((prev) => prev.filter((ev) => ev.id !== localEventId));
    }, 3500);

    // 2. Dispatch to server for room broadcast
    throwObject(room.id, mySeat, targetSeat, selectedThrowable);
    setCooldownUntil(Date.now() + ANIMATION_CONFIG.THROW_COOLDOWN_MS);
    setSelectedThrowable(null);
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

  // Active turn seat & live human turn timer calculations
  const activeTurnSeat: Seat | null =
    gameState.phase === 'bidding'
      ? gameState.currentBidder
      : gameState.phase === 'declaring'
      ? gameState.declarer
      : gameState.phase === 'playing'
      ? gameState.currentTurn
      : null;

  const turnTotalMs = gameState.turnDurationMs || room.turnTimeoutMs || 10000;
  const turnRemainingMs =
    activeTurnSeat && gameState.turnDeadlineAt
      ? Math.max(0, gameState.turnDeadlineAt - nowTick)
      : null;
  const turnSecondsLeft =
    turnRemainingMs !== null ? Math.max(1, Math.ceil(turnRemainingMs / 1000)) : null;
  const turnProgressPct =
    turnRemainingMs !== null && turnTotalMs > 0
      ? Math.max(0, Math.min(100, (turnRemainingMs / turnTotalMs) * 100))
      : 0;

  const matchmakingSecondsLeft =
    room.matchmakingAutoStartAt && gameState.phase === 'waiting'
      ? Math.max(1, Math.ceil((room.matchmakingAutoStartAt - nowTick) / 1000))
      : null;

  const handleCopyRoomCode = () => {
    const codeText = room.code || room.id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codeText).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyInviteLink = () => {
    const codeText = room.code || room.id;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(codeText)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedInviteLink(true);
    setTimeout(() => setCopiedInviteLink(false), 2200);
  };

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
    const isActiveTurnSeat = activeTurnSeat === seat;
    const team = getTeam(seat);
    const tricksWon = gameState.tricksWonCount[seat] || 0;

    const isThisMySeat = mySeat === seat;
    if (isThisMySeat && gameState.phase !== 'waiting') return null; // Player's profile is docked directly in bottom hand footer during gameplay!

    const visualPos = getSeatVisualPos(seat);
    const isTopSeat = visualPos === 'top';
    const isPartner = Boolean(mySeat && getPartner(mySeat) === seat);
    const isCelebrated = gameState.phase === 'playing' && celebratedSeat === seat;
    const isRecoiling = recoiledSeats.has(seat);
    const isTargetable = Boolean(selectedThrowable && mySeat && mySeat !== seat && player);
    const seatBid = gameState.bids.find((b) => b.seat === seat);
    const seatVoice = getSeatVoiceState(seat);
    const isDisconnected = Boolean(player && !player.isBot && player.isDisconnected);
    const secondsLeft =
      isDisconnected && player?.botReplaceAt
        ? Math.max(1, Math.ceil((player.botReplaceAt - nowTick) / 1000))
        : 0;
    const seatTurnSec = isActiveTurnSeat && turnSecondsLeft !== null ? turnSecondsLeft : null;

    return (
      <div
        data-throw-seat={seat}
        onClick={(e) => {
          if (isTargetable) {
            e.stopPropagation();
            handleThrowAtSeat(seat);
          }
        }}
        className={`absolute ${positionClasses} flex flex-col items-center z-20 ${isTargetable ? 'cursor-crosshair' : ''}`}
      >
        {player ? (
          <div className={`flex ${isTopSeat ? 'flex-row items-center gap-2' : 'flex-col items-center gap-1'}`}>
            <div
              onClick={(e) => {
                if (isTargetable) {
                  e.stopPropagation();
                  handleThrowAtSeat(seat);
                }
              }}
              className={`
                flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-2xl transition-all duration-200 relative overflow-visible
                ${isTargetable ? 'cursor-crosshair ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 animate-pulse scale-105 hover:scale-115 shadow-[0_0_18px_rgba(251,191,36,0.9)] z-40' : ''}
                ${isRecoiling ? 'avatar-recoiling' : ''}
                ${isDisconnected ? 'ring-2 ring-rose-500/90 bg-rose-950/90 border border-rose-500/80 shadow-[0_0_16px_rgba(244,63,94,0.55)]' : ''}
                ${!isDisconnected && isCelebrated ? 'ring-3 ring-amber-400 bg-amber-950/90 shadow-[0_0_22px_rgba(251,191,36,0.9)] scale-110 z-30' : ''}
                ${!isDisconnected && !isCelebrated && !isTargetable && isActiveTurnSeat ? 'ring-2 ring-amber-400 bg-amber-950/85 shadow-lg scale-105' : ''}
                ${!isDisconnected && !isCelebrated && !isTargetable && !isActiveTurnSeat ? 'bg-slate-950/90 border border-emerald-800/50 shadow-md' : ''}
              `}
            >
              {/* Live Turn Timer Progress Bar along bottom edge of active seat */}
              {seatTurnSec !== null && !isDisconnected && (
                <div className="absolute bottom-0 left-2 right-2 h-1 bg-slate-900/90 rounded-full overflow-hidden pointer-events-none">
                  <div
                    style={{ width: `${turnProgressPct}%` }}
                    className={`h-full transition-[width] duration-100 ease-linear ${
                      seatTurnSec <= 3
                        ? 'bg-rose-500'
                        : seatTurnSec <= 5
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                </div>
              )}

              {/* Active Targeting Reticle Tag */}
              {isTargetable && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 font-black text-[8px] sm:text-[9px] px-2 py-0.2 rounded-full shadow-lg animate-bounce z-50 whitespace-nowrap">
                  TARGET 🎯
                </div>
              )}
              {/* Disconnected Countdown Pill OR Bid Speech Bubble / Winning Contract Post-Auction */}
              {(() => {
                if (isDisconnected) {
                  return (
                    <div
                      data-testid={`seat-disconnected-badge-${seat}`}
                      className={`absolute ${isTopSeat ? 'top-full mt-1.5' : '-top-5'} left-1/2 -translate-x-1/2 z-40 whitespace-nowrap pointer-events-none`}
                    >
                      <span className="bg-rose-600 border border-rose-300 text-white font-extrabold text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                        <LogOut className="w-2.5 h-2.5 text-white shrink-0" />
                        <span>Left • Bot in {secondsLeft}s</span>
                      </span>
                    </div>
                  );
                }

                // Phase 1: During Active Bidding
                if (gameState.phase === 'bidding') {
                  return (
                    <div className={`absolute ${isTopSeat ? 'top-full mt-1.5' : '-top-5'} left-1/2 -translate-x-1/2 z-30 whitespace-nowrap pointer-events-none`}>
                      {isCurrentBidder ? (
                        <span className="bg-amber-400 text-slate-950 font-extrabold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow animate-pulse flex items-center gap-1">
                          <span>Bidding...</span>
                          {seatTurnSec !== null && (
                            <span className="font-mono bg-slate-950 text-amber-300 px-1 rounded-full text-[7px]">
                              {seatTurnSec}s
                            </span>
                          )}
                        </span>
                      ) : seatBid ? (
                        seatBid.type === 'pass' ? (
                          <span className="bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow flex items-center gap-1">
                            <span>Passed</span>
                            {seatBid.isBotAutoPlay && (
                              <span className="text-[7px] bg-cyan-950 text-cyan-300 border border-cyan-500/60 px-1 rounded-full font-bold">
                                🤖 Auto
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow flex items-center gap-1">
                            <span>Bid {seatBid.level} {seatBid.contractType}</span>
                            {seatBid.isBotAutoPlay && (
                              <span className="text-[7px] bg-cyan-950 text-cyan-300 border border-cyan-500/60 px-1 rounded-full font-bold">
                                🤖 Auto
                              </span>
                            )}
                          </span>
                        )
                      ) : null}
                    </div>
                  );
                }

                // Phase 2: Post-Auction (Declaring, Playing, Round Over)
                if (gameState.phase === 'playing' || gameState.phase === 'declaring' || gameState.phase === 'round_over') {
                  // Winning Bidder: Prominent Glowing Gold Contract Badge
                  if (isDeclarer) {
                    let contractText = '';
                    if (gameState.trumpSuit === 'NT') {
                      contractText = `${gameState.winningBid?.level || 1} NT`;
                    } else if (gameState.trumpSuit) {
                      const sym = SUIT_SYMBOLS[gameState.trumpSuit];
                      const sName = SUIT_NAMES[gameState.trumpSuit];
                      contractText = `${gameState.winningBid?.level || 1}${sym} ${sName}`;
                    } else {
                      contractText = `${gameState.winningBid?.level || 1} Suit`;
                    }

                    return (
                      <div className={`absolute ${isTopSeat ? 'top-full mt-1.5' : '-top-5 sm:-top-6'} left-1/2 -translate-x-1/2 z-30 whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-150`}>
                        <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 text-slate-950 font-black text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.7)] border border-white flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5 fill-current text-slate-950 shrink-0" />
                          <span>{contractText}</span>
                          <span className="hidden sm:inline text-[7px] bg-slate-950 text-amber-300 px-1 py-0.2 rounded-full font-bold uppercase tracking-wider">
                            Winning Bid
                          </span>
                          {(gameState.winningBid?.isBotAutoPlay || gameState.isTrumpAutoDeclared) && (
                            <span className="text-[7px] bg-cyan-950 text-cyan-300 border border-cyan-400 px-1 rounded-full font-bold">
                              🤖 Auto
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  }

                  // Non-Declarer Players: Persistent clear bid or pass pill
                  if (seatBid) {
                    return (
                      <div className={`absolute ${isTopSeat ? 'top-full mt-1.5' : '-top-5'} left-1/2 -translate-x-1/2 z-20 whitespace-nowrap pointer-events-none`}>
                        {seatBid.type === 'pass' ? (
                          <span className="bg-slate-900/90 border border-slate-700/80 text-slate-400 font-semibold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow-xs flex items-center gap-1">
                            <span>Passed</span>
                            {seatBid.isBotAutoPlay && (
                              <span className="text-[7px] bg-cyan-950 text-cyan-300 border border-cyan-500/60 px-1 rounded-full font-bold">
                                🤖 Auto
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="bg-slate-900/90 border border-slate-600 text-slate-300 font-bold text-[8px] sm:text-[9px] px-1.5 py-[1px] rounded-full shadow-xs flex items-center gap-1">
                            <span>Bid {seatBid.level} {seatBid.contractType}</span>
                            {seatBid.isBotAutoPlay && (
                              <span className="text-[7px] bg-cyan-950 text-cyan-300 border border-cyan-500/60 px-1 rounded-full font-bold">
                                🤖 Auto
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  }
                }

                return null;
              })()}

            {/* Avatar & Status Badges */}
            <div className="relative shrink-0">
              <img
                src={player.avatar}
                alt={player.name}
                referrerPolicy="no-referrer"
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border object-cover shadow bg-slate-800 transition-all ${
                  isDisconnected
                    ? 'opacity-60 grayscale-[40%] border-rose-400'
                    : seatVoice?.isSpeaking
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
            <div className="text-left min-w-0 max-w-[100px] sm:max-w-[130px] leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-white truncate">
                  {isThisMySeat ? 'You' : player.name.replace(/^Bot\s+/i, '')}
                </span>
                {seatTurnSec !== null && !isDisconnected && (
                  <span
                    data-testid={`seat-turn-timer-${seat}`}
                    className={`text-[8px] font-mono font-black px-1 py-0.2 rounded-full shrink-0 ${
                      seatTurnSec <= 3
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    {seatTurnSec}s
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-semibold">
                {isDisconnected ? (
                  <span className="text-rose-300 font-bold truncate">Left ({secondsLeft}s)</span>
                ) : (
                  <>
                    <span className={team === 'TeamA' ? 'text-emerald-400' : 'text-blue-400'}>
                      {isPartner ? 'Partner' : team === 'TeamA' ? 'Team 1' : 'Team 2'}
                    </span>
                    {gameState.phase === 'playing' && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-amber-300 font-mono font-bold">{tricksWon}T</span>
                      </>
                    )}
                  </>
                )}
              </div>
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
      {/* Slim, Always-Visible Top HUD Bar */}
      <header className="landscape-compact-header h-10 sm:h-11 shrink-0 border-b border-emerald-900/50 bg-[#0a2016]/95 backdrop-blur-md px-1.5 sm:px-4 flex items-center justify-between gap-1 sm:gap-2 shadow-md z-30">
        {/* Left: Leave / Table Menu + Room Title & Room Code */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={onLeaveRoom}
            className="py-1 px-1.5 sm:px-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-emerald-800/50 text-emerald-300 transition-all cursor-pointer flex items-center gap-1 text-[11px] sm:text-xs font-semibold shrink-0"
            title="Leave table and return to lobby"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Lobby</span>
          </button>

          {room.code && (
            <button
              type="button"
              onClick={handleCopyInviteLink}
              title="Click to copy invite link for friends"
              className="py-1 px-1.5 sm:px-2 rounded-lg bg-slate-950/90 hover:bg-slate-900 border border-amber-500/40 text-amber-300 font-mono text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
            >
              {room.isPrivate ? (
                <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              ) : (
                <Globe className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              )}
              <span>#{room.code}</span>
              {copiedInviteLink ? (
                <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              ) : (
                <Share2 className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              )}
            </button>
          )}

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

        {/* Center: Always-Visible Match Score + Live Contract & Trick Progress (Desktop/Tablet) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Team Match Scores Pill (Always visible on mobile & desktop) */}
          <button
            onClick={() => setShowScoreModal(true)}
            className="flex items-center gap-1 sm:gap-1.5 bg-slate-950/90 hover:bg-slate-900 border border-emerald-800/60 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-mono transition-all cursor-pointer shrink-0"
            title="View Full Match Standings (Target: +10)"
          >
            <span className="text-emerald-400 font-bold">
              T1: {gameState.matchScores.TeamA >= 0 ? `+${gameState.matchScores.TeamA}` : gameState.matchScores.TeamA}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-blue-400 font-bold">
              T2: {gameState.matchScores.TeamB >= 0 ? `+${gameState.matchScores.TeamB}` : gameState.matchScores.TeamB}
            </span>
          </button>

          {/* Phase-Specific Live Contract / Auction Progress Pill (Hidden on <640px where ContractHud & LastTrickCross are already on the felt) */}
          {gameState.phase === 'playing' && contractTeam && (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 px-2.5 py-1 rounded-lg shadow-xs text-[11px] shrink-0">
              {renderTrumpBadge()}
              <span className="text-slate-600">•</span>
              <span className="font-mono font-bold text-amber-300" title="Declaring team tricks won vs. contract target">
                {contractTeam === 'TeamA' ? 'T1' : 'T2'}({gameState.winningBid?.level}
                {gameState.winningBid?.contractType === 'NT' ? 'NT' : 'S'}): {contractTricksWon}/{contractGoalTricks}
              </span>
              <span className="hidden md:inline">
                <span className="text-slate-600"> | </span>
                <span className="font-mono text-slate-300" title="Defending team tricks won vs. tricks needed to set contract">
                  Def: {defenseTricksWon}/{defenseSetGoalTricks}
                </span>
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
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 px-2.5 py-1 rounded-lg text-[11px] shrink-0">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-mono font-bold">
                Auction {gameState.auctionTurnsCount + 1}/4
              </span>
            </div>
          )}

          {gameState.phase === 'declaring' && (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 px-2.5 py-1 rounded-lg text-[11px] shrink-0">
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
            className="hidden sm:flex px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-emerald-800/50 rounded-lg text-[11px] sm:text-xs text-emerald-300 items-center gap-1 transition-all cursor-pointer"
            title="Match Standings"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Standings</span>
          </button>

          {/* Quick Sound & Clicks Toggle */}
          <button
            onClick={() => {
              playClickSound();
              toggleSoundSetting();
            }}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-slate-900 hover:bg-slate-800 border-slate-700/70 text-slate-300 hover:text-white'
                : 'bg-red-950/40 hover:bg-red-900/50 border-red-800/70 text-red-400'
            }`}
            title={soundEnabled ? 'Mute Game Sound & Clicks' : 'Unmute Game Sound & Clicks'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
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
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-slate-950 border border-emerald-700/60 rounded-xl shadow-2xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-slate-800/80 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span className="truncate">{room.name}</span>
                  {room.code && <span className="text-amber-300 font-bold">#{room.code}</span>}
                </div>

                {/* Sound & Clicks Switcher inside Table Options */}
                <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    {soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span>Sound & Clicks</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      toggleSoundSetting();
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      soundEnabled ? 'bg-emerald-600 text-white' : 'bg-red-900/60 border border-red-700 text-red-300'
                    }`}
                  >
                    {soundEnabled ? 'On' : 'Muted'}
                  </button>
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

                {/* Turn Timer Switcher inside Table Options */}
                <div className="px-3 py-2 border-b border-slate-800/80">
                  <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Turn Timer (Auto-Bot)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: '10s', value: 10000 },
                      { label: '15s', value: 15000 },
                      { label: '30s', value: 30000 },
                      { label: 'Off', value: 0 },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTurnTimeout(room.id, opt.value)}
                        className={`py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                          (room.turnTimeoutMs ?? 10000) === opt.value
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
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
      <main className="portrait-table-container flex-1 min-h-0 relative flex items-center justify-center p-1 sm:p-1.5 overflow-clip">
        {/* Disconnected Player Countdown Banner, Bot Replacement Toast & Bot Auto-Play Notice */}
        {(hasDisconnectedPlayers || botReplacementNotice || autoPlayToast) && (
          <div className="absolute top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center gap-1.5 w-max max-w-[92vw]">
            {(['North', 'West', 'South', 'East'] as Seat[]).map((s) => {
              const p = seats[s];
              if (!p || p.isBot || !p.isDisconnected || !p.botReplaceAt) return null;
              const secLeft = Math.max(1, Math.ceil((p.botReplaceAt - nowTick) / 1000));
              return (
                <div
                  key={s}
                  data-testid={`disconnect-banner-${s}`}
                  className="bg-rose-950/95 border border-rose-500/85 text-rose-100 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.65)] flex items-center gap-2 text-[10px] sm:text-xs font-semibold backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400 animate-pulse shrink-0" />
                  <span className="truncate">
                    <strong className="text-white">{p.name}</strong> left the game — replacing with Bot in{' '}
                    <strong className="text-amber-300 font-mono">{secLeft}s</strong>
                  </span>
                </div>
              );
            })}
            {botReplacementNotice && (
              <div
                data-testid="bot-replacement-toast"
                onClick={() => setBotReplacementNotice(null)}
                className="pointer-events-auto cursor-pointer bg-slate-950/95 border border-emerald-500/80 text-emerald-100 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.65)] flex items-center gap-2 text-[10px] sm:text-xs font-semibold backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <Bot className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{botReplacementNotice.text}</span>
              </div>
            )}
            {autoPlayToast && (
              <div
                data-testid="bot-autoplay-toast"
                onClick={() => setAutoPlayToast(null)}
                className="pointer-events-auto cursor-pointer bg-cyan-950/95 border border-cyan-400/90 text-cyan-100 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.65)] flex items-center gap-2 text-[10px] sm:text-xs font-semibold backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span className="truncate">
                  <strong className="text-cyan-300">Bot Move</strong> for{' '}
                  <strong className="text-white">
                    {autoPlayToast.seat === mySeat ? 'You' : autoPlayToast.playerName}
                  </strong>{' '}
                  (Time expired): <strong className="text-amber-300">{autoPlayToast.actionText}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Table Stage: Rich Hardwood Rail Borders with Casino Green Felt */}
        <div className="portrait-table-wrap landscape-compact-table-wrap relative w-full max-w-5xl h-full md:aspect-[16/10] rounded-[24px] sm:rounded-[36px] md:rounded-[52px] table-wood-rail table-brass-bevel p-1 sm:p-2.5 md:p-3.5 shadow-2xl overflow-visible flex items-center justify-center">
          {/* Inner Casino Green Felt Surface */}
          <div className="portrait-felt landscape-compact-felt w-full h-full rounded-[20px] sm:rounded-[30px] md:rounded-[44px] table-felt-radial table-felt-rim table-felt-stitch relative flex items-center justify-center p-1 sm:p-2 overflow-visible">
            {/* Cardinal Seats (Dynamically oriented with active player at the bottom) */}
            {renderSeat(
              topSeat,
              `portrait-seat-top landscape-seat-top top-1 sm:top-1.5 left-1/2 -translate-x-1/2 ${
                gameState.phase !== 'playing' ? 'landscape-console-top-seat' : ''
              }`
            )}
            {renderSeat(leftSeat, 'portrait-seat-left landscape-seat-left left-1 sm:left-2 top-1/2 -translate-y-1/2')}
            {renderSeat(
              bottomSeat,
              `bottom-1 sm:bottom-1.5 left-1/2 -translate-x-1/2 ${
                mySeat && gameState.phase !== 'waiting' ? 'landscape-hide-bottom-seat' : ''
              } ${gameState.phase !== 'playing' ? 'landscape-console-bottom-seat' : ''}`
            )}
            {renderSeat(rightSeat, 'portrait-seat-right landscape-seat-right right-1 sm:right-2 top-1/2 -translate-y-1/2')}

            {/* 1. Last Trick Cross Display (Top Right Corner of Playing Area) */}
            {gameState.phase === 'playing' && (
              <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-3 z-20">
                <LastTrickCross
                  trick={
                    gameState.tricksHistory.length > 0
                      ? gameState.tricksHistory[gameState.tricksHistory.length - 1]
                      : null
                  }
                  mySeat={mySeat}
                  seats={seats}
                  getSeatVisualPos={getSeatVisualPos}
                />
              </div>
            )}

            {/* 2. Big Bold Contract & Live Team Trick Counts (Bottom Left Side of Playing Area) */}
            {(gameState.phase === 'playing' || gameState.phase === 'declaring') && (
              <div className="absolute bottom-1.5 left-1.5 sm:bottom-2.5 sm:left-3 z-20">
                <ContractHud
                  gameState={gameState}
                  mySeat={mySeat}
                  seats={seats}
                />
              </div>
            )}

            {/* Center Table Stage */}
            <div className="portrait-center-stage landscape-compact-center-stage relative w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-80 lg:h-80 rounded-full border border-emerald-600/20 bg-black/25 flex items-center justify-center p-1 overflow-visible">
              <div className="absolute inset-0 pointer-events-none opacity-20 flex items-center justify-center">
                <div className="w-full h-full rounded-full border border-dashed border-emerald-400 animate-spin [animation-duration:60s]" />
              </div>

              {/* Subtle Embossed Felt Watermark (MobilityWare Style) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.08]">
                <div className="flex flex-col items-center">
                  <span className="text-6xl sm:text-7xl font-serif-display font-black text-emerald-200">♠</span>
                  <span className="text-xs sm:text-sm font-serif-display font-bold text-emerald-100 mt-0.5">تدفيع الثمن</span>
                </div>
              </div>

              {/* Waiting Phase: Pre-Game Seating, Room Code / Invite Link & Bot Setup Card */}
              {gameState.phase === 'waiting' && (
                <div className="landscape-compact-console text-center z-20 p-2.5 sm:p-3.5 bg-slate-950/95 border border-emerald-600/60 rounded-2xl w-[265px] sm:w-[285px] shrink-0 shadow-2xl">
                  <div className="text-xs font-bold text-amber-300 mb-1.5 flex items-center justify-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{room.isPrivate ? 'Private Friends Table' : 'Table Seating & Invite'}</span>
                  </div>

                  {/* Room Code & Copy Shareable Invite Link Bar */}
                  {room.code && (
                    <div className="bg-slate-900/95 border border-emerald-700/50 rounded-xl p-1.5 mb-2 flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyRoomCode}
                        data-testid="room-code-pill"
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-400/60 transition-all cursor-pointer"
                        title="Click to copy Room Code"
                      >
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">Code:</span>
                        <span className="text-xs font-mono font-black tracking-wider text-amber-300">
                          {room.code}
                        </span>
                        {copiedCode ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        data-testid="copy-invite-link-btn"
                        className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 font-bold text-[10px] flex items-center justify-center gap-1 border border-emerald-600/50 transition-all cursor-pointer"
                      >
                        {copiedInviteLink ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-300" />
                            <span>Link Copied!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3 h-3" />
                            <span>Invite Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Matchmaking Auto-Start Countdown Banner */}
                  {matchmakingSecondsLeft !== null && (
                    <div
                      data-testid="matchmaking-countdown-banner"
                      className="bg-emerald-950/90 border border-emerald-500/60 rounded-xl px-2.5 py-1.5 mb-2 text-[10px] text-emerald-200 flex items-center justify-center gap-1.5 animate-pulse"
                    >
                      <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>
                        Matching players... Auto-filling bots in{' '}
                        <strong className="text-amber-300 font-mono">{matchmakingSecondsLeft}s</strong>
                      </span>
                    </div>
                  )}

                  {/* Pre-Game Bot Skill & Turn Timer Selectors */}
                  <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl px-2 py-1 mb-1.5">
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

                  <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl px-2 py-1 mb-2">
                    <span className="text-[10px] text-slate-300 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      <span>Turn Timer:</span>
                    </span>
                    <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 gap-0.5">
                      {[
                        { label: '10s', value: 10000 },
                        { label: '15s', value: 15000 },
                        { label: '30s', value: 30000 },
                        { label: 'Off', value: 0 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setTurnTimeout(room.id, opt.value)}
                          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                            (room.turnTimeoutMs ?? 10000) === opt.value
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
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
                        . Share the code with friends or deal with AI bots!
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

              {/* Misdeal Phase: Revealed 13-Card Hand and Countdown */}
              {gameState.phase === 'misdeal' && gameState.misdealInfo && (
                <div className="landscape-compact-console z-30 w-full max-w-lg">
                  <MisdealModal
                    misdealInfo={gameState.misdealInfo}
                    onSkip={() => skipMisdeal(room.id)}
                    isHost={user?.id === room.hostId}
                  />
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
                <div data-trick-arena className="relative w-full h-full flex items-center justify-center">
                  {/* Permanent slot anchors for pixel-exact flight targeting; bottom anchor glows as drop-zone while swiping */}
                  {(['top', 'bottom', 'left', 'right'] as const).map((pos) => {
                    const isBottomDropZoneActive =
                      pos === 'bottom' &&
                      Boolean(draggingCardId) &&
                      isMyTurnToPlay &&
                      !displayTrick.some((p) => getSeatVisualPos(p.seat) === 'bottom');
                    return (
                      <div
                        key={`trick-anchor-${pos}`}
                        data-trick-anchor={pos}
                        aria-hidden="true"
                        className={`absolute ${
                          {
                            top: 'top-3.5 sm:top-4 left-1/2 -translate-x-1/2',
                            bottom: 'bottom-3.5 sm:bottom-4 left-1/2 -translate-x-1/2',
                            left: 'left-3.5 sm:left-4 top-1/2 -translate-y-1/2',
                            right: 'right-3.5 sm:right-4 top-1/2 -translate-y-1/2',
                          }[pos]
                        } portrait-trick-card landscape-compact-trick-card w-15 h-21 sm:w-18 sm:h-25 md:w-20 md:h-28 rounded-lg sm:rounded-xl pointer-events-none select-none transition-all duration-150 ${
                          isBottomDropZoneActive
                            ? 'opacity-100 border-2 border-dashed border-emerald-400/90 bg-emerald-400/15 shadow-[0_0_24px_rgba(52,211,153,0.45)] flex items-center justify-center'
                            : 'opacity-0'
                        }`}
                      >
                        {isBottomDropZoneActive && (
                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-emerald-200 drop-shadow">
                            Drop
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* 4 Cards Placement in Trick with Smooth Play & Collect Animations */}
                  {displayTrick.map((played, idx) => {
                    const isWinningCard = Boolean(
                      winnerInfo && winnerInfo.winningCard.id === played.card.id
                    );
                    const visualPos = getSeatVisualPos(played.seat);
                    const winnerVisualPos = winnerInfo
                      ? getSeatVisualPos(winnerInfo.winner)
                      : null;
                    const wasLocallyPlayed = Boolean(
                      (mySeat && played.seat === mySeat) ||
                        locallyPlayedCardIdsRef.current.has(played.card.id)
                    );
                    return (
                      <TrickCardItem
                        key={played.card.id}
                        played={played}
                        isGathering={isGathering}
                        visualPos={visualPos}
                        winnerVisualPos={winnerVisualPos}
                        isWinningCard={isWinningCard}
                        isLeadCard={idx === 0}
                        isLocallyFlying={Boolean(flyingCard && flyingCard.card.id === played.card.id)}
                        wasLocallyPlayed={wasLocallyPlayed}
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
          <footer className="portrait-hand-footer landscape-compact-hand-footer shrink-0 w-full max-w-5xl mx-auto px-1.5 sm:px-3 pb-1 sm:pb-1.5 z-20">
            <div className="portrait-hand-box landscape-compact-hand-box bg-slate-950/92 backdrop-blur-md border border-emerald-800/40 rounded-xl sm:rounded-2xl px-1.5 sm:px-2 py-1 sm:p-2 shadow-2xl relative overflow-visible">
              {/* Live Turn Timer Progress Bar along top edge of player hand dock when it is your turn */}
              {activeTurnSeat === mySeat && turnSecondsLeft !== null && (
                <div
                  data-testid="my-turn-progress-bar"
                  className="absolute top-0 left-3 right-3 h-1 bg-slate-900 rounded-full overflow-hidden pointer-events-none"
                >
                  <div
                    style={{ width: `${turnProgressPct}%` }}
                    className={`h-full transition-[width] duration-100 ease-linear ${
                      turnSecondsLeft <= 3
                        ? 'bg-rose-500'
                        : turnSecondsLeft <= 5
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                </div>
              )}

              {/* Compact Hand Status Header Row */}
              <div className="flex items-center justify-between gap-1 text-xs px-1 mb-0.5">
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  {/* Player Profile & Identity Pill */}
                  <div data-throw-seat={mySeat} className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <div className="relative shrink-0">
                      <img
                        src={user?.avatar || seats[mySeat]?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=You'}
                        alt="You"
                        referrerPolicy="no-referrer"
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border object-cover shadow bg-slate-800 ${
                          recoiledSeats.has(mySeat) ? 'avatar-recoiling' : ''
                        } ${
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
                      className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-[1px] rounded-full border flex items-center gap-1 shrink-0 ${
                        getTeam(mySeat) === 'TeamA'
                          ? 'text-emerald-300 bg-emerald-950/80 border-emerald-700/50'
                          : 'text-blue-300 bg-blue-950/80 border-blue-700/50'
                      }`}
                    >
                      <span className="sm:hidden">{getTeam(mySeat) === 'TeamA' ? 'T1' : 'T2'}</span>
                      <span className="hidden sm:inline">{getTeam(mySeat) === 'TeamA' ? 'Team 1' : 'Team 2'}</span>
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

                  {/* Your Bid or Winning Contract in Bottom Dock */}
                  {(() => {
                    const isMyDeclarer = gameState.declarer === mySeat;
                    const myBid = gameState.bids.find((b) => b.seat === mySeat);
                    if ((gameState.phase === 'playing' || gameState.phase === 'declaring') && isMyDeclarer) {
                      let myContractDisplay = '';
                      let myContractShort = '';
                      if (gameState.trumpSuit === 'NT') {
                        myContractDisplay = `${gameState.winningBid?.level || 1} NT (No Trump)`;
                        myContractShort = `${gameState.winningBid?.level || 1}NT`;
                      } else if (gameState.trumpSuit) {
                        myContractDisplay = `${gameState.winningBid?.level || 1}${SUIT_SYMBOLS[gameState.trumpSuit]} ${SUIT_NAMES[gameState.trumpSuit]}`;
                        myContractShort = `${gameState.winningBid?.level || 1}${SUIT_SYMBOLS[gameState.trumpSuit]}`;
                      } else {
                        myContractDisplay = `${gameState.winningBid?.level || 1} Suit`;
                        myContractShort = `${gameState.winningBid?.level || 1}S`;
                      }
                      return (
                        <span className="bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full shadow border border-white flex items-center gap-1 shrink-0">
                          <Crown className="w-2.5 h-2.5 fill-current shrink-0" />
                          <span className="sm:hidden">{myContractShort}</span>
                          <span className="hidden sm:inline">Winning Bid: {myContractDisplay}</span>
                          {(gameState.winningBid?.isBotAutoPlay || gameState.isTrumpAutoDeclared) && (
                            <span className="text-[7px] sm:text-[8px] bg-cyan-950 text-cyan-300 border border-cyan-400 px-1 rounded-full font-bold">
                              🤖
                            </span>
                          )}
                        </span>
                      );
                    }
                    if (myBid && (gameState.phase === 'playing' || gameState.phase === 'bidding' || gameState.phase === 'declaring')) {
                      return (
                        <span className="bg-slate-900 border border-slate-700 text-slate-300 font-bold text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full shadow-xs shrink-0 flex items-center gap-1">
                          <span className="sm:hidden">
                            {myBid.type === 'pass'
                              ? 'Pass'
                              : `${myBid.level}${myBid.contractType === 'NT' ? 'NT' : 'S'}`}
                          </span>
                          <span className="hidden sm:inline">
                            {myBid.type === 'pass' ? 'Passed' : `Bid ${myBid.level} ${myBid.contractType}`}
                          </span>
                          {myBid.isBotAutoPlay && (
                            <span className="text-[7px] bg-cyan-950 text-cyan-300 border border-cyan-500/60 px-1 rounded-full font-bold">
                              🤖 <span className="hidden sm:inline">Auto</span>
                            </span>
                          )}
                        </span>
                      );
                    }
                    return null;
                  })()}

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

                {/* Right Header Section: Live Turn Countdown + Prompt & Throwable Items Dock */}
                <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0">
                  {/* Live Turn Countdown Pill for Local Human Player */}
                  {activeTurnSeat === mySeat && turnSecondsLeft !== null && (
                    <span
                      data-testid="my-turn-timer-badge"
                      className={`px-1.5 sm:px-2 py-0.5 rounded-full font-mono font-black text-[9px] sm:text-[10px] flex items-center gap-1 border shadow shrink-0 ${
                        turnSecondsLeft <= 3
                          ? 'bg-rose-600 border-rose-300 text-white animate-pulse'
                          : turnSecondsLeft <= 5
                          ? 'bg-amber-500 border-amber-200 text-slate-950'
                          : 'bg-emerald-950 border-emerald-400 text-emerald-300'
                      }`}
                      title="Time remaining before AI Bot automatically plays your move"
                    >
                      <Clock className="w-2.5 h-2.5 shrink-0" />
                      <span>{turnSecondsLeft}s</span>
                    </span>
                  )}

                  {/* Live Turn Prompt */}
                  <div className="shrink-0">
                    {gameState.phase === 'playing' ? (
                      isMyTurnToPlay ? (
                        <span className="text-slate-950 font-extrabold text-[8px] sm:text-[10px] flex items-center gap-1 bg-amber-400 px-1.5 sm:px-2 py-0.5 rounded-full shadow animate-pulse whitespace-nowrap">
                          <span className="sm:hidden">
                            {currentLedSuit
                              ? `FOLLOW ${SUIT_SYMBOLS[currentLedSuit]}`
                              : 'YOUR TURN'}
                          </span>
                          <span className="hidden sm:inline">
                            {currentLedSuit
                              ? `YOUR TURN • FOLLOW ${SUIT_NAMES[currentLedSuit].toUpperCase()}`
                              : 'YOUR TURN • TAP OR SWIPE CARD TO PLAY'}
                          </span>
                        </span>
                      ) : (
                        <span className="hidden sm:inline text-slate-400 text-[11px] whitespace-nowrap">
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
                      <span className="hidden sm:flex text-amber-300 font-semibold text-[10px] items-center gap-1 whitespace-nowrap">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        <span>
                          {gameState.currentBidder === mySeat
                            ? 'Your turn to bid above!'
                            : 'Inspect your hand during the auction'}
                        </span>
                      </span>
                    ) : (
                      <span className="hidden sm:inline text-amber-300 font-semibold text-[10px] whitespace-nowrap">
                        {gameState.declarer === mySeat
                          ? 'Select Trump Suit in the center console'
                          : 'Waiting for Declarer to name Trump'}
                      </span>
                    )}
                  </div>

                  {/* Throwable Objects Dock on the right side of the player area */}
                  <ThrowableDock
                    selectedItem={selectedThrowable}
                    onSelectItem={setSelectedThrowable}
                    cooldownUntil={cooldownUntil}
                  />
                </div>
              </div>

              {/* 13-Card Single-Row Spread */}
              <div className="portrait-hand-row landscape-compact-hand-row flex justify-center items-center pt-1.5 pb-0.5 overflow-visible min-h-[82px] sm:min-h-[100px] md:min-h-[118px] lg:min-h-[140px]">
                {sortedMyHand.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2">All cards played for this round.</div>
                ) : (() => {
                  // Determine if a specific suit must be followed and player holds cards of that suit
                  const hasRequiredSuitInHand = Boolean(
                    gameState.phase === 'playing' &&
                    currentLedSuit &&
                    sortedMyHand.some((c) => c.suit === currentLedSuit)
                  );

                  // Dynamic per-card slot margins based on viewport geometry & suit accordion:
                  // Guarantees every card's giant top-left Rank & Suit is 100% uncovered while giving
                  // the played suit wide, elevated space for effortless selection.
                  const isPortraitViewport = viewport.height > viewport.width && viewport.width <= 640;
                  const isTabletPortraitViewport = viewport.height > viewport.width && viewport.width > 640;
                  const isExtraShortLandscape = viewport.height <= 380 && viewport.width > viewport.height;
                  const isCompactLandscapeViewport = viewport.height <= 480 && viewport.width > viewport.height;

                  const cardWidthPx = isPortraitViewport
                    ? 62
                    : isExtraShortLandscape
                    ? 48
                    : isCompactLandscapeViewport
                    ? 52
                    : viewport.width >= 1024
                    ? 92
                    : viewport.width >= 768
                    ? 84
                    : 76;

                  const usableHandWidthPx = isPortraitViewport
                    ? Math.min(460, Math.max(296, viewport.width - 14))
                    : isCompactLandscapeViewport
                    ? Math.min(640, Math.max(420, viewport.width - 36))
                    : isTabletPortraitViewport
                    ? Math.min(920, Math.max(600, viewport.width - 28))
                    : Math.min(980, Math.max(540, viewport.width - 36));

                  // Guarantee top-left Rank & Suit index column (19px-30px + left offset) is 100% uncovered on every card
                  const minCompVis = isPortraitViewport
                    ? 22.5
                    : isExtraShortLandscape
                    ? 18.5
                    : isCompactLandscapeViewport
                    ? 19.5
                    : viewport.width >= 1024
                    ? 37
                    : viewport.width >= 768
                    ? 34
                    : 31;

                  const targetCompVis = isPortraitViewport
                    ? 24.5
                    : isExtraShortLandscape
                    ? 20.5
                    : isCompactLandscapeViewport
                    ? 21.5
                    : Math.max(minCompVis + 3, Math.round(cardWidthPx * 0.42));

                  const targetExpVis = isPortraitViewport
                    ? 39
                    : isExtraShortLandscape
                    ? 31
                    : isCompactLandscapeViewport
                    ? 33
                    : Math.round(cardWidthPx * 0.62);

                  const targetStdVis = isPortraitViewport
                    ? 28
                    : isExtraShortLandscape
                    ? 23.5
                    : isCompactLandscapeViewport
                    ? 25
                    : Math.round(cardWidthPx * 0.52);

                  const boundaryExtraPx = isPortraitViewport ? 6 : isCompactLandscapeViewport ? 4 : 8;

                  const numOverlaps = Math.max(0, sortedMyHand.length - 1);
                  let computedCompVis = targetCompVis;
                  let computedExpVis = targetExpVis;
                  let computedStdVis = targetStdVis;

                  if (numOverlaps > 0) {
                    if (!hasRequiredSuitInHand) {
                      const maxAllowedStd = (usableHandWidthPx - cardWidthPx) / numOverlaps;
                      computedStdVis = Math.max(minCompVis, Math.min(targetStdVis, maxAllowedStd));
                    } else {
                      let expOverlaps = 0;
                      let compOverlaps = 0;
                      let boundaryCount = 0;
                      for (let i = 0; i < numOverlaps; i++) {
                        const prevIsReq = sortedMyHand[i].suit === currentLedSuit;
                        const nextIsReq = sortedMyHand[i + 1].suit === currentLedSuit;
                        if (prevIsReq) {
                          expOverlaps++;
                          if (!nextIsReq) boundaryCount++;
                        } else {
                          compOverlaps++;
                        }
                      }

                      const availStripSpace = usableHandWidthPx - cardWidthPx - boundaryCount * boundaryExtraPx;
                      const desiredSpace = expOverlaps * targetExpVis + compOverlaps * targetCompVis;

                      if (desiredSpace <= availStripSpace) {
                        computedCompVis = targetCompVis;
                        computedExpVis = targetExpVis;
                      } else {
                        const scale = availStripSpace / desiredSpace;
                        computedCompVis = Math.max(minCompVis, targetCompVis * scale);
                        const remainingForExp = availStripSpace - compOverlaps * computedCompVis;
                        computedExpVis =
                          expOverlaps > 0
                            ? Math.min(targetExpVis, Math.max(computedCompVis + 8, remainingForExp / expOverlaps))
                            : targetExpVis;

                        if (expOverlaps * computedExpVis + compOverlaps * computedCompVis > availStripSpace) {
                          const tightScale = availStripSpace / (expOverlaps * computedExpVis + compOverlaps * computedCompVis);
                          computedCompVis = Math.max(minCompVis - 1, computedCompVis * tightScale);
                          computedExpVis = Math.max(computedCompVis + 6, computedExpVis * tightScale);
                        }
                      }
                    }
                  }

                  return sortedMyHand.map((card, idx) => {
                    const isLegal =
                      gameState.phase === 'playing'
                        ? isCardLegal(card, myHand, currentLedSuit)
                        : true;
                    const canPlay =
                      gameState.phase === 'playing' && isMyTurnToPlay && isLegal;
                    // Do not dim cards from other suits - all cards remain bright, crisp white card stock.
                    const isDimmed = false;
                    const isJustPlayed = justPlayedHandCardId === card.id || flyingCard?.card.id === card.id;

                    const isRequiredSuit = hasRequiredSuitInHand && card.suit === currentLedSuit;

                    // Crucial left-to-right overlap rule:
                    // marginLeft on card[idx] controls how much of prevCard = card[idx - 1] remains visible!
                    let slotMarginPx = 0;
                    let slotAccordionClass = 'card-slot-standard';
                    if (idx > 0) {
                      const prevCard = sortedMyHand[idx - 1];
                      const prevIsRequired = hasRequiredSuitInHand && prevCard.suit === currentLedSuit;
                      const prevIsLastOfReqGroup = prevIsRequired && card.suit !== currentLedSuit;

                      slotAccordionClass = !hasRequiredSuitInHand
                        ? 'card-slot-standard'
                        : prevIsRequired
                        ? 'card-slot-expanded'
                        : 'card-slot-compressed';

                      const prevVisibleWidth = !hasRequiredSuitInHand
                        ? computedStdVis
                        : prevIsRequired
                        ? computedExpVis + (prevIsLastOfReqGroup ? boundaryExtraPx : 0)
                        : computedCompVis;

                      slotMarginPx = -Math.round(cardWidthPx - prevVisibleWidth);
                    }

                    const isDraggingThisCard = draggingCardId === card.id;

                    return (
                      <div
                        key={card.id}
                        style={{
                          ...(idx > 0
                            ? ({
                                '--slot-margin': `${slotMarginPx}px`,
                                marginLeft: `${slotMarginPx}px`,
                              } as React.CSSProperties)
                            : {}),
                          // Elevate actively dragged card above all sibling slots; otherwise strict left-to-right stacking order
                          zIndex: isJustPlayed ? 0 : isDraggingThisCard ? 100 : idx + 1,
                          transition: isDraggingThisCard
                            ? 'margin 260ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                            : 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), margin 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                        }}
                        className={`
                          portrait-card-slot landscape-compact-card-slot relative shrink-0
                          ${slotAccordionClass}
                          ${
                            isJustPlayed
                              ? 'opacity-0 scale-90 pointer-events-none'
                              : isDraggingThisCard
                              ? isRequiredSuit
                                ? '-translate-y-3 sm:-translate-y-4 rounded-lg sm:rounded-xl'
                                : '-translate-y-2 sm:-translate-y-2.5'
                              : canPlay && isRequiredSuit
                              ? '-translate-y-3 sm:-translate-y-4 hover:-translate-y-5 hover:scale-105 duration-150 ring-2 ring-amber-400 rounded-lg sm:rounded-xl shadow-[0_6px_16px_rgba(251,191,36,0.55)]'
                              : isRequiredSuit
                              ? '-translate-y-2 sm:-translate-y-2.5 duration-150 ring-1 ring-amber-400/60 rounded-lg sm:rounded-xl'
                              : canPlay
                              ? '-translate-y-2 sm:-translate-y-2.5 hover:-translate-y-4 hover:scale-105 duration-150'
                              : ''
                          }
                        `}
                      >
                        <CardView
                          card={card}
                          size="hand"
                          isPlayable={Boolean(canPlay && !isJustPlayed)}
                          isDimmed={isDimmed}
                          onDragStateChange={(isDragging) => {
                            setDraggingCardId((prev) =>
                              isDragging ? card.id : prev === card.id ? null : prev
                            );
                          }}
                          onClick={(e, releaseGesture) => {
                            if (gameState.phase === 'playing') {
                              handleCardInteraction(card, releaseGesture);
                            }
                          }}
                          onSwipePlay={(releaseGesture) => {
                            if (gameState.phase === 'playing') {
                              handleCardInteraction(card, releaseGesture);
                            }
                          }}
                        />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </footer>
        )}

      {/* Floating Throwable Tray if seated in waiting room */}
      {gameState.phase === 'waiting' && mySeat && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
          <ThrowableDock
            selectedItem={selectedThrowable}
            onSelectItem={setSelectedThrowable}
            cooldownUntil={cooldownUntil}
          />
        </div>
      )}

      {/* Active Flying Played Card Layer (Continuous momentum trajectory onto the table) */}
      {flyingCard && (
        <FlyingCardOverlay flight={flyingCard} onComplete={handleCompleteFlight} />
      )}

      {/* Global Interactive Projectile & Impact FX Layer */}
      <ThrowableOverlay
        mySeat={mySeat}
        activeEvents={activeThrows}
        onTriggerRecoil={handleTriggerRecoil}
      />

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
