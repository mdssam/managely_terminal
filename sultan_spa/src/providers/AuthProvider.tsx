// @ts-expect-error ignore
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { dbGet, dbSet, dbRemove, AUTH_STORE } from '../services/offlineDB';

interface AuthContextType {
  token: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  login: (newToken: string, user: any) => void;
  logout: () => void;
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const init = async () => {
      const storedToken = await dbGet<string>(AUTH_STORE, 'erpnext_token');
      const storedUser = await dbGet<any>(AUTH_STORE, 'erpnext_user');
      if (storedToken) {
        setToken(storedToken);
        setUser(storedUser ?? null);
      }
    };
    init();
  }, []);

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const login = async (newToken: string, userData: any) => {
    setToken(newToken);
    setUser(userData);
    await dbSet(AUTH_STORE, 'erpnext_token', newToken);
    await dbSet(AUTH_STORE, 'erpnext_user', userData);
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await dbRemove(AUTH_STORE, 'erpnext_token');
    await dbRemove(AUTH_STORE, 'erpnext_user');
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
