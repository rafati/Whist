import React, { createContext, useContext, useState } from 'react';
import { UserProfile } from '../types.ts';
import { getClientSessionId } from './session.ts';

interface StoredGoogleAccount {
  sub: string;
  name: string;
  email: string;
  avatar: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  loginWithGoogle: (profile: Partial<UserProfile> & { sub?: string }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'whist_google_account_v2';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const account: StoredGoogleAccount = JSON.parse(saved);
      if (!account.name && !account.email) return null;

      // Unique session token for this browser tab/window
      const sessionId = getClientSessionId();
      const sub = account.sub || account.email.replace(/[^a-zA-Z0-9]/g, '_');

      return {
        id: `${sub}_${sessionId}`,
        name: account.name,
        email: account.email,
        avatar: account.avatar,
      };
    } catch {
      return null;
    }
  });

  const loginWithGoogle = (profile: Partial<UserProfile> & { sub?: string }) => {
    const sessionId = getClientSessionId();
    const sub = profile.sub || profile.id || (profile.email ? profile.email.replace(/[^a-zA-Z0-9]/g, '_') : `user_${Date.now()}`);
    const name = profile.name?.trim() || 'Google Player';
    const email = profile.email?.trim() || 'player@google.com';
    const avatar = profile.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0f766e,1e40af,b91c1c`;

    const storedAccount: StoredGoogleAccount = {
      sub,
      name,
      email,
      avatar,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAccount));
    } catch (e) {
      console.error('Failed to save user account', e);
    }

    const inGameProfile: UserProfile = {
      id: `${sub}_${sessionId}`,
      name,
      email,
      avatar,
    };

    setUser(inGameProfile);
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('whist_client_session_v1');
    } catch (e) {
      console.error('Failed to clear user session', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
