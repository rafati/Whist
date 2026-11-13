import React, { useState, useEffect } from 'react';
import { Room, RoomTimingSettings, DEFAULT_ROOM_TIMING_SETTINGS, UserProfile } from '../types.ts';
import {
  Sliders,
  Clock,
  Bot,
  User,
  Zap,
  RotateCcw,
  Check,
  Lock,
  Crown,
  X,
  Gauge,
  Info,
} from 'lucide-react';
import { playClickSound } from '../lib/throwSounds.ts';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  myUser: UserProfile;
  onUpdateTimingSettings: (settings: RoomTimingSettings) => void;
}

export const TIMING_PRESET_BLITZ: RoomTimingSettings = {
  humanBidTimeSeconds: 10,
  humanDeclareTimeSeconds: 10,
  humanPlayCardTimeSeconds: 8,
  botBidDelaySeconds: 1.0,
  botDeclareDelaySeconds: 1.0,
  botPlayCardDelaySeconds: 0.5,
  trickReviewDelaySeconds: 0.5,
};

export const TIMING_PRESET_STANDARD: RoomTimingSettings = {
  humanBidTimeSeconds: 20,
  humanDeclareTimeSeconds: 20,
  humanPlayCardTimeSeconds: 15,
  botBidDelaySeconds: 2.5,
  botDeclareDelaySeconds: 2.5,
  botPlayCardDelaySeconds: 1.0,
  trickReviewDelaySeconds: 0.8,
};

export const TIMING_PRESET_RELAXED: RoomTimingSettings = {
  humanBidTimeSeconds: 35,
  humanDeclareTimeSeconds: 35,
  humanPlayCardTimeSeconds: 25,
  botBidDelaySeconds: 4.0,
  botDeclareDelaySeconds: 4.0,
  botPlayCardDelaySeconds: 2.0,
  trickReviewDelaySeconds: 1.4,
};

function matchesPreset(s: RoomTimingSettings, p: RoomTimingSettings): boolean {
  return (
    s.humanBidTimeSeconds === p.humanBidTimeSeconds &&
    s.humanDeclareTimeSeconds === p.humanDeclareTimeSeconds &&
    s.humanPlayCardTimeSeconds === p.humanPlayCardTimeSeconds &&
    Math.abs(s.botBidDelaySeconds - p.botBidDelaySeconds) < 0.05 &&
    Math.abs(s.botDeclareDelaySeconds - p.botDeclareDelaySeconds) < 0.05 &&
    Math.abs(s.botPlayCardDelaySeconds - p.botPlayCardDelaySeconds) < 0.05 &&
    Math.abs((s.trickReviewDelaySeconds ?? 0.8) - (p.trickReviewDelaySeconds ?? 0.8)) < 0.05
  );
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  room,
  myUser,
  onUpdateTimingSettings,
}) => {
  const [settings, setSettings] = useState<RoomTimingSettings>({
    ...DEFAULT_ROOM_TIMING_SETTINGS,
    ...(room.timingSettings || {}),
  });

  const [hasSaved, setHasSaved] = useState(false);

  // Synchronize ONLY when the modal is opened!
  // Prevents active WebSocket game ticks from resetting sliders while the user is adjusting them.
  useEffect(() => {
    if (isOpen) {
      const initial = room.timingSettings || DEFAULT_ROOM_TIMING_SETTINGS;
      setSettings({
        ...DEFAULT_ROOM_TIMING_SETTINGS,
        ...initial,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine if the current user is the creator/host of this specific game
  const isHost =
    room.hostId === myUser.id ||
    room.hostId === 'system' ||
    Object.values(room.seats).filter((p) => p && !p.isBot).length <= 1;

  // Strict preset detection: matches ONLY if all 7 sliders match the preset
  const activePreset = matchesPreset(settings, TIMING_PRESET_BLITZ)
    ? 'blitz'
    : matchesPreset(settings, TIMING_PRESET_STANDARD)
    ? 'standard'
    : matchesPreset(settings, TIMING_PRESET_RELAXED)
    ? 'relaxed'
    : 'custom';

  const handlePresetSelect = (preset: 'blitz' | 'standard' | 'relaxed') => {
    if (!isHost) return;
    playClickSound();

    if (preset === 'blitz') {
      setSettings({ ...TIMING_PRESET_BLITZ });
    } else if (preset === 'standard') {
      setSettings({ ...TIMING_PRESET_STANDARD });
    } else if (preset === 'relaxed') {
      setSettings({ ...TIMING_PRESET_RELAXED });
    }
  };

  const handleReset = () => {
    if (!isHost) return;
    playClickSound();
    setSettings({ ...DEFAULT_ROOM_TIMING_SETTINGS });
  };

  const handleSave = () => {
    if (!isHost) return;
    playClickSound();
    onUpdateTimingSettings(settings);
    setHasSaved(true);
    setTimeout(() => {
      setHasSaved(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-slate-950 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-emerald-800/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-700/60 text-emerald-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white font-serif-display leading-tight flex items-center gap-1.5">
                Game Delays & Timers
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
                Room: <span className="text-emerald-300 font-bold">{room.name}</span> (This Game Only)
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Creator Permission Status Banner */}
        <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-900/40">
          {isHost ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Room Creator Control:</strong> Changes apply instantly to all players and bots in this table.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Host Only (View Mode):</strong> Only the creator of this game can modify timing settings.
              </span>
            </div>
          )}
        </div>

        {/* Scrollable Settings Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3 h-3 text-emerald-400" />
                <span>Quick Speed Presets</span>
                {activePreset === 'custom' && (
                  <span className="px-1.5 py-0.2 rounded-md bg-purple-950/80 border border-purple-600/70 text-purple-300 text-[9px] font-mono font-bold tracking-normal">
                    Custom Tuning
                  </span>
                )}
              </span>
              {isHost && (
                <button
                  onClick={handleReset}
                  className="text-[10px] text-slate-400 hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer transition-colors"
                  title="Reset to default values"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Default
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => handlePresetSelect('blitz')}
                className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  activePreset === 'blitz'
                    ? 'bg-amber-950/90 border-amber-500 text-amber-300 font-bold shadow-md ring-1 ring-amber-500/50'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                } ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>⚡ Blitz</span>
                </div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5">Fast (8-10s)</div>
              </button>

              <button
                type="button"
                disabled={!isHost}
                onClick={() => handlePresetSelect('standard')}
                className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  activePreset === 'standard'
                    ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 font-bold shadow-md ring-1 ring-emerald-500/50'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                } ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <span>⚖️ Balanced</span>
                </div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5">Standard (15-20s)</div>
              </button>

              <button
                type="button"
                disabled={!isHost}
                onClick={() => handlePresetSelect('relaxed')}
                className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  activePreset === 'relaxed'
                    ? 'bg-blue-950/90 border-blue-500 text-blue-300 font-bold shadow-md ring-1 ring-blue-500/50'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                } ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <span>🐢 Relaxed</span>
                </div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5">Leisure (25-35s)</div>
              </button>
            </div>
          </div>

          {/* Section 1: Human Player Allowed Times */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <User className="w-3.5 h-3.5" />
              <span>Human Player Allowed Timeouts</span>
              <span className="text-[10px] text-slate-400 font-normal">(Auto-plays on timeout)</span>
            </div>

            {/* Human Bid Allowed Time */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Bidding Turn Time</label>
                <span className="font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                  {settings.humanBidTimeSeconds}s
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                disabled={!isHost}
                value={settings.humanBidTimeSeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    humanBidTimeSeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Fast: 5s</span>
                <span>Default: 20s</span>
                <span>60s</span>
              </div>
            </div>

            {/* Human Trump Declaration Time */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Name Trump Suit Time</label>
                <span className="font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                  {settings.humanDeclareTimeSeconds}s
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                disabled={!isHost}
                value={settings.humanDeclareTimeSeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    humanDeclareTimeSeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Fast: 5s</span>
                <span>Default: 20s</span>
                <span>60s</span>
              </div>
            </div>

            {/* Human Card Play Time */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Card Play Turn Time</label>
                <span className="font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                  {settings.humanPlayCardTimeSeconds}s
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                disabled={!isHost}
                value={settings.humanPlayCardTimeSeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    humanPlayCardTimeSeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Fast: 5s</span>
                <span>Default: 15s</span>
                <span>60s</span>
              </div>
            </div>
          </div>

          {/* Section 2: AI Bot Thinking Delays */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Bot className="w-3.5 h-3.5" />
              <span>AI Bot Thinking Delays</span>
              <span className="text-[10px] text-slate-400 font-normal">(Natural simulation delays)</span>
            </div>

            {/* Bot Bidding Delay */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Bot Bidding Delay</label>
                <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                  {settings.botBidDelaySeconds}s
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="8.0"
                step="0.1"
                disabled={!isHost}
                value={settings.botBidDelaySeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    botBidDelaySeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Instant: 0.2s</span>
                <span>Default: 2.5s</span>
                <span>8.0s</span>
              </div>
            </div>

            {/* Bot Trump Declaration Delay */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Bot Name Trump Delay</label>
                <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                  {settings.botDeclareDelaySeconds}s
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="8.0"
                step="0.1"
                disabled={!isHost}
                value={settings.botDeclareDelaySeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    botDeclareDelaySeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Instant: 0.2s</span>
                <span>Default: 2.5s</span>
                <span>8.0s</span>
              </div>
            </div>

            {/* Bot Card Play Delay */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Bot Card Play Delay</label>
                <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                  {settings.botPlayCardDelaySeconds}s
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5.0"
                step="0.1"
                disabled={!isHost}
                value={settings.botPlayCardDelaySeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    botPlayCardDelaySeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Instant: 0.2s</span>
                <span>Default: 1.0s</span>
                <span>5.0s</span>
              </div>
            </div>
          </div>

          {/* Section 3: Trick Clear / Visual Review Delay */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Completed Trick Review Pause</span>
            </div>
            <p className="text-[10px] text-slate-400">
              How long all 4 cards remain in the center of the table before being swept into the winner's pile.
            </p>

            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-300 font-medium">Trick Review Pause</label>
                <span className="font-mono font-bold text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
                  {settings.trickReviewDelaySeconds}s
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="3.0"
                step="0.1"
                disabled={!isHost}
                value={settings.trickReviewDelaySeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    trickReviewDelaySeconds: Number(e.target.value),
                  }))
                }
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Fast: 0.3s</span>
                <span>Default: 0.8s</span>
                <span>Slow: 3.0s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Info className="w-3 h-3 text-slate-500" />
            <span>Settings apply to this table only.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
            >
              Close
            </button>

            {isHost && (
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                {hasSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Applied!</span>
                  </>
                ) : (
                  <span>Save & Apply</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
