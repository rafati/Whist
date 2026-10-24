import React, { useEffect } from 'react';
import { GameState } from '../types.ts';
import { getTeamName } from '../logic/gameLogic.ts';
import { playSalpandFanfareSound } from '../lib/throwSounds.ts';
import confetti from 'canvas-confetti';
import { Trophy, RefreshCw, ArrowLeft, Crown, Flame, Sparkles } from 'lucide-react';

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

  const winnerTeamName = gameState.winnerTeam ? getTeamName(gameState.winnerTeam) : 'Match Over';
  const latestRound = gameState.roundScores?.[gameState.roundScores.length - 1];
  const isSalpandVictory = Boolean(gameState.isSalpand || latestRound?.isSalpand);
  const salpandTeam = gameState.salpandTeam || latestRound?.salpandTeam;
  const salpandTeamName = salpandTeam ? getTeamName(salpandTeam) : winnerTeamName;

  useEffect(() => {
    try {
      if (isSalpandVictory) {
        // Play Salapand audio fanfare
        playSalpandFanfareSound();

        // Multi-stage confetti celebration
        const count = 220;
        const defaults = {
          origin: { y: 0.7 },
          colors: ['#fbbf24', '#f59e0b', '#d97706', '#ef4444', '#10b981', '#ffffff'],
        };

        const fire = (particleRatio: number, opts: confetti.Options) => {
          confetti({
            ...defaults,
            ...opts,
            particleCount: Math.floor(count * particleRatio),
          });
        };

        fire(0.25, { spread: 26, startVelocity: 55 });
        fire(0.2, { spread: 60 });
        fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
        fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        fire(0.1, { spread: 120, startVelocity: 45 });

        // Secondary delayed burst from the sides
        const timer = setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 60,
            origin: { x: 0, y: 0.6 },
            colors: ['#fbbf24', '#f59e0b', '#ffffff'],
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 60,
            origin: { x: 1, y: 0.6 },
            colors: ['#fbbf24', '#f59e0b', '#ffffff'],
          });
        }, 400);

        return () => clearTimeout(timer);
      } else {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (e) {
      console.warn('Confetti effect note:', e);
    }
  }, [isSalpandVictory]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 select-none"
    >
      {/* Radiant rotating sunburst rays backdrop when Salpand victory */}
      {isSalpandVictory && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-35">
          <div className="w-[180vw] h-[180vw] max-w-[1200px] max-h-[1200px] rounded-full animate-spin [animation-duration:35s] bg-[radial-gradient(circle,rgba(251,191,36,0.25)_0%,rgba(217,119,6,0.12)_45%,transparent_70%)]" />
          <svg
            className="absolute w-[180vw] h-[180vw] max-w-[1200px] max-h-[1200px] animate-spin [animation-duration:60s] text-amber-500/15"
            viewBox="0 0 100 100"
            fill="currentColor"
          >
            {Array.from({ length: 16 }).map((_, i) => (
              <polygon
                key={i}
                points="50,50 47,0 53,0"
                transform={`rotate(${i * 22.5} 50 50)`}
              />
            ))}
          </svg>
        </div>
      )}

      {/* Floating sparkles animation for Salpand */}
      {isSalpandVictory && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[
            { top: '12%', left: '18%', delay: '0s', size: 'w-4 h-4 text-amber-300' },
            { top: '20%', right: '22%', delay: '0.4s', size: 'w-5 h-5 text-yellow-200' },
            { top: '72%', left: '16%', delay: '0.8s', size: 'w-4 h-4 text-amber-400' },
            { top: '68%', right: '18%', delay: '1.2s', size: 'w-6 h-6 text-yellow-300' },
          ].map((sparkle, idx) => (
            <div
              key={idx}
              className={`absolute ${sparkle.size} animate-pulse pointer-events-none`}
              style={{
                top: sparkle.top,
                left: sparkle.left,
                right: sparkle.right,
                animationDelay: sparkle.delay,
                animationDuration: '2.5s',
              }}
            >
              <Sparkles className="w-full h-full drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>
          ))}
        </div>
      )}

      {/* Main Modal Card */}
      <div
        className={`relative z-10 landscape-compact-modal bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950/40 border-2 rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-lg w-full max-h-[95dvh] overflow-y-auto shadow-2xl text-center flex flex-col gap-3.5 ${
          isSalpandVictory
            ? 'border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.4)]'
            : 'border-amber-500/60'
        }`}
      >
        {isSalpandVictory ? (
          <>
            {/* Salapand Grand Slam Header: Crown + Flame + Trophy */}
            <div className="relative flex items-center justify-center mt-1">
              <div className="absolute -inset-2 bg-gradient-to-r from-amber-500 via-yellow-400 to-red-500 rounded-full blur-xl opacity-70 animate-pulse" />
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 text-slate-950 flex items-center justify-center shadow-2xl ring-4 ring-amber-300/60">
                <Crown className="w-9 h-9 sm:w-11 sm:h-11 text-slate-950 drop-shadow-md" />
                <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-1 rounded-full border-2 border-amber-300 shadow-md">
                  <Flame className="w-3.5 h-3.5 fill-amber-300 text-red-500 animate-bounce" />
                </div>
              </div>
            </div>

            {/* Badge Header: Salpand / سالابند */}
            <div className="flex flex-col items-center gap-1">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400/60 px-3.5 py-1 rounded-full shadow-inner">
                <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-sm font-black text-amber-300">
                  سالابند
                </span>
                <span className="text-amber-400/60 font-bold">•</span>
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300 font-mono">
                  SALPAND
                </span>
                <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-black font-serif-display text-white tracking-tight leading-tight mt-0.5">
                ALL 13 TRICKS CAPTURED!
              </h2>

              <p className="text-xs sm:text-sm font-bold text-amber-300 flex items-center justify-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Grand Slam Victory • {winnerTeamName} Wins the Match!</span>
              </p>
            </div>

            {/* Salapand Honors & Points Award Card */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950/80 border border-amber-400/40 rounded-2xl p-2.5 sm:p-3 shadow-inner">
              <div className="flex flex-col items-center justify-center border-r border-slate-800 pr-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                  Honors Achieved By
                </span>
                <span className="text-base sm:text-lg font-black text-white mt-0.5">
                  {salpandTeamName}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center pl-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400">
                  Salpand Bonus
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                  +11 PTS
                </span>
              </div>
            </div>

            {/* Salapand Arabic Rule Highlight */}
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-1.5 text-[11px] sm:text-xs text-amber-200/90 font-medium leading-relaxed">
              <strong>سالابند:</strong> الفوز بجميع اللمات الـ 13 يُحتسب بـ 11 نقطة مباشرة وينهي المباراة بالفوز 🏆
            </div>
          </>
        ) : (
          /* Standard Game Over Header */
          <div className="flex items-center justify-center gap-3">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <Trophy className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">
                Match Complete
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold font-serif-display text-white leading-tight">
                {winnerTeamName} Wins!
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {gameState.winnerReason || 'Victory achieved at the table!'}
              </p>
            </div>
          </div>
        )}

        {/* Final Scores Comparison Card */}
        <div className="grid grid-cols-2 gap-3 bg-slate-900/80 p-2.5 sm:p-3 rounded-2xl border border-slate-800">
          <div
            className={`text-center p-2 sm:p-2.5 rounded-xl border ${
              gameState.winnerTeam === 'TeamA'
                ? 'bg-emerald-950/70 border-emerald-500/60 ring-2 ring-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="text-xs text-emerald-400 font-bold mb-0.5 flex items-center justify-center gap-1">
              <span>Team 1</span>
              {gameState.winnerTeam === 'TeamA' && <span>👑</span>}
            </div>
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
                ? 'bg-blue-950/70 border-blue-500/60 ring-2 ring-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="text-xs text-blue-400 font-bold mb-0.5 flex items-center justify-center gap-1">
              <span>Team 2</span>
              {gameState.winnerTeam === 'TeamB' && <span>👑</span>}
            </div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-white">
              {gameState.matchScores.TeamB >= 0
                ? `+${gameState.matchScores.TeamB}`
                : gameState.matchScores.TeamB}
            </div>
            <div className="text-[10px] text-slate-400">Partnership 2</div>
          </div>
        </div>

        {/* Action Buttons: Return to Lobby + Play New Match */}
        <div className="flex items-center gap-2.5 mt-1">
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
            className="flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-xl shadow-amber-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 ring-2 ring-amber-300/60"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Play New Match</span>
          </button>
        </div>
      </div>
    </div>
  );
};

