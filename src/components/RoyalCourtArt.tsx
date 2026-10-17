import React from 'react';
import { Rank, Suit } from '../types.ts';

interface RoyalCourtArtProps {
  rank: Rank;
  suit: Suit;
  className?: string;
}

export const RoyalCourtArt: React.FC<RoyalCourtArtProps> = ({ rank, suit, className = '' }) => {
  const isRed = suit === 'H' || suit === 'D';
  const primaryRobe = isRed ? '#b91c1c' : '#1e3a8a';
  const secondaryRobe = isRed ? '#dc2626' : '#2563eb';
  const gold = '#eab308';
  const darkGold = '#ca8a04';
  const faceSkin = '#fde68a';
  const faceBorder = '#b45309';

  // Symmetrical Double-Headed King
  if (rank === 'K') {
    const HalfKing = () => (
      <g>
        {/* Robe Background */}
        <path d="M12 65 L18 36 L34 26 L66 26 L82 36 L88 65 Z" fill={primaryRobe} />
        <path d="M22 65 L28 42 L38 32 L62 32 L72 42 L78 65 Z" fill={secondaryRobe} />

        {/* Ermine Fur Collar (White with black ermine spots) */}
        <path d="M26 34 C26 34, 50 48, 74 34 L78 48 C50 60, 50 60, 22 48 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />
        <circle cx="34" cy="45" r="1.2" fill="#0f172a" />
        <circle cx="50" cy="51" r="1.2" fill="#0f172a" />
        <circle cx="66" cy="45" r="1.2" fill="#0f172a" />
        <circle cx="42" cy="41" r="0.9" fill="#0f172a" />
        <circle cx="58" cy="41" r="0.9" fill="#0f172a" />

        {/* Ornate Gold Royal Medallion */}
        <path d="M42 50 L50 65 L58 50 Z" fill={gold} stroke={darkGold} strokeWidth="0.6" />
        <circle cx="50" cy="56" r="3" fill={isRed ? '#dc2626' : '#2563eb'} stroke={gold} strokeWidth="0.6" />

        {/* Face */}
        <ellipse cx="50" cy="24" rx="11" ry="12" fill={faceSkin} stroke={faceBorder} strokeWidth="0.7" />

        {/* Beard & Mustache */}
        <path d="M40 28 C40 40, 60 40, 60 28 C56 31, 44 31, 40 28 Z" fill="#fef08a" stroke={faceBorder} strokeWidth="0.6" />
        <path d="M43 27 C47 30, 53 30, 57 27 C54 29, 46 29, 43 27 Z" fill={faceBorder} />

        {/* Eyes & Eyebrows */}
        <path d="M43 21 Q46 19 48 21" stroke="#451a03" strokeWidth="0.8" fill="none" />
        <path d="M52 21 Q54 19 57 21" stroke="#451a03" strokeWidth="0.8" fill="none" />
        <circle cx="45" cy="22.5" r="0.8" fill="#0f172a" />
        <circle cx="55" cy="22.5" r="0.8" fill="#0f172a" />
        {/* Nose */}
        <path d="M50 22 L48.5 25.5 L51.5 25.5" stroke={faceBorder} strokeWidth="0.7" fill="none" />

        {/* Royal Hair Curls */}
        <path d="M38 18 C35 24, 36 30, 38 34" stroke={darkGold} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M62 18 C65 24, 64 30, 62 34" stroke={darkGold} strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Gold Crown */}
        <path d="M37 15 L40 4 L45 10 L50 2 L55 10 L60 4 L63 15 Z" fill={gold} stroke={darkGold} strokeWidth="0.8" />
        <rect x="37" y="13" width="26" height="3" rx="0.5" fill={isRed ? '#dc2626' : '#1e3a8a'} stroke={darkGold} strokeWidth="0.5" />
        <circle cx="43" cy="14.5" r="0.8" fill="#ffffff" />
        <circle cx="50" cy="14.5" r="0.8" fill={gold} />
        <circle cx="57" cy="14.5" r="0.8" fill="#ffffff" />

        {/* Royal Upright Sword */}
        <line x1="18" y1="12" x2="18" y2="65" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="14" y1="24" x2="22" y2="24" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        <circle cx="18" cy="10" r="2.2" fill={gold} stroke={darkGold} strokeWidth="0.6" />
      </g>
    );

    return (
      <svg
        viewBox="12 0 78 65"
        className={`w-full h-full select-none pointer-events-none ${className}`}
        preserveAspectRatio="xMidYMax meet"
      >
        <HalfKing />
      </svg>
    );
  }

  // Upright Royal Queen
  if (rank === 'Q') {
    const HalfQueen = () => (
      <g>
        {/* Royal Gown */}
        <path d="M14 65 L18 38 L34 27 L66 27 L82 38 L86 65 Z" fill={primaryRobe} />
        <path d="M24 65 L28 44 L36 33 L64 33 L72 44 L76 65 Z" fill={secondaryRobe} />

        {/* White Lace Veil & Bodice */}
        <path d="M28 16 C22 28, 22 45, 20 65 L32 65 L34 44 L66 44 L68 65 L80 65 C78 45, 78 28, 72 16 Z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.6" />
        <path d="M38 42 Q50 52 62 42 L50 65 Z" fill="#fef08a" stroke={gold} strokeWidth="0.6" />

        {/* Pearl Necklace */}
        <path d="M40 38 Q50 45 60 38" fill="none" stroke="#cbd5e1" strokeWidth="1.8" strokeDasharray="1,1.5" />

        {/* Face */}
        <ellipse cx="50" cy="23" rx="10.5" ry="11.5" fill={faceSkin} stroke={faceBorder} strokeWidth="0.7" />

        {/* Soft Royal Hair */}
        <path d="M38 18 C36 24, 37 30, 39 33" stroke="#92400e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M62 18 C64 24, 63 30, 61 33" stroke="#92400e" strokeWidth="1.8" fill="none" strokeLinecap="round" />

        {/* Eyes & Smile */}
        <path d="M43 21 Q46 19 48 21" stroke="#451a03" strokeWidth="0.8" fill="none" />
        <path d="M52 21 Q54 19 57 21" stroke="#451a03" strokeWidth="0.8" fill="none" />
        <circle cx="45" cy="22.5" r="0.8" fill="#0f172a" />
        <circle cx="55" cy="22.5" r="0.8" fill="#0f172a" />
        <path d="M50 22 L49 25 L51 25" stroke={faceBorder} strokeWidth="0.6" fill="none" />
        <path d="M47 28 Q50 30 53 28" stroke="#dc2626" strokeWidth="1" fill="none" strokeLinecap="round" />

        {/* Queen Crown */}
        <path d="M38 15 L40 5 L45 10 L50 4 L55 10 L60 5 L62 15 Z" fill={gold} stroke={darkGold} strokeWidth="0.8" />
        <circle cx="50" cy="4" r="1.5" fill="#ffffff" stroke={gold} strokeWidth="0.4" />
        <rect x="38" y="13" width="24" height="2.5" fill={isRed ? '#e11d48' : '#2563eb'} />

        {/* Royal Scepter / Flower */}
        <line x1="22" y1="26" x2="22" y2="65" stroke={gold} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="22" cy="24" r="3.5" fill="#f43f5e" stroke="#be123c" strokeWidth="0.8" />
        <circle cx="22" cy="24" r="1.5" fill="#ffe4e6" />
      </g>
    );

    return (
      <svg
        viewBox="12 0 78 65"
        className={`w-full h-full select-none pointer-events-none ${className}`}
        preserveAspectRatio="xMidYMax meet"
      >
        <HalfQueen />
      </svg>
    );
  }

  // Upright Royal Jack
  const HalfJack = () => (
    <g>
      {/* Tunic */}
      <path d="M14 65 L18 36 L34 26 L66 26 L82 36 L86 65 Z" fill={primaryRobe} />
      <path d="M22 65 L26 42 L36 32 L64 32 L74 42 L78 65 Z" fill={secondaryRobe} />

      {/* Heraldic Chevrons */}
      <path d="M38 45 L50 56 L62 45" stroke={gold} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M38 54 L50 65 L62 54" stroke="#ffffff" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* Ruffled White Collar */}
      <path d="M32 30 Q50 36 68 30 L65 35 Q50 41 35 35 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" />

      {/* Jack Face (Young Courtier) */}
      <ellipse cx="50" cy="22" rx="10.5" ry="11" fill={faceSkin} stroke={faceBorder} strokeWidth="0.7" />

      {/* Hair */}
      <path d="M38 18 C35 24, 36 30, 38 33" stroke="#d97706" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M62 18 C65 24, 64 30, 62 33" stroke="#d97706" strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* Eyes & Confident Smirk */}
      <path d="M43 20 Q46 18 48 20" stroke="#451a03" strokeWidth="0.8" fill="none" />
      <path d="M52 20 Q54 18 57 20" stroke="#451a03" strokeWidth="0.8" fill="none" />
      <circle cx="45" cy="21.5" r="0.8" fill="#0f172a" />
      <circle cx="55" cy="21.5" r="0.8" fill="#0f172a" />
      <path d="M50 21 L49 24.5 L51 24.5" stroke={faceBorder} strokeWidth="0.6" fill="none" />
      <path d="M47 27 Q50 29 53 27" stroke={faceBorder} strokeWidth="0.8" fill="none" strokeLinecap="round" />

      {/* Feathered Courtier Beret */}
      <path d="M34 15 C34 5, 66 5, 66 15 Z" fill={isRed ? '#991b1b' : '#1e3a8a'} stroke="#0f172a" strokeWidth="0.8" />
      <rect x="33" y="14" width="34" height="2.5" rx="0.8" fill={gold} stroke={darkGold} strokeWidth="0.5" />
      {/* Plumed Feather */}
      <path d="M63 14 C66 2, 73 1, 78 0 C75 6, 70 10, 65 14 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" />
      <circle cx="63" cy="14" r="1.8" fill="#dc2626" />

      {/* Halberd / Guard Spear */}
      <line x1="20" y1="6" x2="20" y2="65" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 14 L20 6 L26 14 L20 12 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.6" />
    </g>
  );

  return (
    <svg
      viewBox="12 0 78 65"
      className={`w-full h-full select-none pointer-events-none ${className}`}
      preserveAspectRatio="xMidYMax meet"
    >
      <HalfJack />
    </svg>
  );
};
