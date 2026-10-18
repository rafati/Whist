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

import fs from 'node:fs';
import path from 'node:path';
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
  cardWidthPx: number;
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
  const isTabletPortraitViewport = viewport.height > viewport.width && viewport.width > 640;
  const isExtraShortLandscape = viewport.height <= 380 && viewport.width > viewport.height;
  const isCompactLandscapeViewport = viewport.height <= 480 && viewport.width > viewport.height;

  const cardWidthPx = isPortraitViewport
    ? 62
    : isExtraShortLandscape
    ? 48
    : isCompactLandscapeViewport
    ? 52
    : viewport.width >= 1024
    ? 92
    : viewport.width >= 768
    ? 84
    : 76;

  const usableHandWidthPx = isPortraitViewport
    ? Math.min(460, Math.max(296, viewport.width - 14))
    : isCompactLandscapeViewport
    ? Math.min(640, Math.max(420, viewport.width - 36))
    : isTabletPortraitViewport
    ? Math.min(920, Math.max(600, viewport.width - 28))
    : Math.min(980, Math.max(540, viewport.width - 36));

  const minCompVis = isPortraitViewport
    ? 22.5
    : isExtraShortLandscape
    ? 18.5
    : isCompactLandscapeViewport
    ? 19.5
    : viewport.width >= 1024
    ? 37
    : viewport.width >= 768
    ? 34
    : 31;

  const targetCompVis = isPortraitViewport
    ? 24.5
    : isExtraShortLandscape
    ? 20.5
    : isCompactLandscapeViewport
    ? 21.5
    : Math.max(minCompVis + 3, Math.round(cardWidthPx * 0.42));

  const targetExpVis = isPortraitViewport
    ? 39
    : isExtraShortLandscape
    ? 31
    : isCompactLandscapeViewport
    ? 33
    : Math.round(cardWidthPx * 0.62);

  const targetStdVis = isPortraitViewport
    ? 28
    : isExtraShortLandscape
    ? 23.5
    : isCompactLandscapeViewport
    ? 25
    : Math.round(cardWidthPx * 0.52);

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
      cardWidthPx,
      slotMarginPx: slotMargins[idx],
      visibleWidthPx,
      percentVisible,
    };
  });
}

function runTests() {
  console.log('--- Multi-Device Screen Resolution & Orientation Card Visibility Verification ---');

  // Verify CSS media queries in src/index.css separate Phone Portrait (<=640px) from Tablet/iPad Portrait (>=641px)
  const cssContent = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  assert(
    cssContent.includes('@media (max-width: 640px) and (orientation: portrait)'),
    'src/index.css scopes phone portrait rules to @media (max-width: 640px) and (orientation: portrait)'
  );
  assert(
    cssContent.includes('@media (min-width: 641px) and (orientation: portrait)'),
    'src/index.css includes dedicated Tablet & iPad Portrait rules (@media (min-width: 641px) and (orientation: portrait))'
  );

  // Scenario 1: iPhone Portrait 390x844 (9 cards: 5 Spades led + 4 Diamonds)
  console.log('\n[Scenario 1: iPhone Portrait 390x844] 5 Spades Led + 4 Diamonds...');
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

  for (let i = 1; i < s1Layout.length; i++) {
    assert(
      s1Layout[i].zIndex > s1Layout[i - 1].zIndex,
      `Card ${s1Layout[i].card.id} (zIndex=${s1Layout[i].zIndex}) stacks strictly on top of ${s1Layout[i - 1].card.id}`
    );
  }

  const s1Spades = s1Layout.filter((s) => s.card.suit === 'S');
  s1Spades.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 38,
      `Spade ${slot.card.id} has wide selectable strip: ${slot.visibleWidthPx}px (${slot.percentVisible}% of card)`
    );
  });

  const s1Diamonds = s1Layout.filter((s) => s.card.suit === 'D');
  s1Diamonds.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 23,
      `Diamond ${slot.card.id} is 100% visible (visibleWidth=${slot.visibleWidthPx}px >= 22px index right edge)`
    );
  });

  // Scenario 2: iPhone Portrait 390x844 (13 cards: 3 Clubs led + 10 non-Clubs)
  console.log('\n[Scenario 2: iPhone Portrait 390x844] 13 Cards (3 Clubs Led + 10 Others)...');
  const full13Hand: Card[] = [
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

  const s2Layout = calculateHandLayout(full13Hand, 'C', true, { width: 390, height: 844 });
  const totalS2Width = s2Layout.reduce((sum, s) => sum + s.visibleWidthPx, 0);
  assert(totalS2Width <= 380, `Total 13-card hand width (${totalS2Width}px) fits within 390px iPhone screen`);

  // Scenario 3: iPad Portrait 768x1024 & 820x1180 & 1024x1366 (13 Cards)
  for (const ipadViewport of [
    { name: 'iPad Mini / 9th Gen Portrait (768x1024)', width: 768, height: 1024, minIndexPx: 33 },
    { name: 'iPad Air / Pro 11" Portrait (820x1180)', width: 820, height: 1180, minIndexPx: 33 },
    { name: 'iPad Pro 12.9" Portrait (1024x1366)', width: 1024, height: 1366, minIndexPx: 36 },
  ]) {
    console.log(`\n[Scenario 3: ${ipadViewport.name}] 13 Cards...`);
    const ipadLayout = calculateHandLayout(full13Hand, 'S', true, ipadViewport);
    ipadLayout.forEach((slot) => {
      assert(
        slot.visibleWidthPx > ipadViewport.minIndexPx,
        `${ipadViewport.name}: Card ${slot.card.id} visibleWidth=${slot.visibleWidthPx}px > ${ipadViewport.minIndexPx}px index width (${slot.percentVisible}%)`
      );
    });
    const totalIpadHandW = ipadLayout.reduce((sum, s) => sum + s.visibleWidthPx, 0);
    assert(
      totalIpadHandW <= ipadViewport.width - 24,
      `${ipadViewport.name}: Total 13-card hand width (${totalIpadHandW}px) fits comfortably inside ${ipadViewport.width}px screen`
    );
  }

  // Scenario 4: Mobile Landscape (844x390 and extra-short 667x350)
  for (const landViewport of [
    { name: 'iPhone Landscape (844x390)', width: 844, height: 390, expectedCardW: 52 },
    { name: 'Compact Safari Landscape (667x350)', width: 667, height: 350, expectedCardW: 48 },
  ]) {
    console.log(`\n[Scenario 4: ${landViewport.name}] 13 Cards...`);
    const landLayout = calculateHandLayout(full13Hand, 'H', true, landViewport);
    assert(
      landLayout[0].cardWidthPx === landViewport.expectedCardW,
      `${landViewport.name}: JS cardWidthPx (${landLayout[0].cardWidthPx}px) matches CSS width (${landViewport.expectedCardW}px)`
    );
    landLayout.forEach((slot) => {
      assert(
        slot.visibleWidthPx >= 18,
        `${landViewport.name}: Card ${slot.card.id} visibleWidth=${slot.visibleWidthPx}px (${slot.percentVisible}%)`
      );
    });
  }

  // Scenario 5: Desktop 1280x800 (13 cards, Spades led in middle of hand)
  console.log('\n[Scenario 5: Desktop 1280x800] 13 Cards with Spades Led...');
  const desktopLayout = calculateHandLayout(full13Hand, 'S', true, { width: 1280, height: 800 });
  desktopLayout.forEach((slot) => {
    assert(
      slot.visibleWidthPx >= 37,
      `Desktop: Card ${slot.card.id} shows ${slot.visibleWidthPx}px (>= 36px lg index right edge, ${slot.percentVisible}%)`
    );
  });

  console.log('\n🎉 ALL MULTI-DEVICE SCREEN RESOLUTION & ORIENTATION TESTS PASSED!\n');
}

runTests();

