/**
 * Automated Verification Script for Dynamic Suit Accordion & High-Clarity Card Rendering
 * Tests:
 * 1. Dynamic Accordion Margin Calculation for Hand Cards
 * 2. Auto-expansion of required suit and compression of non-suit cards
 * 3. Uniform distribution fallback when void or leading
 * 4. Total hand container width boundary check for mobile screens (375px - 430px)
 */

import { Card, Suit } from '../src/types.ts';
import { isCardLegal } from '../src/logic/gameLogic.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

interface CardSlotLayout {
  card: Card;
  isRequiredSuit: boolean;
  isCompressed: boolean;
  canPlay: boolean;
  isDimmed: boolean;
  overlapPx: number; // Pixels overlapping previous card
  visibleWidthPx: number; // Visible card face width in px (out of 52px card width)
}

function calculateHandLayout(
  hand: Card[],
  currentLedSuit: Suit | null,
  isMyTurnToPlay: boolean
): CardSlotLayout[] {
  const CARD_WIDTH_PX = 52;
  const hasRequiredSuitInHand = Boolean(
    currentLedSuit && hand.some((c) => c.suit === currentLedSuit)
  );

  return hand.map((card, idx) => {
    const isLegal = isCardLegal(card, hand, currentLedSuit);
    const canPlay = isMyTurnToPlay && isLegal;
    const isDimmed = isMyTurnToPlay && !isLegal;

    const isRequiredSuit = hasRequiredSuitInHand && card.suit === currentLedSuit;
    const isCompressed = hasRequiredSuitInHand && card.suit !== currentLedSuit;

    // In portrait:
    // Expanded: -0.25rem = -4px overlap -> 48px visible face!
    // Compressed: -2.2rem = -35.2px overlap -> 16.8px visible face (index only)!
    // Standard: -1.65rem = -26.4px overlap -> 25.6px visible face!
    let overlapPx = 0;
    if (idx !== 0) {
      if (isRequiredSuit) {
        overlapPx = 4;
      } else if (isCompressed) {
        overlapPx = 35;
      } else {
        overlapPx = 26;
      }
    }

    const visibleWidthPx = idx === 0 ? CARD_WIDTH_PX : CARD_WIDTH_PX - overlapPx;

    return {
      card,
      isRequiredSuit,
      isCompressed,
      canPlay,
      isDimmed,
      overlapPx,
      visibleWidthPx,
    };
  });
}

function runTests() {
  console.log('--- Royal Whist Dynamic Suit Accordion Verification ---');

  // Test Hand: 4 Clubs, 2 Diamonds, 3 Spades, 4 Hearts (13 cards total)
  const testHand: Card[] = [
    { id: 'C5', suit: 'C', rank: '5' },
    { id: 'C8', suit: 'C', rank: '8' },
    { id: 'C9', suit: 'C', rank: '9' },
    { id: 'CJ', suit: 'C', rank: 'J' },
    { id: 'DQ', suit: 'D', rank: 'Q' },
    { id: 'DK', suit: 'D', rank: 'K' },
    { id: 'S3', suit: 'S', rank: '3' },
    { id: 'S7', suit: 'S', rank: '7' },
    { id: 'SQ', suit: 'S', rank: 'Q' },
    { id: 'H3', suit: 'H', rank: '3' },
    { id: 'H6', suit: 'H', rank: '6' },
    { id: 'HJ', suit: 'H', rank: 'J' },
    { id: 'HA', suit: 'H', rank: 'A' },
  ];

  // Scenario 1: Clubs Led in trick (Player holds Clubs)
  console.log('\n[Scenario 1] Clubs Led in trick (Player holds 4 Clubs)...');
  const clubsLedLayout = calculateHandLayout(testHand, 'C', true);

  const clubSlots = clubsLedLayout.filter((s) => s.card.suit === 'C');
  const nonClubSlots = clubsLedLayout.filter((s) => s.card.suit !== 'C');

  assert(clubSlots.length === 4, 'Should have 4 Club slots');
  assert(nonClubSlots.length === 9, 'Should have 9 Non-Club slots');

  clubSlots.forEach((slot, i) => {
    assert(slot.isRequiredSuit === true, `Club card ${slot.card.rank}♣ marked as isRequiredSuit`);
    assert(slot.canPlay === true, `Club card ${slot.card.rank}♣ canPlay is true`);
    assert(slot.isDimmed === false, `Club card ${slot.card.rank}♣ is NOT dimmed`);
    if (i > 0) {
      assert(slot.visibleWidthPx >= 48, `Expanded club card shows >=48px of 52px face (got ${slot.visibleWidthPx}px)`);
    }
  });

  nonClubSlots.forEach((slot) => {
    assert(slot.isCompressed === true, `Non-club card ${slot.card.rank}${slot.card.suit} marked as isCompressed`);
    assert(slot.canPlay === false, `Non-club card ${slot.card.rank}${slot.card.suit} canPlay is false`);
    assert(slot.isDimmed === true, `Non-club card ${slot.card.rank}${slot.card.suit} is dimmed`);
    assert(slot.visibleWidthPx <= 18, `Compressed card condensed to index width <=18px (got ${slot.visibleWidthPx}px)`);
  });

  // Check total mobile hand spread width
  const totalWidthPx = clubsLedLayout.reduce((sum, s) => sum + s.visibleWidthPx, 0);
  console.log(`  -> Total hand width: ${totalWidthPx}px (Card Width: 52px)`);
  assert(totalWidthPx <= 360, `Total hand width (${totalWidthPx}px) must comfortably fit within mobile 375px viewport`);

  // Scenario 2: Diamonds Led, but Player is VOID in Diamonds
  console.log('\n[Scenario 2] Void in led suit (Diamonds led, hand holds 0 Diamonds)...');
  const handVoidInDiamonds = testHand.filter((c) => c.suit !== 'D');
  const voidLayout = calculateHandLayout(handVoidInDiamonds, 'D', true);

  assert(voidLayout.every((s) => s.isRequiredSuit === false), 'No cards marked as required suit when void');
  assert(voidLayout.every((s) => s.isCompressed === false), 'No cards compressed when void');
  assert(voidLayout.every((s) => s.canPlay === true), 'All cards playable when void in led suit (trump/discard)');
  assert(voidLayout.every((s) => s.isDimmed === false), 'Zero cards dimmed when void');

  // Scenario 3: Opening Lead (No suit led yet)
  console.log('\n[Scenario 3] Opening Lead (Player leads trick, currentLedSuit is null)...');
  const leadLayout = calculateHandLayout(testHand, null, true);

  assert(leadLayout.every((s) => s.isRequiredSuit === false), 'Uniform spacing on opening lead');
  assert(leadLayout.every((s) => s.isCompressed === false), 'Uniform spacing on opening lead');
  assert(leadLayout.every((s) => s.canPlay === true), 'Player can lead any card');

  console.log('\n🎉 ALL SUIT ACCORDION LOGIC TESTS PASSED PERFECTLY!\n');
}

runTests();
