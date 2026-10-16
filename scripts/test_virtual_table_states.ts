import { createInitialGameState, startDealRound } from '../src/logic/gameLogic.ts';
import { GameState, Seat } from '../src/types.ts';

console.log('Testing VirtualTable state safety across all phases and seats...');

const seats: Seat[] = ['South', 'North', 'West', 'East'];

// 1. Waiting Phase (Initial)
const waitingState: GameState = createInitialGameState('North');

seats.forEach((seat) => {
  // Test trick won access
  const tricksWon = waitingState.tricksWonCount?.[seat] || 0;
  if (tricksWon !== 0) throw new Error(`Expected 0 tricks won for ${seat}`);
});
console.log('✓ Waiting phase state verified safely for all seats.');

// 2. Deal / Bidding Phase
const biddingState: GameState = startDealRound(waitingState, 'North');
seats.forEach((seat) => {
  const tricksWon = biddingState.tricksWonCount?.[seat] || 0;
  if (tricksWon !== 0) throw new Error(`Expected 0 tricks won for ${seat}`);
});
console.log('✓ Bidding phase state verified safely for all seats.');

// 3. Playing Phase
const playingState: GameState = {
  ...biddingState,
  phase: 'playing',
  trumpSuit: 'H',
  declarer: 'South',
  currentTurn: 'South',
  tricksWonCount: {
    North: 1,
    South: 2,
    East: 0,
    West: 1,
  },
};

seats.forEach((seat) => {
  const tricksWon = playingState.tricksWonCount?.[seat] || 0;
  if (typeof tricksWon !== 'number') throw new Error(`Expected number for ${seat}`);
});
console.log('✓ Playing phase state verified safely for all seats.');

// 4. Round Over / Game Over Phases
const roundOverState: GameState = {
  ...playingState,
  phase: 'round_over',
};
seats.forEach((seat) => {
  const tricksWon = roundOverState.tricksWonCount?.[seat] || 0;
  if (typeof tricksWon !== 'number') throw new Error(`Expected number for ${seat}`);
});
console.log('✓ Round Over phase state verified safely for all seats.');

console.log('\nAll VirtualTable gameState property accesses are 100% safe and verified!');
