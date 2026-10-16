/**
 * Session identifier utility.
 * Guarantees that each browser tab, window, or device machine has a unique session token.
 * Even if the same Google account signs in from two different machines or two browsers,
 * they will be assigned separate player session IDs inside the game.
 */

const SESSION_STORAGE_KEY = 'whist_client_session_v1';

export function getClientSessionId(): string {
  try {
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return 'sess_' + Math.random().toString(36).substring(2, 9);
  }
}
