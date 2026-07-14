import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useApp } from '@/context/AppContext';
import { Button, Card, Field, Screen, Segmented } from '@/components/ui';

type Slide = {
  key: 'welcome' | 'log' | 'analytics' | 'setup';
  icon: string;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
};

const slides: Slide[] = [
  {
    key: 'welcome',
    icon: '📊',
    titleFa: 'به TradeLog خوش اومدی',
    titleEn: 'Welcome to TradeLog',
    descriptionFa: 'ژورنال ترید حرفه‌ای برای فارکس و کریپتو',
    descriptionEn: 'Professional trade journal for Forex & Crypto',
  },
  {
    key: 'log',
    icon: '✍️',
    titleFa: 'هر ترید رو ثبت کن',
    titleEn: 'Log Every Trade',
    descriptionFa: 'ورود، خروج، استراتژی، احساسات و عکس چارت — همه در یه جا',
    descriptionEn: 'Entry, exit, strategy, emotions and chart images — all in one place',
  },
  {
    key: 'analytics',
    icon: '📈',
    titleFa: 'تحلیل کن و رشد کن',
    titleEn: 'Analyze & Grow',
    descriptionFa: 'نمودارها، Win Rate، بهترین استراتژی و تحلیل احساساتت رو ببین',
    descriptionEn: 'See charts, win rate, best strategy and emotion analysis',
  },
  {
    key: 'setup',
    icon: '⚙️',
    titleFa: 'اکانتت رو تنظیم کن',
    titleEn: 'Set Up Your Account',
    descriptionFa: 'موجودی و درصد ریسک پیش‌فرضت رو وارد کن',
    descriptionEn: 'Enter your account balance and default risk percentage',
  },
];

const parseNumber = (value: string) => {
  const normalized = String(value).replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function OnboardingScreen() {
  const listRef = useRef<FlatList<Slide>>(null);
  const { width: windowWidth } = useWindowDimensions();
  const {
    language,
    setLanguage,
    themeMode,
    setThemeMode,
    accountBalance,
    defaultRisk,
    currency,
    saveAccount,
    completeOnboarding,
    theme,
    isRTL,
  } = useApp();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [balance, setBalance] = useState(accountBalance > 0 ? String(accountBalance) : '');
  const [risk, setRisk] = useState(String(defaultRisk || 1));
  const [saving, setSaving] = useState(false);

  const pageWidth = Math.max(1, windowWidth - 32);
  const isLastSlide = currentIndex === slides.length - 1;
  const numericBalance = parseNumber(balance);
  const numericRisk = parseNumber(risk);
  const canStart = numericBalance > 0 && numericRisk > 0;
  const textAlign = isRTL ? 'right' as const : 'left' as const;

  const copy = useMemo(() => ({
    next: language === 'fa' ? 'بعدی' : 'Next',
    start: language === 'fa' ? 'شروع کن' : 'Get Started',
    balance: language === 'fa' ? 'موجودی اکانت' : 'Account Balance',
    risk: language === 'fa' ? 'درصد ریسک پیش‌فرض' : 'Default Risk Percentage',
    language: language === 'fa' ? 'زبان' : 'Language',
    theme: language === 'fa' ? 'تم' : 'Theme',
    dark: language === 'fa' ? 'تاریک' : 'Dark',
    light: language === 'fa' ? 'روشن' : 'Light',
    balanceError: language === 'fa' ? 'موجودی باید بیشتر از صفر باشد.' : 'Balance must be greater than zero.',
    riskError: language === 'fa' ? 'ریسک باید بیشتر از صفر باشد.' : 'Risk must be greater than zero.',
  }), [language]);

  const goNext = () => {
    const nextIndex = Math.min(currentIndex + 1, slides.length - 1);
    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    setCurrentIndex(nextIndex);
  };

  const finish = async () => {
    if (!canStart || saving) return;
    setSaving(true);
    try {
      await saveAccount({
        accountBalance: numericBalance,
        defaultRisk: numericRisk,
        currency: currency || 'USD',
      });
      await completeOnboarding();
    } finally {
      setSaving(false);
    }
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setCurrentIndex(Math.max(0, Math.min(slides.length - 1, index)));
  };

  const renderSlide = ({ item }: ListRenderItemInfo<Slide>) => {
    const title = language === 'fa' ? item.titleFa : item.titleEn;
    const description = language === 'fa' ? item.descriptionFa : item.descriptionEn;

    return (
      <View style={{ width: pageWidth, flex: 1, justifyContent: 'center', paddingVertical: 18 }}>
        <Animated.View entering={FadeIn.duration(450)} key={`${item.key}-${language}-${themeMode}`}>
          <Card elevated style={{ minHeight: item.key === 'setup' ? 500 : 390, justifyContent: 'center' }}>
            <View
              style={{
                width: 108,
                height: 108,
                borderRadius: 34,
                alignSelf: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.primarySoft,
                borderWidth: 1,
                borderColor: `${theme.colors.primary}55`,
                marginBottom: 28,
              }}
            >
              <Text style={{ fontSize: 52 }}>{item.icon}</Text>
            </View>

            <Text
              style={{
                color: theme.colors.text,
                fontSize: 29,
                lineHeight: 39,
                fontWeight: '900',
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: 15,
                lineHeight: 25,
                fontWeight: '700',
                textAlign: 'center',
                marginTop: 14,
                marginBottom: item.key === 'setup' ? 24 : 0,
              }}
            >
              {description}
            </Text>

            {item.key === 'setup' ? (
              <View>
                <Field
                  label={copy.balance}
                  value={balance}
                  onChangeText={setBalance}
                  keyboardType="decimal-pad"
                  icon="dollar-sign"
                  suffix={currency || 'USD'}
                  error={balance.length > 0 && numericBalance <= 0 ? copy.balanceError : undefined}
                />
                <Field
                  label={copy.risk}
                  value={risk}
                  onChangeText={setRisk}
                  keyboardType="decimal-pad"
                  icon="percent"
                  suffix="%"
                  error={risk.length > 0 && numericRisk <= 0 ? copy.riskError : undefined}
                />

                <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', marginTop: 6, marginBottom: 8, textAlign }}>
                  {copy.language}
                </Text>
                <Segmented
                  value={language}
                  onChange={(value) => setLanguage(value as 'fa' | 'en')}
                  options={[
                    { value: 'fa', label: 'فارسی' },
                    { value: 'en', label: 'English' },
                  ]}
                />

                <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', marginTop: 16, marginBottom: 8, textAlign }}>
                  {copy.theme}
                </Text>
                <Segmented
                  value={themeMode}
                  onChange={(value) => setThemeMode(value as 'dark' | 'light')}
                  options={[
                    { value: 'dark', label: copy.dark },
                    { value: 'light', label: copy.light },
                  ]}
                />
              </View>
            ) : null}
          </Card>
        </Animated.View>
      </View>
    );
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 10, alignItems: 'center' }}>
          <Text style={{ color: theme.colors.primaryGlow, fontSize: 16, fontWeight: '900', letterSpacing: 1.2 }}>TradeLog</Text>
        </View>

        <FlatList
          ref={listRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
          style={{ flex: 1 }}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
          {slides.map((slide, index) => (
            <View
              key={slide.key}
              style={{
                width: index === currentIndex ? 26 : 8,
                height: 8,
                borderRadius: 99,
                backgroundColor: index === currentIndex ? theme.colors.primary : theme.colors.border,
              }}
            />
          ))}
        </View>

        <Button
          title={isLastSlide ? copy.start : copy.next}
          icon={isLastSlide ? 'check' : isRTL ? 'arrow-left' : 'arrow-right'}
          onPress={isLastSlide ? finish : goNext}
          disabled={isLastSlide && (!canStart || saving)}
        />
        <View style={{ height: 14 }} />
      </View>
    </Screen>
  );
}
