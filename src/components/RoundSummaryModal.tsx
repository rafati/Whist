import React from 'react';
import { GameState } from '../types.ts';
import { getTeamName, SUIT_NAMES, SUIT_SYMBOLS } from '../logic/gameLogic.ts';
import { ArrowRight, ShieldAlert, Award, Crown } from 'lucide-react';

interface RoundSummaryModalProps {
  gameState: GameState;
  onNextRound: () => void;
}

export const RoundSummaryModal: React.FC<RoundSummaryModalProps> = ({
  gameState,
  onNextRound,
}) => {
  if (gameState.phase !== 'round_over') return null;

  const currentRoundScore = gameState.roundScores[gameState.roundScores.length - 1];
  if (!currentRoundScore) return null;

  const {
    roundNumber,
    contractTeam,
    defendingTeam,
    bidLevel,
    contractType,
    trumpSuit,
    tricksWonBidTeam,
    tricksWonDefTeam,
    bidSuccess,
    scoreDeltaBidTeam,
    scoreDeltaDefTeam,
  } = currentRoundScore;

  const isRedTrump = trumpSuit === 'H' || trumpSuit === 'D';
  const trumpColorHex = isRedTrump ? '#ef4444' : '#ffffff';
  const targetTricks = 6 + bidLevel;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="landscape-compact-modal bg-slate-950 border border-emerald-600/50 rounded-2xl sm:rounded-3xl p-3 sm:p-5 max-w-lg w-full max-h-[95dvh] overflow-y-auto shadow-2xl flex flex-col gap-2 sm:gap-2.5">
        {/* Compact Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 sm:p-2 rounded-xl ${
                bidSuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {bidSuccess ? <Award className="w-4 h-4 sm:w-5 sm:h-5" /> : <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                Round {roundNumber} Summary
              </div>
              <h3 className="text-base sm:text-lg font-bold font-serif-display text-white leading-tight">
                {bidSuccess ? 'Contract Fulfilled!' : 'Contract Defeated!'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-xl text-xs font-semibold">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-300 font-bold">
              {bidLevel} {contractType}
            </span>
            <span className="text-slate-600">•</span>
            {trumpSuit === 'NT' ? (
              <span className="bg-indigo-600/80 text-white px-1.5 py-0.5 rounded font-mono text-[10px]">
                No Trump
              </span>
            ) : (
              <span style={{ color: trumpColorHex }} className="font-bold text-xs">
                {SUIT_SYMBOLS[trumpSuit]} {SUIT_NAMES[trumpSuit]}
              </span>
            )}
          </div>
        </div>

        {/* Tricks & Points Side-by-Side Comparison */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {/* Declaring Team Card */}
          <div
            className={`p-2.5 sm:p-3 rounded-xl border flex flex-col justify-between ${
              contractTeam === 'TeamA'
                ? 'bg-emerald-950/35 border-emerald-700/50'
                : 'bg-blue-950/35 border-blue-700/50'
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[10px] uppercase font-bold text-amber-300 flex items-center gap-1">
                <Crown className="w-3 h-3" />
                <span>Declarer ({getTeamName(contractTeam)})</span>
              </span>
              <span
                className={`text-xs font-extrabold font-mono px-1.5 py-0.5 rounded ${
                  scoreDeltaBidTeam >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {scoreDeltaBidTeam >= 0 ? `+${scoreDeltaBidTeam}` : scoreDeltaBidTeam} pts
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-0.5">
              <div className="text-lg sm:text-xl font-bold text-white font-mono">
                {tricksWonBidTeam}
                <span className="text-xs font-normal text-slate-400"> / {targetTricks} needed</span>
              </div>
              <span
                className={`text-[10px] font-bold ${
                  bidSuccess ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {bidSuccess ? 'Made' : 'Short'}
              </span>
            </div>
          </div>

          {/* Defending Team Card */}
          <div
            className={`p-2.5 sm:p-3 rounded-xl border flex flex-col justify-between ${
              defendingTeam === 'TeamA'
                ? 'bg-emerald-950/35 border-emerald-700/50'
                : 'bg-blue-950/35 border-blue-700/50'
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-300">
                Defenders ({getTeamName(defendingTeam)})
              </span>
              <span className="text-xs font-extrabold font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                +{scoreDeltaDefTeam} pts
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-0.5">
              <div className="text-lg sm:text-xl font-bold text-white font-mono">
                {tricksWonDefTeam}
                <span className="text-xs font-normal text-slate-400"> / 13 tricks</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {tricksWonDefTeam > 6 ? `+${tricksWonDefTeam - 6} over book` : 'Book defense'}
              </span>
            </div>
          </div>
        </div>

        {/* Cumulative Match Score Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 leading-tight">
            <strong className="text-slate-200 block text-xs">Match Score</strong>
            <span>First to +11 wins</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-emerald-700/40">
              <span className="text-xs font-bold text-emerald-400">Team 1</span>
              <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                {gameState.matchScores.TeamA >= 0
                  ? `+${gameState.matchScores.TeamA}`
                  : gameState.matchScores.TeamA}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-blue-700/40">
              <span className="text-xs font-bold text-blue-400">Team 2</span>
              <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                {gameState.matchScores.TeamB >= 0
                  ? `+${gameState.matchScores.TeamB}`
                  : gameState.matchScores.TeamB}
              </span>
            </div>
          </div>
        </div>

        {/* Always-Visible Primary CTA */}
        <button
          onClick={onNextRound}
          className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <span>Deal Next Round</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
