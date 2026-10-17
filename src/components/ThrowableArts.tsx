import React from 'react';
import { ThrowableObjectType } from '../types.ts';

interface ThrowableArtProps {
  size?: number;
  className?: string;
}

/**
 * Custom high-detail cartoon vector illustration of a battered leather boot
 * with rugged sole treads, brass eyelets, stitching, and flapping laces.
 */
export const BootArt: React.FC<ThrowableArtProps> = ({ size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`throwable-svg-shadow ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="bootLeather" x1="12" y1="10" x2="52" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#b45309" />
        <stop offset="55%" stopColor="#78350f" />
        <stop offset="100%" stopColor="#451a03" />
      </linearGradient>
      <linearGradient id="bootToe" x1="34" y1="30" x2="58" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#92400e" />
        <stop offset="100%" stopColor="#3b1502" />
      </linearGradient>
      <linearGradient id="bootSole" x1="8" y1="46" x2="58" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#27272a" />
        <stop offset="100%" stopColor="#09090b" />
      </linearGradient>
    </defs>

    {/* Flapping loose shoelaces */}
    <path
      d="M32 18 C40 10, 49 12, 53 7"
      stroke="#fde68a"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M33 23 C43 18, 50 22, 56 17"
      stroke="#fcd34d"
      strokeWidth="2.2"
      strokeLinecap="round"
    />

    {/* Top ankle cuff */}
    <path
      d="M12 12 C12 9.5, 31 9.5, 31 12 L33 17 L11 17 Z"
      fill="#451a03"
      stroke="#fbbf24"
      strokeWidth="1.2"
    />

    {/* Main leather boot shaft & vamp */}
    <path
      d="M11 16 L32 16 L35 32 C44 32, 56 35, 57 45 L10 45 C9 35, 10 24, 11 16 Z"
      fill="url(#bootLeather)"
      stroke="#290f02"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* Reinforced bulbous toe cap */}
    <path
      d="M39 33.2 C48 33.5, 56.5 37, 57 45 L37 45 C36.5 39, 37.5 35.5, 39 33.2 Z"
      fill="url(#bootToe)"
      stroke="#290f02"
      strokeWidth="1.5"
    />

    {/* Toe cap specular highlight */}
    <path
      d="M42 36 C47 36.2, 51.5 38.5, 52.5 41.5"
      stroke="#f59e0b"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.55"
    />

    {/* Scuff patch & dashed leather stitching */}
    <path
      d="M14 22 L14 41 M10.5 36 C18 36, 23 40, 24 45"
      stroke="#d97706"
      strokeWidth="1.3"
      strokeDasharray="2.5 2.5"
      strokeLinecap="round"
      opacity="0.8"
    />
    <ellipse cx="22" cy="29" rx="4.5" ry="2.3" transform="rotate(-18 22 29)" fill="#451a03" opacity="0.65" />

    {/* Brass eyelets & crossed laces */}
    <circle cx="30" cy="20" r="1.8" fill="#fbbf24" stroke="#451a03" strokeWidth="0.8" />
    <circle cx="31.5" cy="25" r="1.8" fill="#fbbf24" stroke="#451a03" strokeWidth="0.8" />
    <circle cx="33" cy="30" r="1.8" fill="#fbbf24" stroke="#451a03" strokeWidth="0.8" />
    <path
      d="M27 19.5 L33 21 M28.5 24.5 L34.5 26 M30 29.5 L36 31"
      stroke="#fef08a"
      strokeWidth="2"
      strokeLinecap="round"
    />

    {/* Thick rugged cleated sole & heel */}
    <path
      d="M8 45 L58.5 45 L58.5 50.5 L54 50.5 L54 53 L49 53 L49 50.5 L44 50.5 L44 53 L39 53 L39 50.5 L33 50.5 L33 53 L28 53 L28 50.5 L21 50.5 L21 55 L9 55 L8 45 Z"
      fill="url(#bootSole)"
      stroke="#18181b"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Welt stitch line along sole top */}
    <line
      x1="9.5"
      y1="46.2"
      x2="57"
      y2="46.2"
      stroke="#f59e0b"
      strokeWidth="1.4"
      strokeDasharray="3 2.5"
    />
  </svg>
);

/**
 * Muddy sole tread stamp left on the target avatar after a boot hit.
 */
export const BootPrintArt: React.FC<ThrowableArtProps> = ({ size = 52, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <g transform="rotate(-24 32 32)" opacity="0.88">
      {/* Forefoot tread pad */}
      <path
        d="M22 10 C30 8, 42 12, 41 24 C40 31, 37 35, 29 35 C21 35, 19 30, 19 22 C19 15, 20 11, 22 10 Z"
        fill="#451a03"
        stroke="#78350f"
        strokeWidth="1.5"
      />
      {/* Tread grooves */}
      <line x1="21" y1="17" x2="39" y2="17" stroke="#92400e" strokeWidth="2" />
      <line x1="20" y1="23" x2="39" y2="23" stroke="#92400e" strokeWidth="2" />
      <line x1="21" y1="29" x2="37" y2="29" stroke="#92400e" strokeWidth="2" />
      {/* Heel pad */}
      <path
        d="M22 40 L36 40 C37 46, 36 54, 29 55 C22 54, 21 46, 22 40 Z"
        fill="#451a03"
        stroke="#78350f"
        strokeWidth="1.5"
      />
      <line x1="23" y1="46" x2="35" y2="46" stroke="#92400e" strokeWidth="2" />
    </g>
  </svg>
);

/**
 * Custom high-detail vector illustration of an emerald glass beer bottle
 * with gold neck foil, crest label, and overflowing frothy foam head.
 */
export const BeerBottleArt: React.FC<ThrowableArtProps> = ({ size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`throwable-svg-shadow ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="emeraldGlass" x1="18" y1="14" x2="46" y2="58" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="50%" stopColor="#047857" />
        <stop offset="100%" stopColor="#022c22" />
      </linearGradient>
      <linearGradient id="goldFoil" x1="25" y1="12" x2="39" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <linearGradient id="amberLiquid" x1="20" y1="30" x2="44" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.65" />
        <stop offset="100%" stopColor="#d97706" stopOpacity="0.35" />
      </linearGradient>
    </defs>

    {/* Bottle body & neck */}
    <path
      d="M27 12 L37 12 L38 22 C42 26, 45 30, 45 36 L45 55 C45 57.5, 43 59, 40 59 L24 59 C21 59, 19 57.5, 19 55 L19 36 C19 30, 22 26, 26 22 L27 12 Z"
      fill="url(#emeraldGlass)"
      stroke="#022c22"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* Inner golden-amber beer glow */}
    <path
      d="M21 35 C26 33, 38 33, 43 35 L43 55 C43 56.5, 41.5 57, 39.5 57 L24.5 57 C22.5 57, 21 56.5, 21 55 Z"
      fill="url(#amberLiquid)"
    />

    {/* Gold foil wrap around neck */}
    <path
      d="M26.4 13 L37.6 13 L38.2 21.5 C34 23, 30 23, 25.8 21.5 Z"
      fill="url(#goldFoil)"
      stroke="#78350f"
      strokeWidth="1"
    />

    {/* Bottle label with gold border and star */}
    <rect
      x="22"
      y="35"
      width="20"
      height="15"
      rx="2.5"
      fill="#fef3c7"
      stroke="#f59e0b"
      strokeWidth="1.6"
    />
    <path
      d="M32 38.2 L33.4 41.1 L36.6 41.5 L34.2 43.7 L34.8 46.8 L32 45.2 L29.2 46.8 L29.8 43.7 L27.4 41.5 L30.6 41.1 Z"
      fill="#dc2626"
    />

    {/* Glass specular reflection strip */}
    <path
      d="M23 28 C22 31, 22 33, 22 53"
      stroke="#ecfdf5"
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.55"
    />

    {/* Gushing frothy white foam head at top of bottle */}
    <circle cx="27" cy="11" r="4.5" fill="#ffffff" stroke="#fde68a" strokeWidth="1" />
    <circle cx="32" cy="8.5" r="5.5" fill="#ffffff" stroke="#fde68a" strokeWidth="1" />
    <circle cx="37.5" cy="11" r="4.2" fill="#ffffff" stroke="#fde68a" strokeWidth="1" />
    <path
      d="M25 12 C25 16, 27 18, 27 20 C28.5 17.5, 30 15, 31 13 C32 16, 33.5 19, 34.5 22 C36 18.5, 37 15, 39 12 Z"
      fill="#ffffff"
    />
    {/* Escaping fizz bubbles */}
    <circle cx="22" cy="6" r="2" fill="#fef08a" />
    <circle cx="41" cy="5.5" r="2.3" fill="#ffffff" />
    <circle cx="33" cy="2.5" r="1.6" fill="#fef08a" />
  </svg>
);

/**
 * Custom high-detail vector illustration of a 3D Royal Gold Medal
 * with crimson-and-blue V-neck ribbon, bevelled rim, and star crest.
 */
export const GoldMedalArt: React.FC<ThrowableArtProps> = ({ size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`throwable-svg-shadow ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="medalGoldOuter" x1="16" y1="22" x2="48" y2="58" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="45%" stopColor="#facc15" />
        <stop offset="80%" stopColor="#ca8a04" />
        <stop offset="100%" stopColor="#854d0e" />
      </linearGradient>
      <linearGradient id="medalGoldInner" x1="20" y1="26" x2="44" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ca8a04" />
        <stop offset="50%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#fef08a" />
      </linearGradient>
    </defs>

    {/* V-Neck Ribbon Left Wing */}
    <path
      d="M14 6 L26 6 L33 25 L23 25 Z"
      fill="#dc2626"
      stroke="#7f1d1d"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M18 6 L22 6 L29 25 L25 25 Z" fill="#fef2f2" opacity="0.85" />

    {/* V-Neck Ribbon Right Wing */}
    <path
      d="M38 6 L50 6 L41 25 L31 25 Z"
      fill="#1d4ed8"
      stroke="#1e3a8a"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M42 6 L46 6 L37 25 L33 25 Z" fill="#eff6ff" opacity="0.85" />

    {/* Gold Suspension Clasp Ring */}
    <rect
      x="26"
      y="21"
      width="12"
      height="4.5"
      rx="2"
      fill="#facc15"
      stroke="#854d0e"
      strokeWidth="1.3"
    />

    {/* Scalloped Outer Gold Medallion Rim */}
    <circle
      cx="32"
      cy="41"
      r="17.5"
      fill="url(#medalGoldOuter)"
      stroke="#713f12"
      strokeWidth="2"
    />

    {/* Inner Bevelled Recessed Disk */}
    <circle
      cx="32"
      cy="41"
      r="13.5"
      fill="url(#medalGoldInner)"
      stroke="#fef08a"
      strokeWidth="1.4"
    />

    {/* Embossed Center Star Crest */}
    <path
      d="M32 30.5 L35.1 36.8 L42 37.8 L37 42.6 L38.2 49.5 L32 46.2 L25.8 49.5 L27 42.6 L22 37.8 L28.9 36.8 Z"
      fill="#fef9c3"
      stroke="#854d0e"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />

    {/* Specular Shine Glint on Medallion */}
    <path
      d="M21 31 L27 25"
      stroke="#ffffff"
      strokeWidth="2.5"
      strokeLinecap="round"
      opacity="0.8"
    />
    <circle cx="45" cy="30" r="2" fill="#ffffff" opacity="0.9" />
  </svg>
);

/**
 * Helper to render the custom vector artwork for any ThrowableObjectType.
 */
export const ThrowableItemGraphic: React.FC<{
  type: ThrowableObjectType;
  size?: number;
  className?: string;
}> = ({ type, size = 48, className = '' }) => {
  switch (type) {
    case 'shoe':
      return <BootArt size={size} className={className} />;
    case 'beer':
      return <BeerBottleArt size={size} className={className} />;
    case 'medal':
      return <GoldMedalArt size={size} className={className} />;
  }
};

/**
 * Spiky Cartoon / Comic Impact Starburst ("POW / SMACK") for Boot Hits.
 */
export const ComicImpactBurstArt: React.FC<{ size?: number; className?: string }> = ({
  size = 110,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <polygon
      points="50,4 61,26 85,14 74,38 96,50 74,62 85,86 61,74 50,96 39,74 15,86 26,62 4,50 26,38 15,14 39,26"
      fill="#facc15"
      stroke="#dc2626"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />
    <polygon
      points="50,18 57,34 74,25 66,42 82,50 66,58 74,75 57,66 50,82 43,66 26,75 34,58 18,50 34,42 26,25 43,34"
      fill="#fef08a"
    />
  </svg>
);

/**
 * Rotating Golden Sunburst Rays for the Gold Medal Impact Award.
 */
export const SunburstRaysArt: React.FC<{ size?: number; className?: string }> = ({
  size = 136,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <g opacity="0.75">
      {Array.from({ length: 12 }).map((_, idx) => (
        <polygon
          key={idx}
          points="60,60 54,6 66,6"
          fill="url(#rayGrad)"
          transform={`rotate(${idx * 30} 60 60)`}
        />
      ))}
    </g>
    <defs>
      <linearGradient id="rayGrad" x1="60" y1="6" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fef08a" stopOpacity="0" />
        <stop offset="45%" stopColor="#facc15" stopOpacity="0.65" />
        <stop offset="100%" stopColor="#ca8a04" stopOpacity="0.95" />
      </linearGradient>
    </defs>
  </svg>
);
