import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../lib/authContext.tsx';
import { AlertCircle, Sparkles, Users, Trophy, Mic, Play, ArrowRight } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

export const GoogleAuthScreen: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [gisRendered, setGisRendered] = useState(false);
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [fallbackName, setFallbackName] = useState('');
  const btnContainerRef = useRef<HTMLDivElement>(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    const handleCredentialResponse = (response: any) => {
      try {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const data = JSON.parse(jsonPayload);

        loginWithGoogle({
          sub: data.sub,
          name: data.name || 'Card Player',
          email: data.email || 'player@google.com',
          avatar: data.picture,
        });
      } catch (err) {
        console.error('Credential parse error:', err);
        setAuthError('Unable to verify sign-in credentials. Please try again or enter a display name.');
      }
    };

    let intervalId: NodeJS.Timeout;

    const setupGoogleId = () => {
      if (window.google?.accounts?.id && clientId && clientId.trim() !== '') {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId.trim(),
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: false,
            itp_support: true,
          });

          if (btnContainerRef.current) {
            btnContainerRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(btnContainerRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular',
              logo_alignment: 'left',
              width: 280,
            });
            setGisRendered(true);
          }
          return true;
        } catch (e) {
          console.warn('Google Identity Services init warning:', e);
          return false;
        }
      }
      return false;
    };

    const initialized = setupGoogleId();
    if (!initialized) {
      let attempts = 0;
      intervalId = setInterval(() => {
        attempts++;
        if (setupGoogleId() || attempts >= 8) {
          clearInterval(intervalId);
        }
      }, 400);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (window.google?.accounts?.id?.cancel) {
        try {
          window.google.accounts.id.cancel();
        } catch {
          // cleanup
        }
      }
    };
  }, [clientId, loginWithGoogle]);

  const handleManualGoogleClick = () => {
    setShowFallbackModal(true);
  };

  const handleFallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fallbackName.trim() || 'Royal Player';
    const cleanEmail = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@club.local`;
    const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=0f766e,1e40af,b91c1c`;

    loginWithGoogle({
      sub: `user_${cleanName.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: cleanName,
      email: cleanEmail,
      avatar,
    });
  };

  return (
    <div className="h-[100dvh] w-full bg-[#07130e] table-felt-radial flex justify-center p-3 sm:p-4 scrollable-panel">
      <div className="max-w-md w-full bg-[#0b1f16]/95 border border-emerald-700/50 rounded-3xl shadow-2xl p-5 sm:p-8 backdrop-blur-md my-auto relative overflow-hidden">
        {/* Subtle decorative suit watermark */}
        <div className="absolute -top-6 -right-4 text-8xl text-emerald-500/5 font-serif-display pointer-events-none select-none">
          ♠
        </div>

        {/* Game Emblem */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-700 to-teal-900 flex items-center justify-center shadow-xl shadow-emerald-950/70 border border-amber-400/40 relative">
            <span className="text-3xl text-amber-300 font-serif-display font-bold drop-shadow">♠</span>
            <span className="absolute -bottom-1.5 -right-1.5 bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow">
              2v2
            </span>
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="text-center mb-5">
          <h1
            className="font-serif-display font-bold text-white"
            style={{ fontSize: 'clamp(1.35rem, 1.1rem + 1vw, 1.75rem)' }}
          >
            تدفيع الثمن
          </h1>
          <p className="text-xs sm:text-sm text-emerald-300/90 mt-1">
            4-Player Partnership Bidding & Trick-Taking Card Game
          </p>
        </div>

        {/* Player Value Highlights */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-2xl p-2.5 text-center">
            <Users className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <div className="text-[11px] font-bold text-white leading-tight">2v2 Teams</div>
            <div className="text-[9px] text-emerald-300/70 mt-0.5">Friends or AI</div>
          </div>
          <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-2xl p-2.5 text-center">
            <Trophy className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <div className="text-[11px] font-bold text-white leading-tight">Race to +10</div>
            <div className="text-[9px] text-emerald-300/70 mt-0.5">Suit & No-Trump</div>
          </div>
          <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-2xl p-2.5 text-center">
            <Mic className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
            <div className="text-[11px] font-bold text-white leading-tight">Table Voice</div>
            <div className="text-[9px] text-emerald-300/70 mt-0.5">Live WebRTC</div>
          </div>
        </div>

        {authError && (
          <div className="bg-rose-950/70 border border-rose-800/50 text-rose-200 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{authError}</span>
          </div>
        )}

        {/* Primary Sign-In Actions */}
        <div className="flex flex-col items-center justify-center gap-3 my-2">
          <div ref={btnContainerRef} id="google-signin-btn-container" className="flex justify-center" />

          {!gisRendered && (
            <button
              id="google-signin-primary-btn"
              onClick={handleManualGoogleClick}
              className="w-full max-w-[280px] h-11 bg-white hover:bg-slate-50 text-slate-900 font-semibold text-sm rounded-xl shadow-lg border border-slate-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowFallbackModal(true)}
            className="w-full max-w-[280px] h-10 bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-600/40 text-emerald-200 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
            <span>Quick Play with Display Name</span>
          </button>
        </div>

        {/* Display Name Modal */}
        {showFallbackModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-950 border border-emerald-600/60 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-150">
              <h3 className="text-base font-bold font-serif-display text-white mb-1">
                Choose Your Table Name
              </h3>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Enter the display name other players and your partner will see at the card table:
              </p>
              <form onSubmit={handleFallbackSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1.5 font-medium">Player Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Miller"
                    value={fallbackName}
                    onChange={(e) => setFallbackName(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-700/70 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowFallbackModal(false)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Enter Club Lobby</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-emerald-900/40 text-center">
          <div className="text-[11px] text-emerald-300/60">
            Playable on Desktop & Mobile Landscape • Instant Reconnect
          </div>
        </div>
      </div>
    </div>
  );
};
