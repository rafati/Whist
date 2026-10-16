import React, { useState, useEffect } from 'react';
import { MisdealInfo } from '../types.ts';
import { CardView } from './CardView.tsx';
import { RotateCcw, AlertTriangle, Play } from 'lucide-react';

interface MisdealModalProps {
  misdealInfo: MisdealInfo;
  onSkip?: () => void;
  isHost?: boolean;
}

export const MisdealModal: React.FC<MisdealModalProps> = ({
  misdealInfo,
  onSkip,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const diff = Math.ceil((misdealInfo.expiresAt - Date.now()) / 1000);
    return Math.max(0, Math.min(10, diff));
  });

  useEffect(() => {
    const updateCountdown = () => {
      const diff = Math.ceil((misdealInfo.expiresAt - Date.now()) / 1000);
      setSecondsRemaining(Math.max(0, diff));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [misdealInfo.expiresAt]);

  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / 10) * 100));

  return (
    <div className="bg-slate-950/95 backdrop-blur-xl border-2 border-amber-500/80 rounded-2xl sm:rounded-3xl p-3 sm:p-4 max-w-lg w-[95%] sm:w-full mx-auto shadow-2xl shadow-amber-950/50 animate-in fade-in zoom-in-95 duration-200 text-slate-100 z-40 relative">
      {/* Top Banner: Status & Countdown Pill */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-900/40 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-amber-500/20 border border-amber-400/60 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold font-serif-display text-white text-xs sm:text-sm leading-tight flex items-center gap-1.5">
              <span>No Winning Cards Dealt</span>
            </h3>
            <p className="text-[10px] text-amber-300 font-medium leading-none mt-0.5">
              Unwinnable Hand Rule (Kosh)
            </p>
          </div>
        </div>

        {/* 10-Second Countdown Pill */}
        <div className="flex items-center gap-1 bg-amber-950/90 border border-amber-500/80 px-2 py-0.5 sm:py-1 rounded-full text-amber-300 font-mono text-[10px] sm:text-xs font-bold shadow-xs shrink-0">
          <RotateCcw className="w-3 h-3 text-amber-400 animate-spin [animation-duration:4s]" />
          <span>Re-dealing: {secondsRemaining}s</span>
        </div>
      </div>

      {/* Narrative Notification */}
      <div className="bg-amber-950/40 border border-amber-600/30 rounded-xl px-2.5 py-1.5 mb-2.5 text-center">
        <p className="text-xs sm:text-sm font-bold text-amber-200">
          <strong className="text-white underline decoration-amber-400 underline-offset-2">
            {misdealInfo.playerName.replace(/^Bot\s+/i, '')}
          </strong>{' '}
          has no winning cards!
        </p>
        <p className="text-[10px] sm:text-[11px] text-slate-300 mt-0.5 leading-snug">
          A playable hand must have at least one winning card (<strong className="text-amber-300">Ace</strong>, <strong className="text-amber-300">King+1</strong>, <strong className="text-amber-300">Queen+2</strong>, or <strong className="text-amber-300">Jack+3</strong>).
        </p>
      </div>

      {/* 13 Revealed Cards Spread */}
      <div className="mb-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between px-1">
          <span>Revealed Hand (13 Cards)</span>
          <span className="text-[9px] text-slate-400 font-mono">0 Honors Protected</span>
        </div>

        <div className="flex justify-center items-center py-1 overflow-x-auto overflow-y-visible px-2 min-h-[72px] sm:min-h-[85px]">
          {misdealInfo.hand.map((card, idx) => (
            <div
              key={card.id}
              className={`transition-all relative shrink-0 ${
                idx !== 0 ? '-ml-5 sm:-ml-6 md:-ml-7' : ''
              }`}
            >
              <CardView card={card} size="sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Progress Bar & Skip Deal Button */}
      <div className="space-y-1.5 pt-1">
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-slate-400">
          <span>Deal automatically rotates to next dealer...</span>
          {onSkip && (
            <button
              onClick={onSkip}
              className="py-1 px-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-[10px] rounded-lg shadow transition-all flex items-center gap-1 cursor-pointer active:scale-95"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>Deal Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
