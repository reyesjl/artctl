function fallbackThemeColor(token, opacity) {
  return opacity == null ? `hsl(var(${token}))` : `hsl(var(${token}) / ${opacity})`;
}

export function themeColor(token, opacity) {
  if (typeof window === "undefined") {
    return fallbackThemeColor(token, opacity);
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();

  if (!value) {
    return fallbackThemeColor(token, opacity);
  }

  return opacity == null ? `hsl(${value})` : `hsl(${value} / ${opacity})`;
}
