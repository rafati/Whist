import { useState, useEffect, useCallback } from 'react';
import { ThrowableObjectType } from '../types.ts';

/**
 * Web Audio Synthesizer for Interactive Game Audio & Throwable Objects
 * Creates lightweight, realistic procedural audio effects without external asset dependencies.
 * Includes user-configurable audio toggle state with localStorage persistence.
 */

export const SOUND_STORAGE_KEY = 'royal_whist_sound_enabled';

let isSoundMuted = false;
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    if (stored !== null) {
      isSoundMuted = stored === 'false';
    }
  } catch {}
}

type SoundListener = (enabled: boolean) => void;
const soundListeners = new Set<SoundListener>();

export function isSoundEnabled(): boolean {
  return !isSoundMuted;
}

export function setSoundEnabled(enabled: boolean): void {
  isSoundMuted = !enabled;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {}
  }
  soundListeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch {}
  });
}

export function toggleSound(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
}

export function subscribeSoundEnabled(listener: SoundListener): () => void {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

/**
 * React hook to bind sound settings to UI components
 */
export function useSoundSetting(): [boolean, () => void, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(isSoundEnabled);

  useEffect(() => {
    return subscribeSoundEnabled(setEnabled);
  }, []);

  const toggle = useCallback(() => {
    toggleSound();
  }, []);

  return [enabled, toggle, setSoundEnabled];
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Procedural Subtle UI Click / Tap Sound
 */
export function playClickSound(): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.035);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch (e) {
    console.debug('Click sound suppressed:', e);
  }
}

/**
 * Procedural Whoosh Sound when an item is launched
 */
export function playThrowSound(): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.linearRampToValueAtTime(250, now + 0.35);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch (e) {
    console.debug('Throw sound suppressed:', e);
  }
}

/**
 * Procedural Impact Sound tailored to each throwable item
 */
export function playHitSound(objectType: ThrowableObjectType): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (objectType === 'shoe') {
      // 👞 Used Shoe: Low thump + comic slap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);

      // Add high-end slap crack
      const slap = ctx.createOscillator();
      const slapGain = ctx.createGain();
      slap.type = 'square';
      slap.frequency.setValueAtTime(320, now);
      slap.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      slapGain.gain.setValueAtTime(0.12, now);
      slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      slap.connect(slapGain);
      slapGain.connect(ctx.destination);
      slap.start(now);
      slap.stop(now + 0.1);
    } else if (objectType === 'beer') {
      // 🍾 Open Beer Bottle: Liquid fizz + pop splash
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(2.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.22, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.2);

      // Bubble pop drop
      const pop = ctx.createOscillator();
      const popGain = ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(600, now);
      pop.frequency.exponentialRampToValueAtTime(220, now + 0.15);

      popGain.gain.setValueAtTime(0.25, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      pop.connect(popGain);
      popGain.connect(ctx.destination);
      pop.start(now);
      pop.stop(now + 0.16);
    } else if (objectType === 'medal') {
      // 🥇 Gold Medal: Harmonic ringing bell chime
      const freqs = [1046.5, 1318.51, 1567.98, 2093.0]; // C6, E6, G6, C7
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.02);

        gain.gain.setValueAtTime(0.12 / (idx + 1), now + idx * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + idx * 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.02);
        osc.stop(now + 0.7 + idx * 0.1);
      });
    }
  } catch (e) {
    console.debug('Hit sound suppressed:', e);
  }
}

/**
 * Procedural Card Slide & Felt Snap Sound
 */
export function playCardSnapSound(): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Friction slide noise / whoosh
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.1);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.setValueAtTime(1.5, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);

    // 2. Felt snap tap
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'sine';
    snap.frequency.setValueAtTime(180, now + 0.04);
    snap.frequency.exponentialRampToValueAtTime(60, now + 0.12);

    snapGain.gain.setValueAtTime(0.22, now + 0.04);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    snap.connect(snapGain);
    snapGain.connect(ctx.destination);
    snap.start(now + 0.04);
    snap.stop(now + 0.15);
  } catch (e) {
    console.debug('Card snap sound suppressed:', e);
  }
}

