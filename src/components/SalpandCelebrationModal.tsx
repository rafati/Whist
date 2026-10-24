import React, { useEffect, useState } from 'react';
import { GameState, Team } from '../types.ts';
import { getTeamName } from '../logic/gameLogic.ts';
import { playSalpandFanfareSound } from '../lib/throwSounds.ts';
import confetti from 'canvas-confetti';
import { Crown, Sparkles, Flame, Trophy, Award, ArrowRight, X } from 'lucide-react';

interface SalpandCelebrationModalProps {
  gameState: GameState;
  onDismiss?: () => void;
}

export const SalpandCelebrationModal: React.FC<SalpandCelebrationModalProps> = ({
  gameState,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Check if current round or latest round score is a Salpand
  const latestRoundScore = gameState.roundScores?.[gameState.roundScores.length - 1];
  const isSalpand = Boolean(gameState.isSalpand || latestRoundScore?.isSalpand);
  const salpandTeam: Team | undefined = gameState.salpandTeam || latestRoundScore?.salpandTeam;
  const roundNumber = latestRoundScore?.roundNumber || gameState.roundNumber;

  useEffect(() => {
    if (isSalpand && !dismissed && (gameState.phase === 'round_over')) {
      setVisible(true);

      // Play audio fanfare
      try {
        playSalpandFanfareSound();
      } catch (err) {
        console.debug('Fanfare error:', err);
      }

      // Fire celebratory canvas-confetti bursts
      try {
        const count = 200;
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
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.6 },
            colors: ['#fbbf24', '#f59e0b', '#ffffff'],
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.6 },
            colors: ['#fbbf24', '#f59e0b', '#ffffff'],
          });
        }, 400);

        return () => clearTimeout(timer);
      } catch (e) {
        console.warn('Confetti error:', e);
      }
    } else {
      setVisible(false);
    }
  }, [isSalpand, dismissed, gameState.phase, roundNumber]);

  if (!visible || !isSalpand) return null;

  const teamDisplayName = salpandTeam ? getTeamName(salpandTeam) : 'Capturing Team';
  const isDefensive = latestRoundScore && latestRoundScore.salpandTeam === latestRoundScore.defendingTeam;

  const handleClose = () => {
    setDismissed(true);
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 overflow-hidden bg-black/85 backdrop-blur-lg animate-in fade-in duration-300 select-none"
    >
      {/* Radiant rotating sunburst rays background */}
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

      {/* Floating sparkles animation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[
          { top: '15%', left: '20%', delay: '0s', size: 'w-4 h-4 text-amber-300' },
          { top: '22%', right: '25%', delay: '0.4s', size: 'w-5 h-5 text-yellow-200' },
          { top: '70%', left: '18%', delay: '0.8s', size: 'w-4 h-4 text-amber-400' },
          { top: '65%', right: '20%', delay: '1.2s', size: 'w-6 h-6 text-yellow-300' },
          { top: '40%', left: '10%', delay: '1.6s', size: 'w-5 h-5 text-amber-200' },
          { top: '35%', right: '12%', delay: '2.0s', size: 'w-4 h-4 text-amber-400' },
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

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950/40 border-2 border-amber-400/80 rounded-3xl p-5 sm:p-7 shadow-[0_0_50px_rgba(245,158,11,0.35)] text-center flex flex-col items-center gap-4 animate-in zoom-in-90 duration-300">
        {/* Dismiss X button */}
        <button
          onClick={handleClose}
          aria-label="Close celebration"
          className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Crown & Flame Icon Crown */}
        <div className="relative mt-1">
          {/* Pulsing glow ring */}
          <div className="absolute -inset-3 bg-gradient-to-r from-amber-500 via-yellow-400 to-red-500 rounded-full blur-xl opacity-75 animate-pulse" />
          
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 text-slate-950 flex items-center justify-center shadow-2xl ring-4 ring-amber-300/60 transform hover:rotate-3 transition-transform">
            <Crown className="w-11 h-11 sm:w-13 sm:h-13 text-slate-950 drop-shadow-md" />
            <div className="absolute -top-2 -right-2 bg-red-600 text-white p-1 rounded-full border-2 border-amber-300 shadow-md">
              <Flame className="w-4 h-4 fill-amber-300 text-red-500 animate-bounce" />
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

          <h2 className="text-2xl sm:text-3xl font-black font-serif-display text-white tracking-tight leading-tight mt-1">
            ALL 13 TRICKS CAPTURED!
          </h2>

          <p className="text-xs sm:text-sm text-amber-200/90 font-medium">
            {isDefensive
              ? 'Defensive Grand Slam! The defenders swept the entire table!'
              : 'Grand Slam Victory! Perfect hand sweep with zero lost tricks!'}
          </p>
        </div>

        {/* Huge Point Award Card */}
        <div className="w-full bg-gradient-to-r from-amber-950/60 via-slate-900/80 to-amber-950/60 border border-amber-500/50 rounded-2xl p-3.5 sm:p-4 flex items-center justify-around shadow-inner">
          <div className="flex flex-col items-center">
            <span className="text-[10px] sm:text-xs uppercase tracking-wider text-amber-400 font-bold">
              Honors Achieved By
            </span>
            <span className="text-base sm:text-lg font-extrabold text-white">
              {teamDisplayName}
            </span>
          </div>

          <div className="h-10 w-px bg-amber-500/30" />

          <div className="flex flex-col items-center">
            <span className="text-[10px] sm:text-xs uppercase tracking-wider text-emerald-400 font-bold">
              Salpand Bonus
            </span>
            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]">
              +11 PTS
            </span>
          </div>
        </div>

        {/* Arabic Cultural Badge */}
        <div className="text-[11px] sm:text-xs text-slate-300 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl">
          <span className="text-amber-400 font-bold">سالابند:</span> الفوز بجميع اللمات الـ 13 يُحتسب بـ 11 نقطة مباشرة
        </div>

        {/* Action Button */}
        <button
          onClick={handleClose}
          className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <span>Continue to Summary</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};
