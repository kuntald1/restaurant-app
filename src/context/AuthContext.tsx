// src/context/AuthContext.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { UserSession } from "../api/types";

const STORAGE_KEY = "vorpetpos.session";

interface AuthContextValue {
  session: UserSession | null;
  isLoading: boolean;
  login: (session: UserSession) => Promise<void>;
  logout: () => Promise<void>;
  isManager: boolean;
  hasMenu: (menuurl: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSession(JSON.parse(raw));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (newSession: UserSession) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setSession(null);
  };

  const hasMenu = (menuurl: string) =>
    session?.menus?.some((m) => m.menuurl === menuurl && m.is_active) ?? false;

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        login,
        logout,
        // Until Kuntal confirms the real admin/manager menu urls, treat
        // is_admin/is_super_admin as the manager-tier signal.
        isManager: !!(session?.is_admin || session?.is_super_admin),
        hasMenu,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
