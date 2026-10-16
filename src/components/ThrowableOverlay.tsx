import React, { useEffect, useState, useRef } from 'react';
import { Seat, ThrowableObjectType, ThrownObjectEvent } from '../types.ts';
import { ANIMATION_CONFIG } from '../logic/animationConfig.ts';
import { playThrowSound, playHitSound } from '../lib/throwSounds.ts';

interface ActiveFlight {
  id: string;
  fromSeat: Seat;
  toSeat: Seat;
  objectType: ThrowableObjectType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTime: number;
}

interface ActiveImpact {
  id: string;
  seat: Seat;
  objectType: ThrowableObjectType;
  x: number;
  y: number;
  bubbleText: string;
  timestamp: number;
}

interface ThrowableOverlayProps {
  activeEvents: ThrownObjectEvent[];
  onTriggerRecoil?: (seat: Seat) => void;
}

export const ThrowableOverlay: React.FC<ThrowableOverlayProps> = ({
  activeEvents,
  onTriggerRecoil,
}) => {
  const [flights, setFlights] = useState<ActiveFlight[]>([]);
  const [impacts, setImpacts] = useState<ActiveImpact[]>([]);
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // Helper to get screen center of a seat
  const getSeatCenter = (seat: Seat, isOrigin = false): { x: number; y: number } => {
    if (isOrigin) {
      const dockEl = document.querySelector('[data-throw-dock]');
      if (dockEl) {
        const rect = dockEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }
      }
    }

    const el = document.querySelector(`[data-throw-seat="${seat}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }

    // Reliable cardinal geometry fallbacks (relative to viewport)
    const w = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const h = typeof window !== 'undefined' ? window.innerHeight : 700;
    if (seat === 'North') return { x: w * 0.5, y: h * 0.14 };
    if (seat === 'South') return { x: w * 0.5, y: h * 0.86 };
    if (seat === 'West') return { x: w * 0.14, y: h * 0.48 };
    if (seat === 'East') return { x: w * 0.86, y: h * 0.48 };

    return { x: w / 2, y: h / 2 };
  };

  // Process incoming thrown object events
  useEffect(() => {
    activeEvents.forEach((ev) => {
      if (processedEventIdsRef.current.has(ev.id)) return;
      processedEventIdsRef.current.add(ev.id);

      const start = getSeatCenter(ev.fromSeat, true);
      const end = getSeatCenter(ev.toSeat, false);

      const flight: ActiveFlight = {
        id: ev.id,
        fromSeat: ev.fromSeat,
        toSeat: ev.toSeat,
        objectType: ev.objectType,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        startTime: performance.now(),
      };

      setFlights((prev) => [...prev, flight]);
      playThrowSound();

      // Schedule impact
      setTimeout(() => {
        // Trigger avatar recoil
        onTriggerRecoil?.(ev.toSeat);
        playHitSound(ev.objectType);

        // Generate context-aware humorous response bubbles
        let bubbleText = 'Ouch!';
        if (ev.objectType === 'shoe') {
          const shoeReplies = ['Hey! 👞', 'Ouch!', 'My face!', 'Why the boot?!'];
          bubbleText = shoeReplies[Math.floor(Math.random() * shoeReplies.length)];
        } else if (ev.objectType === 'beer') {
          const beerReplies = ['Cheers! 🍻', 'Refreshing!', 'Thanks for the drink!', 'Ahhh!'];
          bubbleText = beerReplies[Math.floor(Math.random() * beerReplies.length)];
        } else if (ev.objectType === 'medal') {
          const medalReplies = ['Champion! 🥇', 'Honored!', 'Thank you!', 'MVP!'];
          bubbleText = medalReplies[Math.floor(Math.random() * medalReplies.length)];
        }

        const latestTargetPos = getSeatCenter(ev.toSeat, false);
        const impact: ActiveImpact = {
          id: `impact_${ev.id}`,
          seat: ev.toSeat,
          objectType: ev.objectType,
          x: latestTargetPos.x,
          y: latestTargetPos.y,
          bubbleText,
          timestamp: Date.now(),
        };

        setFlights((prev) => prev.filter((f) => f.id !== ev.id));
        setImpacts((prev) => [...prev, impact]);

        // Clean up impact after animation duration
        setTimeout(() => {
          setImpacts((prev) => prev.filter((i) => i.id !== impact.id));
        }, ANIMATION_CONFIG.THROW_HIT_DURATION_MS);
      }, ANIMATION_CONFIG.THROW_FLIGHT_DURATION_MS);
    });
  }, [activeEvents, onTriggerRecoil]);

  // Projectile animation frame ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    if (flights.length === 0) return;
    let animId: number;
    const update = () => {
      setTick((t) => t + 1);
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [flights.length]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden select-none">
      {/* 1. Flying Projectiles */}
      {flights.map((f) => {
        const elapsed = performance.now() - f.startTime;
        const progress = Math.min(1, Math.max(0, elapsed / ANIMATION_CONFIG.THROW_FLIGHT_DURATION_MS));

        // Parabolic Bezier trajectory: arc upward along midpoint
        const arcHeight = Math.min(140, Math.max(70, Math.hypot(f.endX - f.startX, f.endY - f.startY) * 0.25));
        const currentX = f.startX + (f.endX - f.startX) * progress;
        const currentY =
          f.startY + (f.endY - f.startY) * progress - 4 * arcHeight * progress * (1 - progress);

        // Rotation kinematics
        let rotationDeg = 0;
        let scale = 1.0;
        if (f.objectType === 'shoe') {
          rotationDeg = progress * 720;
          scale = 1.0 + Math.sin(progress * Math.PI) * 0.4;
        } else if (f.objectType === 'beer') {
          rotationDeg = progress * 360;
          scale = 1.0 + Math.sin(progress * Math.PI) * 0.35;
        } else if (f.objectType === 'medal') {
          rotationDeg = Math.sin(progress * Math.PI * 4) * 20;
          scale = 1.0 + Math.sin(progress * Math.PI) * 0.45;
        }

        const symbol = f.objectType === 'shoe' ? '👞' : f.objectType === 'beer' ? '🍾' : '🥇';

        return (
          <div
            key={f.id}
            className="absolute will-change-transform pointer-events-none"
            style={{
              left: `${currentX}px`,
              top: `${currentY}px`,
              transform: `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${scale})`,
            }}
          >
            {/* Projectile Particle Trail */}
            <div className="relative flex items-center justify-center">
              <span className="text-3xl sm:text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
                {symbol}
              </span>

              {/* Sparkling / Bubbling Trail */}
              {f.objectType === 'medal' && (
                <div className="absolute inset-0 -z-10 animate-ping opacity-60">
                  <div className="w-8 h-8 rounded-full bg-yellow-400 blur-sm" />
                </div>
              )}
              {f.objectType === 'beer' && (
                <div className="absolute -bottom-2 -left-2 text-[10px] animate-bounce opacity-70">
                  🫧
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* 2. Hit Impacts & Reaction Bubbles */}
      {impacts.map((imp) => {
        return (
          <div
            key={imp.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${imp.x}px`, top: `${imp.y}px` }}
          >
            {/* Distinct Impact Particle Burst */}
            {imp.objectType === 'shoe' && (
              <div className="relative flex items-center justify-center">
                {/* Comic Dust Ring */}
                <div className="w-16 h-16 rounded-full border-4 border-amber-500/80 animate-ping opacity-60" />
                {/* Dazed Rotating Stars */}
                <div className="absolute -top-6 flex items-center gap-1 text-sm animate-spin [animation-duration:2s]">
                  <span>💫</span>
                  <span>⭐</span>
                  <span>💫</span>
                </div>
              </div>
            )}

            {imp.objectType === 'beer' && (
              <div className="relative flex items-center justify-center">
                {/* Foaming Splash Shockwave */}
                <div className="w-20 h-20 rounded-full bg-emerald-400/30 border-2 border-emerald-300 animate-ping opacity-70" />
                {/* Foam / Splash Sprays */}
                <div className="absolute -top-4 flex items-center gap-1.5 text-base animate-bounce">
                  <span>🍺</span>
                  <span>💦</span>
                  <span>🫧</span>
                </div>
              </div>
            )}

            {imp.objectType === 'medal' && (
              <div className="relative flex items-center justify-center">
                {/* Golden Victory Halo */}
                <div className="w-24 h-24 rounded-full bg-yellow-400/30 border-2 border-yellow-300 shadow-[0_0_25px_rgba(250,204,21,0.9)] animate-ping opacity-80" />
                {/* Confetti & Golden Sparkles */}
                <div className="absolute -top-7 flex items-center gap-1 text-lg animate-pulse">
                  <span>✨</span>
                  <span>🎉</span>
                  <span>✨</span>
                </div>
              </div>
            )}

            {/* Avatar Reaction Speech Bubble */}
            <div className="mt-1 animate-in fade-in zoom-in-75 slide-in-from-bottom-2 duration-200">
              <span
                className={`
                  font-black text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full shadow-2xl border flex items-center gap-1 whitespace-nowrap
                  ${
                    imp.objectType === 'shoe'
                      ? 'bg-amber-950 text-amber-200 border-amber-500'
                      : imp.objectType === 'beer'
                      ? 'bg-emerald-950 text-emerald-200 border-emerald-400'
                      : 'bg-yellow-950 text-yellow-200 border-yellow-400'
                  }
                `}
              >
                {imp.bubbleText}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
