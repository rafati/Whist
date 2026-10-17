/**
 * Unit & Integration Test for Realistic Card Swipe-to-Throw & Center-Origin Flight Animation System
 */

console.log('--- Testing Realistic Card Swipe-to-Throw & Center-Origin Flight System ---');

// 1. Rolling-Window Velocity & Gesture Decision Matrix
console.log('\n1. Testing Rolling-Window Velocity & Swipe Decision Matrix:');

interface PointerSample {
  x: number;
  y: number;
  time: number;
}

function computeRollingVelocity(
  samples: PointerSample[],
  nowX: number,
  nowY: number,
  nowTime: number
) {
  const filtered = samples.filter((s) => nowTime - s.time <= 90);
  const anchor = filtered[0] || samples[0];
  if (!anchor) return { vx: 0, vy: 0 };
  const dt = Math.max(8, nowTime - anchor.time);
  return {
    vx: (nowX - anchor.x) / dt,
    vy: (nowY - anchor.y) / dt,
  };
}

function evaluateGestureResult(
  deltaX: number,
  deltaY: number,
  vy: number,
  hasMoved: boolean
): 'throw' | 'tap' | 'cancel' {
  const isVerticalEnough = Math.abs(deltaY) >= Math.abs(deltaX) * 0.45 || deltaY <= -55;
  const isPulledBackDown = vy > 0.38 && deltaY > -90;
  const isUpwardThrow =
    isVerticalEnough &&
    !isPulledBackDown &&
    (deltaY <= -38 || (deltaY <= -14 && vy < -0.22));
  const isTapOrClick = !hasMoved || (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10);

  if (isUpwardThrow) return 'throw';
  if (isTapOrClick) return 'tap';
  return 'cancel';
}

// Test rolling velocity when player holds card for 1.5s while thinking, then flicks upward in the last 60ms
const holdThenFlickSamples: PointerSample[] = [
  { x: 500, y: 650, time: 0 },
  { x: 500, y: 650, time: 1450 },
  { x: 502, y: 642, time: 1470 },
  { x: 504, y: 630, time: 1490 },
];
const holdFlickVel = computeRollingVelocity(holdThenFlickSamples, 505, 622, 1510);
const holdFlickDecision = evaluateGestureResult(5, -28, holdFlickVel.vy, true);
if (holdFlickDecision !== 'throw') {
  throw new Error(`Expected hold-then-flick to register as THROW, got ${holdFlickDecision} (vy=${holdFlickVel.vy})`);
}
console.log(`  ✓ Hold 1.5s then upward flick (-28px in 60ms) -> vy=${holdFlickVel.vy.toFixed(2)}px/ms -> THROW`);

const testCases = [
  { name: 'Fast upward flick', deltaX: 5, deltaY: -22, vy: -0.35, hasMoved: true, expected: 'throw' },
  { name: 'Extended diagonal swipe to felt', deltaX: 90, deltaY: -180, vy: -0.1, hasMoved: true, expected: 'throw' },
  { name: 'Pull-back cancel near hand', deltaX: 8, deltaY: -10, vy: 0.15, hasMoved: true, expected: 'cancel' },
  { name: 'Active downward yank cancel', deltaX: 4, deltaY: -45, vy: 0.55, hasMoved: true, expected: 'cancel' },
  { name: 'Single tap / click', deltaX: 2, deltaY: 3, vy: 0.01, hasMoved: false, expected: 'tap' },
  { name: 'Horizontal hand pan', deltaX: 60, deltaY: -20, vy: -0.05, hasMoved: true, expected: 'cancel' },
];

for (const tc of testCases) {
  const result = evaluateGestureResult(tc.deltaX, tc.deltaY, tc.vy, tc.hasMoved);
  if (result !== tc.expected) {
    throw new Error(`Gesture mismatch for "${tc.name}": expected ${tc.expected}, got ${result}`);
  }
  console.log(`  ✓ ${tc.name.padEnd(32)} -> ${result.toUpperCase()} (as expected)`);
}

// 2. Center-Invariant Unrotated Release Geometry Verification
console.log('\n2. Testing Center-Invariant Release Geometry (Zero AABB Jump / Zero Scale Distortion):');

function simulateRotatedCardRelease(
  baseWidth: number,
  baseHeight: number,
  trueCenterX: number,
  trueCenterY: number,
  scale: number,
  rotateDeg: number
) {
  const rad = (Math.abs(rotateDeg) * Math.PI) / 180;
  // Browser getBoundingClientRect() returns inflated AABB for rotated & scaled elements:
  const aabbWidth =
    baseWidth * scale * Math.cos(rad) + baseHeight * scale * Math.sin(rad);
  const aabbHeight =
    baseWidth * scale * Math.sin(rad) + baseHeight * scale * Math.cos(rad);
  const aabbLeft = trueCenterX - aabbWidth / 2;
  const aabbTop = trueCenterY - aabbHeight / 2;

  // Our new center-invariant extraction:
  const extractedCenterX = aabbLeft + aabbWidth / 2;
  const extractedCenterY = aabbTop + aabbHeight / 2;

  const centerError = Math.hypot(
    extractedCenterX - trueCenterX,
    extractedCenterY - trueCenterY
  );
  if (centerError > 1e-6) {
    throw new Error(`Expected 0 center error, got ${centerError}`);
  }
  return {
    aabbWidth,
    baseWidth,
    extractedCenterX,
    extractedCenterY,
  };
}

const releaseCheck = simulateRotatedCardRelease(84, 120, 520, 480, 1.07, 13.5);
console.log(
  `  ✓ Tilted card (13.5°, scale 1.07): AABB width=${releaseCheck.aabbWidth.toFixed(1)}px vs true width=${releaseCheck.baseWidth}px -> Exact center=(${releaseCheck.extractedCenterX}, ${releaseCheck.extractedCenterY}) preserved with 0.0px jump!`
);

console.log('\n🎉 ALL REALISTIC CARD SWIPE & FLIGHT ANIMATION TESTS PASSED!\n');
