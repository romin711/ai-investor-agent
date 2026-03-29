import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    // Initialize from localStorage or system preference
    const stored = window.localStorage.getItem('theme-preference');
    if (stored) {
      return stored === 'dark';
    }
    // Default to light mode
    return false;
  });

  useEffect(() => {
    const htmlElement = document.documentElement;
    const theme = isDark ? 'dark' : 'light';

    // Update DOM
    if (isDark) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }

    // Store preference
    window.localStorage.setItem('theme-preference', theme);
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
