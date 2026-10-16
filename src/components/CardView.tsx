import React, { useRef, useState } from 'react';
import { Card, Rank, Suit } from '../types.ts';
import { SUIT_SYMBOLS } from '../logic/gameLogic.ts';
import { RoyalCourtArt } from './RoyalCourtArt.tsx';

export interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  onClick?: (e?: React.MouseEvent<HTMLDivElement>, startRect?: DOMRect) => void;
  onSwipePlay?: (startRect?: DOMRect) => void;
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

interface PipPos {
  x: number;
  y: number;
  flip?: boolean;
}

const PIP_LAYOUTS: Record<Rank, PipPos[]> = {
  A: [{ x: 50, y: 70 }],
  '2': [{ x: 50, y: 35 }, { x: 50, y: 105, flip: true }],
  '3': [{ x: 50, y: 35 }, { x: 50, y: 70 }, { x: 50, y: 105, flip: true }],
  '4': [
    { x: 30, y: 35 }, { x: 70, y: 35 },
    { x: 30, y: 105, flip: true }, { x: 70, y: 105, flip: true }
  ],
  '5': [
    { x: 30, y: 35 }, { x: 70, y: 35 },
    { x: 50, y: 70 },
    { x: 30, y: 105, flip: true }, { x: 70, y: 105, flip: true }
  ],
  '6': [
    { x: 30, y: 35 }, { x: 70, y: 35 },
    { x: 30, y: 70 }, { x: 70, y: 70 },
    { x: 30, y: 105, flip: true }, { x: 70, y: 105, flip: true }
  ],
  '7': [
    { x: 30, y: 35 }, { x: 70, y: 35 },
    { x: 50, y: 52 },
    { x: 30, y: 70 }, { x: 70, y: 70 },
    { x: 30, y: 105, flip: true }, { x: 70, y: 105, flip: true }
  ],
  '8': [
    { x: 30, y: 35 }, { x: 70, y: 35 },
    { x: 50, y: 52 },
    { x: 30, y: 70 }, { x: 70, y: 70 },
    { x: 50, y: 88, flip: true },
    { x: 30, y: 105, flip: true }, { x: 70, y: 105, flip: true }
  ],
  '9': [
    { x: 30, y: 30 }, { x: 70, y: 30 },
    { x: 30, y: 56 }, { x: 70, y: 56 },
    { x: 50, y: 70 },
    { x: 30, y: 84, flip: true }, { x: 70, y: 84, flip: true },
    { x: 30, y: 110, flip: true }, { x: 70, y: 110, flip: true }
  ],
  '10': [
    { x: 30, y: 28 }, { x: 70, y: 28 },
    { x: 50, y: 44 },
    { x: 30, y: 58 }, { x: 70, y: 58 },
    { x: 30, y: 82, flip: true }, { x: 70, y: 82, flip: true },
    { x: 50, y: 96, flip: true },
    { x: 30, y: 112, flip: true }, { x: 70, y: 112, flip: true }
  ],
  J: [],
  Q: [],
  K: [],
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  faceDown = false,
  isPlayable = false,
  isSelected = false,
  isDimmed = false,
  onClick,
  onSwipePlay,
  size = 'hand',
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [dragOffset, setDragOffset] = useState<{ y: number; x: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const touchHandledRef = useRef(false);

  // Common gesture start
  const handleDragStart = (clientX: number, clientY: number) => {
    if (!isPlayable || isDimmed) return;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      time: Date.now(),
    };
    isDraggingRef.current = true;
    hasMovedRef.current = false;
  };

  // Common gesture move
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    const deltaY = clientY - dragStartRef.current.y;
    const deltaX = clientX - dragStartRef.current.x;

    if (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8) {
      hasMovedRef.current = true;
    }

    if (deltaY < 0) {
      // Extensive upward swipe toward and into playing area felt (up to -650px)
      const clampedY = Math.max(-650, deltaY);
      setDragOffset({ y: clampedY, x: deltaX * 0.75 });
    } else {
      // Downward resistance
      setDragOffset({ y: Math.min(25, deltaY * 0.2), x: deltaX * 0.3 });
    }
  };

  // Common gesture end
  const handleDragEnd = (clientX: number, clientY: number, e?: React.SyntheticEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      setDragOffset(null);
      return;
    }

    const start = dragStartRef.current;
    const deltaY = clientY - start.y;
    const deltaX = clientX - start.x;
    const elapsed = Date.now() - start.time;
    const speedY = deltaY / Math.max(1, elapsed); // px/ms

    isDraggingRef.current = false;
    dragStartRef.current = null;

    // Upward swipe / throw check:
    // 1. Dragged up by 40px or more (deltaY <= -40)
    // 2. OR fast flick upward (deltaY <= -18 and speedY < -0.25)
    // with primarily vertical orientation
    const isVerticalMove = Math.abs(deltaY) >= Math.abs(deltaX) * 0.6;
    const isUpwardThrow = isVerticalMove && (deltaY <= -40 || (deltaY <= -18 && speedY < -0.25));

    // Tap / Click check: very small finger/mouse movement
    const isTapOrClick = !hasMovedRef.current || (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10);

    if (isUpwardThrow) {
      touchHandledRef.current = true;
      if (e && e.cancelable) e.preventDefault();
      // Capture current bounding rect right where released!
      const rect = cardRef.current?.getBoundingClientRect();
      setDragOffset(null);
      if (onSwipePlay) {
        onSwipePlay(rect);
      } else if (onClick) {
        onClick(undefined, rect);
      }
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 400);
    } else if (isTapOrClick) {
      touchHandledRef.current = true;
      if (e && e.cancelable) e.preventDefault();
      const rect = cardRef.current?.getBoundingClientRect();
      setDragOffset(null);
      if (onClick) {
        onClick(undefined, rect);
      }
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 400);
    } else {
      // User dragged back down towards the cards or panned horizontally:
      // Cancel and smoothly snap back to hand!
      setDragOffset(null);
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
    const touch = e.changedTouches[0] || (dragStartRef.current ? { clientX: dragStartRef.current.x, clientY: dragStartRef.current.y } : { clientX: 0, clientY: 0 });
    handleDragEnd(touch.clientX, touch.clientY, e);
  };

  const handleTouchCancel = () => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
    setDragOffset(null);
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
      const rect = cardRef.current?.getBoundingClientRect();
      onClick(e, rect);
    }
  };

  // Proportional standard card dimensions (classic 1 : 1.4 ratio)
  const sizeClasses = {
    xs: 'w-7 h-10 sm:w-8 sm:h-11 rounded-sm sm:rounded-md',
    sm: 'portrait-trick-card landscape-compact-trick-card w-12 h-17 sm:w-14 sm:h-20 md:w-16 md:h-23 rounded-lg sm:rounded-xl',
    hand: 'portrait-hand-card landscape-compact-card w-13 h-19 sm:w-16 sm:h-23 md:w-20 md:h-28 lg:w-23 lg:h-33 rounded-lg sm:rounded-xl',
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

  // Classic 2-color tournament deck: Hearts & Diamonds rich crimson (#c02626), Spades & Clubs deep midnight black (#0f172a)
  const isRed = card.suit === 'H' || card.suit === 'D';
  const suitColorHex = isRed ? '#c02626' : '#0f172a';
  const symbol = SUIT_SYMBOLS[card.suit];

  const isCourtCard = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const isAce = card.rank === 'A';
  const isAceOfSpades = isAce && card.suit === 'S';

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
        backgroundColor: '#ffffff',
        boxShadow: dragOffset && dragOffset.y < -20
          ? '0 20px 40px -6px rgba(245, 158, 11, 0.7), 0 6px 18px -2px rgba(245, 158, 11, 0.5)'
          : isSelected
          ? '0 12px 28px -3px rgba(245, 158, 11, 0.65), 0 4px 10px -2px rgba(245, 158, 11, 0.5)'
          : '0 3px 10px rgba(0, 0, 0, 0.32)',
        transform: dragOffset
          ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.08) rotate(${Math.min(16, Math.max(-16, dragOffset.x * 0.12))}deg)`
          : undefined,
        zIndex: dragOffset ? 60 : undefined,
        transition: dragOffset ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease',
        touchAction: isPlayable && !isDimmed ? 'pan-x' : undefined,
      }}
      className={`
        ${sizeClasses}
        shrink-0
        border border-slate-300 sm:border-slate-400
        relative
        select-none
        overflow-hidden
        ${isDimmed ? 'opacity-40 grayscale-[35%] pointer-events-none scale-[0.96]' : ''}
        ${isPlayable && !isDimmed ? 'cursor-pointer hover:-translate-y-2.5 hover:shadow-2xl hover:ring-2 hover:ring-amber-400 active:scale-95 z-20' : ''}
        ${isSelected ? 'ring-2 sm:ring-3 ring-amber-400 -translate-y-2.5 sm:-translate-y-3 scale-105 z-40' : ''}
        ${className}
      `}
    >
      {/* Throw Badge when dragging up on touch */}
      {dragOffset && dragOffset.y < -24 && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-50 bg-amber-400 text-slate-950 font-black text-[7px] sm:text-[8px] uppercase tracking-wider px-1.5 py-[1px] rounded-full shadow-md border border-white whitespace-nowrap pointer-events-none flex items-center gap-0.5 animate-pulse">
          <span>Throw</span>
          <span className="text-[9px] font-bold leading-none">↑</span>
        </div>
      )}

      {/* Subtle Inner Card Border Frame (Bicycle standard hairline frame) */}
      <div className="absolute inset-0.5 sm:inset-1 border border-slate-200/90 rounded-[4px] sm:rounded-md pointer-events-none select-none z-10" />

      {/* Top-Left Rank & Suit Index */}
      <div
        className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 flex flex-col items-center leading-none select-none z-20"
        style={{ color: suitColorHex }}
      >
        <span className="font-serif font-black text-[11px] sm:text-xs md:text-sm lg:text-base leading-none tracking-tight">
          {card.rank}
        </span>
        <span className="text-[10px] sm:text-[11px] md:text-xs lg:text-sm leading-none mt-0.5 font-bold">
          {symbol}
        </span>
      </div>

      {/* Bottom-Right Mirrored Rank & Suit Index (Reversible Card Standard) */}
      <div
        className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 flex flex-col items-center leading-none select-none z-20 rotate-180"
        style={{ color: suitColorHex }}
      >
        <span className="font-serif font-black text-[11px] sm:text-xs md:text-sm lg:text-base leading-none tracking-tight">
          {card.rank}
        </span>
        <span className="text-[10px] sm:text-[11px] md:text-xs lg:text-sm leading-none mt-0.5 font-bold">
          {symbol}
        </span>
      </div>

      {/* Center Artwork & Pip Area */}
      {isCourtCard ? (
        /* Traditional Double-Headed Court Card Frame */
        <div className="absolute inset-2 sm:inset-2.5 md:inset-3 flex items-center justify-center overflow-hidden rounded-[2px]">
          <RoyalCourtArt rank={card.rank} suit={card.suit} />
        </div>
      ) : isAceOfSpades ? (
        /* Legendary Bicycle Ornate Ace of Spades */
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none p-3">
          <svg viewBox="0 0 100 130" className="w-[68%] h-[68%] drop-shadow-sm select-none">
            <path
              d="M50 14 C40 32, 16 58, 16 78 C16 94, 30 102, 42 92 C38 100, 32 108, 28 112 L72 112 C68 108, 62 100, 58 92 C70 102, 84 94, 84 78 C84 58, 60 32, 50 14 Z"
              fill="#0f172a"
            />
            {/* Center Ornate Gold Filigree Inlay */}
            <circle cx="50" cy="68" r="8" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
            <path
              d="M50 63 L52 67 L57 67 L53 70 L55 75 L50 72 L45 75 L47 70 L43 67 L48 67 Z"
              fill="#ffffff"
            />
            <circle cx="50" cy="68" r="2" fill="#b45309" />
          </svg>
        </div>
      ) : (
        /* Traditional Standard Geometric Pip Layout for Number Cards (2 to 10) & Aces */
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none p-1 sm:p-1.5">
          <svg viewBox="0 0 100 140" className="w-full h-full select-none">
            {PIP_LAYOUTS[card.rank]?.map((pip, idx) => (
              <g
                key={idx}
                transform={`translate(${pip.x - 7}, ${pip.y - 7}) ${pip.flip ? 'rotate(180 7 7)' : ''}`}
              >
                <path
                  d={SUIT_PATHS[card.suit]}
                  fill={suitColorHex}
                  transform="scale(0.48)"
                />
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
};
