import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { resetDatabase } from '@/db/database';
import {
  createStrategy,
  createSymbol,
  deleteCustomSymbol,
  deleteStrategy,
  getManagedSymbols,
  getStrategies,
  getSettings,
  getTradeCount,
  setSetting,
  setSymbolActive,
} from '@/db/repositories';
import { cancelAllNotifications, isNotificationRuntimeAvailable, requestNotificationPermission, scheduleDailyReminder } from '@/services/notifications';
import { exportBackupJson, exportTradesCsv, restoreLatestBackupJson } from '@/services/export';
import { Market, StrategyRow, SymbolRow } from '@/types';
import type { AppNavigation } from '@/types/navigation';
import { useApp } from '@/context/AppContext';
import { useFeedback } from '@/components/feedback';
import { formatMoney, formatNumber } from '@/services/calculations';
import { CompactToggle } from '@/components/CompactToggle';
import {
  ActionTile,
  Badge,
  Button,
  AnimatedCard,
  CollapsibleCard,
  Empty,
  Field,
  HeroCard,
  Screen,
  SectionHeading,
  Segmented,
} from '@/components/ui';

type NewSymbolForm = {
  symbol: string;
  market: Market;
  pipSize: string;
  contractSize: string;
  quoteCurrency: string;
};

type SymbolFilter = Market | 'all';
type DisplayMode = 'simple' | 'pro';

const initialNewSymbol: NewSymbolForm = {
  symbol: '',
  market: 'forex',
  pipSize: '0.0001',
  contractSize: '100000',
  quoteCurrency: 'USD',
};

const riskPresets = ['0.5', '1', '1.5', '2'];

const parseInputNumber = (value: string) => {
  const parsed = Number(String(value).replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAccountMoney = (value: number, currency: string) => formatMoney(value, currency).replace(/^\+/, '');

export default function SettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<AppNavigation>();
  const {
    theme,
    isRTL,
    language,
    themeMode,
    setLanguage,
    setThemeMode,
    accountBalance,
    defaultRisk,
    currency,
    saveAccount,
    refresh,
    refreshKey,
    experienceMode,
    setExperienceMode,
  } = useApp();
  const { showToast, confirm } = useFeedback();
  const [balance, setBalance] = useState(String(accountBalance));
  const [risk, setRisk] = useState(String(defaultRisk));
  const [baseCurrency, setBaseCurrency] = useState(currency);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(experienceMode);
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [newStrategy, setNewStrategy] = useState('');
  const [symbolModalOpen, setSymbolModalOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState<NewSymbolForm>(initialNewSymbol);
  const [symbolFilter, setSymbolFilter] = useState<SymbolFilter>('all');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationHour, setNotificationHour] = useState('20');
  const [notificationMinute, setNotificationMinute] = useState('00');
  const [displayInfoOpen, setDisplayInfoOpen] = useState(false);

  const activeSymbols = useMemo(() => symbols.filter((symbol) => symbol.active === 1).length, [symbols]);
  const forexSymbols = useMemo(() => symbols.filter((symbol) => symbol.market === 'forex').length, [symbols]);
  const cryptoSymbols = useMemo(() => symbols.filter((symbol) => symbol.market === 'crypto').length, [symbols]);
  const customSymbols = useMemo(() => symbols.filter((symbol) => symbol.is_custom === 1).length, [symbols]);
  const numericBalance = parseInputNumber(balance);
  const numericRisk = parseInputNumber(risk);
  const riskPerTrade = numericBalance > 0 && numericRisk > 0 ? (numericBalance * numericRisk) / 100 : 0;

  const filteredSymbols = useMemo(() => {
    const query = symbolSearch.trim().toUpperCase();
    return symbols.filter((symbol) => {
      const marketMatches = symbolFilter === 'all' || symbol.market === symbolFilter;
      const queryMatches = !query || symbol.symbol.includes(query);
      return marketMatches && queryMatches;
    });
  }, [symbols, symbolFilter, symbolSearch]);

  const loadManagedData = useCallback(async () => {
    const [symbolRows, strategyRows] = await Promise.all([getManagedSymbols(), getStrategies()]);
    setSymbols(symbolRows);
    setStrategies(strategyRows);
  }, []);

  useEffect(() => {
    setBalance(String(accountBalance));
    setRisk(String(defaultRisk));
    setBaseCurrency(currency);
  }, [accountBalance, defaultRisk, currency]);

  useEffect(() => {
    setDisplayMode(experienceMode);
  }, [experienceMode]);

  useEffect(() => {
    loadManagedData();
  }, [loadManagedData, refreshKey]);

  useEffect(() => {
    getSettings().then((settings) => {
      setNotificationsEnabled((settings.notif_enabled ?? '0') === '1');
      setNotificationHour(settings.notif_hour ?? '20');
      setNotificationMinute((settings.notif_minute ?? '0').padStart(2, '0'));
    });
  }, [refreshKey]);

  const textAlign = isRTL ? 'right' : 'left';
  const rowDirection = isRTL ? 'row-reverse' : 'row';
  const savedCurrency = baseCurrency.trim().toUpperCase() || 'USD';

  const save = async () => {
    const accountBalanceValue = parseInputNumber(balance);
    const riskValue = parseInputNumber(risk);
    if (accountBalanceValue <= 0 || riskValue <= 0 || !/^[A-Z]{3,6}$/.test(savedCurrency)) {
      showToast({ title: t('common.checkFields'), message: t('settings.accountInvalid'), tone: 'warning' });
      return;
    }
    if (savedCurrency !== currency && await getTradeCount() > 0) {
      showToast({
        title: isRTL ? 'تغییر ارز حساب ممکن نیست' : 'Account currency cannot be changed',
        message: isRTL
          ? 'برای جلوگیری از محاسبه اشتباه گزارش‌ها، ارز حساب پس از ثبت اولین معامله ثابت می‌ماند.'
          : 'To keep reports accurate, account currency is locked after the first trade.',
        tone: 'warning',
      });
      setBaseCurrency(currency);
      return;
    }
    await saveAccount({ accountBalance: accountBalanceValue, defaultRisk: riskValue, currency: savedCurrency });
    setBaseCurrency(savedCurrency);
    showToast({ title: t('common.saved'), tone: 'success' });
  };

  const saveDisplayMode = async (value: DisplayMode) => {
    setDisplayMode(value);
    await setExperienceMode(value);
    showToast({ title: t('common.saved'), message: value === 'pro' ? t('settings.proModeSaved') : t('settings.simpleModeSaved'), tone: 'success' });
  };

  const changeNotificationTime = (deltaMinutes: number) => {
    const currentHour = Number(notificationHour);
    const currentMinute = Number(notificationMinute);
    const safeHour = Number.isFinite(currentHour) ? currentHour : 20;
    const safeMinute = Number.isFinite(currentMinute) ? currentMinute : 0;
    const nextTotal = (safeHour * 60 + safeMinute + deltaMinutes + 24 * 60) % (24 * 60);
    setNotificationHour(String(Math.floor(nextTotal / 60)).padStart(2, '0'));
    setNotificationMinute(String(nextTotal % 60).padStart(2, '0'));
  };

  const saveNotificationSettings = async () => {
    const hour = Number(notificationHour);
    const minute = Number(notificationMinute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      showToast({ title: t('common.checkFields'), message: isRTL ? 'ساعت باید بین ۰ تا ۲۳ و دقیقه بین ۰ تا ۵۹ باشد.' : 'Hour must be 0–23 and minute must be 0–59.', tone: 'warning' });
      return;
    }
    if (notificationsEnabled) {
      if (!isNotificationRuntimeAvailable()) {
        setNotificationsEnabled(false);
        showToast({ title: isRTL ? 'اعلان در Expo Go در دسترس نیست' : 'Notifications are unavailable in Expo Go', message: isRTL ? 'برای تست اعلان از Development Build یا APK استفاده کن.' : 'Use a development build or APK to test notifications.', tone: 'warning' });
        return;
      }
      if (!(await requestNotificationPermission())) {
        await setSetting('notif_enabled', '0');
        setNotificationsEnabled(false);
        showToast({ title: isRTL ? 'مجوز نوتیفیکیشن داده نشد' : 'Notification permission denied', tone: 'warning' });
        return;
      }
      await scheduleDailyReminder(hour, minute, language);
    } else {
      await cancelAllNotifications();
    }
    await Promise.all([
      setSetting('notif_enabled', notificationsEnabled ? '1' : '0'),
      setSetting('notif_hour', String(hour)),
      setSetting('notif_minute', String(minute)),
    ]);
    setNotificationHour(String(hour));
    setNotificationMinute(String(minute).padStart(2, '0'));
    showToast({ title: t('common.saved'), tone: 'success' });
  };

  const toggleSymbol = async (symbol: SymbolRow, active: boolean) => {
    await setSymbolActive(symbol.id, active);
    await loadManagedData();
    refresh();
  };

  const setNewSymbolMarket = (market: Market) => {
    setNewSymbol((old) => ({
      ...old,
      market,
      pipSize: market === 'forex' ? (old.pipSize || '0.0001') : '1',
      contractSize: market === 'forex' ? (old.contractSize || '100000') : '1',
      quoteCurrency: market === 'forex' ? (old.quoteCurrency || 'USD') : 'USDT',
    }));
  };

  const addSymbol = async () => {
    try {
      await createSymbol({
        symbol: newSymbol.symbol,
        market: newSymbol.market,
        pip_size: Number(newSymbol.pipSize),
        contract_size: Number(newSymbol.contractSize),
        quote_currency: newSymbol.quoteCurrency,
      });
      setNewSymbol(initialNewSymbol);
      setSymbolModalOpen(false);
      setSymbolFilter('all');
      setSymbolSearch('');
      await loadManagedData();
      refresh();
      showToast({ title: t('common.saved'), message: t('settings.symbolAdded'), tone: 'success' });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      showToast({
        title: t('common.checkFields'),
        message: code === 'SYMBOL_EXISTS' ? t('settings.symbolExists') : t('settings.symbolInvalid'),
        tone: 'warning',
      });
    }
  };

  const removeSymbol = (symbol: SymbolRow) => confirm({
    title: t('settings.deleteSymbolTitle'),
    message: `${t('settings.deleteSymbolMessage')} “${symbol.symbol}”`,
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    destructive: true,
    onConfirm: async () => {
      await deleteCustomSymbol(symbol.id);
      await loadManagedData();
      refresh();
      showToast({ title: t('common.saved'), message: t('settings.symbolDeleted'), tone: 'success' });
    },
  });

  const addStrategy = async () => {
    if (!newStrategy.trim()) {
      showToast({ title: t('common.checkFields'), message: t('settings.strategyRequired'), tone: 'warning' });
      return;
    }
    try {
      await createStrategy(newStrategy);
      setNewStrategy('');
      await loadManagedData();
      refresh();
      showToast({ title: t('common.saved'), message: t('settings.strategyAdded'), tone: 'success' });
    } catch {
      showToast({ title: t('common.checkFields'), message: t('settings.strategyDuplicate'), tone: 'warning' });
    }
  };

  const removeStrategy = (strategy: StrategyRow) => confirm({
    title: t('settings.deleteStrategyTitle'),
    message: `${t('settings.deleteStrategyMessage')} “${strategy.name}”`,
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    destructive: true,
    onConfirm: async () => {
      await deleteStrategy(strategy.id);
      await loadManagedData();
      refresh();
      showToast({ title: t('common.saved'), message: t('settings.strategyDeleted'), tone: 'success' });
    },
  });

  const erase = () => confirm({
    title: t('settings.deleteAll'),
    message: t('settings.deleteWarning'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    destructive: true,
    onConfirm: async () => {
      await resetDatabase();
      await loadManagedData();
      refresh();
      showToast({ title: t('common.saved'), message: t('settings.resetComplete'), tone: 'success' });
    },
  });

  const renderMutedText = (text: string, marginBottom = 12) => (
    <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 20, fontWeight: '700', marginBottom, textAlign }}>{text}</Text>
  );

  return <Screen>
    <View style={{ paddingTop: 8, paddingBottom: 4 }}>
      <Text style={{
        fontSize: 11, fontWeight: '900', letterSpacing: 1.2,
        textTransform: 'uppercase', color: theme.colors.primaryGlow,
        textAlign: isRTL ? 'right' : 'left', marginBottom: 6,
      }}>TRADELOG</Text>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{
          fontSize: 34, fontWeight: '900', letterSpacing: -1,
          color: theme.colors.text,
        }}>{t('settings.title')}</Text>
        <View style={{
          width: 44, height: 44, borderRadius: 16,
          backgroundColor: theme.colors.primarySoft,
          borderWidth: 1, borderColor: theme.colors.border,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name="settings" size={20} color={theme.colors.primaryGlow} />
        </View>
      </View>
      <Text style={{
        fontSize: 13, fontWeight: '700', color: theme.colors.textMuted,
        textAlign: isRTL ? 'right' : 'left', marginTop: 6, lineHeight: 20,
      }}>{t('settings.controlCenterSubtitle')}</Text>
    </View>

    <AnimatedCard index={0}>
      <View style={{ flexDirection: rowDirection, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 9 }}>
          <Feather name="bell" size={18} color={theme.colors.primaryGlow} />
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800', textAlign }}>{isRTL ? 'یادآور روزانه' : 'Daily reminder'}</Text>
        </View>
        <Switch accessibilityRole="switch" accessibilityLabel={isRTL ? 'فعال‌سازی یادآور روزانه' : 'Enable daily reminder'} accessibilityState={{ checked: notificationsEnabled }} value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }} thumbColor={notificationsEnabled ? theme.colors.primary : theme.colors.textSubtle} />
      </View>

      {notificationsEnabled ? (
        <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={{ marginTop: 14 }}>
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 14 }} />
          <View style={{ flexDirection: rowDirection, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 8 }}>
              <Feather name="clock" size={16} color={theme.colors.textMuted} />
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800', textAlign }}>{isRTL ? 'ساعت یادآور' : 'Reminder time'}</Text>
            </View>
            <Text style={{ color: theme.colors.primaryGlow, fontSize: 15, fontWeight: '900' }}>{notificationHour.padStart(2, '0')}:{notificationMinute.padStart(2, '0')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isRTL ? 'سی دقیقه کمتر' : 'Decrease by 30 minutes'}
              onPress={() => changeNotificationTime(-30)}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="minus" size={19} color={theme.colors.text} />
            </Pressable>
            <View style={{ minWidth: 116, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, alignItems: 'center' }}>
              <Text style={{ color: theme.colors.primaryGlow, fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>{notificationHour.padStart(2, '0')} : {notificationMinute.padStart(2, '0')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isRTL ? 'سی دقیقه بیشتر' : 'Increase by 30 minutes'}
              onPress={() => changeNotificationTime(30)}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="plus" size={19} color={theme.colors.text} />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      <View style={{ marginTop: notificationsEnabled ? 0 : 14 }}>
        <Button title={isRTL ? 'ذخیره تنظیمات نوتیف' : 'Save notification settings'} icon="save" onPress={saveNotificationSettings} />
      </View>
    </AnimatedCard>

    <HeroCard
      eyebrow={t('settings.tradingSetup')}
      title={t('settings.accountSummary')}
      value={formatAccountMoney(numericBalance, savedCurrency)}
      caption={t('settings.setupHint')}
      tone="primary"
      right={<Badge label={displayMode === 'pro' ? t('settings.pro') : t('settings.simple')} tone={displayMode === 'pro' ? 'primary' : 'info'} icon={displayMode === 'pro' ? 'zap' : 'shield'} />}
      footer={<View style={{ flexDirection: rowDirection, gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: t('settings.defaultRisk'), value: `${formatNumber(numericRisk, 2)}%`, color: theme.colors.warning, background: theme.colors.warningSoft },
          { label: t('settings.riskPerTrade'), value: formatAccountMoney(riskPerTrade, savedCurrency), color: theme.colors.success, background: theme.colors.successSoft },
          { label: t('settings.symbolsActive'), value: `${activeSymbols}/${symbols.length || 0}`, color: theme.colors.info, background: theme.colors.infoSoft },
        ].map((item) => (
          <View key={item.label} style={{ minWidth: '30%', flex: 1, borderWidth: 1, borderColor: item.color, backgroundColor: item.background, borderRadius: 16, padding: 10 }}>
            <Text numberOfLines={2} adjustsFontSizeToFit style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', textAlign }}>{item.label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color: item.color, fontSize: 11, fontWeight: '900', marginTop: 6, textAlign }}>{item.value}</Text>
          </View>
        ))}
      </View>}
    />

    <AnimatedCard index={1} elevated>
      <SectionHeading title={t('settings.workspace')} icon="sliders" />
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: rowDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 }}>
          <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Feather name="globe" size={17} color={theme.colors.primaryGlow} />
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800', textAlign }}>{t('settings.language')}</Text>
          </View>
          <CompactToggle
            value={language}
            onChange={(value) => setLanguage(value as 'fa' | 'en')}
            options={[{ value: 'fa', label: 'فا' }, { value: 'en', label: 'EN' }]}
            theme={theme}
            isRTL={isRTL}
          />
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.border }} />

        <View style={{ flexDirection: rowDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 }}>
          <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Feather name="sun" size={17} color={theme.colors.primaryGlow} />
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800', textAlign }}>{t('settings.theme')}</Text>
          </View>
          <CompactToggle
            value={themeMode}
            onChange={(value) => setThemeMode(value as 'dark' | 'light')}
            options={[{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }]}
            theme={theme}
            isRTL={isRTL}
          />
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.border }} />

        <View style={{ flexDirection: rowDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 }}>
          <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 7, flexShrink: 1 }}>
            <Feather name="zap" size={17} color={theme.colors.primaryGlow} />
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800', textAlign }}>{t('settings.displayMode')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isRTL ? 'توضیح حالت نمایش' : 'Display mode information'}
              onPress={() => setDisplayInfoOpen(true)}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="info" size={15} color={theme.colors.info} />
            </Pressable>
          </View>
          <CompactToggle
            value={displayMode}
            onChange={(value) => saveDisplayMode(value as DisplayMode)}
            options={[{ value: 'simple', label: t('settings.simple') }, { value: 'pro', label: t('settings.pro') }]}
            theme={theme}
            isRTL={isRTL}
          />
        </View>
      </View>
    </AnimatedCard>

    <AnimatedCard index={2} elevated>
      <SectionHeading title={t('settings.account')} icon="credit-card" meta={savedCurrency} />
      {renderMutedText(t('settings.accountHint'))}
      <Field label={t('trade.accountBalance')} value={balance} onChangeText={setBalance} keyboardType="decimal-pad" icon="dollar-sign" suffix={savedCurrency} />
      <Field label={`${t('settings.defaultRisk')} (%)`} value={risk} onChangeText={setRisk} keyboardType="decimal-pad" icon="shield" suffix="%" />
      <View style={{ flexDirection: rowDirection, flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {riskPresets.map((preset) => {
          const active = parseInputNumber(risk) === parseInputNumber(preset);
          return <Pressable key={preset} onPress={() => setRisk(preset)} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1, borderWidth: active ? 1.5 : 1, borderColor: active ? theme.colors.warning : theme.colors.border, backgroundColor: active ? theme.colors.warningSoft : theme.colors.surfaceMuted, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 })}>
            <Text style={{ color: active ? theme.colors.warning : theme.colors.textMuted, fontWeight: '900', fontSize: 12 }}>{preset}%</Text>
          </Pressable>;
        })}
      </View>
      <Field label={t('settings.currency')} value={baseCurrency} onChangeText={(value) => setBaseCurrency(value.toUpperCase())} autoCapitalize="characters" icon="globe" />
      <View style={{ borderWidth: 1, borderColor: theme.colors.success, backgroundColor: theme.colors.successSoft, borderRadius: 20, padding: 14, marginTop: 4, marginBottom: 12 }}>
        <View style={{ flexDirection: rowDirection, justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.success, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', textAlign }}>{t('settings.riskPreview')}</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '700', lineHeight: 17, marginTop: 5, textAlign }}>{t('settings.riskPreviewHint')}</Text>
          </View>
          <Text style={{ color: theme.colors.success, fontSize: 24, fontWeight: '900' }}>{formatAccountMoney(riskPerTrade, savedCurrency)}</Text>
        </View>
      </View>
      <Button title={t('settings.saveAccount')} icon="save" onPress={save} />
    </AnimatedCard>

    <Animated.View entering={FadeInDown.delay(3 * 80).springify().damping(14)}>
      <CollapsibleCard
        title={t('settings.symbolManagement')}
      subtitle={t('settings.symbolManagementHint')}
      icon="bar-chart-2"
      meta={`${activeSymbols}/${symbols.length || 0}`}
      defaultOpen={false}
    >
      <View style={{ flexDirection: rowDirection, gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge label={`${t('common.forex')}: ${forexSymbols}`} tone="info" />
        <Badge label={`${t('common.crypto')}: ${cryptoSymbols}`} tone="primary" />
        <Badge label={`${t('settings.customSymbol')}: ${customSymbols}`} tone="warning" />
      </View>
      <Button title={t('settings.addSymbol')} icon="plus" onPress={() => setSymbolModalOpen(true)} />
      <View style={{ height: 12 }} />
      <Segmented
        value={symbolFilter}
        onChange={(value) => setSymbolFilter(value as SymbolFilter)}
        options={[
          { value: 'all', label: t('common.all') },
          { value: 'forex', label: t('common.forex') },
          { value: 'crypto', label: t('common.crypto') },
        ]}
      />
      <View style={{ height: 10 }} />
      <Field label={t('settings.symbolSearch')} value={symbolSearch} onChangeText={(value) => setSymbolSearch(value.toUpperCase())} placeholder={t('settings.symbolSearchPlaceholder')} autoCapitalize="characters" icon="search" />
      {filteredSymbols.length ? <View style={{ gap: 9 }}>
        {filteredSymbols.map((symbol) => {
          const isActive = symbol.active === 1;
          const isCustom = symbol.is_custom === 1;
          return <View key={symbol.id} style={{ borderWidth: 1, borderColor: isActive ? theme.colors.borderFocus : theme.colors.border, backgroundColor: isActive ? theme.colors.surfaceMuted : theme.colors.backgroundElevated, borderRadius: 20, padding: 13 }}>
            <View style={{ flexDirection: rowDirection, justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: rowDirection, flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17, textAlign }}>{symbol.symbol}</Text>
                  <Badge label={symbol.market === 'forex' ? t('common.forex') : t('common.crypto')} tone={symbol.market === 'forex' ? 'info' : 'primary'} />
                  <Badge label={isActive ? t('settings.activeLabel') : t('settings.inactiveLabel')} tone={isActive ? 'success' : 'default'} />
                </View>
                <Text style={{ color: theme.colors.textSubtle, fontSize: 11, fontWeight: '800', marginTop: 7, lineHeight: 17, textAlign }}>
                  Pip {formatNumber(symbol.pip_size, 6)} · Contract {formatNumber(symbol.contract_size, 2)} · {symbol.quote_currency || '—'}
                </Text>
                <Text style={{ color: isCustom ? theme.colors.warning : theme.colors.textSubtle, fontSize: 10, fontWeight: '900', marginTop: 5, textAlign }}>{isCustom ? t('settings.customSymbol') : t('settings.defaultSymbol')}</Text>
              </View>
              <Switch
                accessibilityRole="switch"
                accessibilityLabel={`${symbol.symbol} ${isRTL ? 'فعال' : 'active'}`}
                accessibilityState={{ checked: isActive }}
                value={isActive}
                onValueChange={(value) => toggleSymbol(symbol, value)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }}
                thumbColor={isActive ? theme.colors.primary : theme.colors.textSubtle}
              />
            </View>
            {isCustom ? <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${symbol.symbol}`} onPress={() => removeSymbol(symbol)} style={({ pressed }) => ({ marginTop: 11, minHeight: 44, alignSelf: isRTL ? 'flex-start' : 'flex-end', flexDirection: rowDirection, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
              <Feather name="trash-2" size={14} color={theme.colors.danger} />
              <Text style={{ color: theme.colors.danger, fontSize: 11, fontWeight: '900' }}>{t('common.delete')}</Text>
            </Pressable> : null}
          </View>;
        })}
      </View> : <Empty title={t('settings.noSymbolsFound')} text={t('settings.noSymbolsFoundHint')} icon="search" />}
      </CollapsibleCard>
    </Animated.View>

    <Animated.View entering={FadeInDown.delay(4 * 80).springify().damping(14)}>
      <CollapsibleCard
        title={t('settings.strategyManagement')}
      subtitle={t('settings.strategyManagementHint')}
      icon="target"
      meta={`${strategies.length}`}
      defaultOpen={false}
    >
      <Field label={t('settings.strategyName')} value={newStrategy} onChangeText={setNewStrategy} placeholder={t('settings.strategyPlaceholder')} icon="edit-3" />
      <Button title={t('settings.addStrategy')} icon="plus" onPress={addStrategy} />
      {strategies.length ? <View style={{ gap: 8, marginTop: 14 }}>
        {strategies.map((strategy, index) => <View key={strategy.id} style={{ flexDirection: rowDirection, alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted, borderRadius: 18, padding: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign, fontSize: 14 }}>{strategy.name}</Text>
            <Text style={{ color: theme.colors.textSubtle, fontWeight: '800', textAlign, fontSize: 10, marginTop: 4 }}>{index < 3 ? t('settings.featuredStrategy') : t('settings.savedStrategy')}</Text>
          </View>
          <Pressable onPress={() => removeStrategy(strategy)} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Feather name="trash-2" size={16} color={theme.colors.danger} />
          </Pressable>
        </View>)}
      </View> : <Empty title={t('settings.noStrategies')} text={t('settings.noStrategiesHint')} icon="target" />}
      </CollapsibleCard>
    </Animated.View>

    <Animated.View entering={FadeInDown.delay(5 * 80).springify().damping(14)}>
      <CollapsibleCard title={t('settings.data')} subtitle={t('settings.dataHint')} icon="database" defaultOpen={false}>
      <View style={{ borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, borderRadius: 20, padding: 14, marginBottom: 12 }}>
        <Text style={{ color: theme.colors.primaryGlow, fontWeight: '900', textAlign, fontSize: 14 }}>{isRTL ? 'وارد کردن تریدها از بروکر' : 'Import broker trades'}</Text>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', textAlign, lineHeight: 18, fontSize: 11, marginTop: 6 }}>{isRTL ? 'فایل خروجی CSV متاتریدر ۴، متاتریدر ۵ یا بایننس را انتخاب و قبل از ذخیره بررسی کن.' : 'Choose an MT4, MT5, or Binance CSV export and review it before saving.'}</Text>
      </View>
      <Button
        title={isRTL ? 'وارد کردن از CSV (MT4/MT5/Binance)' : 'Import from CSV (MT4/MT5/Binance)'}
        icon="upload"
        variant="secondary"
        onPress={() => navigation.navigate('Import')}
      />
      <View style={{ height: 14 }} />
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted, borderRadius: 20, padding: 14, marginBottom: 12 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign, fontSize: 14 }}>{t('settings.exportCsv')}</Text>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', textAlign, lineHeight: 18, fontSize: 11, marginTop: 6 }}>{t('settings.exportDescription')}</Text>
      </View>
      <Button title={t('settings.exportCsv')} icon="share-2" variant="secondary" onPress={async () => { await exportTradesCsv(); showToast({ title: t('settings.exportReady'), tone: 'success' }); }} />
      <View style={{ height: 10 }} />
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted, borderRadius: 20, padding: 14, marginBottom: 12 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign, fontSize: 14 }}>{t('settings.backupJson')}</Text>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', textAlign, lineHeight: 18, fontSize: 11, marginTop: 6 }}>{t('settings.backupDescription')}</Text>
      </View>
      <View style={{ flexDirection: rowDirection, gap: 10 }}>
        <View style={{ flex: 1 }}><Button title={t('settings.backup')} icon="download" variant="secondary" onPress={async () => { await exportBackupJson(); showToast({ title: t('settings.backupReady'), tone: 'success' }); }} /></View>
        <View style={{ flex: 1 }}><Button title={t('settings.restoreLatest')} icon="upload" variant="secondary" onPress={() => confirm({
          title: t('settings.restoreLatest'),
          message: t('settings.restoreWarning'),
          confirmLabel: t('common.confirm'),
          cancelLabel: t('common.cancel'),
          destructive: true,
          onConfirm: async () => {
            try {
              const file = await restoreLatestBackupJson();
              if (!file) {
                showToast({ title: t('common.noData'), message: t('settings.noBackupFound'), tone: 'warning' });
                return;
              }
              refresh();
              showToast({ title: t('settings.restoreComplete'), tone: 'success' });
            } catch {
              showToast({ title: t('common.checkFields'), message: t('settings.restoreFailed'), tone: 'danger' });
            }
          },
        })} /></View>
      </View>
      </CollapsibleCard>
    </Animated.View>

    <Animated.View entering={FadeInDown.delay(6 * 80).springify().damping(14)}>
      <CollapsibleCard title={t('settings.dangerZone')} subtitle={t('settings.dangerHint')} icon="alert-triangle" defaultOpen={false}>
      <View style={{ borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderRadius: 20, padding: 14, marginBottom: 12 }}>
        <Text style={{ color: theme.colors.danger, fontWeight: '900', textAlign, fontSize: 14 }}>{t('settings.deleteAll')}</Text>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', textAlign, lineHeight: 18, fontSize: 11, marginTop: 6 }}>{t('settings.deleteWarning')}</Text>
      </View>
      <Button title={t('settings.deleteAll')} icon="trash-2" variant="danger" onPress={erase} />
      </CollapsibleCard>
    </Animated.View>

    <AnimatedCard index={7} compact>
      <SectionHeading title={isRTL ? 'اطلاعات و حریم خصوصی' : 'About & Privacy'} icon="info" />
      <View style={{ gap: 10 }}>
        <ActionTile
          title={isRTL ? 'درباره اپ' : 'About'}
          subtitle={isRTL ? 'نسخه، ارتباط با ما و بررسی بروزرسانی' : 'Version, contact and update information'}
          icon="info"
          tone="info"
          onPress={() => navigation.navigate('About')}
        />
        <ActionTile
          title={isRTL ? 'حریم خصوصی' : 'Privacy Policy'}
          subtitle={isRTL ? 'نحوه نگهداری اطلاعات و دسترسی‌های اپ' : 'How your information and permissions are handled'}
          icon="shield"
          tone="primary"
          onPress={() => navigation.navigate('Privacy')}
        />
      </View>
    </AnimatedCard>

    <Modal transparent visible={displayInfoOpen} animationType="none" onRequestClose={() => setDisplayInfoOpen(false)}>
      <Pressable
        onPress={() => setDisplayInfoOpen(false)}
        style={{ flex: 1, justifyContent: 'center', padding: 22, backgroundColor: theme.colors.overlay }}
      >
        <Animated.View entering={FadeIn.duration(220)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ margin: 10, backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: theme.colors.border, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginBottom: 16 }}>
              {isRTL ? 'حالت نمایش چیه؟' : 'Display modes explained'}
            </Text>
            <View style={{ backgroundColor: theme.colors.infoSoft, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.info + '44' }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: theme.colors.info, textAlign: isRTL ? 'right' : 'left', marginBottom: 5 }}>
                {isRTL ? '⚡ ساده' : '⚡ Simple'}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textAlign: isRTL ? 'right' : 'left', lineHeight: 19 }}>
                {isRTL ? 'فقط فیلدهای ضروری — ورود، خروج، نماد. مناسب ثبت سریع روزانه.' : 'Only essential fields — entry, exit, symbol. Best for fast daily logging.'}
              </Text>
            </View>
            <View style={{ backgroundColor: theme.colors.primarySoft, borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.primary + '44' }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: theme.colors.primaryGlow, textAlign: isRTL ? 'right' : 'left', marginBottom: 5 }}>
                {isRTL ? '🎯 حرفه‌ای' : '🎯 Pro'}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textAlign: isRTL ? 'right' : 'left', lineHeight: 19 }}>
                {isRTL ? 'ژورنال کامل با چک‌لیست، احساسات، یادداشت و عکس چارت. برای تریدر جدی.' : 'Full journal with checklist, emotions, notes and chart images. For serious traders.'}
              </Text>
            </View>
            <Button title={isRTL ? 'فهمیدم' : 'Got it'} onPress={() => setDisplayInfoOpen(false)} />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>

    <Modal transparent visible={symbolModalOpen} animationType="fade" onRequestClose={() => setSymbolModalOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 18, backgroundColor: theme.colors.overlay }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 28, padding: 18 }}>
            <View style={{ flexDirection: rowDirection, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.primaryGlow, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, textAlign }}>{t('settings.symbolMarket')}</Text>
                <Text style={{ color: theme.colors.text, fontSize: 21, fontWeight: '900', textAlign, marginTop: 3 }}>{t('settings.addSymbolTitle')}</Text>
              </View>
              <Pressable onPress={() => setSymbolModalOpen(false)} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Feather name="x" size={20} color={theme.colors.textSubtle} />
              </Pressable>
            </View>
            <Field label={t('settings.symbolName')} value={newSymbol.symbol} onChangeText={(value) => setNewSymbol((old) => ({ ...old, symbol: value.toUpperCase() }))} placeholder={t('settings.symbolPlaceholder')} autoCapitalize="characters" icon="hash" />
            <Text style={{ color: theme.colors.textMuted, fontWeight: '900', fontSize: 11, marginBottom: 8, textAlign }}>{t('settings.symbolMarket')}</Text>
            <Segmented value={newSymbol.market} onChange={(value) => setNewSymbolMarket(value as Market)} options={[{ value: 'forex', label: t('common.forex') }, { value: 'crypto', label: t('common.crypto') }]} />
            <View style={{ height: 12 }} />
            <Field label={t('settings.pipSize')} value={newSymbol.pipSize} onChangeText={(value) => setNewSymbol((old) => ({ ...old, pipSize: value }))} keyboardType="decimal-pad" placeholder={newSymbol.market === 'forex' ? '0.0001' : '1'} icon="activity" />
            <Field label={t('settings.contractSize')} value={newSymbol.contractSize} onChangeText={(value) => setNewSymbol((old) => ({ ...old, contractSize: value }))} keyboardType="decimal-pad" placeholder={newSymbol.market === 'forex' ? '100000' : '1'} icon="box" />
            <Field label={t('settings.quoteCurrency')} value={newSymbol.quoteCurrency} onChangeText={(value) => setNewSymbol((old) => ({ ...old, quoteCurrency: value.toUpperCase() }))} placeholder={newSymbol.market === 'forex' ? 'USD' : 'USDT'} autoCapitalize="characters" icon="dollar-sign" />
            <View style={{ flexDirection: rowDirection, gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Button title={t('common.cancel')} variant="secondary" onPress={() => setSymbolModalOpen(false)} /></View>
              <View style={{ flex: 1 }}><Button title={t('settings.saveSymbol')} icon="save" onPress={addSymbol} /></View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  </Screen>;
}
