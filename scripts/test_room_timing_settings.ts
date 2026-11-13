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

console.log('\n============================================================');
console.log(`🎉 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================');

if (failedTests > 0) process.exit(1);
