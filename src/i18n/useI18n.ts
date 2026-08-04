// The i18n context and its hook.
//
// Deliberately separate from I18nProvider.tsx: a file that exports both a
// component and a non-component breaks React Fast Refresh (and the
// react-refresh lint rule), so the context lives here with the hook and the
// provider imports it.

import { createContext, useContext } from 'react';
import { translate, type Locale, type Vars } from './strings';

export interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Vars) => string;
}

export const I18nContext = createContext<I18nValue | null>(null);

/**
 * Access the active locale and translator.
 *
 * Falls back to a provider-less English translator rather than throwing, so a
 * component can be rendered in isolation (a test, a one-off harness) without
 * being wrapped.
 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: 'en',
    setLocale: () => {},
    t: (key, vars) => translate(key, 'en', vars),
  };
}
