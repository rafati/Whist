import React from 'react';
import { GameState, Seat, UserProfile } from '../types.ts';
import { SUIT_SYMBOLS, SUIT_NAMES, getTeam } from '../logic/gameLogic.ts';
import { Crown, Trophy, Target } from 'lucide-react';

interface ContractHudProps {
  gameState: GameState;
  mySeat: Seat | null;
  seats: Record<Seat, UserProfile | null>;
  className?: string;
}

export const ContractHud: React.FC<ContractHudProps> = ({
  gameState,
  mySeat,
  seats,
  className = '',
}) => {
  const { winningBid, trumpSuit, declarer, teamTricksWon, phase } = gameState;

  // Only relevant once bidding or declaring has produced a winning contract or during play
  const isPlayingOrDeclaring = phase === 'playing' || phase === 'declaring';
  const myTeam = mySeat ? getTeam(mySeat) : null;
  const declarerTeam = declarer ? getTeam(declarer) : null;

  const level = winningBid?.level || 1;
  const isNT = trumpSuit === 'NT' || winningBid?.contractType === 'NT';
  const isRedSuit = trumpSuit === 'H' || trumpSuit === 'D';

  const declarerName = declarer
    ? declarer === mySeat
      ? 'You'
      : seats[declarer]?.name.replace(/^Bot\s+/i, '') || 'Player'
    : '';

  const contractGoal = 6 + level;
  const contractTricksWon = declarerTeam ? teamTricksWon[declarerTeam] : 0;

  return (
    <div
      className={`bg-slate-950/90 backdrop-blur-md border border-emerald-700/60 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 shadow-2xl flex flex-col gap-1.5 select-none text-slate-100 min-w-[170px] sm:min-w-[200px] max-w-[220px] sm:max-w-[240px] ${className}`}
    >
      {/* 1. Header & Contract Type Banner */}
      <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-slate-400 font-bold border-b border-slate-800/80 pb-1">
        <span className="flex items-center gap-1 text-amber-300 uppercase tracking-wider">
          <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span>Winning Contract</span>
        </span>
        {declarerTeam && (
          <span
            className={`px-1.5 py-0.2 rounded text-[8px] sm:text-[9px] font-bold ${
              declarerTeam === 'TeamA'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                : 'bg-blue-950 text-blue-300 border border-blue-700/60'
            }`}
          >
            {declarerTeam === 'TeamA' ? 'Team 1' : 'Team 2'}
          </span>
        )}
      </div>

      {/* 2. Big & Clear Bid Number + Selected Suit / No Trump Display */}
      {isPlayingOrDeclaring && winningBid ? (
        <div className="flex items-center justify-between gap-2 py-0.5">
          {/* Big Bid Level Number + Big Suit/NT Symbol */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-black font-serif-display text-amber-300 leading-none drop-shadow">
              {level}
            </span>

            {isNT ? (
              <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-400/50 px-2 py-0.5 rounded-lg shadow-inner">
                <span className="text-lg sm:text-xl font-black text-amber-300 font-mono leading-none">
                  NT
                </span>
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-200 hidden sm:inline leading-none">
                  No Trump
                </span>
              </div>
            ) : trumpSuit ? (
              <div className="flex items-center gap-1 bg-black/40 border border-slate-700/60 px-2 py-0.5 rounded-lg shadow-inner">
                <span
                  className={`text-2xl sm:text-3xl font-black leading-none drop-shadow ${
                    isRedSuit ? 'text-red-500' : 'text-slate-100'
                  }`}
                >
                  {SUIT_SYMBOLS[trumpSuit]}
                </span>
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-200 capitalize leading-none">
                  {SUIT_NAMES[trumpSuit]}
                </span>
              </div>
            ) : (
              <span className="text-xs font-bold text-amber-300 italic">
                Declaring Suit...
              </span>
            )}
          </div>

          {/* Goal Indicator */}
          <div className="text-right leading-none shrink-0">
            <div className="text-[8px] sm:text-[9px] text-slate-400 flex items-center justify-end gap-0.5">
              <Target className="w-2.5 h-2.5 text-amber-400" />
              <span>Goal</span>
            </div>
            <div className="text-xs sm:text-sm font-black font-mono text-amber-300">
              {contractGoal} <span className="text-[8px] font-normal text-slate-400">tricks</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-1 text-center text-xs text-slate-400 italic">
          {phase === 'bidding' ? 'Auction in progress...' : 'Waiting for deal...'}
        </div>
      )}

      {/* 3. Live Team Tricks Won Tracker */}
      <div className="pt-1 border-t border-slate-800/80 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[8px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <Trophy className="w-2.5 h-2.5 text-emerald-400" />
            <span>Tricks Won</span>
          </span>
          {declarerTeam && (
            <span className="text-[8px] text-slate-400 font-mono">
              Need: {Math.max(0, contractGoal - contractTricksWon)} more
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {/* Team 1 Trick Count */}
          <div
            className={`flex items-center justify-between px-2 py-1 rounded-lg border text-xs font-mono transition-all ${
              myTeam === 'TeamA'
                ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                : 'bg-slate-900/80 border-emerald-800/40 text-emerald-400'
            }`}
            title="Tricks won by Team 1 this round"
          >
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-300">T1</span>
              {myTeam === 'TeamA' && (
                <span className="text-[7px] bg-emerald-700/80 text-white px-1 rounded-sm uppercase font-sans">
                  You
                </span>
              )}
            </div>
            <span className="text-sm sm:text-base font-black text-white ml-1">
              {teamTricksWon.TeamA}
            </span>
          </div>

          {/* Team 2 Trick Count */}
          <div
            className={`flex items-center justify-between px-2 py-1 rounded-lg border text-xs font-mono transition-all ${
              myTeam === 'TeamB'
                ? 'bg-blue-950/80 border-blue-500/80 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.2)]'
                : 'bg-slate-900/80 border-blue-800/40 text-blue-400'
            }`}
            title="Tricks won by Team 2 this round"
          >
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-300">T2</span>
              {myTeam === 'TeamB' && (
                <span className="text-[7px] bg-blue-700/80 text-white px-1 rounded-sm uppercase font-sans">
                  You
                </span>
              )}
            </div>
            <span className="text-sm sm:text-base font-black text-white ml-1">
              {teamTricksWon.TeamB}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
