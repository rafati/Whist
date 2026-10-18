import React from 'react';
import { GameState, Team } from '../types.ts';
import { Trophy, AlertTriangle, Shield, CheckCircle2 } from 'lucide-react';

interface ScoreBoardProps {
  gameState: GameState;
  className?: string;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({ gameState, className = '' }) => {
  const { TeamA, TeamB } = gameState.matchScores;

  const calculateProgress = (score: number) => {
    // Score range is -10 to +10
    // Progress towards +10 (0 to 10 is 0% to 100%)
    if (score > 0) {
      return Math.min(100, Math.round((score / 10) * 100));
    }
    return 0;
  };

  const calculateDanger = (score: number) => {
    // Danger towards -10 (0 to -10 is 0% to 100%)
    if (score < 0) {
      return Math.min(100, Math.round((Math.abs(score) / 10) * 100));
    }
    return 0;
  };

  return (
    <div className={`bg-slate-950/85 backdrop-blur-md border border-emerald-800/40 rounded-2xl p-4 shadow-xl ${className}`}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
          <Trophy className="w-3.5 h-3.5" />
          <span>Match Standings</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Target: <strong className="text-emerald-300">+10</strong> | Elimination: <strong className="text-rose-400">-10</strong>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Team 1 */}
        <div className="bg-slate-900/60 border border-emerald-700/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-emerald-300">Team 1</span>
            <span className="text-[10px] text-emerald-400/80 bg-emerald-950/80 px-1.5 py-0.5 rounded">Partnership 1</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mb-2">
            {TeamA >= 0 ? `+${TeamA}` : TeamA} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>

          {/* Progress bar towards +10 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Victory (+10)</span>
              <span>{Math.max(0, TeamA)}/10</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${calculateProgress(TeamA)}%` }}
              />
            </div>

            {/* Danger bar if negative */}
            {TeamA < 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-[10px] text-rose-400 font-medium">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Elimination Danger</span>
                  </span>
                  <span>{Math.abs(TeamA)}/10</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-300"
                    style={{ width: `${calculateDanger(TeamA)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Team 2 */}
        <div className="bg-slate-900/60 border border-blue-700/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-blue-300">Team 2</span>
            <span className="text-[10px] text-blue-400/80 bg-blue-950/80 px-1.5 py-0.5 rounded">Partnership 2</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mb-2">
            {TeamB >= 0 ? `+${TeamB}` : TeamB} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>

          {/* Progress bar towards +10 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Victory (+10)</span>
              <span>{Math.max(0, TeamB)}/10</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${calculateProgress(TeamB)}%` }}
              />
            </div>

            {/* Danger bar if negative */}
            {TeamB < 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-[10px] text-rose-400 font-medium">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Elimination Danger</span>
                  </span>
                  <span>{Math.abs(TeamB)}/10</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-300"
                    style={{ width: `${calculateDanger(TeamB)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {gameState.roundScores && gameState.roundScores.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Round History
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {gameState.roundScores.map((rd, i) => (
              <div
                key={i}
                className={`text-xs p-2 rounded-lg flex items-center justify-between border ${
                  rd.isSalpand
                    ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-400">R{rd.roundNumber}:</span>
                  <span>{rd.bidLevel} {rd.contractType}</span>
                  {rd.isSalpand && (
                    <span className="bg-amber-500/20 text-amber-300 font-extrabold px-1.5 py-0.5 rounded text-[10px] border border-amber-400/40">
                      🔥 Salpand
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs font-bold">
                  <span className="text-emerald-400">
                    T1: {rd.contractTeam === 'TeamA'
                      ? (rd.scoreDeltaBidTeam >= 0 ? `+${rd.scoreDeltaBidTeam}` : rd.scoreDeltaBidTeam)
                      : (rd.scoreDeltaDefTeam >= 0 ? `+${rd.scoreDeltaDefTeam}` : rd.scoreDeltaDefTeam)}
                  </span>
                  <span className="text-slate-500 mx-1.5">|</span>
                  <span className="text-blue-400">
                    T2: {rd.contractTeam === 'TeamB'
                      ? (rd.scoreDeltaBidTeam >= 0 ? `+${rd.scoreDeltaBidTeam}` : rd.scoreDeltaBidTeam)
                      : (rd.scoreDeltaDefTeam >= 0 ? `+${rd.scoreDeltaDefTeam}` : rd.scoreDeltaDefTeam)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
