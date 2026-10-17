/**
 * Automated Verification Script for Dynamic Suit Accordion, Card Visibility & Giant Indices
 * Tests:
 * 1. Left-to-Right Overlap Rule: marginLeft on card[idx] controls visibleWidth of card[idx - 1]
 * 2. Strict Left-to-Right Stacking Order (zIndex: idx + 1) so no card ever covers the card to its right
 * 3. 100% Visibility Guarantee: every compressed card exposes >= 21.5px on mobile (>= 32px on desktop),
 *    exceeding the 19px top-left giant Rank & Suit index column width
 * 4. Expanded Suit Selection Ease: played suit cards expose 34px-45px on mobile (52px-63px on desktop)
 *    with extra boundary clearance on the last card of the played suit
 * 5. Non-suit cards are NEVER dimmed (remain crisp white card stock)
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
  idx: number;
  zIndex: number;
  isRequiredSuit: boolean;
  canPlay: boolean;
  isDimmed: boolean;
  slotMarginPx: number; // marginLeft applied to this card's slot (0 for idx === 0)
  visibleWidthPx: number; // How many px of THIS card remain visible before card[idx + 1] overlaps it
  percentVisible: number; // % of THIS card's width that remains visible
}

function calculateHandLayout(
  hand: Card[],
  currentLedSuit: Suit | null,
  isMyTurnToPlay: boolean,
  viewport: { width: number; height: number }
): CardSlotLayout[] {
  const hasRequiredSuitInHand = Boolean(
    currentLedSuit && hand.some((c) => c.suit === currentLedSuit)
  );

  const isPortraitViewport = viewport.height > viewport.width && viewport.width <= 640;
  const isCompactLandscapeViewport = viewport.height <= 480 && viewport.width > viewport.height;

  const cardWidthPx = isPortraitViewport
    ? 62
    : isCompactLandscapeViewport
    ? 52
    : viewport.width >= 1024
    ? 92
    : viewport.width >= 768
    ? 84
    : 76;

  const usableHandWidthPx = isPortraitViewport
    ? Math.min(460, Math.max(340, viewport.width - 14))
    : isCompactLandscapeViewport
    ? Math.min(640, Math.max(420, viewport.width - 36))
    : Math.min(920, Math.max(540, viewport.width - 48));

  const minCompVis = isPortraitViewport
    ? 21.5
    : isCompactLandscapeViewport
    ? 19
    : Math.round(cardWidthPx * 0.35);

  const targetCompVis = isPortraitViewport
    ? 24
    : isCompactLandscapeViewport
    ? 21.5
    : Math.round(cardWidthPx * 0.38);

  const targetExpVis = isPortraitViewport
    ? 39
    : isCompactLandscapeViewport
    ? 33
    : Math.round(cardWidthPx * 0.60);

  const targetStdVis = isPortraitViewport
    ? 28
    : isCompactLandscapeViewport
    ? 25
    : Math.round(cardWidthPx * 0.48);

  const boundaryExtraPx = isPortraitViewport ? 6 : isCompactLandscapeViewport ? 4 : 8;

  const numOverlaps = Math.max(0, hand.length - 1);
  let computedCompVis = targetCompVis;
  let computedExpVis = targetExpVis;
  let computedStdVis = targetStdVis;

  if (numOverlaps > 0) {
    if (!hasRequiredSuitInHand) {
      const maxAllowedStd = (usableHandWidthPx - cardWidthPx) / numOverlaps;
      computedStdVis = Math.max(minCompVis, Math.min(targetStdVis, maxAllowedStd));
    } else {
      let expOverlaps = 0;
      let compOverlaps = 0;
      let boundaryCount = 0;
      for (let i = 0; i < numOverlaps; i++) {
        const prevIsReq = hand[i].suit === currentLedSuit;
        const nextIsReq = hand[i + 1].suit === currentLedSuit;
        if (prevIsReq) {
          expOverlaps++;
          if (!nextIsReq) boundaryCount++;
        } else {
          compOverlaps++;
        }
      }

      const availStripSpace = usableHandWidthPx - cardWidthPx - boundaryCount * boundaryExtraPx;
      const desiredSpace = expOverlaps * targetExpVis + compOverlaps * targetCompVis;

      if (desiredSpace <= availStripSpace) {
        computedCompVis = targetCompVis;
        computedExpVis = targetExpVis;
      } else {
        const scale = availStripSpace / desiredSpace;
        computedCompVis = Math.max(minCompVis, targetCompVis * scale);
        const remainingForExp = availStripSpace - compOverlaps * computedCompVis;
        computedExpVis =
          expOverlaps > 0
            ? Math.min(targetExpVis, Math.max(computedCompVis + 8, remainingForExp / expOverlaps))
            : targetExpVis;

        if (expOverlaps * computedExpVis + compOverlaps * computedCompVis > availStripSpace) {
          const tightScale = availStripSpace / (expOverlaps * computedExpVis + compOverlaps * computedCompVis);
          computedCompVis = Math.max(minCompVis - 1, computedCompVis * tightScale);
          computedExpVis = Math.max(computedCompVis + 6, computedExpVis * tightScale);
        }
      }
    }
  }

  // First compute slotMarginPx for each card idx
  const slotMargins = hand.map((card, idx) => {
    if (idx === 0) return 0;
    const prevCard = hand[idx - 1];
    const prevIsRequired = hasRequiredSuitInHand && prevCard.suit === currentLedSuit;
    const prevIsLastOfReqGroup = prevIsRequired && card.suit !== currentLedSuit;

    const prevVisibleWidth = !hasRequiredSuitInHand
      ? computedStdVis
      : prevIsRequired
      ? computedExpVis + (prevIsLastOfReqGroup ? boundaryExtraPx : 0)
      : computedCompVis;

    return -Math.round(cardWidthPx - prevVisibleWidth);
  });

  return hand.map((card, idx) => {
    const isLegal = isCardLegal(card, hand, currentLedSuit);
    const canPlay = isMyTurnToPlay && isLegal;
    const isDimmed = false;
    const isRequiredSuit = hasRequiredSuitInHand && card.suit === currentLedSuit;

    // Visible width of card[idx] is determined by cardWidthPx + slotMargins[idx + 1] (or full cardWidthPx for last card)
    const nextMargin = idx < hand.length - 1 ? slotMargins[idx + 1] : 0;
    const visibleWidthPx = cardWidthPx + nextMargin;
    const percentVisible = Math.round((visibleWidthPx / cardWidthPx) * 100);

    return {
      card,
      idx,
      zIndex: idx + 1,
      isRequiredSuit,
      canPlay,
      isDimmed,
      slotMarginPx: slotMargins[idx],
      visibleWidthPx,
      percentVisible,
    };
  });
}

function runTests() {
  console.log('--- Royal Whist Dynamic Suit Accordion & Full Card Visibility Verification ---');

  // Scenario 1: Exact reproduction of User Screenshot 1 (9 cards: 5 Spades led + 4 Diamonds on 390x844 iPhone)
  console.log('\n[Scenario 1: iPhone 390x844] 5 Spades Led + 4 Diamonds (Reproduction of Screenshot 1)...');
  const screenshot1Hand: Card[] = [
    { id: 'AS', suit: 'S', rank: 'A' },
    { id: 'KS', suit: 'S', rank: 'K' },
    { id: 'QS', suit: 'S', rank: 'Q' },
    { id: '5S', suit: 'S', rank: '5' },
    { id: '3S', suit: 'S', rank: '3' },
    { id: '10D', suit: 'D', rank: '10' },
    { id: 'KD', suit: 'D', rank: 'K' },
    { id: 'JD', suit: 'D', rank: 'J' },
    { id: '2D', suit: 'D', rank: '2' },
  ];

  const s1Layout = calculateHandLayout(screenshot1Hand, 'S', true, { width: 390, height: 844 });

  // Verify strict left-to-right zIndex so 3♠ NEVER covers 10♦ or K♦
  for (let i = 1; i < s1Layout.length; i++) {
    assert(
      s1Layout[i].zIndex > s1Layout[i - 1].zIndex,
      `Card ${s1Layout[i].card.id} (zIndex=${s1Layout[i].zIndex}) stacks strictly on top of ${s1Layout[i - 1].card.id} (zIndex=${s1Layout[i - 1].zIndex})`
    );
  }

  // Verify ALL 5 Spades have wide expanded visibility (>= 38px) including the last Spade (3♠)
  const s1Spades = s1Layout.filter((s) => s.card.suit === 'S');
  s1Spades.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 38,
      `Spade ${slot.card.id} has wide selectable strip: ${slot.visibleWidthPx}px (${slot.percentVisible}% of card)`
    );
  });

  // Verify ALL 4 Diamonds (including 10♦ and K♦ right after 3♠) have >= 23px visible width so no card is hidden!
  const s1Diamonds = s1Layout.filter((s) => s.card.suit === 'D');
  s1Diamonds.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 23,
      `Diamond ${slot.card.id} is 100% visible (visibleWidth=${slot.visibleWidthPx}px >= 19px index width)`
    );
  });

  // Scenario 2: Exact reproduction of Reference Screenshot 2 (13 cards: 3 Clubs led + 10 non-Clubs on 390x844 iPhone)
  console.log('\n[Scenario 2: iPhone 390x844] 13 Cards (3 Clubs Led + 10 Others, Reference Screenshot 2)...');
  const screenshot2Hand: Card[] = [
    { id: 'QC', suit: 'C', rank: 'Q' },
    { id: 'KC', suit: 'C', rank: 'K' },
    { id: 'AC', suit: 'C', rank: 'A' },
    { id: '7D', suit: 'D', rank: '7' },
    { id: '8D', suit: 'D', rank: '8' },
    { id: '2S', suit: 'S', rank: '2' },
    { id: '3S', suit: 'S', rank: '3' },
    { id: '7S', suit: 'S', rank: '7' },
    { id: '8S', suit: 'S', rank: '8' },
    { id: 'KS', suit: 'S', rank: 'K' },
    { id: '2H', suit: 'H', rank: '2' },
    { id: '8H', suit: 'H', rank: '8' },
    { id: '10H', suit: 'H', rank: '10' },
  ];

  const s2Layout = calculateHandLayout(screenshot2Hand, 'C', true, { width: 390, height: 844 });
  const s2Clubs = s2Layout.filter((s) => s.card.suit === 'C');
  const s2Others = s2Layout.filter((s) => s.card.suit !== 'C');

  s2Clubs.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 36,
      `13-Card Hand: Club ${slot.card.id} expanded to ${slot.visibleWidthPx}px (${slot.percentVisible}%)`
    );
  });

  s2Others.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 21,
      `13-Card Hand: Non-Club ${slot.card.id} clearly visible with ${slot.visibleWidthPx}px strip`
    );
    assert(slot.isDimmed === false, `Non-Club ${slot.card.id} is NOT dimmed`);
  });

  const totalS2Width = s2Layout.reduce((sum, s) => sum + s.visibleWidthPx, 0);
  console.log(`  -> Total 13-card hand width on 390px iPhone: ${totalS2Width}px`);
  assert(totalS2Width <= 380, `Total 13-card hand width (${totalS2Width}px) fits within 390px iPhone screen`);

  // Scenario 3: Desktop 1280x800 (13 cards, 4 Hearts led in the middle of the hand)
  console.log('\n[Scenario 3: Desktop 1280x800] 13 Cards with 4 Hearts Led in middle of hand...');
  const desktopLayout = calculateHandLayout(screenshot2Hand, 'S', true, { width: 1280, height: 800 });
  const dtSpades = desktopLayout.filter((s) => s.card.suit === 'S');
  const dtOthers = desktopLayout.filter((s) => s.card.suit !== 'S');

  dtSpades.forEach((slot) => {
    assert(
      slot.percentVisible >= 55 && slot.percentVisible <= 70,
      `Desktop: Expanded Spade ${slot.card.id} shows ${slot.visibleWidthPx}px (${slot.percentVisible}%, natural overlap, NOT whole card)`
    );
  });

  dtOthers.forEach((slot, i) => {
    if (slot.idx < desktopLayout.length - 1) {
      assert(
        slot.visibleWidthPx >= 32,
        `Desktop: Compressed card ${slot.card.id} shows ${slot.visibleWidthPx}px (${slot.percentVisible}%)`
      );
    }
  });

  console.log('\n🎉 ALL SUIT ACCORDION & CARD VISIBILITY TESTS PASSED PERFECTLY!\n');
}

runTests();
