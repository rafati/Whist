import React from 'react';
import { CardView } from './CardView.tsx';

interface OpponentHandSpreadProps {
  count: number;
  orientation: 'top' | 'left' | 'right';
  isCurrentTurn?: boolean;
}

export const OpponentHandSpread: React.FC<OpponentHandSpreadProps> = ({
  count,
  orientation,
  isCurrentTurn = false,
}) => {
  if (count <= 0) return null;

  // Realistic stacked deck layers (1 to 4 depth layers)
  const stackLayers = Math.min(Math.max(count, 1), 4);

  return (
    <div
      className={`relative flex items-center justify-center select-none pointer-events-none transition-all duration-200 ${
        isCurrentTurn ? 'scale-105' : ''
      }`}
    >
      {/* Realistic Stacked Deck of Card Backs */}
      <div className="relative">
        {Array.from({ length: stackLayers }).map((_, i) => (
          <div
            key={i}
            style={{
              position: i === 0 ? 'relative' : 'absolute',
              top: i * -1.5,
              left: orientation === 'left' ? i * 1.5 : orientation === 'right' ? i * -1.5 : 0,
              zIndex: i,
            }}
            className={i > 0 ? 'opacity-90 pointer-events-none' : ''}
          >
            <CardView faceDown size="xs" />
          </div>
        ))}
      </div>

      {/* Card Count Badge */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 bg-slate-950/95 border border-slate-700/90 px-1.5 py-[0.5px] rounded-full text-[8px] font-mono text-amber-300 font-bold shadow-sm whitespace-nowrap leading-tight">
        {count}
      </div>
    </div>
  );
};
