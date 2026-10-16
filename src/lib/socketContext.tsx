import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { ClientMessage, Room, ServerMessage, UserProfile } from '../types.ts';

interface SocketContextType {
  isConnected: boolean;
  roomsList: Array<{ id: string; name: string; playersCount: number; status: string }>;
  currentRoom: Room | null;
  joinRoom: (roomId: string, user: UserProfile) => void;
  leaveRoom: (roomId: string, user: UserProfile) => void;
  claimSeat: (roomId: string, seat: any, user: UserProfile) => void;
  leaveSeat: (roomId: string, seat: any) => void;
  fillBots: (roomId: string) => void;
  setBotDifficulty: (roomId: string, difficulty: 'casual' | 'super') => void;
  makeBid: (roomId: string, bid: any) => void;
  declareTrump: (roomId: string, suit: any) => void;
  playCard: (roomId: string, seat: any, card: any) => void;
  nextRound: (roomId: string) => void;
  restartMatch: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
  refreshRoomList: () => void;
  errorMessage: string | null;
  clearError: () => void;
  addSocketListener: (handler: (msg: ServerMessage) => void) => () => void;
  sendClientMessage: (msg: ClientMessage) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [roomsList, setRoomsList] = useState<Array<{ id: string; name: string; playersCount: number; status: string }>>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const activeUserRef = useRef<UserProfile | null>(null);
  const listenersRef = useRef<Set<(msg: ServerMessage) => void>>(new Set());

  const addSocketListener = useCallback((handler: (msg: ServerMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = (import.meta.env.VITE_WS_URL as string) || `${protocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (activeRoomIdRef.current && activeUserRef.current) {
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: activeRoomIdRef.current,
          user: activeUserRef.current,
        } satisfies ClientMessage));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data);
        if (data.type === 'room_list') {
          setRoomsList(data.rooms);
        } else if (data.type === 'room_state') {
          setCurrentRoom(data.room);
          activeRoomIdRef.current = data.room.id;
        } else if (data.type === 'room_deleted') {
          if (activeRoomIdRef.current === data.roomId || currentRoom?.id === data.roomId) {
            setCurrentRoom(null);
            activeRoomIdRef.current = null;
            setErrorMessage('This table was deleted.');
          }
          refreshRoomList();
        } else if (data.type === 'error') {
          setErrorMessage(data.message);
        }

        // Notify all registered listeners (e.g. voice chat signaling)
        listenersRef.current.forEach((listener) => {
          try {
            listener(data);
          } catch (listenerErr) {
            console.error('Socket listener callback error:', listenerErr);
          }
        });
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const joinRoom = useCallback((roomId: string, user: UserProfile) => {
    activeRoomIdRef.current = roomId;
    activeUserRef.current = user;
    send({ type: 'join_room', roomId, user });
  }, [send]);

  const leaveRoom = useCallback((roomId: string, user: UserProfile) => {
    activeRoomIdRef.current = null;
    setCurrentRoom(null);
    send({ type: 'leave_room', roomId, user });
  }, [send]);

  const claimSeat = useCallback((roomId: string, seat: any, user: UserProfile) => {
    send({ type: 'claim_seat', roomId, seat, user });
  }, [send]);

  const leaveSeat = useCallback((roomId: string, seat: any) => {
    send({ type: 'leave_seat', roomId, seat });
  }, [send]);

  const fillBots = useCallback((roomId: string) => {
    send({ type: 'fill_bots', roomId });
  }, [send]);

  const setBotDifficulty = useCallback((roomId: string, difficulty: 'casual' | 'super') => {
    send({ type: 'set_bot_difficulty', roomId, difficulty });
  }, [send]);

  const makeBid = useCallback((roomId: string, bid: any) => {
    send({ type: 'make_bid', roomId, bid });
  }, [send]);

  const declareTrump = useCallback((roomId: string, suit: any) => {
    send({ type: 'declare_trump', roomId, suit });
  }, [send]);

  const playCard = useCallback((roomId: string, seat: any, card: any) => {
    send({ type: 'play_card', roomId, seat, card });
  }, [send]);

  const nextRound = useCallback((roomId: string) => {
    send({ type: 'next_round', roomId });
  }, [send]);

  const restartMatch = useCallback((roomId: string) => {
    send({ type: 'restart_match', roomId });
  }, [send]);

  const refreshRoomList = useCallback(() => {
    const apiBase = (import.meta.env.VITE_API_URL as string) || '';
    fetch(`${apiBase}/api/rooms`)
      .then((res) => res.json())
      .then((data) => setRoomsList(data))
      .catch((err) => console.warn('Could not refresh rooms:', err));
  }, []);

  const deleteRoom = useCallback((roomId: string) => {
    send({ type: 'delete_room', roomId });
    const apiBase = (import.meta.env.VITE_API_URL as string) || '';
    fetch(`${apiBase}/api/rooms/${roomId}`, { method: 'DELETE' })
      .then(() => refreshRoomList())
      .catch((err) => console.warn('Could not delete room via REST:', err));

    if (activeRoomIdRef.current === roomId || currentRoom?.id === roomId) {
      activeRoomIdRef.current = null;
      setCurrentRoom(null);
    }
  }, [send, refreshRoomList, currentRoom]);

  const clearError = () => setErrorMessage(null);

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        roomsList,
        currentRoom,
        joinRoom,
        leaveRoom,
        claimSeat,
        leaveSeat,
        fillBots,
        setBotDifficulty,
        makeBid,
        declareTrump,
        playCard,
        nextRound,
        restartMatch,
        deleteRoom,
        refreshRoomList,
        errorMessage,
        clearError,
        addSocketListener,
        sendClientMessage: send,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
