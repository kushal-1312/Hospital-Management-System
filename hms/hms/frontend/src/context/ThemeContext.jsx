import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

/**
 * UPGRADE 5: ThemeContext
 *
 * Manages dark/light mode:
 * - Reads saved preference from localStorage on mount
 * - Falls back to OS preference (prefers-color-scheme)
 * - Applies 'dark' class to <html> element
 * - Exposes toggle function to any component
 */
export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // 1. Check saved preference
    const saved = localStorage.getItem('hms-theme');
    if (saved) return saved === 'dark';
    // 2. Fall back to OS preference
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  // Apply theme class to <html> on every change
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('hms-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = useCallback(() => setIsDark(prev => !prev), []);

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
