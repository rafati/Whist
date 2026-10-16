import React from 'react';
import { Card } from '../types.ts';
import { SUIT_SYMBOLS } from '../logic/gameLogic.ts';
import { RoyalCourtArt } from './RoyalCourtArt.tsx';

interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  size?: 'xs' | 'sm' | 'hand' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  faceDown = false,
  isPlayable = false,
  isSelected = false,
  onClick,
  size = 'hand',
  className = '',
}) => {
  // Proportional, high-legibility card dimensions across mobile landscape & desktop
  const sizeClasses = {
    xs: 'w-7 h-10 sm:w-8 sm:h-11 rounded-sm sm:rounded-md',
    sm: 'landscape-compact-trick-card w-12 h-17 sm:w-14 sm:h-20 md:w-16 md:h-24 rounded-lg sm:rounded-xl',
    hand: 'landscape-compact-card w-13 h-19 sm:w-16 sm:h-23 md:w-20 md:h-28 lg:w-23 lg:h-33 rounded-lg sm:rounded-xl',
    md: 'w-16 h-24 sm:w-20 sm:h-29 rounded-xl',
    lg: 'w-20 h-29 sm:w-28 sm:h-40 rounded-2xl',
    xl: 'w-28 h-40 sm:w-36 sm:h-52 rounded-2xl',
  }[size];

  // Face-down card back with classic casino diamond lattice & gold emblem
  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClasses} shrink-0 bg-[#0f1d3a] border-[1.5px] sm:border-2 border-white shadow-md relative overflow-hidden flex items-center justify-center select-none ${className}`}
        style={{
          boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
        }}
      >
        <div className="absolute inset-0.5 sm:inset-1 border border-blue-400/50 rounded-[4px] sm:rounded-md flex items-center justify-center overflow-hidden bg-[#122449]">
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(#60a5fa 1px, transparent 1px), radial-gradient(#93c5fd 1px, #122449 1px)`,
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

  // Classic 2-color deck: Hearts & Diamonds (#dc2626), Spades & Clubs (#0f172a)
  const isRed = card.suit === 'H' || card.suit === 'D';
  const suitColorHex = isRed ? '#dc2626' : '#0f172a';
  const symbol = SUIT_SYMBOLS[card.suit];

  const isCourtCard = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const isAce = card.rank === 'A';

  return (
    <div
      onClick={isPlayable ? onClick : undefined}
      style={{
        backgroundColor: '#ffffff',
        boxShadow: isSelected
          ? '0 12px 28px -3px rgba(245, 158, 11, 0.65), 0 4px 8px -2px rgba(245, 158, 11, 0.5)'
          : '0 2px 8px rgba(0, 0, 0, 0.28)',
      }}
      className={`
        ${sizeClasses}
        shrink-0
        border border-slate-300 sm:border-slate-400
        relative
        flex flex-col justify-between
        p-1 sm:p-1.5
        select-none
        overflow-visible
        transition-all duration-150
        ${isPlayable ? 'cursor-pointer hover:-translate-y-2.5 hover:shadow-2xl hover:ring-2 hover:ring-amber-400 active:scale-95 z-20' : ''}
        ${isSelected ? 'ring-2 sm:ring-3 ring-amber-400 -translate-y-2.5 sm:-translate-y-3 scale-105 z-40' : ''}
        ${className}
      `}
    >
      {/* 2-Tap Confirmation Badge when Selected */}
      {isSelected && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-50 bg-amber-400 text-slate-950 font-black text-[7px] sm:text-[8px] uppercase tracking-wider px-1.5 py-[1px] rounded-full shadow-md border border-white whitespace-nowrap pointer-events-none">
          Tap to Play
        </div>
      )}

      {/* Top-Left Rank & Suit Index */}
      <div
        className="flex flex-col items-start leading-none select-none z-10 pt-0.5 pl-0.5"
        style={{ color: suitColorHex }}
      >
        <span className="font-black font-sans text-xs sm:text-sm md:text-base lg:text-lg leading-none tracking-tight">
          {card.rank}
        </span>
        <span className="text-[11px] sm:text-xs md:text-sm lg:text-base leading-none mt-0.5 font-bold">
          {symbol}
        </span>
      </div>

      {/* Center Artwork Area */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none px-2 sm:px-2.5 py-3 sm:py-3.5 overflow-hidden rounded-lg sm:rounded-xl">
        {isCourtCard ? (
          <div className="w-[72%] h-[72%] flex items-center justify-center">
            <RoyalCourtArt rank={card.rank} suit={card.suit} />
          </div>
        ) : isAce ? (
          card.suit === 'S' ? (
            <div className="flex flex-col items-center justify-center">
              <svg
                viewBox="0 0 60 70"
                className="w-7 h-9 sm:w-10 sm:h-12 md:w-13 md:h-15 lg:w-15 lg:h-18 select-none"
              >
                <path
                  d="M30 4 C24 16, 6 36, 6 48 C6 58, 16 63, 24 57 C22 62, 19 66, 17 68 L43 68 C41 66, 38 62, 36 57 C44 63, 54 58, 54 48 C54 36, 36 16, 30 4 Z"
                  fill="#0f172a"
                />
                <circle cx="30" cy="40" r="4.5" fill="#f59e0b" />
                <path
                  d="M30 33 L32 38 L37 38 L33 41 L35 46 L30 43 L25 46 L27 41 L23 38 L28 38 Z"
                  fill="#ffffff"
                />
              </svg>
            </div>
          ) : (
            <span
              style={{ color: suitColorHex }}
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black select-none leading-none drop-shadow-xs"
            >
              {symbol}
            </span>
          )
        ) : (
          <span
            style={{ color: suitColorHex }}
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black select-none leading-none drop-shadow-xs"
          >
            {symbol}
          </span>
        )}
      </div>

      {/* Bottom-Right Inverted Rank & Suit Index */}
      <div
        className="flex flex-col items-start rotate-180 self-end leading-none select-none z-10 pt-0.5 pl-0.5"
        style={{ color: suitColorHex }}
      >
        <span className="font-black font-sans text-xs sm:text-sm md:text-base lg:text-lg leading-none tracking-tight">
          {card.rank}
        </span>
        <span className="text-[11px] sm:text-xs md:text-sm lg:text-base leading-none mt-0.5 font-bold">
          {symbol}
        </span>
      </div>
    </div>
  );
};
