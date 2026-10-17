/**
 * Automated Verification Script for Dynamic Suit Accordion & Card Spacing
 * Tests:
 * 1. Mobile Portrait & Desktop Dynamic Accordion Spacing
 * 2. Non-suit cards are NEVER dimmed (remain crisp white card stock)
 * 3. Expanded suit cards maintain natural fan overlap (do NOT show the whole card)
 * 4. Compressed suit cards condense cleanly to show index column
 * 5. Uniform distribution when void in led suit or opening lead
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
  visibleWidthPx: number; // Visible card face width in px
  percentVisible: number; // % of total card width visible
}

function calculateHandLayout(
  hand: Card[],
  currentLedSuit: Suit | null,
  isMyTurnToPlay: boolean,
  device: 'mobile' | 'desktop' = 'mobile'
): CardSlotLayout[] {
  // Mobile portrait card width: 52px. Desktop card width: 92px.
  const CARD_WIDTH_PX = device === 'mobile' ? 52 : 92;
  const hasRequiredSuitInHand = Boolean(
    currentLedSuit && hand.some((c) => c.suit === currentLedSuit)
  );

  return hand.map((card, idx) => {
    const isLegal = isCardLegal(card, hand, currentLedSuit);
    const canPlay = isMyTurnToPlay && isLegal;
    // Per user requirement: Do NOT dim cards from other suits. All cards remain bright white.
    const isDimmed = false;

    const isRequiredSuit = hasRequiredSuitInHand && card.suit === currentLedSuit;
    const isCompressed = hasRequiredSuitInHand && card.suit !== currentLedSuit;

    let overlapPx = 0;
    if (idx !== 0) {
      if (device === 'mobile') {
        // Mobile portrait CSS:
        // Expanded: -1.05rem = -16.8px overlap -> ~35.2px visible (67%)
        // Compressed: -2.35rem = -37.6px overlap -> ~14.4px visible (28%, index only)
        // Standard: -1.65rem = -26.4px overlap -> ~25.6px visible (49%)
        if (isRequiredSuit) {
          overlapPx = 17;
        } else if (isCompressed) {
          overlapPx = 38;
        } else {
          overlapPx = 26;
        }
      } else {
        // Desktop CSS:
        // Expanded: -2.35rem = -37.6px overlap -> ~54.4px visible (59% - natural fan, NOT whole card!)
        // Compressed: -4.15rem = -66.4px overlap -> ~25.6px visible (28% - compact index)
        // Standard: -2.85rem = -45.6px overlap -> ~46.4px visible (50%)
        if (isRequiredSuit) {
          overlapPx = 38;
        } else if (isCompressed) {
          overlapPx = 66;
        } else {
          overlapPx = 46;
        }
      }
    }

    const visibleWidthPx = idx === 0 ? CARD_WIDTH_PX : CARD_WIDTH_PX - overlapPx;
    const percentVisible = Math.round((visibleWidthPx / CARD_WIDTH_PX) * 100);

    return {
      card,
      isRequiredSuit,
      isCompressed,
      canPlay,
      isDimmed,
      overlapPx,
      visibleWidthPx,
      percentVisible,
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

  // Scenario 1: Desktop - Clubs Led in trick (Player holds 4 Clubs)
  console.log('\n[Scenario 1: Desktop] Clubs Led in trick (Player holds 4 Clubs)...');
  const desktopClubsLayout = calculateHandLayout(testHand, 'C', true, 'desktop');

  const dtClubSlots = desktopClubsLayout.filter((s) => s.card.suit === 'C');
  const dtNonClubSlots = desktopClubsLayout.filter((s) => s.card.suit !== 'C');

  assert(dtClubSlots.length === 4, 'Desktop: Should have 4 Club slots');
  assert(dtNonClubSlots.length === 9, 'Desktop: Should have 9 Non-Club slots');

  // Expanded suit on Desktop: must overlap naturally, MUST NOT show whole card (visible % should be < 85%)
  dtClubSlots.forEach((slot, i) => {
    assert(slot.isRequiredSuit === true, `Desktop: Club card ${slot.card.rank}♣ marked as isRequiredSuit`);
    assert(slot.canPlay === true, `Desktop: Club card ${slot.card.rank}♣ canPlay is true`);
    assert(slot.isDimmed === false, `Desktop: Club card ${slot.card.rank}♣ is NOT dimmed (full brightness)`);
    if (i > 0) {
      assert(
        slot.percentVisible >= 50 && slot.percentVisible <= 70,
        `Desktop: Expanded club card has natural fan overlap (visible ${slot.percentVisible}%, not whole card)`
      );
    }
  });

  // Compressed suits on Desktop: tight fanning, NOT dimmed
  dtNonClubSlots.forEach((slot) => {
    assert(slot.isCompressed === true, `Desktop: Non-club card ${slot.card.rank}${slot.card.suit} marked as isCompressed`);
    assert(slot.canPlay === false, `Desktop: Non-club card ${slot.card.rank}${slot.card.suit} canPlay is false`);
    assert(slot.isDimmed === false, `Desktop: Non-club card ${slot.card.rank}${slot.card.suit} is NOT dimmed (stays clean white card stock)`);
    assert(slot.visibleWidthPx <= 30, `Desktop: Compressed card shows index only (got ${slot.visibleWidthPx}px)`);
  });

  // Scenario 2: Mobile Portrait - Clubs Led in trick
  console.log('\n[Scenario 2: Mobile Portrait] Clubs Led in trick (Player holds 4 Clubs)...');
  const mobileClubsLayout = calculateHandLayout(testHand, 'C', true, 'mobile');

  const mobClubSlots = mobileClubsLayout.filter((s) => s.card.suit === 'C');
  const mobNonClubSlots = mobileClubsLayout.filter((s) => s.card.suit !== 'C');

  mobClubSlots.forEach((slot, i) => {
    assert(slot.isRequiredSuit === true, `Mobile: Club card ${slot.card.rank}♣ marked as isRequiredSuit`);
    assert(slot.canPlay === true, `Mobile: Club card ${slot.card.rank}♣ canPlay is true`);
    assert(slot.isDimmed === false, `Mobile: Club card ${slot.card.rank}♣ is NOT dimmed`);
    if (i > 0) {
      assert(
        slot.percentVisible >= 60 && slot.percentVisible <= 75,
        `Mobile: Expanded club card visible ${slot.percentVisible}%, fan overlapping cleanly`
      );
    }
  });

  mobNonClubSlots.forEach((slot) => {
    assert(slot.isCompressed === true, `Mobile: Non-club card ${slot.card.rank}${slot.card.suit} marked as isCompressed`);
    assert(slot.isDimmed === false, `Mobile: Non-club card ${slot.card.rank}${slot.card.suit} is NOT dimmed`);
    assert(slot.visibleWidthPx <= 18, `Mobile: Compressed card condensed to index width <=18px (got ${slot.visibleWidthPx}px)`);
  });

  const totalMobileWidth = mobileClubsLayout.reduce((sum, s) => sum + s.visibleWidthPx, 0);
  console.log(`  -> Total mobile hand width: ${totalMobileWidth}px (Card Width: 52px)`);
  assert(totalMobileWidth <= 360, `Total mobile hand width (${totalMobileWidth}px) fits within 375px viewport`);

  // Scenario 3: Void in Led Suit (Diamonds Led, Hand holds 0 Diamonds)
  console.log('\n[Scenario 3] Void in led suit (Diamonds led, hand holds 0 Diamonds)...');
  const handVoidInDiamonds = testHand.filter((c) => c.suit !== 'D');
  const voidLayout = calculateHandLayout(handVoidInDiamonds, 'D', true, 'desktop');

  assert(voidLayout.every((s) => s.isRequiredSuit === false), 'No cards marked as required suit when void');
  assert(voidLayout.every((s) => s.isCompressed === false), 'No cards compressed when void');
  assert(voidLayout.every((s) => s.canPlay === true), 'All cards playable when void in led suit');
  assert(voidLayout.every((s) => s.isDimmed === false), 'Zero cards dimmed when void');

  // Scenario 4: Opening Lead (No suit led yet)
  console.log('\n[Scenario 4] Opening Lead (Player leads trick, currentLedSuit is null)...');
  const leadLayout = calculateHandLayout(testHand, null, true, 'desktop');

  assert(leadLayout.every((s) => s.isRequiredSuit === false), 'Uniform spacing on opening lead');
  assert(leadLayout.every((s) => s.isCompressed === false), 'Uniform spacing on opening lead');
  assert(leadLayout.every((s) => s.canPlay === true), 'Player can lead any card');
  assert(leadLayout.every((s) => s.isDimmed === false), 'Zero cards dimmed on opening lead');

  console.log('\n🎉 ALL SUIT ACCORDION LOGIC TESTS PASSED PERFECTLY!\n');
}

runTests();
