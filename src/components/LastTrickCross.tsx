import React, { useState } from 'react';
import { Card, Seat, TrickResult, UserProfile } from '../types.ts';
import { SUIT_SYMBOLS } from '../logic/gameLogic.ts';
import { Crown, Sparkles } from 'lucide-react';

interface LastTrickCrossProps {
  trick: TrickResult | null;
  mySeat: Seat | null;
  seats: Record<Seat, UserProfile | null>;
  getSeatVisualPos: (seat: Seat) => 'bottom' | 'top' | 'left' | 'right';
  className?: string;
}

/**
 * Mini Card component for the Last Trick cross
 */
const MiniCrossCard: React.FC<{
  card: Card;
  isWinner: boolean;
  positionLabel: string;
  playerName: string;
}> = ({ card, isWinner, positionLabel, playerName }) => {
  const isRed = card.suit === 'H' || card.suit === 'D';

  return (
    <div
      title={`${playerName} (${positionLabel}): ${card.rank}${SUIT_SYMBOLS[card.suit]}${isWinner ? ' • Winner' : ''}`}
      className={`
        relative w-6 h-8.5 sm:w-7 sm:h-10 rounded-[3px] sm:rounded-md bg-white flex flex-col justify-between p-0.5 sm:p-1 select-none transition-transform
        ${
          isWinner
            ? 'border-2 border-amber-400 ring-2 ring-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.8)] scale-105 z-10'
            : 'border border-slate-300 shadow-sm z-0'
        }
      `}
    >
      {/* Top Left Rank & Pip */}
      <div className="flex items-center justify-between leading-none">
        <span
          className={`font-black text-[9px] sm:text-[10px] font-mono leading-none ${
            isRed ? 'text-red-600' : 'text-slate-900'
          }`}
        >
          {card.rank}
        </span>
        {isWinner && (
          <Crown className="w-2 h-2 text-amber-500 fill-amber-400 shrink-0" />
        )}
      </div>

      {/* Center Suit Symbol */}
      <div
        className={`text-center font-bold text-xs sm:text-sm leading-none self-center ${
          isRed ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {SUIT_SYMBOLS[card.suit]}
      </div>

      {/* Bottom Sub-tag */}
      <div className="text-[6px] sm:text-[7px] text-slate-400 text-right leading-none truncate font-mono">
        {positionLabel[0]}
      </div>
    </div>
  );
};

export const LastTrickCross: React.FC<LastTrickCrossProps> = ({
  trick,
  mySeat,
  seats,
  getSeatVisualPos,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // If no trick has completed yet in the round
  if (!trick) {
    return (
      <div
        className={`bg-slate-950/80 backdrop-blur-md border border-emerald-900/40 rounded-xl px-2 py-1.5 shadow-lg select-none text-[10px] text-slate-400 flex items-center gap-1.5 ${className}`}
      >
        <span className="font-semibold text-slate-300">Last Trick:</span>
        <span className="italic text-slate-500">None yet</span>
      </div>
    );
  }

  // Find cards by visual seating orientation
  const playedCards = trick.cards;
  const cardByPos: Partial<Record<'bottom' | 'top' | 'left' | 'right', { card: Card; seat: Seat }>> = {};

  playedCards.forEach((played) => {
    const pos = getSeatVisualPos(played.seat);
    cardByPos[pos] = { card: played.card, seat: played.seat };
  });

  const getPositionLabel = (pos: 'bottom' | 'top' | 'left' | 'right'): string => {
    switch (pos) {
      case 'bottom':
        return 'You';
      case 'top':
        return 'Partner';
      case 'left':
        return 'Left Opp';
      case 'right':
        return 'Right Opp';
    }
  };

  const winnerName =
    trick.winner === mySeat
      ? 'You'
      : seats[trick.winner]?.name.replace(/^Bot\s+/i, '') || 'Player';

  return (
    <div
      onClick={() => setShowDetails((prev) => !prev)}
      className={`relative bg-slate-950/85 backdrop-blur-md border border-emerald-800/60 rounded-xl sm:rounded-2xl p-1.5 sm:p-2 shadow-2xl flex flex-col items-center select-none cursor-pointer transition-all hover:border-emerald-500/80 ${className}`}
      title="Click to toggle details for the last trick"
    >
      {/* Header Tag */}
      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-amber-300 mb-1 w-full justify-between">
        <span className="flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
          <span>Last Trick</span>
        </span>
        <span className="text-[8px] sm:text-[9px] font-mono text-slate-400">
          Tk #{trick.trickNumber}
        </span>
      </div>

      {/* The 4-Card Cross Layout */}
      <div className="relative w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] flex items-center justify-center">
        {/* Top (Partner) */}
        {cardByPos.top && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2">
            <MiniCrossCard
              card={cardByPos.top.card}
              isWinner={cardByPos.top.card.id === trick.winningCard.id}
              positionLabel={getPositionLabel('top')}
              playerName={seats[cardByPos.top.seat]?.name || 'Partner'}
            />
          </div>
        )}

        {/* Bottom (You / Local Seat) */}
        {cardByPos.bottom && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <MiniCrossCard
              card={cardByPos.bottom.card}
              isWinner={cardByPos.bottom.card.id === trick.winningCard.id}
              positionLabel={getPositionLabel('bottom')}
              playerName={seats[cardByPos.bottom.seat]?.name || 'You'}
            />
          </div>
        )}

        {/* Left (Left Opponent) */}
        {cardByPos.left && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <MiniCrossCard
              card={cardByPos.left.card}
              isWinner={cardByPos.left.card.id === trick.winningCard.id}
              positionLabel={getPositionLabel('left')}
              playerName={seats[cardByPos.left.seat]?.name || 'Left Opponent'}
            />
          </div>
        )}

        {/* Right (Right Opponent) */}
        {cardByPos.right && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <MiniCrossCard
              card={cardByPos.right.card}
              isWinner={cardByPos.right.card.id === trick.winningCard.id}
              positionLabel={getPositionLabel('right')}
              playerName={seats[cardByPos.right.seat]?.name || 'Right Opponent'}
            />
          </div>
        )}

        {/* Center Cross Indicator */}
        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-900 border border-emerald-600/50 flex items-center justify-center text-[8px] font-bold text-emerald-400 shadow-inner z-20">
          •
        </div>
      </div>

      {/* Winner Summary Footer */}
      <div className="mt-1 text-[8px] sm:text-[9px] text-center text-slate-300 font-medium leading-tight max-w-[85px] sm:max-w-[100px] truncate">
        <span className="text-amber-400 font-bold">★ {winnerName}</span> won
      </div>

      {/* Expanded Details Tooltip */}
      {showDetails && (
        <div className="absolute top-full mt-1.5 right-0 w-44 bg-slate-950 border border-amber-400/80 rounded-xl p-2 shadow-2xl text-[10px] text-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="font-bold text-amber-300 mb-1 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>Trick #{trick.trickNumber} Review</span>
            <Crown className="w-3 h-3 text-amber-400" />
          </div>
          <div className="space-y-0.5 text-[9px]">
            <div>
              Winner: <strong className="text-amber-300">{winnerName}</strong> with{' '}
              <strong className="text-white">
                {trick.winningCard.rank}
                {SUIT_SYMBOLS[trick.winningCard.suit]}
              </strong>
            </div>
            <div>
              Led Suit: <strong>{SUIT_SYMBOLS[trick.ledSuit]}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
