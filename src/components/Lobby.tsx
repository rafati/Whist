import React, { useState } from 'react';
import { useAuth } from '../lib/authContext.tsx';
import { useSocket } from '../lib/socketContext.tsx';
import { SimulationModal } from './SimulationModal.tsx';
import {
  Plus,
  Users,
  Play,
  LogOut,
  RefreshCw,
  HelpCircle,
  Cpu,
  Trash2,
  Zap,
  Crown,
  Trophy,
  Sparkles,
  Bot,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useSoundSetting, playClickSound } from '../lib/throwSounds.ts';

interface LobbyProps {
  onEnterRoom: (roomId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onEnterRoom }) => {
  const { user, logout } = useAuth();
  const { roomsList, refreshRoomList, deleteRoom } = useSocket();
  const [isCreating, setIsCreating] = useState(false);
  const [isQuickStarting, setIsQuickStarting] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [botSkill, setBotSkill] = useState<'super' | 'casual'>('super');
  const [showRules, setShowRules] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<{ id: string; name: string } | null>(null);
  const [soundEnabled, toggleSoundSetting] = useSoundSetting();

  // Developer-only flag to access AI Simulation Lab (?dev=true)
  const isDevMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('dev') === 'true';

  const handleQuickPlay = async () => {
    if (!user || isQuickStarting) return;
    setIsQuickStarting(true);
    try {
      const apiBase = (import.meta.env.VITE_API_URL as string) || '';
      const res = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${user.name.split(' ')[0]}'s Table`,
          hostId: user.id,
          user,
          botDifficulty: botSkill,
          autoFillBots: true,
        }),
      });
      const room = await res.json();
      onEnterRoom(room.id);
    } catch (err) {
      console.error('Failed to start quick play:', err);
    } finally {
      setIsQuickStarting(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const apiBase = (import.meta.env.VITE_API_URL as string) || '';
      const res = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoomName.trim() || `Table #${Math.floor(1000 + Math.random() * 9000)}`,
          hostId: user.id,
          user,
          botDifficulty: botSkill,
          autoFillBots: false,
        }),
      });
      const room = await res.json();
      setIsCreating(false);
      setNewRoomName('');
      onEnterRoom(room.id);
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-[#07130e] table-felt-radial flex flex-col text-slate-100 overflow-clip">
      {/* Top Header */}
      <header className="border-b border-emerald-900/50 bg-[#0b1f16]/90 backdrop-blur-md px-4 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-800 flex items-center justify-center shadow-md border border-amber-400/40 shrink-0">
            <span className="text-lg sm:text-xl font-serif-display text-amber-200 font-bold">♠</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold font-serif-display text-white tracking-wide truncate">
              Royal Whist Club
            </h1>
            <div className="text-[10px] sm:text-[11px] text-emerald-400/90 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>2v2 Partnership Trick-Taking</span>
            </div>
          </div>
        </div>

        {/* User Profile & Actions */}
        {user && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isDevMode && (
              <button
                onClick={() => setShowSimModal(true)}
                className="px-2.5 py-1.5 bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/50 rounded-xl text-xs text-cyan-200 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Developer AI Simulation Lab"
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-300" />
                <span className="hidden md:inline font-semibold">Dev Sim Lab</span>
              </button>
            )}

            <button
              onClick={() => {
                playClickSound();
                toggleSoundSetting();
              }}
              title={soundEnabled ? 'Mute Game Sound & Clicks' : 'Unmute Game Sound & Clicks'}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                soundEnabled
                  ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
                  : 'bg-red-950/40 hover:bg-red-900/50 border-red-800/70 text-red-400'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
            </button>

            <button
              onClick={() => setShowRules(true)}
              className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 rounded-xl text-xs text-emerald-200 font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>How to Play</span>
            </button>

            <div className="flex items-center gap-2.5 bg-black/40 border border-emerald-800/40 rounded-2xl px-2.5 py-1 sm:px-3 sm:py-1.5">
              <img
                src={user.avatar}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-emerald-400/50 object-cover shadow-sm shrink-0"
              />
              <div className="hidden sm:block text-left leading-tight max-w-[140px]">
                <div className="text-xs font-semibold text-white truncate">{user.name}</div>
                <div className="text-[10px] text-emerald-400/80">Ready to Play</div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-rose-950/80 border border-slate-700/60 hover:border-rose-700/60 text-slate-300 hover:text-rose-300 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 scrollable-panel max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Hero Launchpad: 1-Click Quick Play vs. Create Multiplayer Table */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-4 shrink-0">
          {/* Quick Play with Bots Card (7 cols) */}
          <div className="md:col-span-7 bg-gradient-to-br from-emerald-950/95 via-[#0c261b] to-teal-950/90 border border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-4 -bottom-6 text-8xl text-emerald-400/5 font-serif-display pointer-events-none select-none">
              ♠
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-2">
                <Zap className="w-3 h-3 fill-current" />
                <span>Instant Match • 1-Click Deal</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold font-serif-display text-white">
                Quick Play with AI Partners
              </h2>
              <p className="text-xs text-emerald-200/80 mt-1 max-w-md leading-relaxed">
                Jump straight into a 2v2 match on <strong className="text-emerald-300">Team 1</strong>. Your partner and both opponents are filled automatically and Round 1 deals immediately.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-800/50 flex flex-wrap items-center justify-between gap-3">
              {/* Bot Skill Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span>AI Skill:</span>
                </span>
                <div className="inline-flex bg-slate-950/90 p-0.5 rounded-xl border border-emerald-800/50">
                  <button
                    type="button"
                    onClick={() => setBotSkill('casual')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      botSkill === 'casual'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Casual
                  </button>
                  <button
                    type="button"
                    onClick={() => setBotSkill('super')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                      botSkill === 'super'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crown className="w-3 h-3" />
                    <span>Pro</span>
                  </button>
                </div>
              </div>

              <button
                onClick={handleQuickPlay}
                disabled={isQuickStarting}
                className="py-2.5 px-5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-950/40 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isQuickStarting ? 'Dealing Cards...' : 'Play Instant Match'}</span>
              </button>
            </div>
          </div>

          {/* Create Multiplayer Table Card (5 cols) */}
          <div className="md:col-span-5 bg-slate-950/75 border border-emerald-800/50 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-emerald-950 border border-emerald-700/50 text-emerald-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-2">
                <Users className="w-3 h-3" />
                <span>Multiplayer Lobby</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold font-serif-display text-white">
                Host a Public Table
              </h2>
              <p className="text-xs text-slate-300/80 mt-1 leading-relaxed">
                Open a custom 4-seat table for friends to join on Team 1 or Team 2, with built-in voice chat and optional AI seat fill.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end">
              <button
                id="create-room-btn"
                onClick={() => setIsCreating(true)}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Create Multiplayer Table</span>
              </button>
            </div>
          </div>
        </section>

        {/* Public Tables Section */}
        <section className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif-display text-white flex items-center gap-2">
                <span>Live Club Tables</span>
                <span className="text-xs font-mono bg-emerald-950/90 border border-emerald-700/50 text-emerald-300 px-2 py-0.5 rounded-full">
                  {roomsList.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Join an open seat with other players or spectate an active table.
              </p>
            </div>

            <button
              onClick={refreshRoomList}
              className="px-3 py-2 bg-slate-900/80 hover:bg-slate-800 border border-emerald-800/40 rounded-xl text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh Tables"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {roomsList.length === 0 ? (
              <div className="col-span-full bg-slate-950/50 border border-emerald-800/30 rounded-2xl p-8 sm:p-10 text-center">
                <Users className="w-10 h-10 text-emerald-500/50 mx-auto mb-2.5" />
                <h3 className="text-sm sm:text-base font-bold text-white mb-1">No Open Public Tables</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Use <strong className="text-amber-300">Quick Play</strong> above for an instant game with bots, or open a new public table for friends.
                </p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow cursor-pointer"
                >
                  Open First Public Table
                </button>
              </div>
            ) : (
              roomsList.map((room) => {
                const isFull = room.playersCount >= 4;
                return (
                  <div
                    key={room.id}
                    className="bg-slate-950/75 border border-emerald-800/40 hover:border-emerald-500/60 rounded-2xl p-4 shadow-lg flex flex-col justify-between transition-all group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            room.status === 'waiting'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                          }`}
                        >
                          {room.status === 'waiting' ? 'Open Seating' : 'Match in Progress'}
                        </span>

                        {/* 4 Seat Occupancy Dots */}
                        <div className="flex items-center gap-1" title={`${room.playersCount} of 4 seats occupied`}>
                          {[0, 1, 2, 3].map((idx) => (
                            <span
                              key={idx}
                              className={`w-2 h-2 rounded-full ${
                                idx < room.playersCount
                                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                                  : 'bg-slate-800 border border-slate-700'
                              }`}
                            />
                          ))}
                          <span className="text-[11px] font-mono text-slate-300 ml-1 font-bold">
                            {room.playersCount}/4
                          </span>
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors font-serif-display truncate mb-3">
                        {room.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/70">
                      <button
                        onClick={() => onEnterRoom(room.id)}
                        className="flex-1 py-2 px-3 bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isFull ? 'Enter Table' : 'Join & Pick Seat'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoomToDelete({ id: room.id, name: room.name });
                        }}
                        title="Delete Table"
                        className="p-2 bg-slate-900/80 hover:bg-rose-950/80 border border-slate-800 hover:border-rose-700/60 text-slate-500 hover:text-rose-300 rounded-xl transition-all cursor-pointer active:scale-95 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Room Creation Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-emerald-600/60 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold font-serif-display text-white mb-1">
              Create Multiplayer Table
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              Open a 4-seat partnership table. Friends can claim any seat on Team 1 or Team 2, or you can fill remaining seats with AI bots.
            </p>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1.5">Table Name</label>
                <input
                  type="text"
                  placeholder="e.g. Champions Table, Friday Night Whist"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full bg-slate-900 border border-emerald-800/60 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1.5">
                  Default AI Bot Skill (if filling empty seats)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBotSkill('casual')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      botSkill === 'casual'
                        ? 'bg-emerald-950/90 border-emerald-500 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">Casual Bots</div>
                    <div className="text-[10px] text-slate-400">Relaxed, standard bidding</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBotSkill('super')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      botSkill === 'super'
                        ? 'bg-amber-950/70 border-amber-400 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1 text-amber-300">
                      <Crown className="w-3 h-3" />
                      <span>Pro Bots</span>
                    </div>
                    <div className="text-[10px] text-slate-400">Sharp partnership tactics</div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer"
                >
                  Create & Enter Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Room Confirmation Modal */}
      {roomToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-rose-800/60 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-700/60 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Table</h3>
                <p className="text-xs text-slate-400">Close table and end active match</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">{roomToDelete.name}</strong>? Any seated players will be returned to the lobby.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRoomToDelete(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteRoom(roomToDelete.id);
                  setRoomToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer active:scale-95"
              >
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual, Scannable "How to Play" Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-950 border border-emerald-600/60 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-2xl w-full max-h-[90dvh] scrollable-panel shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold font-serif-display text-white">
                  How to Play Royal Whist
                </h3>
              </div>
              <button
                onClick={() => setShowRules(false)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 rounded-lg hover:bg-slate-900 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="bg-slate-900/70 border border-emerald-800/40 rounded-2xl p-3.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1.5">
                  <Users className="w-4 h-4" />
                  <span>1. Teams &amp; The Deal</span>
                </div>
                <p className="leading-relaxed">
                  4 players sit in two partnerships: <strong className="text-emerald-300">Team 1</strong> vs. <strong className="text-blue-300">Team 2</strong>. Your partner always sits directly across from you at the top of the table, and each player is dealt 13 cards.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-amber-700/40 rounded-2xl p-3.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm mb-1.5">
                  <Crown className="w-4 h-4" />
                  <span>2. Single-Round Auction</span>
                </div>
                <p className="leading-relaxed">
                  Each player gets <strong className="text-white">one turn</strong> to Pass or Bid from Level <strong className="text-white">1 to 7</strong> (committing to win <strong className="text-amber-300">6 + Level</strong> tricks) in either <strong className="text-white">Suit</strong> or <strong className="text-indigo-300">No Trump (NT)</strong>. NT outranks Suit at the same level. The <strong className="text-amber-300">Dealer</strong> acts last and can match the highest bid!
                </p>
              </div>

              <div className="bg-slate-900/70 border border-cyan-800/40 rounded-2xl p-3.5">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm mb-1.5">
                  <Shield className="w-4 h-4" />
                  <span>3. Trump &amp; Trick Play</span>
                </div>
                <p className="leading-relaxed">
                  In <strong className="text-white">Suit</strong> contracts, the Declarer names the Trump suit (♠ ♥ ♦ ♣) and the player to the Declarer&apos;s right leads first (in <strong className="text-indigo-300">NT</strong>, the Declarer leads first). Players <strong className="text-white">must follow the led suit</strong> if able; otherwise they may trump or discard.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-purple-800/40 rounded-2xl p-3.5">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-sm mb-1.5">
                  <Trophy className="w-4 h-4" />
                  <span>4. Scoring &amp; Victory (+11 / -11)</span>
                </div>
                <p className="leading-relaxed">
                  Make a Suit contract to score <strong className="text-emerald-300">+(Tricks - 6)</strong> pts; fail and lose <strong className="text-rose-400">-Bid Level</strong> while defenders score tricks over 6. In <strong className="text-indigo-300">No Trump (NT)</strong>, contract points and penalties are <strong className="text-amber-300">doubled (2× Level)</strong>! First team to <strong className="text-emerald-300">+11 wins</strong> (or <strong className="text-rose-400">-11 is eliminated</strong>).
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowRules(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow"
              >
                Got It, Let&apos;s Play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Developer-only AI Simulation Lab Modal */}
      {isDevMode && (
        <SimulationModal
          isOpen={showSimModal}
          onClose={() => setShowSimModal(false)}
        />
      )}
    </div>
  );
};
