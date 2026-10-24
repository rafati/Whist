import React from 'react';
import { Card, GameState, Seat, Suit } from '../types.ts';
import { SUIT_NAMES, SUIT_SYMBOLS, getTeamName, getTeam } from '../logic/gameLogic.ts';
import { Crown, Clock } from 'lucide-react';

interface SuitDeclarationModalProps {
  gameState: GameState;
  mySeat: Seat | null;
  myHand?: Card[];
  secondsLeft?: number | null;
  onDeclareSuit: (suit: Suit) => void;
}

export const SuitDeclarationModal: React.FC<SuitDeclarationModalProps> = ({
  gameState,
  mySeat,
  myHand = [],
  secondsLeft,
  onDeclareSuit,
}) => {
  if (gameState.phase !== 'declaring') return null;

  const isDeclarer = Boolean(mySeat && gameState.declarer === mySeat);
  const declarerSeat = gameState.declarer;
  const declarerTeam = declarerSeat ? getTeam(declarerSeat) : null;
  const winningBid = gameState.winningBid;

  const suits: Suit[] = ['S', 'H', 'D', 'C'];

  return (
    <div className="bg-slate-950/95 backdrop-blur-md border border-amber-400/70 rounded-2xl p-2.5 sm:p-3 max-w-[330px] sm:max-w-[360px] w-full mx-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-100 z-30">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800/90 text-xs">
        <div className="flex items-center gap-1.5">
          <Crown className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-white font-serif-display text-[11px] sm:text-xs">
            Choose Trump Suit
          </span>
          {secondsLeft !== null && secondsLeft !== undefined && (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full border flex items-center gap-0.5 ${
                secondsLeft <= 5
                  ? 'bg-rose-950/80 text-rose-300 border-rose-500/80 animate-pulse'
                  : 'bg-amber-950/80 text-amber-300 border-amber-500/60'
              }`}
            >
              <Clock className="w-2.5 h-2.5" />
              <span>{secondsLeft}s</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px] sm:text-[11px]">
          <span className="text-slate-400">Contract:</span>
          <span className="font-bold bg-amber-950/90 border border-amber-500/70 text-amber-300 px-1.5 py-0.5 rounded font-mono">
            {winningBid?.level} Suit ({6 + (winningBid?.level || 1)} Tricks)
          </span>
        </div>
      </div>

      {isDeclarer ? (
        <div>
          <p className="text-[11px] text-slate-300 mb-2 text-center">
            You won the auction! Pick the <strong className="text-amber-300">Trump Suit</strong> using your hand below:
          </p>

          <div className="grid grid-cols-4 gap-1.5">
            {suits.map((s) => {
              const isRed = s === 'H' || s === 'D';
              const suitHex = isRed ? '#ef4444' : '#ffffff';
              const suitCards = myHand.filter((c) => c.suit === s);

              return (
                <button
                  key={s}
                  onClick={() => onDeclareSuit(s)}
                  className="py-2 px-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm group cursor-pointer active:scale-95"
                >
                  <span
                    style={{ color: suitHex }}
                    className="text-xl sm:text-2xl font-black group-hover:scale-110 transition-transform select-none leading-none"
                  >
                    {SUIT_SYMBOLS[s]}
                  </span>
                  <span className="text-[10px] font-bold text-slate-200 leading-tight">
                    {SUIT_NAMES[s]}
                  </span>
                  <span className="text-[9px] bg-slate-950/90 border border-slate-800 px-1.5 py-0.5 rounded-full font-mono text-amber-300">
                    {suitCards.length} {suitCards.length === 1 ? 'card' : 'cards'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-2.5 px-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-200 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            <span>
              Declarer{' '}
              <strong className={declarerTeam === 'TeamA' ? 'text-emerald-400' : 'text-blue-400'}>
                {declarerTeam ? getTeamName(declarerTeam) : 'Declarer'}
              </strong>{' '}
              is choosing Trump...
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            Play begins as soon as the Trump suit is named.
          </p>
        </div>
      )}
    </div>
  );
};
