import React, { useState, useEffect } from 'react';
import type { BotStrategy, SimulationResult } from '../logic/simulator.ts';
import type { BotPolicyData } from '../data/botPolicy.ts';
import {
  Brain,
  Zap,
  BarChart3,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Shield,
  Layers,
  Cpu,
  TrendingUp,
  Database,
  BookOpen,
  Sliders,
  RefreshCw,
} from 'lucide-react';

interface SimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SimulationModal: React.FC<SimulationModalProps> = ({ isOpen, onClose }) => {
  const [totalMatches, setTotalMatches] = useState<number>(25);
  const [teamAStrategy, setTeamAStrategy] = useState<BotStrategy>('super');
  const [teamBStrategy, setTeamBStrategy] = useState<BotStrategy>('casual');
  const [saveToBrain, setSaveToBrain] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [policy, setPolicy] = useState<BotPolicyData | null>(null);
  const [activeTab, setActiveTab] = useState<'arena' | 'brain' | 'opening_book'>('arena');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isAiOptimizing, setIsAiOptimizing] = useState<boolean>(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<{ analysis: string; adjustments: string[] } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const apiBase = (import.meta.env.VITE_API_URL as string) || '';

  // Fetch active policy on open
  useEffect(() => {
    if (isOpen) {
      fetchPolicy();
    }
  }, [isOpen]);

  const fetchPolicy = async () => {
    try {
      const res = await fetch(`${apiBase}/api/bot-brain`);
      if (res.ok) {
        const data = await res.json();
        setPolicy(data);
      }
    } catch (err) {
      console.warn('Failed to fetch bot policy:', err);
    }
  };

  const handleAiOptimize = async () => {
    setIsAiOptimizing(true);
    setAiDiagnosis(null);
    try {
      const res = await fetch(`${apiBase}/api/ai-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalMatches: Math.max(250, totalMatches) }),
      });
      if (!res.ok) throw new Error('AI optimization failed');
      const data = await res.json();
      setAiDiagnosis({ analysis: data.analysis, adjustments: data.adjustments });
      if (data.policy) setPolicy(data.policy);
      if (data.baseline) setResult(data.baseline);
      showToast('✨ Gemini AI successfully analyzed games and synthesized new Super Bot policy!');
    } catch (err) {
      console.error('AI optimization failed:', err);
      showToast('AI analysis error, please try again.');
    } finally {
      setIsAiOptimizing(false);
    }
  };

  const handleRunSimulation = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      const res = await fetch(`${apiBase}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalMatches,
          teamAStrategy,
          teamBStrategy,
          saveToBrain,
        }),
      });

      if (!res.ok) {
        throw new Error('Simulation failed');
      }

      const data = await res.json();
      setResult(data);
      if (data.policy) {
        setPolicy(data.policy);
        if (saveToBrain && teamAStrategy === 'super') {
          showToast(`🧠 Bot Brain Updated! Version ${data.policy.version} saved to disk with ${data.policy.totalSimulatedHands} hands trained.`);
        }
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleResetPolicy = async () => {
    if (!window.confirm('Are you sure you want to reset the bot brain to factory baseline weights?')) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch(`${apiBase}/api/bot-brain/reset`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPolicy(data);
        showToast('Bot Brain reset to tournament baseline parameters.');
      }
    } catch (err) {
      console.error('Failed to reset policy:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-950 border border-emerald-600/50 rounded-2xl sm:rounded-3xl max-w-2xl w-full shadow-2xl p-4 sm:p-6 text-slate-100 max-h-[92dvh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-indigo-800 flex items-center justify-center border border-cyan-400/40 shadow-lg shadow-cyan-950">
              <Brain className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-serif-display text-white">
                  Super Bot & Simulation Arena
                </h2>
                {policy && (
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wider bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" />
                    <span>v{policy.version}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Persistent Monte Carlo Policy, Double-Dummy Minimax & Learned Opening Book
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 pt-3 border-b border-slate-800 shrink-0 text-xs">
          <button
            onClick={() => setActiveTab('arena')}
            className={`pb-2 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'arena'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simulation Arena</span>
          </button>

          <button
            onClick={() => setActiveTab('brain')}
            className={`pb-2 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'brain'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Learned Policy & Bidding ({policy ? policy.totalSimulatedHands.toLocaleString() : '...'} hands)</span>
          </button>

          <button
            onClick={() => setActiveTab('opening_book')}
            className={`pb-2 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'opening_book'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Opening Book</span>
          </button>
        </div>

        {/* Toast Alert Banner */}
        {toastMessage && (
          <div className="mt-3 bg-cyan-950/90 border border-cyan-500 text-cyan-200 text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 shrink-0">
            <Sparkles className="w-4 h-4 text-cyan-300 shrink-0 animate-spin" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="space-y-4 py-3 overflow-y-auto pr-1 flex-1">
          {activeTab === 'arena' && (
            <>
              {/* Persistent Knowledge Status Summary Pill */}
              {policy && (
                <div className="bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-cyan-800/40 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="text-slate-300 font-medium">Persistent Brain File: </span>
                      <strong className="text-white">src/data/learnedPolicy.json</strong>
                      <span className="text-slate-400 block text-[11px]">
                        Accumulated: <strong className="text-cyan-300">{policy.totalSimulatedHands.toLocaleString()}</strong> hands •{' '}
                        <strong className="text-emerald-300">{policy.totalMatchesTrained}</strong> matches trained
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-600/40 px-2 py-0.5 rounded-full font-mono">
                      Live at Game Tables
                    </span>
                  </div>
                </div>
              )}

              {/* Controls Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5">
                {/* Matches Selection */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Matches to Simulate
                    </label>
                    <span className="text-[10px] text-cyan-300 font-mono font-bold">
                      {totalMatches.toLocaleString()} games
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 mb-1.5">
                    {[25, 100, 500, 1000, 2500].map((num) => (
                      <button
                        key={num}
                        onClick={() => setTotalMatches(num)}
                        disabled={isRunning}
                        className={`py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                          totalMatches === num
                            ? 'bg-cyan-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {num >= 1000 ? `${num / 1000}k` : num}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="5000"
                    step="10"
                    value={totalMatches}
                    onChange={(e) => setTotalMatches(Number(e.target.value))}
                    disabled={isRunning}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>

                {/* Team 1 Engine */}
                <div>
                  <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
                    Team 1
                  </label>
                  <select
                    value={teamAStrategy}
                    onChange={(e) => setTeamAStrategy(e.target.value as BotStrategy)}
                    disabled={isRunning}
                    className="w-full bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-white font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="super">🧠 Super Bot (PIMC + DDS)</option>
                    <option value="casual">🤖 Casual Bot (Heuristic)</option>
                  </select>
                </div>

                {/* Team 2 Engine */}
                <div>
                  <label className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block mb-1.5">
                    Team 2
                  </label>
                  <select
                    value={teamBStrategy}
                    onChange={(e) => setTeamBStrategy(e.target.value as BotStrategy)}
                    disabled={isRunning}
                    className="w-full bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-white font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="casual">🤖 Casual Bot (Heuristic)</option>
                    <option value="super">🧠 Super Bot (PIMC + DDS)</option>
                  </select>
                </div>
              </div>

              {/* Action Trigger & Training Checkbox */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToBrain}
                    onChange={(e) => setSaveToBrain(e.target.checked)}
                    disabled={isRunning}
                    className="w-4 h-4 rounded text-cyan-600 bg-slate-800 border-slate-700 focus:ring-cyan-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-white block">Auto-Save Results into Bot Brain</span>
                    <span className="text-[11px] text-slate-400">Updates persistent bidding matrix & opening book on disk</span>
                  </div>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAiOptimize}
                    disabled={isRunning || isAiOptimizing}
                    className="py-2.5 px-4 bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-950 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-98 shrink-0 border border-purple-450/40"
                  >
                    {isAiOptimizing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>AI Analyzing & Synthesizing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 fill-current" />
                        <span>AI Strategy Optimize (Gemini)</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleRunSimulation}
                    disabled={isRunning || isAiOptimizing}
                    className="py-2.5 px-5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-950 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98 shrink-0"
                  >
                    {isRunning ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Simulating & Learning...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Run {totalMatches} Matches</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Strategic Diagnosis Card */}
              {aiDiagnosis && (
                <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/50 rounded-2xl p-4 space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between pb-1.5 border-b border-purple-800/40">
                    <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                      <Sparkles className="w-4 h-4 text-pink-400" />
                      <span>Gemini Grandmaster Strategy Analysis</span>
                    </div>
                    <span className="text-[10px] bg-purple-900/80 text-purple-200 border border-purple-600/50 px-2 py-0.5 rounded-full font-mono">
                      Policy v{policy?.version || '3.5.x'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed italic">
                    "{aiDiagnosis.analysis}"
                  </p>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-pink-300 tracking-wider block mb-1">
                      Synthesized Weight Adjustments:
                    </span>
                    <ul className="grid grid-cols-1 gap-1 text-[11px] text-slate-300">
                      {aiDiagnosis.adjustments.map((adj, i) => (
                        <li key={i} className="flex items-start gap-1.5 bg-black/30 px-2.5 py-1.5 rounded-lg border border-purple-900/40">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{adj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Results Display */}
              {result && (
                <div className="space-y-4 bg-slate-900/90 border border-cyan-800/50 rounded-2xl p-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Benchmark Results ({result.totalMatches} Matches / {result.totalRounds} Rounds)
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Completed in <strong className="text-cyan-300">{result.durationMs}ms</strong>
                    </span>
                  </div>

                  {/* Head-to-Head Win Rate Comparison */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-end text-xs font-bold">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <span>Team 1 ({teamAStrategy === 'super' ? 'Super Bot' : 'Casual'})</span>
                        <span className="text-sm font-mono text-emerald-300">{result.teamAWins} Wins ({result.teamAWinRate}%)</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-400">
                        <span className="text-sm font-mono text-blue-300">({result.teamBWinRate}%) {result.teamBWins} Wins</span>
                        <span>Team 2 ({teamBStrategy === 'super' ? 'Super Bot' : 'Casual'})</span>
                      </div>
                    </div>

                    <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${result.teamAWinRate}%` }}
                      />
                      <div
                        className="bg-blue-500 h-full transition-all duration-500"
                        style={{ width: `${result.teamBWinRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Detailed Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Avg Tricks / Round</span>
                      <div className="font-mono font-bold text-white flex justify-between">
                        <span className="text-emerald-400">{result.teamAAverageTricks}</span>
                        <span className="text-slate-500">vs</span>
                        <span className="text-blue-400">{result.teamBAverageTricks}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Bid Success Rate</span>
                      <div className="font-mono font-bold text-white flex justify-between">
                        <span className="text-emerald-400">{result.teamABidSuccessRate}%</span>
                        <span className="text-slate-500">vs</span>
                        <span className="text-blue-400">{result.teamBBidSuccessRate}%</span>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Contracts Made</span>
                      <div className="font-mono font-bold text-white flex justify-between">
                        <span className="text-emerald-400">{result.teamASuccessfulContracts}/{result.teamATotalContracts}</span>
                        <span className="text-slate-500">vs</span>
                        <span className="text-blue-400">{result.teamBSuccessfulContracts}/{result.teamBTotalContracts}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Rounds / Match</span>
                      <div className="font-mono font-bold text-cyan-300">
                        {result.averageRoundsPerMatch} rounds
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'brain' && policy && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-cyan-400" />
                      <span>Calibrated Bidding Thresholds Matrix</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Trained on {policy.totalSimulatedHands.toLocaleString()} hands. Evaluates contract EV to prevent set penalties.
                    </p>
                  </div>
                  <button
                    onClick={handleResetPolicy}
                    disabled={isResetting}
                    className="text-[11px] text-rose-400 hover:text-rose-300 border border-rose-900/50 hover:border-rose-700 bg-rose-950/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset to Baseline</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {Object.entries(policy.biddingMatrix).map(([key, val]) => (
                    <div key={key} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-amber-300 font-mono text-sm">
                          Bid {val.level} {val.contractType}
                        </span>
                        <span className="text-[10px] bg-emerald-950 border border-emerald-700/50 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                          {Math.round(val.empiricalWinRate * 100)}% Win Rate
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 space-y-0.5">
                        <div>Required HCP: <strong className="text-white">{val.minHCP} pts</strong></div>
                        <div>Required Suit Length: <strong className="text-white">{val.minSuitLength}+ cards</strong></div>
                        <div>Sample Size: <strong className="text-slate-300 font-mono">{val.sampleSize} deals</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Partnership Fit Parameters */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  <span>Partnership Fit & Distribution Points (DOP)</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">8-Trump Fit Bonus</span>
                    <strong className="text-cyan-300 font-mono text-sm">+{policy.partnershipCoefficients?.fitBonus8Trumps || 1.5} EV</strong>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Void Point Value</span>
                    <strong className="text-emerald-300 font-mono text-sm">+{policy.partnershipCoefficients?.voidBonus || 3.0} pts</strong>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Singleton Point Value</span>
                    <strong className="text-emerald-300 font-mono text-sm">+{policy.partnershipCoefficients?.singletonBonus || 2.0} pts</strong>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Partner Raise Min HCP</span>
                    <strong className="text-amber-300 font-mono text-sm">{policy.partnershipCoefficients?.supportRaiseMinHCP || 7.5} HCP</strong>
                  </div>
                </div>
              </div>

              {/* Tactical & Defensive Weights */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Tactical & Defensive Signaling Multipliers</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Partner Void Ruffing</span>
                    <strong className="text-cyan-300 font-mono text-sm">{policy.tacticalParameters?.partnerVoidLeadPriority || 2.2}x priority</strong>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Finesse Aggression</span>
                    <strong className="text-cyan-300 font-mono text-sm">{policy.tacticalParameters?.finesseAggression || 1.4}x</strong>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Trump Extraction Power</span>
                    <strong className="text-emerald-300 font-mono text-sm">{policy.tacticalParameters?.declarerTrumpDrawPower || 1.8}x</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'opening_book' && policy && (
            <div className="space-y-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    <span>Precomputed Opening Lead Master Book</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    The bot consults this table on Trick 1 for 0ms execution of optimal bridge lines.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {policy.openingBook.map((rule) => (
                    <div key={rule.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <strong className="text-emerald-300 font-semibold text-xs">{rule.name}</strong>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                            {rule.targetContract} Contracts
                          </span>
                          <span className="text-[10px] bg-cyan-950 border border-cyan-700/50 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold">
                            Weight: {rule.weight}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-400 text-[11px] mb-2 leading-relaxed">
                        {rule.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Trials: {rule.trialsCount} hands</span>
                        <span className="text-emerald-400">Winning Line: {rule.winsCount} times</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Persistent AI weights active at all live game tables</span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
