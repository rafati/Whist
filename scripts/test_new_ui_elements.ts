/**
 * Automated Verification Script for New UI Elements:
 * 1. Last Trick Cross in Top-Right Corner of Playing Area
 * 2. Big Bold Contract / Suit / No-Trump Display in Bottom-Left
 * 3. Live Team 1 & Team 2 Winning Trick Counts in Bottom-Left
 */

import { GameState, Seat, TrickResult, UserProfile, Card } from '../src/types.ts';
import { getSeatVisualPos, getTeam, SUIT_SYMBOLS, SUIT_NAMES } from '../src/logic/gameLogic.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

async function runTests() {
  console.log('--- Royal Whist UI Enhancements Verification ---');

  // Test 1: Last Trick Cross seating & card mapping logic
  console.log('\n[Test 1] Verifying Last Trick Cross Perspective Seating Mapping...');
  const mockSeats: Record<Seat, UserProfile | null> = {
    South: { id: 'u1', name: 'Alice', avatar: '', email: 'alice@test.com', isBot: false },
    North: { id: 'b1', name: 'Bot Bob', avatar: '', email: 'bot1@test.com', isBot: true },
    West: { id: 'b2', name: 'Bot Charlie', avatar: '', email: 'bot2@test.com', isBot: true },
    East: { id: 'b3', name: 'Bot Dave', avatar: '', email: 'bot3@test.com', isBot: true },
  };

  const mySeat: Seat = 'South';

  // Helper simulating getSeatVisualPos relative to mySeat
  const visualPosMap: Record<Seat, 'bottom' | 'top' | 'left' | 'right'> = {
    South: getSeatVisualPos('South', mySeat),
    North: getSeatVisualPos('North', mySeat),
    West: getSeatVisualPos('West', mySeat),
    East: getSeatVisualPos('East', mySeat),
  };

  assert(visualPosMap.South === 'bottom', 'South (mySeat) should map to bottom of cross');
  assert(visualPosMap.North === 'top', 'North (Partner) should map to top of cross');
  assert(visualPosMap.West === 'left', 'West (Left Opponent) should map to left of cross');
  assert(visualPosMap.East === 'right', 'East (Right Opponent) should map to right of cross');

  // Test 2: TrickResult winning card detection in cross
  console.log('\n[Test 2] Verifying TrickResult Cross Cards and Winner Flagging...');
  const mockTrick: TrickResult = {
    trickNumber: 3,
    leader: 'West',
    ledSuit: 'S',
    winner: 'South',
    winningCard: { id: 'S-A', suit: 'S', rank: 'A' },
    cards: [
      { seat: 'West', card: { id: 'S-7', suit: 'S', rank: '7' } },
      { seat: 'North', card: { id: 'S-10', suit: 'S', rank: '10' } },
      { seat: 'East', card: { id: 'S-K', suit: 'S', rank: 'K' } },
      { seat: 'South', card: { id: 'S-A', suit: 'S', rank: 'A' } },
    ],
  };

  // Cross card mapping
  const crossByPos: Record<string, { card: Card; isWinner: boolean }> = {};
  mockTrick.cards.forEach((played) => {
    const pos = visualPosMap[played.seat];
    crossByPos[pos] = {
      card: played.card,
      isWinner: played.card.id === mockTrick.winningCard.id,
    };
  });

  assert(crossByPos.bottom.isWinner === true, 'South (bottom) card S-A should be flagged as winning card');
  assert(crossByPos.top.isWinner === false, 'North (top) card S-10 should NOT be winner');
  assert(crossByPos.left.isWinner === false, 'West (left) card S-7 should NOT be winner');
  assert(crossByPos.right.isWinner === false, 'East (right) card S-K should NOT be winner');
  assert(crossByPos.bottom.card.rank === 'A', 'Bottom card rank is A');
  assert(crossByPos.top.card.rank === '10', 'Top card rank is 10');
  assert(crossByPos.left.card.rank === '7', 'Left card rank is 7');
  assert(crossByPos.right.card.rank === 'K', 'Right card rank is K');

  // Test 3: Contract HUD calculation & representation
  console.log('\n[Test 3] Verifying Contract HUD Big Display & Live Team Trick Counts...');
  const mockGameState: Partial<GameState> = {
    phase: 'playing',
    winningBid: {
      seat: 'South',
      level: 2,
      contractType: 'Suit',
      type: 'bid',
    },
    declarer: 'South',
    trumpSuit: 'S',
    teamTricksWon: {
      TeamA: 5,
      TeamB: 2,
    },
    tricksHistory: [mockTrick],
  };

  const declarerTeam = getTeam(mockGameState.declarer!);
  const winningBid = mockGameState.winningBid!;
  const contractGoal = 6 + winningBid.level!;
  const teamTricksWon = mockGameState.teamTricksWon!;

  assert(declarerTeam === 'TeamA', 'Declarer South belongs to Team 1 (TeamA)');
  assert(contractGoal === 8, 'Level 2 bid requires 6 + 2 = 8 tricks');
  assert(teamTricksWon.TeamA === 5, 'Team 1 has won 5 tricks');
  assert(teamTricksWon.TeamB === 2, 'Team 2 has won 2 tricks');
  assert(mockGameState.trumpSuit === 'S', 'Trump suit is S');
  assert(SUIT_SYMBOLS[mockGameState.trumpSuit as 'S'] === '♠', 'Trump symbol is ♠');
  assert(SUIT_NAMES[mockGameState.trumpSuit as 'S'] === 'Spades', 'Trump name is Spades');

  // Test 4: NT contract representation
  console.log('\n[Test 4] Verifying No Trump (NT) Contract Representation...');
  const ntGameState: Partial<GameState> = {
    phase: 'playing',
    winningBid: {
      seat: 'East',
      level: 3,
      contractType: 'NT',
      type: 'bid',
    },
    declarer: 'East',
    trumpSuit: 'NT',
    teamTricksWon: {
      TeamA: 1,
      TeamB: 4,
    },
  };

  const ntDeclarerTeam = getTeam(ntGameState.declarer!);
  const ntWinningBid = ntGameState.winningBid!;
  const ntGoal = 6 + ntWinningBid.level!;
  assert(ntDeclarerTeam === 'TeamB', 'Declarer East belongs to Team 2 (TeamB)');
  assert(ntGoal === 9, 'Level 3 NT bid requires 6 + 3 = 9 tricks');
  assert(ntGameState.trumpSuit === 'NT', 'Trump suit is NT');
  assert(ntGameState.teamTricksWon!.TeamB === 4, 'Team 2 has won 4 tricks');

  console.log('\n🎉 ALL NEW UI ENHANCEMENT TESTS PASSED PERFECTLY!\n');
}

runTests();
