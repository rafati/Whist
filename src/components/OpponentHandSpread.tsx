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

  // Maximum visual cards to display to avoid UI clutter while maintaining fan effect
  const displayCount = Math.min(count, 13);
  const cardIndices = Array.from({ length: displayCount }, (_, i) => i);

  if (orientation === 'top') {
    // Top Seat (Partner) - Horizontal fanned spread
    const middleIndex = (displayCount - 1) / 2;
    return (
      <div className="flex flex-col items-center mt-1 select-none pointer-events-none">
        <div className="flex items-center justify-center overflow-visible">
          {cardIndices.map((i) => {
            const offset = i - middleIndex;
            const rotation = offset * 2.2; // slight fan angle
            const translateY = Math.abs(offset) * 0.8;

            return (
              <div
                key={i}
                style={{
                  transform: `rotate(${rotation}deg) translateY(${translateY}px)`,
                  zIndex: i + 1,
                }}
                className={`transition-transform duration-200 ${
                  i !== 0 ? '-ml-4 sm:-ml-5 md:-ml-5.5' : ''
                } ${isCurrentTurn ? 'ring-1 ring-amber-400 rounded-sm' : ''}`}
              >
                <CardView faceDown size="xs" />
              </div>
            );
          })}
        </div>
        <div className="mt-0.5 bg-slate-950/80 border border-slate-700/60 px-1.5 py-[1px] rounded-full text-[8px] font-mono text-slate-300 font-bold shadow-xs">
          {count} {count === 1 ? 'card' : 'cards'}
        </div>
      </div>
    );
  }

  // Left or Right Seat (Opponents) - Vertical angled cascade
  const isLeft = orientation === 'left';

  return (
    <div
      className={`flex items-center gap-1 select-none pointer-events-none ${
        isLeft ? 'flex-row' : 'flex-row-reverse'
      }`}
    >
      <div className="flex flex-col items-center justify-center overflow-visible">
        {cardIndices.map((i) => {
          const rotation = isLeft ? -15 + i * 2.5 : 15 - i * 2.5;
          const translateX = isLeft ? i * 0.8 : -i * 0.8;

          return (
            <div
              key={i}
              style={{
                transform: `rotate(${rotation}deg) translateX(${translateX}px)`,
                zIndex: i + 1,
              }}
              className={`transition-transform duration-200 ${
                i !== 0 ? '-mt-6 sm:-mt-7 md:-mt-8' : ''
              } ${isCurrentTurn ? 'ring-1 ring-amber-400 rounded-sm' : ''}`}
            >
              <CardView faceDown size="xs" />
            </div>
          );
        })}
      </div>
      <div className="bg-slate-950/80 border border-slate-700/60 px-1 py-0.5 rounded-md text-[8px] font-mono text-slate-300 font-bold shadow-xs">
        {count}
      </div>
    </div>
  );
};
