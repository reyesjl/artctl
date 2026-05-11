import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import { applyTheme, DEFAULT_THEME_ID, THEMES } from "./themes.js";

const themeStorageKey = "artctl-theme";

const ThemeContext = createContext(null);

function getThemeIdFromStorage() {
  if (typeof window === "undefined" || !window.localStorage?.getItem) {
    return DEFAULT_THEME_ID;
  }

  const storedThemeId = window.localStorage.getItem(themeStorageKey);

  return THEMES.some((theme) => theme.id === storedThemeId) ? storedThemeId : DEFAULT_THEME_ID;
}

function resolveTheme(themeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(getThemeIdFromStorage);

  useLayoutEffect(() => {
    const theme = resolveTheme(themeId);

    applyTheme(theme);

    if (typeof window !== "undefined" && window.localStorage?.setItem) {
      window.localStorage.setItem(themeStorageKey, themeId);
    }
  }, [themeId]);

  const value = useMemo(() => ({ themeId, setThemeId }), [themeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);

  if (!theme) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }

  return theme;
}
