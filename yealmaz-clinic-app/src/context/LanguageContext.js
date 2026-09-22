// Ye-Almaz clinic app — language switch (English / Amharic).
//
// Amharic is LTR (Ge'ez script), so unlike an RTL language this needs no
// layout mirroring — only the translation dictionary swaps. `t(key, vars)`
// looks `key` up in src/i18n/translations.js under the active language,
// falling back to English and then to the key itself so a missing
// translation shows readable text instead of crashing or rendering blank.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../i18n/translations';

const STORAGE_KEY = 'ya_clinic_language';
const DEFAULT_LANGUAGE = 'en';
export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'am', label: 'Amharic', nativeLabel: 'አማርኛ' },
];

const LanguageContext = createContext(null);

function resolve(dict, key) {
  // Supports dot-paths ("home.greeting") so the dictionary can be nested by screen.
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => { if (stored && translations[stored]) setLanguageState(stored); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback((code) => {
    if (!translations[code]) return;
    setLanguageState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }, []);

  const t = useCallback((key, vars) => {
    let str = resolve(translations[language], key);
    if (str === undefined) str = resolve(translations[DEFAULT_LANGUAGE], key);
    if (str === undefined) return key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return str;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t, ready, languages: LANGUAGES }), [language, setLanguage, t, ready]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
