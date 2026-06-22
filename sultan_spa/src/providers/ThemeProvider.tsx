 // @ts-expect-error ignore
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { dbGet, dbSet, APP_CACHE_STORE } from '../services/offlineDB';

interface ThemeContextType {
  theme: string;
  toggleTheme: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    dbGet<string>(APP_CACHE_STORE, 'theme').then(storedTheme => {
      if (storedTheme) {
        setTheme(storedTheme);
        document.documentElement.classList.toggle('dark', storedTheme === 'dark');
      }
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    dbSet(APP_CACHE_STORE, 'theme', newTheme).catch(() => {});
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
