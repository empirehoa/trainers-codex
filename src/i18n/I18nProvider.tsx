import { useCallback, useMemo, useState } from 'react';
import { detectLocale, setStoredLocale, translate, type Locale } from './strings';
import { I18nContext, type I18nValue } from './useI18n';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setStoredLocale(l);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key, vars) => translate(key, locale, vars),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
