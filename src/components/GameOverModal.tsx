import React, { useEffect } from 'react';
import { GameState } from '../types.ts';
import { getTeamName } from '../logic/gameLogic.ts';
import confetti from 'canvas-confetti';
import { Trophy, RefreshCw, ArrowLeft } from 'lucide-react';

interface GameOverModalProps {
  gameState: GameState;
  onRestartMatch: () => void;
  onLeaveRoom?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  gameState,
  onRestartMatch,
  onLeaveRoom,
}) => {
  if (gameState.phase !== 'game_over') return null;

  useEffect(() => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {
      console.warn('Confetti effect note:', e);
    }
  }, []);

  const winnerTeamName = gameState.winnerTeam ? getTeamName(gameState.winnerTeam) : 'Match Over';
  const latestRound = gameState.roundScores?.[gameState.roundScores.length - 1];
  const isSalpandVictory = Boolean(gameState.isSalpand || latestRound?.isSalpand);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in zoom-in-95 duration-200">
      <div
        className={`landscape-compact-modal bg-slate-950 border-2 rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full max-h-[95dvh] overflow-y-auto shadow-2xl text-center flex flex-col gap-3 ${
          isSalpandVictory ? 'border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.35)]' : 'border-amber-500/60'
        }`}
      >
        {/* Header Row */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Trophy className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">
              {isSalpandVictory ? '🔥 Salpand Grand Slam' : 'Match Complete'}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold font-serif-display text-white leading-tight">
              {winnerTeamName} Wins!
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {gameState.winnerReason || 'Victory achieved at the table!'}
            </p>
          </div>
        </div>

        {/* Salpand Honor Banner */}
        {isSalpandVictory && (
          <div className="bg-gradient-to-r from-amber-950/80 via-yellow-950/70 to-amber-950/80 border border-amber-500/60 rounded-xl px-3 py-1.5 text-xs text-amber-200 font-bold flex items-center justify-center gap-2 shadow-inner">
            <span>🔥</span>
            <span>صلبند • SALPAND (13 Tricks Captured)</span>
            <span>+11 PTS</span>
          </div>
        )}

        {/* Final Scores */}
        <div className="grid grid-cols-2 gap-3 bg-slate-900/80 p-2.5 sm:p-3 rounded-2xl border border-slate-800">
          <div
            className={`text-center p-2 sm:p-2.5 rounded-xl border ${
              gameState.winnerTeam === 'TeamA'
                ? 'bg-emerald-950/70 border-emerald-500/60 ring-1 ring-emerald-400/40'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="text-xs text-emerald-400 font-bold mb-0.5">Team 1</div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-white">
              {gameState.matchScores.TeamA >= 0
                ? `+${gameState.matchScores.TeamA}`
                : gameState.matchScores.TeamA}
            </div>
            <div className="text-[10px] text-slate-400">Partnership 1</div>
          </div>

          <div
            className={`text-center p-2 sm:p-2.5 rounded-xl border ${
              gameState.winnerTeam === 'TeamB'
                ? 'bg-blue-950/70 border-blue-500/60 ring-1 ring-blue-400/40'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="text-xs text-blue-400 font-bold mb-0.5">Team 2</div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-white">
              {gameState.matchScores.TeamB >= 0
                ? `+${gameState.matchScores.TeamB}`
                : gameState.matchScores.TeamB}
            </div>
            <div className="text-[10px] text-slate-400">Partnership 2</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onLeaveRoom && (
            <button
              type="button"
              onClick={onLeaveRoom}
              className="py-2.5 sm:py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Lobby</span>
            </button>
          )}
          <button
            onClick={onRestartMatch}
            className="flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Play New Match</span>
          </button>
        </div>
      </div>
    </div>
  );
};
