/**
 * Automated Verification Script for Sound & Click Disable Settings
 * Tests:
 * 1. Default sound state (true)
 * 2. Muting via setSoundEnabled(false) and localStorage persistence
 * 3. Reactive subscription listeners
 * 4. Toggling state via toggleSound()
 * 5. Safe no-op execution when muted in headless environments
 */

// Setup browser-like storage mock for node testing environment
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, String(val)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

(globalThis as unknown as { window: unknown; localStorage: unknown }).window = globalThis;
(globalThis as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;

import {
  SOUND_STORAGE_KEY,
  isSoundEnabled,
  setSoundEnabled,
  toggleSound,
  subscribeSoundEnabled,
  playClickSound,
  playThrowSound,
  playHitSound,
  playCardSnapSound,
} from '../src/lib/throwSounds.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

async function runTests() {
  console.log('--- Royal Whist Sound & Clicks Setting Verification ---');

  // Test 1: Initial state
  console.log('\n[Test 1] Checking initial default sound state...');
  assert(isSoundEnabled() === true, 'Sound should default to enabled (true)');

  // Test 2: Subscriber notification
  console.log('\n[Test 2] Testing subscriber notification upon state change...');
  let notifiedState: boolean | null = null;
  const unsubscribe = subscribeSoundEnabled((state) => {
    notifiedState = state;
  });

  setSoundEnabled(false);
  assert(notifiedState === false, 'Subscriber should receive false when sound disabled');
  assert(isSoundEnabled() === false, 'isSoundEnabled() should report false after disabling');
  assert(mockLocalStorage.getItem(SOUND_STORAGE_KEY) === 'false', 'localStorage should store "false"');

  // Test 3: Audio functions when muted should return cleanly without error
  console.log('\n[Test 3] Verifying sound generators cleanly early-return when muted...');
  try {
    playClickSound();
    playCardSnapSound();
    playThrowSound();
    playHitSound('shoe');
    playHitSound('beer');
    playHitSound('medal');
    assert(true, 'Sound synthesizer calls safely early-returned with zero errors when muted');
  } catch (err) {
    assert(false, `Sound generators threw error while muted: ${err}`);
  }

  // Test 4: Toggle sound back to enabled
  console.log('\n[Test 4] Testing toggleSound()...');
  const nextState = toggleSound();
  assert(nextState === true, 'toggleSound() should return true when unmuted');
  assert(isSoundEnabled() === true, 'isSoundEnabled() should report true after toggle');
  assert(notifiedState === true, 'Subscriber should receive true when toggled on');
  assert(mockLocalStorage.getItem(SOUND_STORAGE_KEY) === 'true', 'localStorage should store "true"');

  // Test 5: Unsubscribe cleanup
  console.log('\n[Test 5] Testing listener cleanup on unsubscribe...');
  unsubscribe();
  notifiedState = null;
  setSoundEnabled(false);
  assert(notifiedState === null, 'Unsubscribed listener should no longer receive state changes');

  // Restore enabled state
  setSoundEnabled(true);
  assert(isSoundEnabled() === true, 'Restored sound setting to enabled');

  console.log('\n🎉 ALL SOUND & CLICK SETTING TESTS PASSED PERFECTLY!\n');
}

runTests();
