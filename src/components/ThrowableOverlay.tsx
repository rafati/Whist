import React, { useEffect, useState, useRef } from 'react';
import { Seat, ThrowableObjectType, ThrownObjectEvent } from '../types.ts';
import { ANIMATION_CONFIG } from '../logic/animationConfig.ts';
import { playThrowSound, playHitSound } from '../lib/throwSounds.ts';
import { getPartner, getNextSeat, getPrevSeat } from '../logic/gameLogic.ts';
import {
  ThrowableItemGraphic,
  BootArt,
  BootPrintArt,
  BeerBottleArt,
  GoldMedalArt,
  ComicImpactBurstArt,
  SunburstRaysArt,
} from './ThrowableArts.tsx';

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
  reboundDir: 1 | -1;
  bubbleText: string;
  startTime: number;
}

interface ThrowableOverlayProps {
  mySeat: Seat | null;
  activeEvents: ThrownObjectEvent[];
  onTriggerRecoil?: (seat: Seat) => void;
}

// Pre-computed deterministic splash & confetti particle vectors for 60fps impact choreography
const BEER_SPLASH_PARTICLES = Array.from({ length: 14 }).map((_, i) => {
  const angle = -Math.PI * 0.88 + (i / 13) * Math.PI * 0.76;
  const speed = 52 + (i % 4) * 18;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 24,
    size: i % 2 === 0 ? 10 : 7,
    isFoam: i % 3 !== 0,
  };
});

const CONFETTI_PARTICLES = Array.from({ length: 16 }).map((_, i) => {
  const angle = -Math.PI + (i / 15) * Math.PI;
  const spreadX = Math.cos(angle) * (48 + (i % 3) * 20);
  const initialUpY = -36 - (i % 4) * 14;
  const colors = ['#facc15', '#ef4444', '#38bdf8', '#34d399', '#f472b6', '#fb923c'];
  return {
    spreadX,
    initialUpY,
    color: colors[i % colors.length],
    swayPhase: i * 0.9,
    rotSpeed: (i % 2 === 0 ? 1 : -1) * (240 + (i % 3) * 90),
  };
});

function computeParabolaPoint(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  arcHeight: number,
  t: number
) {
  const clamped = Math.min(1, Math.max(0, t));
  // Slight ease-in-out cubic shaping for organic throw acceleration & landing
  const eased =
    clamped < 0.15
      ? (clamped / 0.15) * 0.13
      : 0.13 + ((clamped - 0.15) / 0.85) * 0.87;
  const groundX = startX + (endX - startX) * eased;
  const groundY = startY + (endY - startY) * eased;
  const elevation = 4 * arcHeight * eased * (1 - eased);
  return {
    x: groundX,
    y: groundY - elevation,
    groundX,
    groundY,
    elevation,
    eased,
  };
}

export const ThrowableOverlay: React.FC<ThrowableOverlayProps> = ({
  mySeat,
  activeEvents,
  onTriggerRecoil,
}) => {
  const [flights, setFlights] = useState<ActiveFlight[]>([]);
  const [impacts, setImpacts] = useState<ActiveImpact[]>([]);
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // Calculates seat screen coordinates dynamically relative to THIS device's seat rotation (mySeat)
  const getSeatCenter = (seat: Seat, isSource: boolean): { x: number; y: number } => {
    const isLocalUserSeat = Boolean(mySeat && seat === mySeat);

    // 1. If THIS local player is the one throwing, originate from the throw dock on the right of their console
    if (isSource && isLocalUserSeat) {
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

    // 2. Query DOM for the actual visual seat element tagged on this screen
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

    // 3. Fallback: Geometry dynamically rotated for this device's seat perspective
    const bottomSeat: Seat = mySeat || 'South';
    const topSeat: Seat = mySeat ? getPartner(mySeat) : 'North';
    const leftSeat: Seat = mySeat ? getPrevSeat(mySeat) : 'West';
    const rightSeat: Seat = mySeat ? getNextSeat(mySeat) : 'East';

    let visualPos: 'bottom' | 'top' | 'left' | 'right' = 'bottom';
    if (seat === bottomSeat) visualPos = 'bottom';
    else if (seat === topSeat) visualPos = 'top';
    else if (seat === leftSeat) visualPos = 'left';
    else visualPos = 'right';

    const w = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const h = typeof window !== 'undefined' ? window.innerHeight : 700;

    switch (visualPos) {
      case 'bottom':
        return { x: w * 0.5, y: Math.min(h - 50, h * 0.88) };
      case 'top':
        return { x: w * 0.5, y: Math.max(50, h * 0.12) };
      case 'left':
        return { x: Math.max(50, w * 0.12), y: h * 0.48 };
      case 'right':
        return { x: Math.min(w - 50, w * 0.88), y: h * 0.48 };
    }
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

      // Schedule impact when flight reaches target
      setTimeout(() => {
        onTriggerRecoil?.(ev.toSeat);
        playHitSound(ev.objectType);

        let bubbleText = 'Ouch!';
        if (ev.objectType === 'shoe') {
          const shoeReplies = ['Ouch! 👞', 'Hey! Watch it!', 'My head! 💫', 'Not the boot!'];
          bubbleText = shoeReplies[Math.floor(Math.random() * shoeReplies.length)];
        } else if (ev.objectType === 'beer') {
          const beerReplies = ['Cheers! 🍻', 'Refreshing!', 'Soaked! 💦', 'Thanks for the brew!'];
          bubbleText = beerReplies[Math.floor(Math.random() * beerReplies.length)];
        } else if (ev.objectType === 'medal') {
          const medalReplies = ['Champion! 🥇', 'Honored! ✨', 'MVP!', 'Pure Gold! 🏆'];
          bubbleText = medalReplies[Math.floor(Math.random() * medalReplies.length)];
        }

        const latestTargetPos = getSeatCenter(ev.toSeat, false);
        const reboundDir: 1 | -1 = end.x >= start.x ? 1 : -1;

        const impact: ActiveImpact = {
          id: `impact_${ev.id}`,
          seat: ev.toSeat,
          objectType: ev.objectType,
          x: latestTargetPos.x,
          y: latestTargetPos.y,
          reboundDir,
          bubbleText,
          startTime: performance.now(),
        };

        setFlights((prev) => prev.filter((f) => f.id !== ev.id));
        setImpacts((prev) => [...prev, impact]);

        setTimeout(() => {
          setImpacts((prev) => prev.filter((i) => i.id !== impact.id));
        }, ANIMATION_CONFIG.THROW_HIT_DURATION_MS);
      }, ANIMATION_CONFIG.THROW_FLIGHT_DURATION_MS);
    });
  }, [activeEvents, onTriggerRecoil]);

  // 60fps animation frame loop active during both flights and physics impacts
  const [, setTick] = useState(0);
  const isAnimating = flights.length > 0 || impacts.length > 0;

  useEffect(() => {
    if (!isAnimating) return;
    let animId: number;
    const update = () => {
      setTick((t) => t + 1);
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [isAnimating]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden select-none">
      {/* 1. Flying Projectiles, Separated Ground Shadows & Wake Trails */}
      {flights.map((f) => {
        const elapsed = performance.now() - f.startTime;
        const progress = Math.min(1, Math.max(0, elapsed / ANIMATION_CONFIG.THROW_FLIGHT_DURATION_MS));
        const dist = Math.hypot(f.endX - f.startX, f.endY - f.startY);
        const arcHeight = Math.min(165, Math.max(82, dist * 0.28));

        const pos = computeParabolaPoint(f.startX, f.startY, f.endX, f.endY, arcHeight, progress);

        // Rotation & 3D depth scaling kinematics
        let rotationDeg = 0;
        let scale = 1.0;
        if (f.objectType === 'shoe') {
          // Anticipation wind-back in first 10%, then rapid 900-degree end-over-end tumble
          rotationDeg = progress < 0.1 ? -28 * (progress / 0.1) : -28 + ((progress - 0.1) / 0.9) * 900;
          scale = 0.92 + Math.sin(progress * Math.PI) * 0.48;
        } else if (f.objectType === 'beer') {
          rotationDeg = progress * 540;
          scale = 0.92 + Math.sin(progress * Math.PI) * 0.42;
        } else if (f.objectType === 'medal') {
          rotationDeg = Math.sin(progress * Math.PI * 3.5) * 24;
          scale = 0.9 + Math.sin(progress * Math.PI) * 0.52;
        }

        // Ground shadow scale shrinks and softens as projectile rises higher above the felt
        const heightRatio = arcHeight > 0 ? pos.elevation / arcHeight : 0;
        const shadowScale = 1.05 - heightRatio * 0.55;
        const shadowOpacity = 0.45 - heightRatio * 0.25;

        // 5 trailing wake positions along the exact flight trajectory
        const trailOffsets = [0.04, 0.08, 0.125, 0.17, 0.22];

        return (
          <React.Fragment key={f.id}>
            {/* A. Separated Table-Felt Ground Shadow */}
            <div
              className="absolute rounded-full bg-black pointer-events-none will-change-transform"
              style={{
                left: `${pos.groundX}px`,
                top: `${pos.groundY + 18}px`,
                width: '38px',
                height: '13px',
                opacity: Math.max(0.1, shadowOpacity),
                filter: `blur(${3 + heightRatio * 5}px)`,
                transform: `translate(-50%, -50%) scale(${shadowScale})`,
              }}
            />

            {/* B. Multi-Point Particle Wake Trail */}
            {trailOffsets.map((offset, idx) => {
              const trailT = progress - offset;
              if (trailT <= 0.02) return null;
              const tp = computeParabolaPoint(f.startX, f.startY, f.endX, f.endY, arcHeight, trailT);
              const trailDecay = 1 - idx / trailOffsets.length;

              if (f.objectType === 'shoe') {
                return (
                  <div
                    key={idx}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      left: `${tp.x}px`,
                      top: `${tp.y}px`,
                      width: `${16 * trailDecay + 5}px`,
                      height: `${16 * trailDecay + 5}px`,
                      background: 'radial-gradient(circle, rgba(217,119,6,0.55) 0%, rgba(120,53,15,0) 75%)',
                      opacity: trailDecay * 0.75,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              }

              if (f.objectType === 'beer') {
                return (
                  <div
                    key={idx}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      left: `${tp.x + (idx % 2 === 0 ? 5 : -5)}px`,
                      top: `${tp.y + (idx % 2 === 0 ? -4 : 4)}px`,
                      width: `${10 * trailDecay + 4}px`,
                      height: `${10 * trailDecay + 4}px`,
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fbbf24',
                      boxShadow: '0 0 8px rgba(251,191,36,0.7)',
                      opacity: trailDecay * 0.85,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              }

              // Gold Medal: 4-point golden star glints along flight arc
              return (
                <div
                  key={idx}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${tp.x}px`,
                    top: `${tp.y}px`,
                    opacity: trailDecay * 0.9,
                    transform: `translate(-50%, -50%) scale(${0.5 + trailDecay * 0.6}) rotate(${idx * 25}deg)`,
                  }}
                >
                  <div className="w-3.5 h-3.5 bg-yellow-300 rotate-45 shadow-[0_0_10px_#facc15]" />
                </div>
              );
            })}

            {/* C. High-Detail Vector Projectile */}
            <div
              className="absolute will-change-transform pointer-events-none"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                transform: `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${scale})`,
              }}
            >
              <ThrowableItemGraphic type={f.objectType} size={54} />
            </div>
          </React.Fragment>
        );
      })}

      {/* 2. Multi-Stage Physics Impact Choreography & Reaction Speech Bubbles */}
      {impacts.map((imp) => {
        const elapsed = performance.now() - imp.startTime;
        const p = Math.min(1, Math.max(0, elapsed / ANIMATION_CONFIG.THROW_HIT_DURATION_MS));
        const fadeOut = p > 0.72 ? Math.max(0, 1 - (p - 0.72) / 0.28) : 1;

        // Boot ricochet physics: bounces off the avatar along a secondary gravity arc
        const ricochetT = Math.min(1, elapsed / 680);
        const ricochetX = imp.reboundDir * ricochetT * 78;
        const ricochetY = -48 * ricochetT + 175 * ricochetT * ricochetT;
        const ricochetRot = imp.reboundDir * (140 + ricochetT * 380);
        const ricochetOpacity = Math.max(0, 1 - ricochetT * 1.15);

        return (
          <div
            key={imp.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
            style={{
              left: `${imp.x}px`,
              top: `${imp.y}px`,
              opacity: fadeOut,
            }}
          >
            {/* === A. WORN BOOT IMPACT: Comic Burst + Muddy Sole Stamp + Ricochet Boot + Orbiting Stars === */}
            {imp.objectType === 'shoe' && (
              <div className="relative flex items-center justify-center w-32 h-32">
                {/* 1. Spiky Cartoon POW/SMACK Starburst Flash (first 480ms) */}
                {elapsed < 520 && (
                  <div
                    className="absolute inset-0 flex items-center justify-center comic-burst-pop"
                    style={{ opacity: Math.max(0, 1 - elapsed / 520) }}
                  >
                    <ComicImpactBurstArt size={108} />
                  </div>
                )}

                {/* 2. Expanding Dust Cloud Shockwave */}
                <div
                  className="absolute rounded-full border-4 border-amber-500/80"
                  style={{
                    width: `${34 + p * 84}px`,
                    height: `${34 + p * 84}px`,
                    opacity: Math.max(0, 0.85 - p * 0.95),
                  }}
                />

                {/* 3. Muddy Sole Tread Stamp on Avatar */}
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    opacity: Math.max(0, 0.92 - p * 0.85),
                    transform: `scale(${Math.min(1, 0.75 + p * 0.3)})`,
                  }}
                >
                  <BootPrintArt size={52} />
                </div>

                {/* 4. Orbiting Dazed Golden Stars Above Head */}
                {[0, 1, 2, 3].map((starIdx) => {
                  const angle = p * Math.PI * 3.2 + (starIdx * Math.PI) / 2;
                  const rx = Math.cos(angle) * 34;
                  const ry = -28 + Math.sin(angle) * 10;
                  return (
                    <div
                      key={starIdx}
                      className="absolute text-xs sm:text-sm font-black text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                      style={{
                        transform: `translate(${rx}px, ${ry}px) rotate(${p * 360}deg)`,
                      }}
                    >
                      ★
                    </div>
                  );
                })}

                {/* 5. Ricocheting Boot Bouncing Off with Gravity */}
                {ricochetOpacity > 0.02 && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      transform: `translate(${ricochetX}px, ${ricochetY}px) rotate(${ricochetRot}deg) scale(0.85)`,
                      opacity: ricochetOpacity,
                    }}
                  >
                    <BootArt size={44} />
                  </div>
                )}
              </div>
            )}

            {/* === B. FOAMING BEER IMPACT: Frothy Geyser + 14-Droplet Gravity Splash Fountain === */}
            {imp.objectType === 'beer' && (
              <div className="relative flex items-center justify-center w-32 h-32">
                {/* 1. Dual Expanding Emerald & Golden Foam Splash Rings */}
                <div
                  className="absolute rounded-full border-3 border-amber-300/90 bg-amber-400/20"
                  style={{
                    width: `${30 + p * 92}px`,
                    height: `${30 + p * 92}px`,
                    opacity: Math.max(0, 0.9 - p),
                  }}
                />
                <div
                  className="absolute rounded-full border-2 border-white/90"
                  style={{
                    width: `${20 + p * 70}px`,
                    height: `${20 + p * 70}px`,
                    opacity: Math.max(0, 0.95 - p * 1.1),
                  }}
                />

                {/* 2. 14-Particle Gravity Liquid & Foam Splash Fountain */}
                {BEER_SPLASH_PARTICLES.map((pt, idx) => {
                  const tSec = Math.min(1.1, elapsed / 750);
                  const px = pt.vx * tSec;
                  const py = pt.vy * tSec + 135 * tSec * tSec; // Gravity pull downward
                  return (
                    <div
                      key={idx}
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: `${pt.size}px`,
                        height: `${pt.size}px`,
                        backgroundColor: pt.isFoam ? '#ffffff' : '#fbbf24',
                        border: pt.isFoam ? '1.5px solid #fde68a' : '1px solid #d97706',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                        transform: `translate(${px}px, ${py}px) scale(${Math.max(0.25, 1 - p * 0.65)})`,
                      }}
                    />
                  );
                })}

                {/* 3. Tilted Popping Bottle Gushing Foam (first 520ms) */}
                {elapsed < 520 && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      transform: `translateY(${-8 - (elapsed / 520) * 10}px) rotate(${-25 + (elapsed / 520) * 45}deg) scale(${1.05 - (elapsed / 520) * 0.35})`,
                      opacity: Math.max(0, 1 - elapsed / 520),
                    }}
                  >
                    <BeerBottleArt size={46} />
                  </div>
                )}
              </div>
            )}

            {/* === C. ROYAL GOLD MEDAL IMPACT: Rotating Sunburst + Wearable Spring Medal + 16 Confetti Ribbons === */}
            {imp.objectType === 'medal' && (
              <div className="relative flex items-center justify-center w-36 h-36">
                {/* 1. Rotating Golden God-Rays Sunburst */}
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    transform: `rotate(${p * 110}deg) scale(${0.85 + Math.sin(p * Math.PI) * 0.25})`,
                  }}
                >
                  <SunburstRaysArt size={132} />
                </div>

                {/* 2. Golden Victory Glow Halo */}
                <div className="absolute w-20 h-20 rounded-full bg-yellow-400/35 blur-md" />

                {/* 3. 16 Multi-Colored Fluttering Confetti Ribbons */}
                {CONFETTI_PARTICLES.map((c, idx) => {
                  const tNorm = Math.min(1, elapsed / 1000);
                  const cx = c.spreadX * tNorm + Math.sin(tNorm * 7 + c.swayPhase) * 8;
                  const cy = c.initialUpY * tNorm + 115 * tNorm * tNorm;
                  return (
                    <div
                      key={idx}
                      className="absolute rounded-xs pointer-events-none shadow-xs"
                      style={{
                        width: '8px',
                        height: '5px',
                        backgroundColor: c.color,
                        transform: `translate(${cx}px, ${cy}px) rotate(${tNorm * c.rotSpeed}deg)`,
                      }}
                    />
                  );
                })}

                {/* 4. Ceremonial Wearable Gold Medal with Physics Bounce */}
                <div className="relative z-10 medal-award-spring">
                  <GoldMedalArt size={52} />
                </div>
              </div>
            )}

            {/* Avatar Reaction Speech Bubble */}
            <div className="-mt-3 z-20 animate-in fade-in zoom-in-75 slide-in-from-bottom-2 duration-200">
              <span
                className={`
                  font-black text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full shadow-2xl border flex items-center gap-1 whitespace-nowrap
                  ${
                    imp.objectType === 'shoe'
                      ? 'bg-amber-950/95 text-amber-200 border-amber-400'
                      : imp.objectType === 'beer'
                      ? 'bg-emerald-950/95 text-emerald-200 border-emerald-400'
                      : 'bg-yellow-950/95 text-yellow-200 border-yellow-400'
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
