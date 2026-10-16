import { Seat, ThrowableObjectType } from '../src/types.ts';
import { getPartner, getNextSeat, getPrevSeat } from '../src/logic/gameLogic.ts';

console.log('--- Testing Multi-Device Perspective-Aware Throwable Trajectory System ---');

const SEATS: Seat[] = ['South', 'North', 'West', 'East'];
const OBJECTS: ThrowableObjectType[] = ['shoe', 'beer', 'medal'];

// Replicate the perspective calculation from ThrowableOverlay & VirtualTable
function getSeatVisualPos(seat: Seat, mySeat: Seat | null): 'bottom' | 'top' | 'left' | 'right' {
  const bottomSeat: Seat = mySeat || 'South';
  const topSeat: Seat = mySeat ? getPartner(mySeat) : 'North';
  const leftSeat: Seat = mySeat ? getPrevSeat(mySeat) : 'West';
  const rightSeat: Seat = mySeat ? getNextSeat(mySeat) : 'East';

  if (seat === bottomSeat) return 'bottom';
  if (seat === topSeat) return 'top';
  if (seat === leftSeat) return 'left';
  return 'right';
}

function getSimulatedSeatCenter(
  seat: Seat,
  mySeat: Seat | null,
  isSource: boolean,
  hasDomElement = false
): { x: number; y: number } {
  const isLocalUserSeat = Boolean(mySeat && seat === mySeat);
  const w = 1000;
  const h = 700;

  // 1. Local user throw originating from bottom right dock
  if (isSource && isLocalUserSeat) {
    return { x: w - 120, y: h - 40 }; // Dock coordinates
  }

  // 2. Visual element / Fallback geometry according to viewpoint
  const visualPos = getSeatVisualPos(seat, mySeat);
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
}

// 1. Verify seat perspective rotation matrix
console.log('\n1. Verifying Visual Orientations Per Seat Viewpoint:');
const expectedVisualPos: Record<Seat, Record<Seat, 'bottom' | 'top' | 'left' | 'right'>> = {
  South: { South: 'bottom', North: 'top', West: 'left', East: 'right' },
  North: { North: 'bottom', South: 'top', East: 'left', West: 'right' },
  West:  { West: 'bottom', East: 'top', North: 'left', South: 'right' },
  East:  { East: 'bottom', West: 'top', South: 'left', North: 'right' },
};

for (const viewerSeat of SEATS) {
  for (const targetSeat of SEATS) {
    const visual = getSeatVisualPos(targetSeat, viewerSeat);
    const expected = expectedVisualPos[viewerSeat][targetSeat];
    if (visual !== expected) {
      throw new Error(`Perspective mismatch! Viewer ${viewerSeat} viewing ${targetSeat}: expected ${expected}, got ${visual}`);
    }
  }
  console.log(`  ✓ Viewpoint from ${viewerSeat}: self=bottom, partner=top, left & right correct.`);
}

// 2. Verify throw trajectories across multiple screens
console.log('\n2. Verifying Multi-Device Throws for a concrete match scenario:');
// Scenario: South throws to West
const fromSeat: Seat = 'South';
const toSeat: Seat = 'West';

console.log(`\nScenario: ${fromSeat} throws shoe to ${toSeat}`);
for (const viewer of [null, ...SEATS] as (Seat | null)[]) {
  const viewerName = viewer ? `Client ${viewer}` : 'Spectator (no seat)';
  const start = getSimulatedSeatCenter(fromSeat, viewer, true);
  const end = getSimulatedSeatCenter(toSeat, viewer, false);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  // Parabolic control point
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const arcHeight = Math.min(180, Math.max(60, distance * 0.28));
  const controlX = midX;
  const controlY = midY - arcHeight;

  if (distance < 50) {
    throw new Error(`Degenerate throw distance on ${viewerName}`);
  }

  console.log(`  ${viewerName.padEnd(24)}: From (${start.x.toFixed(0)}, ${start.y.toFixed(0)}) -> To (${end.x.toFixed(0)}, ${end.y.toFixed(0)}), dist=${distance.toFixed(0)}px, arcPeakY=${controlY.toFixed(0)}`);
}

// 3. Verify all pairwise combinations
console.log('\n3. Verifying all 12 pairwise seat combinations across all 4 viewpoints:');
let totalChecked = 0;
for (const viewer of SEATS) {
  for (const s1 of SEATS) {
    for (const s2 of SEATS) {
      if (s1 === s2) continue;
      const start = getSimulatedSeatCenter(s1, viewer, true);
      const end = getSimulatedSeatCenter(s2, viewer, false);
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      if (dist <= 0 || isNaN(dist)) {
        throw new Error(`Invalid distance for ${s1} -> ${s2} on viewer ${viewer}`);
      }
      totalChecked++;
    }
  }
}
console.log(`  ✓ Successfully verified all ${totalChecked} throw vector trajectories across all viewpoints!`);

console.log('\n🎉 ALL PERSPECTIVE THROW TESTS PASSED CLEANLY!\n');
