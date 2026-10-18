import React, { useRef, useState } from 'react';
import { Card, Rank, Suit } from '../types.ts';
import { SUIT_SYMBOLS } from '../logic/gameLogic.ts';
import { RoyalCourtArt } from './RoyalCourtArt.tsx';
import { playClickSound } from '../lib/throwSounds.ts';

export interface CardReleaseGesture {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  scale: number;
  rotateDeg: number;
  vx: number;
  vy: number;
  wasDragged: boolean;
}

export interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  onClick?: (e?: React.MouseEvent<HTMLDivElement>, releaseGesture?: CardReleaseGesture) => void;
  onSwipePlay?: (releaseGesture?: CardReleaseGesture) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  size?: 'xs' | 'sm' | 'hand' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Vector Suit Pip SVG Path definitions
const SUIT_PATHS: Record<Suit, string> = {
  S: 'M14 2 C11.5 7.5 6 13 6 17 C6 20 8.5 22.5 11.5 22.5 C13.5 22.5 15.5 21.2 16.5 19.5 C16 21.5 15 24 13 25.5 L19 25.5 C17 24 16 21.5 15.5 19.5 C16.5 21.2 18.5 22.5 20.5 22.5 C23.5 22.5 26 20 26 17 C26 13 20.5 7.5 18 2 C17 0.5 15 0.5 14 2 Z',
  H: 'M16 25 C16 25 5 16.5 5 9.5 C5 5.5 8 2.5 12 2.5 C14.5 2.5 16 4 16 5 C16 4 17.5 2.5 20 2.5 C24 2.5 27 5.5 27 9.5 C27 16.5 16 25 16 25 Z',
  D: 'M16 2.5 L26.5 14 L16 25.5 L5.5 14 Z',
  C: 'M16 2.5 C13.5 2.5 11.5 4.5 11.5 7 C11.5 8.2 12 9.2 12.8 10 C11.2 9.2 8.5 9.5 7.5 12 C6.2 14.8 8.2 18 11.5 18 C12.8 18 14 17.2 14.8 16.2 C14.2 18.2 13 22 10 25.5 L22 25.5 C19 22 17.8 18.2 17.2 16.2 C18 17.2 19.2 18 20.5 18 C23.8 18 25.8 14.8 24.5 12 C23.5 9.5 20.8 9.2 19.2 10 C20 9.2 20.5 8.2 20.5 7 C20.5 4.5 18.5 2.5 16 2.5 Z',
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  faceDown = false,
  isPlayable = false,
  isSelected = false,
  isDimmed = false,
  onClick,
  onSwipePlay,
  onDragStateChange,
  size = 'hand',
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const throwBadgeRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingUI, setIsDraggingUI] = useState(false);
  const dragStateRef = useRef<{
    x: number;
    y: number;
    scale: number;
    rotateDeg: number;
  } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pointerSamplesRef = useRef<Array<{ x: number; y: number; time: number }>>([]);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const touchHandledRef = useRef(false);

  // Apply transform & elevation shadow directly to DOM node at 120Hz without React re-renders
  const applyDirectDragTransform = (
    next: { x: number; y: number; scale: number; rotateDeg: number } | null
  ) => {
    dragStateRef.current = next;
    const el = cardRef.current;
    if (!el) return;

    if (next) {
      el.style.transition = 'none';
      el.style.zIndex = '80';
      el.style.transform = `translate3d(${next.x.toFixed(2)}px, ${next.y.toFixed(2)}px, 0) scale(${next.scale.toFixed(3)}) rotate(${next.rotateDeg.toFixed(2)}deg)`;
      if (next.y < -18) {
        const readyToRelease = next.y <= -38;
        el.style.boxShadow = readyToRelease
          ? '0 24px 48px -8px rgba(0, 0, 0, 0.75), 0 0 24px rgba(52, 211, 153, 0.65)'
          : '0 18px 36px -6px rgba(0, 0, 0, 0.68), 0 0 18px rgba(245, 158, 11, 0.5)';
      }
      if (throwBadgeRef.current) {
        throwBadgeRef.current.style.opacity = next.y <= -32 ? '1' : '0';
        throwBadgeRef.current.style.transform =
          next.y <= -32
            ? 'translate(-50%, 0) scale(1)'
            : 'translate(-50%, 4px) scale(0.85)';
      }
    } else {
      el.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease';
      el.style.zIndex = '';
      el.style.transform = '';
      el.style.boxShadow = isSelected
        ? '0 12px 28px -3px rgba(245, 158, 11, 0.65), 0 4px 10px -2px rgba(245, 158, 11, 0.5)'
        : '0 4px 14px -1px rgba(0, 0, 0, 0.38), 0 2px 6px -1px rgba(0, 0, 0, 0.22)';
      if (throwBadgeRef.current) {
        throwBadgeRef.current.style.opacity = '0';
      }
    }
  };

  const computeRollingVelocity = (nowX: number, nowY: number, nowTime: number) => {
    const samples = pointerSamplesRef.current;
    // Prune samples older than 85ms for crisp instantaneous release velocity
    while (samples.length > 1 && nowTime - samples[0].time > 85) {
      samples.shift();
    }
    const anchor = samples[0] || dragStartRef.current;
    if (!anchor) return { vx: 0, vy: 0 };
    const dt = Math.max(8, nowTime - anchor.time);
    return {
      vx: (nowX - anchor.x) / dt,
      vy: (nowY - anchor.y) / dt,
    };
  };

  const captureReleaseGesture = (
    vx: number,
    vy: number,
    wasDragged: boolean
  ): CardReleaseGesture | undefined => {
    const el = cardRef.current;
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const current = dragStateRef.current;
    return {
      // Center of an AABB is mathematically invariant under any rotation and uniform scale around center!
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: el.offsetWidth || rect.width,
      height: el.offsetHeight || rect.height,
      scale: wasDragged && current ? current.scale : 1,
      rotateDeg: wasDragged && current ? current.rotateDeg : 0,
      vx,
      vy,
      wasDragged,
    };
  };

  // Common gesture start
  const handleDragStart = (clientX: number, clientY: number) => {
    if (!isPlayable || isDimmed) return;
    playClickSound();
    const now = performance.now();
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      time: now,
    };
    pointerSamplesRef.current = [{ x: clientX, y: clientY, time: now }];
    isDraggingRef.current = true;
    hasMovedRef.current = false;
  };

  // Common gesture move (120Hz direct DOM updates)
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    const now = performance.now();
    pointerSamplesRef.current.push({ x: clientX, y: clientY, time: now });
    while (pointerSamplesRef.current.length > 1 && now - pointerSamplesRef.current[0].time > 85) {
      pointerSamplesRef.current.shift();
    }

    const deltaY = clientY - dragStartRef.current.y;
    const deltaX = clientX - dragStartRef.current.x;

    if (!hasMovedRef.current && (Math.abs(deltaY) > 4 || Math.abs(deltaX) > 4)) {
      hasMovedRef.current = true;
      setIsDraggingUI(true);
      onDragStateChange?.(true);
    }

    if (!hasMovedRef.current) return;

    const { vx } = computeRollingVelocity(clientX, clientY, now);

    if (deltaY < 0) {
      // Smooth 1:1 upward tracking toward and into the playing felt with perspective depth scaling:
      // - Initial lift off the hand (0 to -70px): card rises toward the camera (scale up to 1.065)
      // - Deep reach into the table arena (-70px to -320px): card settles toward table perspective (0.94)
      const clampedY = Math.max(-680, deltaY);
      const upwardPx = Math.abs(clampedY);
      const liftPhase = Math.min(1, upwardPx / 65);
      const depthPhase = Math.max(0, Math.min(1, (upwardPx - 65) / 240));
      const scale = 1 + 0.065 * liftPhase - 0.11 * depthPhase;

      // Natural wrist banking combining horizontal offset and instantaneous lateral velocity,
      // gently straightening as the card approaches the table slot
      const bankingDampen = 1 - depthPhase * 0.35;
      const rotateDeg = Math.max(
        -13,
        Math.min(13, (deltaX * 0.055 + vx * 4.2) * bankingDampen)
      );

      applyDirectDragTransform({
        x: deltaX,
        y: clampedY,
        scale,
        rotateDeg,
      });
    } else {
      // Soft elastic resistance when pulling downward
      applyDirectDragTransform({
        x: deltaX * 0.35,
        y: Math.min(20, deltaY * 0.22),
        scale: 1,
        rotateDeg: Math.max(-4, Math.min(4, deltaX * 0.03)),
      });
    }
  };

  // Common gesture end
  const handleDragEnd = (clientX: number, clientY: number, e?: React.SyntheticEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      pointerSamplesRef.current = [];
      applyDirectDragTransform(null);
      setIsDraggingUI(false);
      onDragStateChange?.(false);
      return;
    }

    const now = performance.now();
    const start = dragStartRef.current;
    const deltaY = clientY - start.y;
    const deltaX = clientX - start.x;
    const { vx, vy } = computeRollingVelocity(clientX, clientY, now);

    isDraggingRef.current = false;
    dragStartRef.current = null;
    pointerSamplesRef.current = [];

    // Upward swipe / throw check:
    // 1. Lifted upward by 36px or more (and not actively yanked fast downward: vy < 0.35)
    // 2. OR crisp upward flick (deltaY <= -14 and rolling vy < -0.20 px/ms)
    const isVerticalEnough = Math.abs(deltaY) >= Math.abs(deltaX) * 0.42 || deltaY <= -50;
    const isPulledBackDown = vy > 0.36 && deltaY > -88;
    const isUpwardThrow =
      isVerticalEnough &&
      !isPulledBackDown &&
      (deltaY <= -36 || (deltaY <= -14 && vy < -0.20));

    // Tap / Click check: minimal movement
    const isTapOrClick = !hasMovedRef.current || (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10);

    if (isUpwardThrow) {
      touchHandledRef.current = true;
      if (e && e.cancelable) e.preventDefault();
      // Capture exact center, unrotated size, scale, tilt, and velocity BEFORE clearing transform
      const gesture = captureReleaseGesture(vx, vy, true);
      applyDirectDragTransform(null);
      setIsDraggingUI(false);
      onDragStateChange?.(false);
      if (onSwipePlay) {
        onSwipePlay(gesture);
      } else if (onClick) {
        onClick(undefined, gesture);
      }
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 380);
    } else if (isTapOrClick) {
      touchHandledRef.current = true;
      if (e && e.cancelable) e.preventDefault();
      const gesture = captureReleaseGesture(0, -0.65, false);
      applyDirectDragTransform(null);
      setIsDraggingUI(false);
      onDragStateChange?.(false);
      if (onClick) {
        onClick(undefined, gesture);
      }
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 380);
    } else {
      // User pulled card back down towards hand or panned horizontally:
      // Cancel and smoothly spring back into the hand slot!
      applyDirectDragTransform(null);
      setIsDraggingUI(false);
      onDragStateChange?.(false);
    }
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPlayable || isDimmed) return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !e.touches[0]) return;
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const touch =
      e.changedTouches[0] ||
      (dragStartRef.current
        ? { clientX: dragStartRef.current.x, clientY: dragStartRef.current.y }
        : { clientX: 0, clientY: 0 });
    handleDragEnd(touch.clientX, touch.clientY, e);
  };

  const handleTouchCancel = () => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
    pointerSamplesRef.current = [];
    applyDirectDragTransform(null);
    setIsDraggingUI(false);
    onDragStateChange?.(false);
  };

  // Mouse drag on desktop
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlayable || isDimmed || e.button !== 0) return;
    if (touchHandledRef.current) return;
    e.preventDefault();

    handleDragStart(e.clientX, e.clientY);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleDragMove(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      handleDragEnd(upEvent.clientX, upEvent.clientY);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (touchHandledRef.current) return;
    if (isPlayable && !isDimmed && onClick) {
      playClickSound();
      const gesture = captureReleaseGesture(0, -0.6, false);
      onClick(e, gesture);
    }
  };

  // Proportional standard card dimensions (classic 1 : 1.4 ratio)
  const sizeClasses = {
    xs: 'w-7 h-10 sm:w-8 sm:h-11 rounded-sm sm:rounded-md',
    sm: 'portrait-trick-card landscape-compact-trick-card w-15 h-21 sm:w-18 sm:h-25 md:w-20 md:h-28 rounded-lg sm:rounded-xl',
    hand: 'portrait-hand-card landscape-compact-card w-15.5 h-22 sm:w-19 sm:h-27 md:w-21 md:h-30 lg:w-23 lg:h-33 rounded-lg sm:rounded-xl',
    md: 'w-16 h-23 sm:w-20 sm:h-28 rounded-xl',
    lg: 'w-20 h-28 sm:w-28 sm:h-39 rounded-2xl',
    xl: 'w-28 h-39 sm:w-36 sm:h-50 rounded-2xl',
  }[size];

  // Face-down card back with classic casino diamond lattice & gold emblem
  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClasses} shrink-0 bg-[#0c1936] border-[1.5px] border-white shadow-md relative overflow-hidden flex items-center justify-center select-none ${className}`}
        style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
        }}
      >
        <div className="absolute inset-0.5 sm:inset-1 border border-blue-400/40 rounded-[3px] sm:rounded-md flex items-center justify-center overflow-hidden bg-[#10234a]">
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(#60a5fa 1px, transparent 1px), radial-gradient(#93c5fd 1px, #10234a 1px)`,
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 4px 4px',
            }}
          />
          <div className="w-5 h-7 sm:w-7 sm:h-9 md:w-8 md:h-10 rounded-sm sm:rounded border border-amber-300/80 bg-gradient-to-b from-blue-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center shadow-inner relative z-10">
            <span className="text-[10px] sm:text-xs text-amber-300 font-black leading-none drop-shadow">
              ♠
            </span>
            <div className="w-2 sm:w-3 h-0.5 bg-amber-400/70 my-0.5 rounded-full" />
            <span className="text-[8px] sm:text-[9px] text-amber-200 font-bold leading-none">
              ♦
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Strict Classic 2-Color tournament deck: Hearts & Diamonds rich crimson (#dc2626), Spades & Clubs deep midnight black (#0f172a)
  const isRed = card.suit === 'H' || card.suit === 'D';
  const suitColorHex = isRed ? '#dc2626' : '#0f172a';
  const isTen = card.rank === '10';

  const isCourtCard = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const isAce = card.rank === 'A';
  const isAceOfSpades = isAce && card.suit === 'S';

  // Size-specific typography & top-left suit icon scaling
  const indexContainerClass =
    size === 'xs'
      ? 'top-0.5 left-0.5 w-[13px] sm:w-[15px]'
      : size === 'sm'
      ? 'top-1 left-1 sm:top-1.5 sm:left-1.5 w-[19px] sm:w-[23px] md:w-[26px]'
      : size === 'hand'
      ? 'top-1 left-[3px] sm:top-1.5 sm:left-1.5 w-[19px] sm:w-[24px] md:w-[27px] lg:w-[30px]'
      : 'top-1.5 left-1.5 sm:top-2 sm:left-2 w-[24px] sm:w-[30px]';

  const rankFontClass =
    size === 'xs'
      ? isTen
        ? 'text-[10px] sm:text-[11px] tracking-[-0.12em]'
        : 'text-[12px] sm:text-[13px] tracking-tight'
      : size === 'sm'
      ? isTen
        ? 'text-[19px] sm:text-[23px] md:text-[26px] tracking-[-0.12em]'
        : 'text-[23px] sm:text-[27px] md:text-[31px] tracking-tight'
      : size === 'hand'
      ? isTen
        ? 'text-[20px] sm:text-[24px] md:text-[27px] lg:text-[30px] tracking-[-0.12em]'
        : 'text-[24px] sm:text-[28px] md:text-[32px] lg:text-[36px] tracking-tight'
      : isTen
      ? 'text-[24px] sm:text-[30px] md:text-[34px] tracking-[-0.12em]'
      : 'text-[28px] sm:text-[34px] md:text-[40px] tracking-tight';

  const indexSuitSvgClass =
    size === 'xs'
      ? 'w-[9px] h-[9px] sm:w-[10px] sm:h-[10px] mt-[1px]'
      : size === 'sm'
      ? 'w-[15px] h-[15px] sm:w-[18px] sm:h-[18px] md:w-[21px] md:h-[21px] mt-[2px]'
      : size === 'hand'
      ? 'w-[16px] h-[16px] sm:w-[19px] sm:h-[19px] md:w-[22px] md:h-[22px] lg:w-[25px] lg:h-[25px] mt-[2px]'
      : 'w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] md:w-[26px] md:h-[26px] mt-0.5';

  return (
    <div
      ref={cardRef}
      onClick={isPlayable && !isDimmed ? handleClick : undefined}
      onMouseDown={isPlayable && !isDimmed ? handleMouseDown : undefined}
      onTouchStart={isPlayable && !isDimmed ? handleTouchStart : undefined}
      onTouchMove={isPlayable && !isDimmed ? handleTouchMove : undefined}
      onTouchEnd={isPlayable && !isDimmed ? handleTouchEnd : undefined}
      onTouchCancel={isPlayable && !isDimmed ? handleTouchCancel : undefined}
      style={{
        backgroundColor: '#fdfdfc',
        boxShadow: isSelected
          ? '0 12px 28px -3px rgba(245, 158, 11, 0.65), 0 4px 10px -2px rgba(245, 158, 11, 0.5)'
          : '0 4px 14px -1px rgba(0, 0, 0, 0.38), 0 2px 6px -1px rgba(0, 0, 0, 0.22)',
        transformOrigin: 'center center',
        transition: isDraggingUI
          ? 'none'
          : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease',
        touchAction: isPlayable && !isDimmed ? 'none' : undefined,
        willChange: isPlayable ? 'transform' : undefined,
      }}
      className={`
        ${sizeClasses}
        shrink-0
        border-[1.5px] border-slate-300 sm:border-slate-400
        relative
        select-none
        overflow-hidden
        ${isDimmed ? 'opacity-80 pointer-events-none' : ''}
        ${
          isPlayable && !isDimmed
            ? isDraggingUI
              ? 'cursor-grabbing ring-2 ring-amber-400'
              : 'cursor-grab hover:-translate-y-2.5 hover:shadow-2xl hover:ring-2 hover:ring-amber-400 active:scale-95'
            : ''
        }
        ${isSelected && !isDraggingUI ? 'ring-2 sm:ring-3 ring-amber-400 -translate-y-2.5 sm:-translate-y-3 scale-105 z-40' : ''}
        ${className}
      `}
    >
      {/* Throw Badge when dragging up on touch/mouse (mutated directly at 120Hz via throwBadgeRef) */}
      <div
        ref={throwBadgeRef}
        style={{
          opacity: 0,
          transform: 'translate(-50%, 4px) scale(0.85)',
          transition: 'opacity 120ms ease, transform 120ms ease',
        }}
        className="absolute -top-3.5 left-1/2 z-50 bg-emerald-400 text-slate-950 font-black text-[7px] sm:text-[8px] uppercase tracking-wider px-1.5 py-[1px] rounded-full shadow-md border border-white whitespace-nowrap pointer-events-none flex items-center gap-0.5"
      >
        <span>Release</span>
        <span className="text-[9px] font-bold leading-none">↑</span>
      </div>

      {/* Subtle Inner Card Border Frame (Classic casino hairline frame) */}
      <div className="absolute inset-0.5 sm:inset-1 border border-slate-200/80 rounded-[4px] sm:rounded-md pointer-events-none select-none z-10" />

      {/* Top-Left Giant Rank & Vector Suit Index (High-clarity column visible even when shingled) */}
      <div
        className={`absolute ${indexContainerClass} flex flex-col items-center leading-none select-none z-20 pointer-events-none`}
        style={{ color: suitColorHex }}
      >
        <span className={`font-sans font-black ${rankFontClass} leading-[0.82]`}>
          {card.rank}
        </span>
        <svg
          viewBox="0 0 32 30"
          className={`${indexSuitSvgClass} shrink-0 select-none`}
          aria-hidden="true"
        >
          <path d={SUIT_PATHS[card.suit]} fill={suitColorHex} />
        </svg>
      </div>

      {/* Lower-Right / Center-Bottom Feature Pip or Upright Royal Court Art */}
      {isCourtCard ? (
        /* Upright Royal Court Portrait positioned in lower-right so top-left index has 100% pure white contrast */
        <div className="absolute bottom-0.5 right-0.5 w-[74%] h-[63%] flex items-end justify-end overflow-hidden rounded-br-[5px] pointer-events-none select-none z-10">
          <RoyalCourtArt rank={card.rank} suit={card.suit} />
        </div>
      ) : isAceOfSpades ? (
        /* Ornate Ace of Spades Emblem in prominent lower-right position */
        <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 w-[60%] h-[58%] flex items-center justify-center pointer-events-none select-none z-10">
          <svg viewBox="0 0 100 130" className="w-full h-full drop-shadow-xs select-none">
            <path
              d="M50 14 C40 32, 16 58, 16 78 C16 94, 30 102, 42 92 C38 100, 32 108, 28 112 L72 112 C68 108, 62 100, 58 92 C70 102, 84 94, 84 78 C84 58, 60 32, 50 14 Z"
              fill="#0f172a"
            />
            <circle cx="50" cy="68" r="8" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
            <path
              d="M50 63 L52 67 L57 67 L53 70 L55 75 L50 72 L45 75 L47 70 L43 67 L48 67 Z"
              fill="#ffffff"
            />
            <circle cx="50" cy="68" r="2" fill="#b45309" />
          </svg>
        </div>
      ) : (
        /* High-Clarity Giant Suit Pip in lower-right area for Number Cards (2 to 10) & Aces */
        <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 w-[56%] h-[54%] flex items-center justify-center pointer-events-none select-none z-10">
          <svg viewBox="0 0 32 30" className="w-full h-full drop-shadow-xs select-none">
            <path
              d={SUIT_PATHS[card.suit]}
              fill={suitColorHex}
            />
          </svg>
        </div>
      )}
    </div>
  );
};
