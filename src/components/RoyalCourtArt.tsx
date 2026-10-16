import React from 'react';
import { Rank, Suit } from '../types.ts';
import { SUIT_SYMBOLS } from '../logic/gameLogic.ts';

interface RoyalCourtArtProps {
  rank: Rank;
  suit: Suit;
  className?: string;
}

export const RoyalCourtArt: React.FC<RoyalCourtArtProps> = ({ rank, suit, className = '' }) => {
  const isRed = suit === 'H' || suit === 'D';
  const suitColor = isRed ? '#dc2626' : '#0f172a';
  const symbol = SUIT_SYMBOLS[suit];

  if (rank === 'K') {
    return (
      <svg
        viewBox="0 0 100 130"
        className={`w-full h-full select-none pointer-events-none ${className}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="kingGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id="kingRobe" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isRed ? '#b91c1c' : '#1e3a8a'} />
            <stop offset="100%" stopColor={isRed ? '#7f1d1d' : '#0f172a'} />
          </linearGradient>
        </defs>

        {/* Inner Card Frame */}
        <rect x="2" y="2" width="96" height="126" rx="5" fill="#fcfbf7" stroke="#eab308" strokeWidth="1.5" />
        <rect x="5" y="5" width="90" height="120" rx="3" fill="none" stroke="#d1d5db" strokeWidth="0.75" />

        {/* Robe Background */}
        <path d="M12 122 L16 75 L32 60 L68 60 L84 75 L88 122 Z" fill="url(#kingRobe)" />
        
        {/* Ermine Collar (White fur with black ermine spots) */}
        <path d="M22 62 C22 62, 50 82, 78 62 L82 86 C50 104, 50 104, 18 86 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        {/* Ermine spots */}
        <circle cx="34" cy="80" r="1.5" fill="#0f172a" />
        <circle cx="50" cy="88" r="1.5" fill="#0f172a" />
        <circle cx="66" cy="80" r="1.5" fill="#0f172a" />
        <circle cx="42" cy="74" r="1.2" fill="#0f172a" />
        <circle cx="58" cy="74" r="1.2" fill="#0f172a" />

        {/* Ornate Royal Torso Sash & Medallion */}
        <path d="M38 88 L50 122 L62 88 Z" fill="url(#kingGold)" stroke="#b45309" strokeWidth="0.8" />
        <circle cx="50" cy="100" r="4.5" fill="#dc2626" stroke="#fbbf24" strokeWidth="1" />

        {/* King Face */}
        <ellipse cx="50" cy="46" rx="14" ry="16" fill="#fde68a" stroke="#d97706" strokeWidth="0.8" />

        {/* Beard & Mustache */}
        <path d="M38 52 C38 68, 62 68, 62 52 C58 56, 42 56, 38 52 Z" fill="#fef08a" stroke="#d97706" strokeWidth="0.8" />
        <path d="M42 49 C46 53, 54 53, 58 49 C55 52, 45 52, 42 49 Z" fill="#b45309" />

        {/* Eyes & Eyebrows */}
        <path d="M41 42 Q44 40 47 42" stroke="#451a03" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M53 42 Q56 40 59 42" stroke="#451a03" strokeWidth="1" fill="none" strokeLinecap="round" />
        <circle cx="44" cy="44" r="1" fill="#0f172a" />
        <circle cx="56" cy="44" r="1" fill="#0f172a" />
        {/* Nose */}
        <path d="M50 43 L48 48 L52 48" stroke="#b45309" strokeWidth="0.9" fill="none" strokeLinecap="round" />

        {/* Hair / Curls */}
        <path d="M36 38 C32 46, 34 56, 36 60" stroke="#ca8a04" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M64 38 C68 46, 66 56, 64 60" stroke="#ca8a04" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* Gold Crown */}
        <path d="M34 34 L37 18 L44 26 L50 15 L56 26 L63 18 L66 34 Z" fill="url(#kingGold)" stroke="#b45309" strokeWidth="1" />
        <rect x="34" y="31" width="32" height="4" rx="1" fill="#dc2626" stroke="#b45309" strokeWidth="0.8" />
        <circle cx="42" cy="33" r="1" fill="#ffffff" />
        <circle cx="50" cy="33" r="1" fill="#3b82f6" />
        <circle cx="58" cy="33" r="1" fill="#ffffff" />

        {/* Upright Royal Sword */}
        <line x1="20" y1="36" x2="20" y2="108" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="36" x2="20" y2="40" stroke="#f8fafc" strokeWidth="3" />
        {/* Crossguard */}
        <line x1="14" y1="52" x2="26" y2="52" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" />
        {/* Pommel */}
        <circle cx="20" cy="110" r="3" fill="#eab308" stroke="#ca8a04" strokeWidth="0.8" />

        {/* Corner Mini Suit Shields */}
        <g transform="translate(73, 94)">
          <circle cx="10" cy="10" r="9" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
          <text
            x="10"
            y="14"
            textAnchor="middle"
            fill={suitColor}
            fontSize="12"
            fontWeight="900"
            fontFamily="sans-serif"
          >
            {symbol}
          </text>
        </g>
      </svg>
    );
  }

  if (rank === 'Q') {
    return (
      <svg
        viewBox="0 0 100 130"
        className={`w-full h-full select-none pointer-events-none ${className}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="queenGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id="queenGown" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isRed ? '#e11d48' : '#2563eb'} />
            <stop offset="100%" stopColor={isRed ? '#9f1239' : '#1e3a8a'} />
          </linearGradient>
        </defs>

        {/* Inner Card Frame */}
        <rect x="2" y="2" width="96" height="126" rx="5" fill="#fcfbf7" stroke="#eab308" strokeWidth="1.5" />
        <rect x="5" y="5" width="90" height="120" rx="3" fill="none" stroke="#d1d5db" strokeWidth="0.75" />

        {/* Royal Gown */}
        <path d="M14 122 L18 78 L34 62 L66 62 L82 78 L86 122 Z" fill="url(#queenGown)" />

        {/* White Lace Veil & Bodice */}
        <path d="M28 36 C22 52, 22 75, 20 100 L32 100 L35 70 L65 70 L68 100 L80 100 C78 75, 78 52, 72 36 Z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.8" />
        <path d="M36 68 Q50 82 64 68 L50 114 Z" fill="#fef08a" stroke="#eab308" strokeWidth="0.8" />

        {/* Pearl Necklace */}
        <path d="M38 60 Q50 70 62 60" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeDasharray="1,2" />

        {/* Queen Face */}
        <ellipse cx="50" cy="45" rx="13" ry="15" fill="#fde68a" stroke="#d97706" strokeWidth="0.8" />

        {/* Hair */}
        <path d="M36 36 C34 44, 34 52, 37 56" stroke="#92400e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M64 36 C66 44, 66 52, 63 56" stroke="#92400e" strokeWidth="2.2" fill="none" strokeLinecap="round" />

        {/* Eyes & Smile */}
        <path d="M42 42 Q45 40 48 42" stroke="#451a03" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M52 42 Q55 40 58 42" stroke="#451a03" strokeWidth="1" fill="none" strokeLinecap="round" />
        <circle cx="45" cy="43.5" r="1" fill="#0f172a" />
        <circle cx="55" cy="43.5" r="1" fill="#0f172a" />
        <path d="M50 43 L49 47 L51 47" stroke="#b45309" strokeWidth="0.8" fill="none" />
        <path d="M46 52 Q50 55 54 52" stroke="#dc2626" strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Queen Crown */}
        <path d="M36 32 L39 18 L45 25 L50 16 L55 25 L61 18 L64 32 Z" fill="url(#queenGold)" stroke="#b45309" strokeWidth="1" />
        <circle cx="50" cy="16" r="2" fill="#ffffff" stroke="#eab308" strokeWidth="0.5" />
        <rect x="36" y="30" width="28" height="3" fill="#e11d48" />

        {/* Scepter / Royal Rose held in hand */}
        <g transform="translate(18, 54)">
          <line x1="6" y1="0" x2="6" y2="52" stroke="#eab308" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6" cy="0" r="5" fill="#f43f5e" stroke="#be123c" strokeWidth="1" />
          <circle cx="6" cy="0" r="2.5" fill="#ffe4e6" />
        </g>

        {/* Suit Shield */}
        <g transform="translate(73, 94)">
          <circle cx="10" cy="10" r="9" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
          <text
            x="10"
            y="14"
            textAnchor="middle"
            fill={suitColor}
            fontSize="12"
            fontWeight="900"
            fontFamily="sans-serif"
          >
            {symbol}
          </text>
        </g>
      </svg>
    );
  }

  // Jack (J)
  return (
    <svg
      viewBox="0 0 100 130"
      className={`w-full h-full select-none pointer-events-none ${className}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="jackGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id="jackTunic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={isRed ? '#b91c1c' : '#1d4ed8'} />
          <stop offset="100%" stopColor={isRed ? '#881337' : '#1e3a8a'} />
        </linearGradient>
      </defs>

      {/* Inner Card Frame */}
      <rect x="2" y="2" width="96" height="126" rx="5" fill="#fcfbf7" stroke="#eab308" strokeWidth="1.5" />
      <rect x="5" y="5" width="90" height="120" rx="3" fill="none" stroke="#d1d5db" strokeWidth="0.75" />

      {/* Knight / Courtier Tunic */}
      <path d="M14 122 L18 74 L34 60 L66 60 L82 74 L86 122 Z" fill="url(#jackTunic)" />

      {/* Heraldic Chevrons on Tunic */}
      <path d="M36 78 L50 94 L64 78" stroke="#fbbf24" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M36 92 L50 108 L64 92" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* White Ruffled Collar */}
      <path d="M30 58 Q50 68 70 58 L66 66 Q50 76 34 66 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />

      {/* Jack Face (Young Courtier, clean-shaven) */}
      <ellipse cx="50" cy="44" rx="13" ry="14" fill="#fde68a" stroke="#d97706" strokeWidth="0.8" />

      {/* Flowing Young Hair */}
      <path d="M36 36 C32 46, 33 54, 35 58" stroke="#d97706" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M64 36 C68 46, 67 54, 65 58" stroke="#d97706" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* Eyes & Smirk */}
      <path d="M42 41 Q45 39 48 41" stroke="#451a03" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M52 41 Q55 39 58 41" stroke="#451a03" strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="45" cy="42.5" r="1" fill="#0f172a" />
      <circle cx="55" cy="42.5" r="1" fill="#0f172a" />
      <path d="M50 42 L49 46 L51 46" stroke="#b45309" strokeWidth="0.8" fill="none" />
      <path d="M46 51 Q50 53 54 50" stroke="#b45309" strokeWidth="1" fill="none" strokeLinecap="round" />

      {/* Feathered Beret / Chaperon Hat */}
      <path d="M32 34 C32 20, 68 20, 68 34 Z" fill={isRed ? '#991b1b' : '#1e3a8a'} stroke="#0f172a" strokeWidth="1" />
      <rect x="30" y="32" width="40" height="4" rx="1.5" fill="#fbbf24" stroke="#ca8a04" strokeWidth="0.8" />
      {/* Tall Plumed Feather */}
      <path d="M64 32 C68 14, 76 10, 82 8 C78 16, 72 24, 66 32 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />
      <circle cx="64" cy="32" r="2.5" fill="#dc2626" />

      {/* Halberd / Axe / Spear Weapon */}
      <line x1="20" y1="20" x2="20" y2="114" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 28 L20 18 L28 28 L20 25 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.8" />
      <path d="M20 28 C26 28, 28 34, 25 38 L20 34 Z" fill="#94a3b8" />

      {/* Suit Shield */}
      <g transform="translate(73, 94)">
        <circle cx="10" cy="10" r="9" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
        <text
          x="10"
          y="14"
          textAnchor="middle"
          fill={suitColor}
          fontSize="12"
          fontWeight="900"
          fontFamily="sans-serif"
        >
          {symbol}
        </text>
      </g>
    </svg>
  );
};
