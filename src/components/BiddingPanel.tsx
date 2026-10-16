import React, { useState, useEffect } from 'react';
import { Bid, Card, ContractType, GameState, Seat } from '../types.ts';
import { isBidHigher, getTeam } from '../logic/gameLogic.ts';
import { Sparkles, Check, X } from 'lucide-react';

interface BiddingPanelProps {
  gameState: GameState;
  mySeat: Seat | null;
  myHand?: Card[];
  onMakeBid: (bid: Bid) => void;
}

export const BiddingPanel: React.FC<BiddingPanelProps> = ({
  gameState,
  mySeat,
  onMakeBid,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [selectedType, setSelectedType] = useState<ContractType>('Suit');

  const isMyTurn = Boolean(mySeat && gameState.currentBidder === mySeat);
  const isDealer = Boolean(mySeat && gameState.dealer === mySeat);
  const isFinalTurn = gameState.auctionTurnsCount === 3; // 4th turn

  const highest = gameState.highestBid;

  const canDealerMatchSuitAtLevel = (lvl: number) => {
    return Boolean(
      isDealer &&
      isFinalTurn &&
      highest &&
      highest.type === 'bid' &&
      highest.level &&
      lvl === highest.level
    );
  };

  const isDealerMatchSuit = Boolean(
    isDealer &&
    isFinalTurn &&
    highest &&
    highest.type === 'bid' &&
    highest.level &&
    selectedLevel === highest.level &&
    selectedType === 'Suit'
  );

  // Automatically default selector: for dealer on final turn, default to matching the suit bid;
  // otherwise default to the lowest legal higher bid.
  useEffect(() => {
    if (!highest || highest.type !== 'bid' || !highest.level) {
      setSelectedLevel(1);
      setSelectedType('Suit');
      return;
    }
    if (isDealer && isFinalTurn) {
      setSelectedLevel(highest.level);
      setSelectedType('Suit');
      return;
    }
    if (highest.contractType === 'Suit') {
      if (highest.level < 7) {
        setSelectedLevel(highest.level + 1);
        setSelectedType('Suit');
      } else {
        setSelectedLevel(7);
        setSelectedType('NT');
      }
    } else {
      if (highest.level < 7) {
        setSelectedLevel(highest.level + 1);
        setSelectedType('Suit');
      }
    }
  }, [highest?.level, highest?.contractType, highest?.type, isDealer, isFinalTurn]);

  const isValidHigherBid = isBidHigher(selectedLevel, selectedType, highest);
  const isValidBid = isValidHigherBid || isDealerMatchSuit;

  const handleStandardBid = () => {
    if (!mySeat || !isValidBid) return;
    onMakeBid({
      seat: mySeat,
      type: 'bid',
      level: selectedLevel,
      contractType: selectedType,
      isDealerPrivilegeMatch: isDealerMatchSuit,
    });
  };

  const handlePass = () => {
    if (!mySeat) return;
    onMakeBid({
      seat: mySeat,
      type: 'pass',
    });
  };

  // Turn sequence starting right of dealer (Counter-Clockwise order)
  const allSeats: Seat[] = ['North', 'West', 'South', 'East'];
  const dealerIndex = allSeats.indexOf(gameState.dealer);
  const biddingOrder: Seat[] = [
    allSeats[(dealerIndex + 1) % 4],
    allSeats[(dealerIndex + 2) % 4],
    allSeats[(dealerIndex + 3) % 4],
    allSeats[dealerIndex], // Dealer is always 4th turn
  ];

  return (
    <div className="bg-slate-950/95 backdrop-blur-md border border-emerald-500/60 rounded-2xl p-2 sm:p-2.5 max-w-[330px] sm:max-w-[360px] w-full mx-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-100 z-30">
      {/* Header: Turn indicator & Leading Bid */}
      <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-800/90 text-xs">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-white font-serif-display text-[11px] sm:text-xs">
            Auction
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            ({gameState.auctionTurnsCount + 1}/4)
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] sm:text-[11px]">
          <span className="text-slate-400">High Bid:</span>
          {highest && highest.type === 'bid' ? (
            <span className="font-bold bg-amber-950/90 border border-amber-500/70 text-amber-300 px-1.5 py-0.5 rounded font-mono">
              {highest.level} {highest.contractType}{' '}
              <span className="text-[9px] text-slate-300">
                ({gameState.highestBidder ? (getTeam(gameState.highestBidder) === 'TeamA' ? 'T1' : 'T2') : ''})
              </span>
            </span>
          ) : (
            <span className="text-emerald-400 font-semibold">None Yet</span>
          )}
        </div>
      </div>

      {/* Compact 4-Player Auction Sequence Strip */}
      <div className="grid grid-cols-4 gap-1 mb-1.5">
        {biddingOrder.map((seat) => {
          const seatBid = gameState.bids.find((b) => b.seat === seat);
          const isCurrentlyBidding = gameState.currentBidder === seat;
          const isThisDealer = gameState.dealer === seat;
          const seatTeam = getTeam(seat);
          const isMe = seat === mySeat;

          return (
            <div
              key={seat}
              className={`py-0.5 px-1 rounded-lg border text-center transition-all ${
                isCurrentlyBidding
                  ? 'ring-2 ring-amber-400 bg-amber-950/75 border-amber-400 shadow-xs'
                  : seatBid
                  ? 'bg-slate-900/90 border-slate-800'
                  : 'bg-slate-950/60 border-slate-800 opacity-65'
              }`}
            >
              <div className="text-[8px] sm:text-[9px] font-bold flex items-center justify-center gap-0.5 leading-tight">
                <span className={seatTeam === 'TeamA' ? 'text-emerald-400' : 'text-blue-400'}>
                  {isMe ? 'You' : seatTeam === 'TeamA' ? 'Team 1' : 'Team 2'}
                </span>
                {isThisDealer && (
                  <span className="text-[7px] bg-amber-500 text-slate-950 px-0.5 rounded font-mono font-black leading-none">
                    D
                  </span>
                )}
              </div>
              <div className="text-[9px] sm:text-[10px] font-mono font-bold leading-tight">
                {seatBid ? (
                  seatBid.type === 'pass' ? (
                    <span className="text-slate-400">PASS</span>
                  ) : (
                    <span className="text-emerald-300">
                      {seatBid.level}{seatBid.contractType === 'NT' ? 'NT' : 'S'}
                    </span>
                  )
                ) : isCurrentlyBidding ? (
                  <span className="text-amber-300 animate-pulse text-[8px]">TURN</span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Controls when it's your turn */}
      {isMyTurn ? (
        <div className="space-y-1.5">
          {/* Level Selector 1 to 7 */}
          <div>
            <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 flex items-center justify-between px-0.5">
              <span>Bid Level</span>
              <span className="text-amber-300 font-mono">
                Goal: {6 + selectedLevel}/13 Tricks
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((lvl) => {
                const canBidAtLevel =
                  isBidHigher(lvl, 'Suit', highest) ||
                  isBidHigher(lvl, 'NT', highest) ||
                  canDealerMatchSuitAtLevel(lvl);
                const isMatchingLvl = canDealerMatchSuitAtLevel(lvl);
                return (
                  <button
                    key={lvl}
                    onClick={() => {
                      setSelectedLevel(lvl);
                      if (
                        !isBidHigher(lvl, selectedType, highest) &&
                        !canDealerMatchSuitAtLevel(lvl) &&
                        isBidHigher(lvl, 'NT', highest)
                      ) {
                        setSelectedType('NT');
                      }
                    }}
                    disabled={!canBidAtLevel}
                    className={`py-0.5 sm:py-1 text-center rounded-md font-bold text-[11px] sm:text-xs transition-all cursor-pointer ${
                      selectedLevel === lvl
                        ? 'bg-amber-400 text-slate-950 shadow-sm ring-2 ring-amber-300 scale-102'
                        : canBidAtLevel
                        ? isMatchingLvl
                          ? 'bg-amber-950/90 text-amber-300 hover:bg-amber-900 border border-amber-500/70'
                          : 'bg-slate-900 text-slate-200 hover:bg-slate-800 border border-slate-700'
                        : 'bg-slate-950 text-slate-600 border border-slate-900 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contract Type Toggle */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => {
                setSelectedType('Suit');
                if (
                  !isBidHigher(selectedLevel, 'Suit', highest) &&
                  !canDealerMatchSuitAtLevel(selectedLevel) &&
                  selectedLevel < 7 &&
                  isBidHigher(selectedLevel + 1, 'Suit', highest)
                ) {
                  setSelectedLevel(selectedLevel + 1);
                }
              }}
              disabled={!isBidHigher(7, 'Suit', highest) && !canDealerMatchSuitAtLevel(selectedLevel)}
              className={`py-1 px-1.5 rounded-lg font-bold text-[11px] sm:text-xs transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                selectedType === 'Suit'
                  ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-400'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>♠ ♥ ♦ ♣ Suit</span>
            </button>
            <button
              onClick={() => setSelectedType('NT')}
              className={`py-1 px-1.5 rounded-lg font-bold text-[11px] sm:text-xs transition-all cursor-pointer flex items-center justify-center gap-1 ${
                selectedType === 'NT'
                  ? 'bg-indigo-600 text-white shadow ring-2 ring-indigo-400'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>No Trump (NT)</span>
            </button>
          </div>

          {/* Action Row: Pass & Bid Buttons */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              onClick={handlePass}
              className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
              <span>Pass</span>
            </button>

            <button
              onClick={handleStandardBid}
              disabled={!isValidBid}
              className={`flex-1 py-1.5 px-2.5 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1 shadow cursor-pointer ${
                isValidBid
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 active:scale-95'
                  : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed opacity-50'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {isDealerMatchSuit
                  ? `Match ${selectedLevel} Suit (${6 + selectedLevel} Tricks)`
                  : `Bid ${selectedLevel} ${selectedType} (${6 + selectedLevel} Tricks)`}
              </span>
            </button>
          </div>
        </div>
      ) : (
        /* Waiting on Bot or Other Player */
        <div className="text-center py-1 text-xs text-slate-300 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span>
            Waiting for{' '}
            <strong className="text-amber-300 font-bold">
              {gameState.currentBidder
                ? getTeam(gameState.currentBidder) === 'TeamA'
                  ? 'Team 1'
                  : 'Team 2'
                : 'Player'}
            </strong>{' '}
            to bid...
          </span>
        </div>
      )}
    </div>
  );
};
