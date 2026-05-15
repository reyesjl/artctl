import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ditherStorageKey = "artctl-dither-enabled";

const SettingsContext = createContext({
  ditherEnabled: true,
  setDitherEnabled() {}
});

function getDitherEnabledFromStorage() {
  if (typeof window === "undefined" || !window.localStorage?.getItem) {
    return true;
  }

  const storedValue = window.localStorage.getItem(ditherStorageKey);

  if (storedValue === "false") {
    return false;
  }

  return true;
}

export function SettingsProvider({ children, initialDitherEnabled }) {
  const [ditherEnabled, setDitherEnabled] = useState(() => (
    typeof initialDitherEnabled === "boolean"
      ? initialDitherEnabled
      : getDitherEnabledFromStorage()
  ));

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage?.setItem) {
      window.localStorage.setItem(ditherStorageKey, String(ditherEnabled));
    }
  }, [ditherEnabled]);

  const value = useMemo(() => ({ ditherEnabled, setDitherEnabled }), [ditherEnabled]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

