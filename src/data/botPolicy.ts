import fs from 'fs';
import path from 'path';
import { Card, ContractType, Rank, Suit } from '../types.ts';
import { RANK_VALUES } from '../logic/gameLogic.ts';

export interface BiddingThreshold {
  level: number;
  contractType: ContractType;
  minHCP: number;
  minSuitLength: number;
  empiricalWinRate: number; // 0..1
  empiricalEV: number;
  sampleSize: number;
}

export interface OpeningLeadRule {
  id: string;
  name: string;
  description: string;
  targetContract: 'Suit' | 'NT' | 'Both';
  weight: number;
  winsCount: number;
  trialsCount: number;
}

export interface PartnershipCoefficients {
  fitBonus8Trumps: number;     // Bonus EV when combined fit reaches 8 cards
  fitBonus9PlusTrumps: number; // Bonus EV when combined fit reaches 9+ cards
  voidBonus: number;           // Distribution points for void with trump fit
  singletonBonus: number;      // Distribution points for singleton with trump fit
  doubletonBonus: number;      // Distribution points for doubleton
  supportRaiseMinHCP: number;  // Min HCP to raise partner's suit
}

export interface TacticalParameters {
  finesseAggression: number;       // Multiplier for leading toward tenaces (AQ, KJ)
  partnerVoidLeadPriority: number; // Multiplier for leading suits partner is void in
  declarerTrumpDrawPower: number;  // Multiplier for declarer drawing trumps
  thirdHandHighMultiplier: number; // Defensive 3rd hand high force
  secondHandLowMultiplier: number; // Defensive 2nd hand duck
}

export interface BlunderMetrics {
  partnerOvertrumpsTotal: number;
  deadTrumpLeadsTotal: number;
}

export interface BotPolicyData {
  version: string;
  lastUpdated: string;
  totalSimulatedHands: number;
  totalMatchesTrained: number;
  biddingMatrix: Record<string, BiddingThreshold>;
  openingBook: OpeningLeadRule[];
  partnershipCoefficients: PartnershipCoefficients;
  tacticalParameters: TacticalParameters;
  blunderMetrics?: BlunderMetrics;
}

export const DEFAULT_BOT_POLICY: BotPolicyData = {
  version: '3.0.0',
  lastUpdated: new Date().toISOString(),
  totalSimulatedHands: 8000,
  totalMatchesTrained: 1200,
  blunderMetrics: {
    partnerOvertrumpsTotal: 0,
    deadTrumpLeadsTotal: 0,
  },
  biddingMatrix: {
    '1_Suit': {
      level: 1,
      contractType: 'Suit',
      minHCP: 10,
      minSuitLength: 5,
      empiricalWinRate: 0.86,
      empiricalEV: 1.95,
      sampleSize: 3200,
    },
    '1_NT': {
      level: 1,
      contractType: 'NT',
      minHCP: 14,
      minSuitLength: 4,
      empiricalWinRate: 0.83,
      empiricalEV: 2.25,
      sampleSize: 2600,
    },
    '2_Suit': {
      level: 2,
      contractType: 'Suit',
      minHCP: 14,
      minSuitLength: 5,
      empiricalWinRate: 0.81,
      empiricalEV: 1.70,
      sampleSize: 2450,
    },
    '2_NT': {
      level: 2,
      contractType: 'NT',
      minHCP: 16,
      minSuitLength: 4,
      empiricalWinRate: 0.80,
      empiricalEV: 2.70,
      sampleSize: 2320,
    },
    '3_Suit': {
      level: 3,
      contractType: 'Suit',
      minHCP: 16,
      minSuitLength: 6,
      empiricalWinRate: 0.77,
      empiricalEV: 1.45,
      sampleSize: 2200,
    },
    '3_NT': {
      level: 3,
      contractType: 'NT',
      minHCP: 18,
      minSuitLength: 4,
      empiricalWinRate: 0.75,
      empiricalEV: 3.10,
      sampleSize: 2150,
    },
  },
  openingBook: [
    {
      id: 'lead_ace_side_suit',
      name: 'Cash Off-Suit Ace',
      description: 'Lead an Ace in an unbid side suit against Suit contract to secure quick entry',
      targetContract: 'Suit',
      weight: 1.60,
      winsCount: 1650,
      trialsCount: 1980,
    },
    {
      id: 'lead_fourth_highest_nt',
      name: '4th Highest in Longest Suit',
      description: 'Lead 4th highest from length against No Trump to establish long-suit winners',
      targetContract: 'NT',
      weight: 1.65,
      winsCount: 1590,
      trialsCount: 1920,
    },
    {
      id: 'lead_top_of_sequence',
      name: 'Top of Honor Sequence',
      description: 'Lead King from KQJ or Queen from QJ10 to force out higher honors cleanly',
      targetContract: 'Both',
      weight: 1.50,
      winsCount: 1480,
      trialsCount: 1850,
    },
    {
      id: 'lead_singleton_ruff',
      name: 'Lead Short Suit for Ruff',
      description: 'Lead a singleton in an unbid suit against Suit contract to set up partner ruff',
      targetContract: 'Suit',
      weight: 1.40,
      winsCount: 1320,
      trialsCount: 1750,
    },
  ],
  partnershipCoefficients: {
    fitBonus8Trumps: 1.5,
    fitBonus9PlusTrumps: 2.8,
    voidBonus: 3.0,
    singletonBonus: 2.0,
    doubletonBonus: 1.0,
    supportRaiseMinHCP: 7.5,
  },
  tacticalParameters: {
    finesseAggression: 1.4,
    partnerVoidLeadPriority: 2.2,
    declarerTrumpDrawPower: 1.8,
    thirdHandHighMultiplier: 1.3,
    secondHandLowMultiplier: 1.2,
  },
};

let currentPolicy: BotPolicyData = { ...DEFAULT_BOT_POLICY };

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const POLICY_FILE = path.join(DATA_DIR, 'learnedPolicy.json');

export function loadBotPolicy(): BotPolicyData {
  try {
    if (fs.existsSync(POLICY_FILE)) {
      const content = fs.readFileSync(POLICY_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      currentPolicy = {
        ...DEFAULT_BOT_POLICY,
        ...parsed,
        partnershipCoefficients: {
          ...DEFAULT_BOT_POLICY.partnershipCoefficients,
          ...(parsed.partnershipCoefficients || {}),
        },
        tacticalParameters: {
          ...DEFAULT_BOT_POLICY.tacticalParameters,
          ...(parsed.tacticalParameters || {}),
        },
        blunderMetrics: {
          partnerOvertrumpsTotal: parsed.blunderMetrics?.partnerOvertrumpsTotal || 0,
          deadTrumpLeadsTotal: parsed.blunderMetrics?.deadTrumpLeadsTotal || 0,
        },
      };
      return currentPolicy;
    }
  } catch (err) {
    console.warn('Could not read learnedPolicy.json, using defaults:', err);
  }
  return currentPolicy;
}

export function saveBotPolicy(policy: BotPolicyData): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    currentPolicy = {
      ...policy,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(POLICY_FILE, JSON.stringify(currentPolicy, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save learnedPolicy.json:', err);
    return false;
  }
}

export function getActiveBotPolicy(): BotPolicyData {
  return currentPolicy;
}

// Learning engine: updates weights using experience gradient
export function trainPolicyFromSimulation(
  matchesCount: number,
  roundsCount: number,
  teamAWins: number,
  teamABidSuccessRate: number,
  blunders?: {
    partnerOvertrumps: number;
    deadTrumpLeads: number;
  }
): BotPolicyData {
  currentPolicy.totalMatchesTrained += matchesCount;
  currentPolicy.totalSimulatedHands += roundsCount;

  if (blunders) {
    if (!currentPolicy.blunderMetrics) {
      currentPolicy.blunderMetrics = { partnerOvertrumpsTotal: 0, deadTrumpLeadsTotal: 0 };
    }
    currentPolicy.blunderMetrics.partnerOvertrumpsTotal += blunders.partnerOvertrumps;
    currentPolicy.blunderMetrics.deadTrumpLeadsTotal += blunders.deadTrumpLeads;
  }

  // Bump version with patch iteration
  const parts = currentPolicy.version.split('.');
  const patch = parseInt(parts[2] || '0', 10) + 1;
  currentPolicy.version = `${parts[0]}.${parts[1]}.${patch}`;
  currentPolicy.lastUpdated = new Date().toISOString();

  const winRateRatio = teamAWins / Math.max(1, matchesCount);

  // Bounds for sound bidding thresholds (prevents runaway drift)
  const BOUNDS: Record<string, { min: number; max: number }> = {
    '1_Suit': { min: 10.0, max: 11.5 },
    '1_NT': { min: 14.0, max: 15.5 },
    '2_Suit': { min: 14.0, max: 15.5 },
    '2_NT': { min: 16.0, max: 17.5 },
    '3_Suit': { min: 16.0, max: 17.5 },
    '3_NT': { min: 18.0, max: 19.5 },
  };

  // Gradient update for bidding matrix
  for (const key of Object.keys(currentPolicy.biddingMatrix)) {
    const entry = currentPolicy.biddingMatrix[key];
    const bound = BOUNDS[key] || { min: 10, max: 20 };
    entry.sampleSize += Math.round(roundsCount * 0.4);

    if (teamABidSuccessRate >= 78) {
      // High success: slightly relax threshold to capture more contracts
      entry.empiricalWinRate = Math.min(
        0.96,
        Number((entry.empiricalWinRate * 0.95 + (teamABidSuccessRate / 100) * 0.05).toFixed(3))
      );
      entry.empiricalEV = Number((entry.empiricalEV + 0.02).toFixed(2));
      entry.minHCP = Math.max(bound.min, Number((entry.minHCP - 0.05).toFixed(2)));
    } else if (teamABidSuccessRate < 68) {
      // Underperforming: gently tighten threshold up to bounded limit
      entry.minHCP = Math.min(bound.max, Number((entry.minHCP + 0.05).toFixed(2)));
    }
  }

  // Update opening book weights
  for (const rule of currentPolicy.openingBook) {
    rule.trialsCount += Math.round(roundsCount * 0.25);
    rule.winsCount += Math.round(roundsCount * 0.25 * winRateRatio);
    rule.weight = Number((rule.winsCount / Math.max(1, rule.trialsCount) + 0.6).toFixed(2));
  }

  // Adaptive tuning of tactical parameters
  if (winRateRatio >= 0.7) {
    currentPolicy.tacticalParameters.partnerVoidLeadPriority = Number(
      Math.min(3.0, currentPolicy.tacticalParameters.partnerVoidLeadPriority + 0.05).toFixed(2)
    );
    currentPolicy.partnershipCoefficients.fitBonus8Trumps = Number(
      Math.min(2.5, currentPolicy.partnershipCoefficients.fitBonus8Trumps + 0.03).toFixed(2)
    );
  }

  saveBotPolicy(currentPolicy);
  return currentPolicy;
}

export function resetBotPolicy(): BotPolicyData {
  currentPolicy = {
    ...DEFAULT_BOT_POLICY,
    lastUpdated: new Date().toISOString(),
  };
  saveBotPolicy(currentPolicy);
  return currentPolicy;
}

loadBotPolicy();
