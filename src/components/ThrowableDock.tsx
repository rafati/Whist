import React, { useState, useEffect } from 'react';
import { ThrowableObjectType } from '../types.ts';
import { X } from 'lucide-react';
import { playClickSound } from '../lib/throwSounds.ts';
import { ThrowableItemGraphic } from './ThrowableArts.tsx';

interface ThrowableDockProps {
  selectedItem: ThrowableObjectType | null;
  onSelectItem: (item: ThrowableObjectType | null) => void;
  cooldownUntil: number;
}

export const ThrowableDock: React.FC<ThrowableDockProps> = ({
  selectedItem,
  onSelectItem,
  cooldownUntil,
}) => {
  const [remainingSec, setRemainingSec] = useState<number>(0);

  useEffect(() => {
    const updateCooldown = () => {
      const diff = Math.max(0, cooldownUntil - Date.now());
      setRemainingSec(Math.ceil(diff / 1000));
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 200);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const isOnCooldown = remainingSec > 0;

  const items: Array<{
    type: ThrowableObjectType;
    name: string;
    description: string;
    accentColor: string;
    borderActive: string;
  }> = [
    {
      type: 'shoe',
      name: 'Worn Boot',
      description: 'Hurl a rugged leather boot at anyone',
      accentColor: 'from-amber-900/90 to-amber-950/95',
      borderActive: 'border-amber-400 ring-2 ring-amber-400/80 shadow-[0_0_16px_rgba(251,191,36,0.75)]',
    },
    {
      type: 'beer',
      name: 'Foaming Beer',
      description: 'Splash frothy beer over a player',
      accentColor: 'from-emerald-900/90 to-green-950/95',
      borderActive: 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_16px_rgba(52,211,153,0.75)]',
    },
    {
      type: 'medal',
      name: 'Royal Gold Medal',
      description: 'Award a gleaming victory medal with confetti',
      accentColor: 'from-yellow-700/90 to-amber-900/95',
      borderActive: 'border-yellow-300 ring-2 ring-yellow-400/80 shadow-[0_0_18px_rgba(250,204,21,0.85)]',
    },
  ];

  return (
    <div
      data-throw-dock
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 sm:gap-1.5 shrink-0 bg-slate-950/90 backdrop-blur-md border border-emerald-800/50 rounded-xl sm:rounded-2xl px-1.5 sm:px-2 py-1 shadow-xl relative select-none"
    >
      {/* Active Targeting Banner Tag */}
      {selectedItem && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 font-black text-[9px] sm:text-[10px] px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 whitespace-nowrap animate-pulse z-30 border border-white">
          <span>Tap player avatar to throw!</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playClickSound();
              onSelectItem(null);
            }}
            className="hover:bg-amber-500 rounded-full p-0.5 ml-0.5 cursor-pointer"
            title="Cancel throw"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Throwable Items */}
      {items.map((item) => {
        const isSelected = selectedItem === item.type;
        const isDisabled = isOnCooldown;

        return (
          <button
            key={item.type}
            type="button"
            disabled={isDisabled}
            onClick={(e) => {
              e.stopPropagation();
              playClickSound();
              if (isSelected) {
                onSelectItem(null);
              } else {
                onSelectItem(item.type);
              }
            }}
            title={`${item.name} • ${item.description}`}
            className={`
              group relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center
              transition-all duration-150 cursor-pointer
              ${
                isSelected
                  ? `bg-gradient-to-br ${item.accentColor} ${item.borderActive} scale-112 -translate-y-0.5 z-10`
                  : isDisabled
                  ? 'opacity-40 bg-slate-900/60 border border-slate-800 cursor-not-allowed'
                  : 'bg-slate-900/95 border border-slate-700/80 hover:border-amber-400/70 hover:scale-108 hover:-translate-y-0.5 active:scale-95'
              }
            `}
          >
            <ThrowableItemGraphic
              type={item.type}
              size={26}
              className="transition-transform duration-150 group-hover:rotate-[-8deg] group-hover:scale-105"
            />

            {/* Cooldown Overlay */}
            {isOnCooldown && (
              <div className="absolute inset-0 bg-black/75 rounded-lg sm:rounded-xl flex items-center justify-center text-[10px] font-bold text-amber-300 font-mono">
                {remainingSec}s
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
