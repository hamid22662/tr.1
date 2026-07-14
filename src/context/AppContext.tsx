import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n from '@/i18n';
import { getSettings, setSetting } from '@/db/repositories';
import { Language, ThemeMode } from '@/types';
import { AppTheme, makeTheme } from '@/theme';

type ExperienceMode = 'simple' | 'pro';

type AppContextValue = {
  ready: boolean;
  language: Language;
  themeMode: ThemeMode;
  theme: AppTheme;
  isRTL: boolean;
  accountBalance: number;
  defaultRisk: number;
  currency: string;
  experienceMode: ExperienceMode;
  setLanguage: (language: Language) => Promise<void>;
  setThemeMode: (theme: ThemeMode) => Promise<void>;
  saveAccount: (settings: { accountBalance: number; defaultRisk: number; currency: string }) => Promise<void>;
  setExperienceMode: (mode: ExperienceMode) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  onboarded: boolean;
  refreshKey: number;
  refresh: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [language, setLanguageState] = useState<Language>('fa');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [accountBalance, setAccountBalance] = useState(0);
  const [defaultRisk, setDefaultRisk] = useState(1);
  const [currency, setCurrency] = useState('USD');
  const [experienceMode, setExperienceModeState] = useState<ExperienceMode>('simple');
  const [onboarded, setOnboarded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getSettings().then((settings) => {
      const lang = (settings.language === 'en' ? 'en' : 'fa') as Language;
      const theme = (settings.theme === 'light' ? 'light' : 'dark') as ThemeMode;
      setLanguageState(lang);
      setThemeModeState(theme);
      setAccountBalance(Number(settings.account_balance ?? 0));
      setDefaultRisk(Number(settings.default_risk_percent ?? 1));
      setCurrency(settings.default_currency ?? 'USD');
      setExperienceModeState(settings.experience_mode === 'pro' ? 'pro' : 'simple');
      setOnboarded(settings.onboarding_complete === '1');
      i18n.changeLanguage(lang);
    }).finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    await setSetting('language', lang);
    await i18n.changeLanguage(lang);
    setLanguageState(lang);
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    await setSetting('theme', mode);
    setThemeModeState(mode);
  }, []);

  const saveAccount = useCallback(async (settings: { accountBalance: number; defaultRisk: number; currency: string }) => {
    await Promise.all([
      setSetting('account_balance', String(settings.accountBalance)),
      setSetting('default_risk_percent', String(settings.defaultRisk)),
      setSetting('default_currency', settings.currency),
    ]);
    setAccountBalance(settings.accountBalance);
    setDefaultRisk(settings.defaultRisk);
    setCurrency(settings.currency);
  }, []);

  const setExperienceMode = useCallback(async (mode: ExperienceMode) => {
    await setSetting('experience_mode', mode);
    setExperienceModeState(mode);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await setSetting('onboarding_complete', '1');
    setOnboarded(true);
  }, []);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const theme = useMemo(() => makeTheme(themeMode), [themeMode]);

  return <AppContext.Provider value={{
    ready,
    language,
    themeMode,
    theme,
    isRTL: language === 'fa',
    accountBalance,
    defaultRisk,
    currency,
    experienceMode,
    setLanguage,
    setThemeMode,
    saveAccount,
    setExperienceMode,
    completeOnboarding,
    onboarded,
    refreshKey,
    refresh,
  }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
