import React from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Radio, AlertCircle, Loader2 } from 'lucide-react';
import { VoicePeer } from '../types.ts';

interface VoiceChatBarProps {
  isInVoice: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  permissionError: string | null;
  clearPermissionError: () => void;
  peers: VoicePeer[];
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({
  isInVoice,
  isConnecting,
  isMuted,
  isDeafened,
  isSpeaking,
  permissionError,
  clearPermissionError,
  peers,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
}) => {
  const totalInVoice = isInVoice ? peers.length + 1 : peers.length;

  return (
    <>
      {/* Microphone Permission Error Toast */}
      {permissionError && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-rose-950 border border-rose-600/80 text-rose-200 text-xs px-3.5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 max-w-md w-[90%] backdrop-blur-md animate-bounce">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="flex-1 text-[11px] leading-tight">{permissionError}</span>
          <button
            onClick={clearPermissionError}
            className="text-rose-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded-md hover:bg-rose-900 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Voice Controls Header Widget */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {!isInVoice ? (
          /* Join Voice Button */
          <button
            onClick={onJoinVoice}
            disabled={isConnecting}
            className={`py-1 px-2 sm:px-2.5 rounded-lg border font-medium text-[11px] sm:text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95 ${
              isConnecting
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                : 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500/80 text-white hover:shadow-emerald-900/50'
            }`}
            title="Join Table Voice Chat (Open mic with other players)"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                <span className="hidden sm:inline">Connecting Mic...</span>
              </>
            ) : (
              <>
                <div className="relative flex items-center justify-center">
                  <Mic className="w-3.5 h-3.5 text-emerald-100" />
                  {peers.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </div>
                <span className="hidden sm:inline">Voice Chat</span>
                {peers.length > 0 && (
                  <span className="text-[10px] bg-emerald-900/90 text-emerald-200 px-1 rounded-full font-mono font-bold">
                    {peers.length}
                  </span>
                )}
              </>
            )}
          </button>
        ) : (
          /* Active Voice Dock */
          <div className="flex items-center gap-1 bg-slate-950/80 border border-emerald-600/60 rounded-xl px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-md backdrop-blur-md">
            {/* Live Indicator Pill */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold ${
                isSpeaking
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                  : 'bg-slate-900 text-slate-300'
              }`}
              title={`${totalInVoice} player(s) in voice channel`}
            >
              <Radio
                className={`w-3 h-3 ${
                  isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-emerald-500'
                }`}
              />
              <span className="font-mono text-[10px] hidden md:inline">
                {isSpeaking ? 'Speaking...' : `Voice (${totalInVoice})`}
              </span>
              <span className="font-mono text-[10px] md:hidden">
                {totalInVoice}
              </span>
            </div>

            {/* Mute Mic Button */}
            <button
              onClick={onToggleMute}
              className={`p-1 sm:p-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 ${
                isMuted
                  ? 'bg-rose-950/90 border-rose-700/80 text-rose-300 hover:bg-rose-900'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-emerald-400 hover:text-emerald-300'
              }`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            {/* Deafen Button */}
            <button
              onClick={onToggleDeafen}
              className={`p-1 sm:p-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 ${
                isDeafened
                  ? 'bg-rose-950/90 border-rose-700/80 text-rose-300 hover:bg-rose-900'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={isDeafened ? 'Undeafen Audio' : 'Deafen (Mute incoming voice)'}
            >
              <Headphones className={`w-3.5 h-3.5 ${isDeafened ? 'line-through text-rose-400' : ''}`} />
            </button>

            {/* Leave Voice Button */}
            <button
              onClick={onLeaveVoice}
              className="p-1 sm:p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-300 transition-all cursor-pointer active:scale-95"
              title="Disconnect from voice chat"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};
