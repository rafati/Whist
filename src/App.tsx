import React, { useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './lib/authContext.tsx';
import { SocketProvider, useSocket } from './lib/socketContext.tsx';
import { GoogleAuthScreen } from './components/GoogleAuthScreen.tsx';
import { Lobby } from './components/Lobby.tsx';
import { VirtualTable } from './components/VirtualTable.tsx';
import { AlertCircle, X } from 'lucide-react';

function GameRoot() {
  const { user, isAuthenticated } = useAuth();
  const { currentRoom, joinRoom, joinRoomByCode, leaveRoom, errorMessage, clearError } = useSocket();
  const autoJoinedInviteRef = useRef(false);

  // Automatically join a room if opened via a shareable invite link (?room=CODE)
  useEffect(() => {
    if (!isAuthenticated || !user || currentRoom || autoJoinedInviteRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('room');
    if (inviteCode && inviteCode.trim()) {
      autoJoinedInviteRef.current = true;
      // Clean URL query param so leaving the table later returns cleanly to the Lobby
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.pathname + url.search);
      joinRoomByCode(inviteCode.trim(), user);
    }
  }, [isAuthenticated, user, currentRoom, joinRoomByCode]);

  // If not authenticated via Google Identity Services, show Google Auth Screen
  if (!isAuthenticated || !user) {
    return <GoogleAuthScreen />;
  }

  // If joined a room, show Virtual Table
  if (currentRoom) {
    return (
      <>
        {errorMessage && (
          <div className="fixed top-4 right-4 z-50 bg-rose-950/90 border border-rose-600 text-rose-200 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs animate-in slide-in-from-top duration-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
            <button onClick={clearError} className="ml-2 text-rose-400 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <VirtualTable
          room={currentRoom}
          onLeaveRoom={() => leaveRoom(currentRoom.id, user)}
        />
      </>
    );
  }

  // Otherwise, show Lobby
  return (
    <>
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50 bg-rose-950/90 border border-rose-600 text-rose-200 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs animate-in slide-in-from-top duration-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
          <button onClick={clearError} className="ml-2 text-rose-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <Lobby onEnterRoom={(roomId) => joinRoom(roomId, user)} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <GameRoot />
      </SocketProvider>
    </AuthProvider>
  );
}
