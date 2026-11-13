import {
  initBotSession,
  requestBotBid,
  requestBotPlay,
  broadcastActionToApiBots,
  cleanupBotSessions,
  seatToPlayerIndex,
} from '../src/logic/tadfeeaApiClient.ts';
import {
  calculateRoundScores,
  checkMatchEnd,
  createInitialGameState,
  dealHands,
  evaluateTrickWinner,
  getNextSeat,
  getPartner,
  getTeam,
  isBidHigher,
  isCardLegal,
  SEATS,
  startDealRound,
} from '../src/logic/gameLogic.ts';
import { getSuperBotBid, getSuperBotCardPlay, getSuperBotDeclaredSuit } from '../src/logic/superBot.ts';
import { Bid, Card, GameState, Seat, Team } from '../src/types.ts';

async function testOneMatch() {
  const t0 = Date.now();
  console.log('Testing 1 match between SuperBot (TeamA) and API Bot (TeamB)...');

  const roomId = `perf_test_${Date.now()}`;
  let state = createInitialGameState('North');
  state = startDealRound(state, 'North');
  const apiSeats: Seat[] = ['West', 'East'];

  let roundsCount = 0;
  while (state.phase !== 'game_over' && roundsCount < 10) {
    roundsCount++;
    // Init API bot sessions
    for (const seat of apiSeats) {
      await initBotSession({
        roomId,
        seat,
        dealer: state.dealer,
        hand: state.hands[seat],
        matchScores: state.matchScores,
      });
    }

    // Auction Phase
    while (state.phase === 'bidding' && state.currentBidder) {
      const seat = state.currentBidder;
      const isApi = apiSeats.includes(seat);
      let bid: Bid;
      if (isApi) {
        const res = await requestBotBid({
          roomId,
          seat,
          turnIndex: state.auctionTurnsCount,
          hand: state.hands[seat],
          dealer: state.dealer,
        });
        bid = res || { seat, type: 'pass' };
      } else {
        bid = getSuperBotBid(state, seat);
      }

      const isDealer = state.dealer === seat;
      const isFinalTurn = state.auctionTurnsCount === 3;

      if (bid.type === 'pass') {
        state.bids.push({ seat, type: 'pass' });
      } else {
        if (isDealer && isFinalTurn && bid.isDealerPrivilegeMatch) {
          state.bids.push(bid);
          state.highestBid = bid;
          state.highestBidder = seat;
        } else if (bid.level && bid.contractType && isBidHigher(bid.level, bid.contractType, state.highestBid)) {
          state.bids.push(bid);
          state.highestBid = bid;
          state.highestBidder = seat;
        } else {
          state.bids.push({ seat, type: 'pass' });
        }
      }

      // Broadcast bid to API bots
      await broadcastActionToApiBots({
        roomId,
        botSeats: apiSeats,
        actionType: 'BID',
        payload: {
          player: seatToPlayerIndex(seat),
          bid_type: bid.type === 'pass' ? 'PASS' : (bid.isDealerPrivilegeMatch ? 'MATCH' : 'BID'),
          level: bid.level || null,
          contract_type: bid.contractType ? (bid.contractType === 'Suit' ? 'SUIT' : 'NT') : null,
        },
      });

      state.auctionTurnsCount++;
      if (state.auctionTurnsCount < 4) {
        state.currentBidder = getNextSeat(seat);
      } else {
        state.currentBidder = null;
        if (!state.highestBid || state.highestBid.type === 'pass') {
          const nextDealer = getNextSeat(state.dealer);
          state = startDealRound(state, nextDealer);
          break;
        }

        state.winningBid = state.highestBid;
        state.declarer = state.highestBidder;
        if (state.winningBid.contractType === 'Suit') {
          state.phase = 'declaring';
        } else {
          state.phase = 'playing';
          state.trumpSuit = 'NT';
          state.currentTurn = state.declarer;
        }
      }
    }

    if (state.phase === 'declaring' && state.declarer) {
      const declarer = state.declarer;
      const suit = getSuperBotDeclaredSuit(state.hands[declarer], state, declarer);
      state.trumpSuit = suit;
      state.phase = 'playing';
      state.currentTurn = getNextSeat(declarer);
      await broadcastActionToApiBots({
        roomId,
        botSeats: apiSeats,
        actionType: 'TRUMP_SELECTION',
        payload: { trump_suit: suit },
      });
    }

    while (state.phase === 'playing' && state.currentTurn) {
      const seat = state.currentTurn;
      const isApi = apiSeats.includes(seat);
      const trump = state.trumpSuit!;
      let card: Card;

      if (isApi) {
        const hand = state.hands[seat];
        const ledSuit = state.currentTrick[0]?.card?.suit || null;
        const legalCards = hand.filter((c) => isCardLegal(c, hand, ledSuit));

        const cardId = await requestBotPlay({
          roomId,
          seat,
          trickNum: state.tricksHistory.length + 1,
          contract: {
            level: state.winningBid?.level || 1,
            type: state.trumpSuit === 'NT' ? 'NT' : 'Suit',
            trump: state.trumpSuit,
            declarer: state.declarer || seat,
          },
          hand,
          legalCards,
        });
        const found = cardId ? hand.find((c) => c.id === cardId) : null;
        if (found && isCardLegal(found, hand, ledSuit)) {
          card = found;
        } else {
          card = getSuperBotCardPlay(state, seat, trump);
        }
      } else {
        card = getSuperBotCardPlay(state, seat, trump);
      }

      const hand = state.hands[seat];
      const cIdx = hand.findIndex((c) => c.id === card.id);
      if (cIdx !== -1) hand.splice(cIdx, 1);
      state.cardsCount[seat] = hand.length;
      state.currentTrick.push({ seat, card });

      await broadcastActionToApiBots({
        roomId,
        botSeats: apiSeats,
        actionType: 'PLAY_CARD',
        payload: { player: seatToPlayerIndex(seat), card: card.id },
      });

      if (state.currentTrick.length < 4) {
        state.currentTurn = getNextSeat(seat);
      } else {
        const trickResult = evaluateTrickWinner(state.currentTrick, trump);
        const winner = trickResult.winner;
        const winnerTeam = getTeam(winner);
        state.tricksWonCount[winner]++;
        state.teamTricksWon[winnerTeam]++;
        state.tricksHistory.push({
          trickNumber: state.tricksHistory.length + 1,
          leader: state.currentTrick[0].seat,
          cards: [...state.currentTrick],
          winner,
          winningCard: trickResult.winningCard,
          ledSuit: state.currentTrick[0].card.suit,
        });
        state.currentTrick = [];

        if (state.tricksHistory.length === 13) {
          const roundScore = calculateRoundScores(
            state.winningBid!,
            state.declarer!,
            state.trumpSuit!,
            roundsCount,
            state.teamTricksWon
          );
          state.roundScores.push(roundScore);
          state.matchScores.TeamA +=
            roundScore.contractTeam === 'TeamA' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;
          state.matchScores.TeamB +=
            roundScore.contractTeam === 'TeamB' ? roundScore.scoreDeltaBidTeam : roundScore.scoreDeltaDefTeam;

          const matchResult = checkMatchEnd(state.matchScores);
          if (matchResult.isOver) {
            state.phase = 'game_over';
            state.winnerTeam = matchResult.winnerTeam;
          } else {
            state.phase = 'round_over';
            state = startDealRound(state, getNextSeat(state.dealer));
          }
          state.currentTurn = null;
        } else {
          state.currentTurn = winner;
        }
      }
    }
  }

  await cleanupBotSessions({ roomId, botSeats: apiSeats });
  console.log(`Match finished in ${Date.now() - t0}ms. Winner: ${state.winnerTeam}, Rounds: ${roundsCount}, Scores:`, state.matchScores);
}

testOneMatch().catch(console.error);
