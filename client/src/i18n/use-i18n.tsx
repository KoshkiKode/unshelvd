import { createContext, useContext, useState, useCallback, useEffect } from "react";
import translations, { type Locale, localeNames, localeDirections } from "./translations";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
  locales: typeof localeNames;
}

const I18nContext = createContext<I18nContextType | null>(null);

function detectLocale(): Locale {
  // Try browser language
  const browserLang = navigator.language?.split("-")[0] as Locale;
  if (browserLang && translations[browserLang]) return browserLang;
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.documentElement.lang = l;
    document.documentElement.dir = localeDirections[l];
  }, []);

  // Set initial direction
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirections[locale];
  }, [locale]);

  const t = useCallback((key: string): string => {
    const strings = translations[locale];
    return (strings as any)[key] || (translations.en as any)[key] || key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{
      locale,
      setLocale,
      t,
      dir: localeDirections[locale],
      locales: localeNames,
    }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
