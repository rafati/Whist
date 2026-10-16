/**
 * Animation Configuration for Remix Online Multiplayer Card Game
 *
 * You can easily customize all animation durations (in milliseconds)
 * and easing curves below. Both client visual transitions and server
 * trick resolution timing reference these constants.
 */

export const ANIMATION_CONFIG = {
  /**
   * Duration (in ms) for a card to glide from the player's hand or seat onto the table.
   * Default: 400ms
   */
  CARD_PLAY_DURATION_MS: 400,

  /**
   * Pause duration (in ms) after all 4 cards are played on the table,
   * allowing players to see the completed trick and the winning card highlight
   * before the trick is gathered.
   * Default: 750ms
   */
  TRICK_REVIEW_DELAY_MS: 750,

  /**
   * Duration (in ms) for all 4 cards in the trick to glide/fly into the winning player's seat.
   * Default: 550ms
   */
  TRICK_COLLECT_DURATION_MS: 550,

  /**
   * Duration (in ms) for the winner's seat badge celebration animation.
   * Default: 1000ms
   */
  WINNER_CELEBRATION_DURATION_MS: 1000,

  /**
   * Smooth physics cubic-bezier easing curve for card play flight.
   */
  CARD_FLIGHT_EASING: 'cubic-bezier(0.22, 1, 0.36, 1)',

  /**
   * Physics cubic-bezier easing curve when trick is swept to the winner.
   */
  TRICK_SWEEP_EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',

  /**
   * Flight duration (in ms) for an interactive thrown object (shoe, beer, medal).
   */
  THROW_FLIGHT_DURATION_MS: 650,

  /**
   * Duration (in ms) of the hit reaction effect (shake, splash, particles).
   */
  THROW_HIT_DURATION_MS: 1200,

  /**
   * Cooldown period (in ms) between consecutive throws.
   */
  THROW_COOLDOWN_MS: 2500,
} as const;

/**
 * Total delay on the server before clearing the completed trick,
 * calculated to give enough time for:
 * 1. 4th card flight (CARD_PLAY_DURATION_MS)
 * 2. Visual review pause (TRICK_REVIEW_DELAY_MS)
 * 3. Sweep animation to the winner (TRICK_COLLECT_DURATION_MS)
 * 4. Safety buffer (+150ms)
 */
export const SERVER_TRICK_RESOLVE_DELAY_MS =
  ANIMATION_CONFIG.CARD_PLAY_DURATION_MS +
  ANIMATION_CONFIG.TRICK_REVIEW_DELAY_MS +
  ANIMATION_CONFIG.TRICK_COLLECT_DURATION_MS +
  150;
