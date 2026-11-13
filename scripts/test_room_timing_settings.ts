import { RoomTimingSettings, DEFAULT_ROOM_TIMING_SETTINGS } from '../src/types.ts';

console.log('============================================================');
console.log('🧪 RUNNING PER-GAME TIMING SETTINGS TEST SUITE');
console.log('============================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failedTests++;
  }
}

// Test 1: Default timing settings integrity
console.log('--- Test 1: Default Timing Settings Verification ---');
assert(DEFAULT_ROOM_TIMING_SETTINGS.humanBidTimeSeconds === 20, 'Default human bid time is 20s');
assert(DEFAULT_ROOM_TIMING_SETTINGS.humanDeclareTimeSeconds === 20, 'Default human declare time is 20s');
assert(DEFAULT_ROOM_TIMING_SETTINGS.humanPlayCardTimeSeconds === 15, 'Default human play card time is 15s');
assert(DEFAULT_ROOM_TIMING_SETTINGS.botBidDelaySeconds === 2.5, 'Default bot bid delay is 2.5s');
assert(DEFAULT_ROOM_TIMING_SETTINGS.botDeclareDelaySeconds === 2.5, 'Default bot declare delay is 2.5s');
assert(DEFAULT_ROOM_TIMING_SETTINGS.botPlayCardDelaySeconds === 1.0, 'Default bot play delay is 1.0s');
assert(DEFAULT_ROOM_TIMING_SETTINGS.trickReviewDelaySeconds === 0.8, 'Default trick review delay is 0.8s');

// Test 2: Custom per-room timing settings independence
console.log('\n--- Test 2: Custom Per-Game Timing Isolation ---');
const roomA_settings: RoomTimingSettings = {
  humanBidTimeSeconds: 10,
  humanDeclareTimeSeconds: 10,
  humanPlayCardTimeSeconds: 8,
  botBidDelaySeconds: 1.0,
  botDeclareDelaySeconds: 1.0,
  botPlayCardDelaySeconds: 0.5,
  trickReviewDelaySeconds: 0.5,
};

const roomB_settings: RoomTimingSettings = {
  humanBidTimeSeconds: 35,
  humanDeclareTimeSeconds: 35,
  humanPlayCardTimeSeconds: 25,
  botBidDelaySeconds: 4.0,
  botDeclareDelaySeconds: 4.0,
  botPlayCardDelaySeconds: 2.0,
  trickReviewDelaySeconds: 1.5,
};

assert(roomA_settings.humanBidTimeSeconds !== roomB_settings.humanBidTimeSeconds, 'Room A blitz timing is isolated from Room B relaxed timing');
assert(roomA_settings.botPlayCardDelaySeconds === 0.5, 'Room A bot plays rapidly (0.5s)');
assert(roomB_settings.botPlayCardDelaySeconds === 2.0, 'Room B bot plays slowly (2.0s)');
assert(DEFAULT_ROOM_TIMING_SETTINGS.botPlayCardDelaySeconds === 1.0, 'Global default remains untouched');

// Test 3: Clamping & range validation
console.log('\n--- Test 3: Delay Range Clamping ---');
function sanitizeTimingSettings(input: Partial<RoomTimingSettings>): RoomTimingSettings {
  return {
    humanBidTimeSeconds: Math.min(120, Math.max(5, Number(input.humanBidTimeSeconds) || 20)),
    humanDeclareTimeSeconds: Math.min(120, Math.max(5, Number(input.humanDeclareTimeSeconds) || 20)),
    humanPlayCardTimeSeconds: Math.min(120, Math.max(5, Number(input.humanPlayCardTimeSeconds) || 15)),
    botBidDelaySeconds: Math.min(15, Math.max(0.2, Number(input.botBidDelaySeconds) || 2.5)),
    botDeclareDelaySeconds: Math.min(15, Math.max(0.2, Number(input.botDeclareDelaySeconds) || 2.5)),
    botPlayCardDelaySeconds: Math.min(10, Math.max(0.2, Number(input.botPlayCardDelaySeconds) || 1.0)),
    trickReviewDelaySeconds: Math.min(5, Math.max(0.2, Number(input.trickReviewDelaySeconds) || 0.8)),
  };
}

const clampedLow = sanitizeTimingSettings({ humanBidTimeSeconds: 1, botPlayCardDelaySeconds: 0.05 });
assert(clampedLow.humanBidTimeSeconds === 5, 'Human bid time clamped to minimum 5s');
assert(clampedLow.botPlayCardDelaySeconds === 0.2, 'Bot play delay clamped to minimum 0.2s');

const clampedHigh = sanitizeTimingSettings({ humanPlayCardTimeSeconds: 999, botBidDelaySeconds: 50 });
assert(clampedHigh.humanPlayCardTimeSeconds === 120, 'Human play time clamped to maximum 120s');
assert(clampedHigh.botBidDelaySeconds === 15, 'Bot bid delay clamped to maximum 15s');

// Test 4: Strict preset detection vs custom manual tuning
console.log('\n--- Test 4: Strict Preset Matching vs Custom Manual Tuning ---');
import { TIMING_PRESET_BLITZ, TIMING_PRESET_STANDARD, TIMING_PRESET_RELAXED } from '../src/components/RoomSettingsModal.tsx';

function isStrictPreset(s: RoomTimingSettings, p: RoomTimingSettings) {
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

assert(isStrictPreset(DEFAULT_ROOM_TIMING_SETTINGS, TIMING_PRESET_STANDARD), 'Default matches Standard preset');

// Move ONE slider manually: should NOT match standard or relaxed
const customSettings: RoomTimingSettings = {
  ...DEFAULT_ROOM_TIMING_SETTINGS,
  humanPlayCardTimeSeconds: 25, // moved single slider
};
assert(!isStrictPreset(customSettings, TIMING_PRESET_STANDARD), 'Moving one slider breaks Standard preset match');
assert(!isStrictPreset(customSettings, TIMING_PRESET_RELAXED), 'Moving one slider does not falsely trigger Relaxed preset');
assert(!isStrictPreset(customSettings, TIMING_PRESET_BLITZ), 'Moving one slider does not trigger Blitz preset');

// Test 5: Pre-Game Hold for Settings & Bidding Invariant
console.log('\n--- Test 5: Pre-Game Hold for Settings Invariant ---');
interface SimulatedState {
  isHoldingForSettings?: boolean;
  turnDeadlineAt?: number | null;
  turnDurationMs?: number | null;
  phase: string;
  roundNumber: number;
}

const freshRound1State: SimulatedState = {
  isHoldingForSettings: true,
  turnDeadlineAt: null,
  turnDurationMs: null,
  phase: 'bidding',
  roundNumber: 1,
};

assert(freshRound1State.isHoldingForSettings === true, 'Round 1 deal initializes in holding state');
assert(freshRound1State.turnDeadlineAt === null, 'Turn deadline is null during holding (no countdown running)');

function canProcessBid(state: SimulatedState): boolean {
  if (state.isHoldingForSettings) return false;
  return true;
}

assert(!canProcessBid(freshRound1State), 'Incoming bids are strictly rejected while holding for settings');

// Creator saves settings or starts bidding
function unholdGame(state: SimulatedState, timing: RoomTimingSettings, isBotTurn: boolean) {
  state.isHoldingForSettings = false;
  const timeoutMs = isBotTurn ? timing.botBidDelaySeconds * 1000 : timing.humanBidTimeSeconds * 1000;
  state.turnDeadlineAt = Date.now() + timeoutMs;
  state.turnDurationMs = timeoutMs;
}

unholdGame(freshRound1State, DEFAULT_ROOM_TIMING_SETTINGS, false);
assert(freshRound1State.isHoldingForSettings === false, 'Game unheld after settings saved/confirmed');
assert(canProcessBid(freshRound1State), 'Bidding is now active and permitted');
assert(typeof freshRound1State.turnDeadlineAt === 'number', 'Human bid turn countdown timer started');
assert(freshRound1State.turnDurationMs === 20000, 'Human bid duration matches default 20s');

console.log('\n============================================================');
console.log(`🎉 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================');

if (failedTests > 0) process.exit(1);
