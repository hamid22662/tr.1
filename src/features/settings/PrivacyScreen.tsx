import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Card, Screen, Title } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import type { RootNavigation } from '@/types/navigation';

type PrivacySection = {
  title: string;
  body: string;
};

const faSections: PrivacySection[] = [
  {
    title: '۱. جمع‌آوری داده‌ها',
    body: 'TradeLog هیچ داده شخصی را جمع‌آوری نمی‌کند.\nتمام اطلاعات شما فقط روی دستگاه شما ذخیره می‌شود.',
  },
  {
    title: '۲. اینترنت',
    body: 'این اپ برای کار کردن نیاز به اینترنت ندارد.\nهیچ داده‌ای به سرور ارسال نمی‌شود.',
  },
  {
    title: '۳. تصاویر',
    body: 'تصاویر چارت فقط روی دستگاه شما ذخیره می‌شوند.',
  },
  {
    title: '۴. نوتیفیکیشن',
    body: 'اعلان‌ها فقط برای یادآوری محلی استفاده می‌شوند.',
  },
  {
    title: '۵. خروجی و پشتیبان‌گیری',
    body: 'فایل‌های خروجی و پشتیبان تنها با اقدام شما ساخته یا به برنامه دیگری ارسال می‌شوند. مسئولیت نگهداری امن فایل اشتراک‌گذاری‌شده با کاربر است.',
  },
  {
    title: '۶. حذف اطلاعات',
    body: 'از بخش تنظیمات می‌توانید اطلاعات ثبت‌شده و تصاویر مرتبط را از دستگاه حذف کنید. پشتیبان‌هایی که قبلاً خارج از برنامه ذخیره کرده‌اید جداگانه باقی می‌مانند.',
  },
  {
    title: '۷. تماس',
    body: 'support@tradelog.app',
  },
];

const enSections: PrivacySection[] = [
  {
    title: '1. Data Collection',
    body: 'TradeLog does not collect any personal data.\nAll your information is stored only on your device.',
  },
  {
    title: '2. Internet',
    body: 'This app does not require an internet connection to work.\nNo data is sent to any server.',
  },
  {
    title: '3. Images',
    body: 'Chart images are stored only on your device.',
  },
  {
    title: '4. Notifications',
    body: 'Notifications are used only for local reminders.',
  },
  {
    title: '5. Export and backups',
    body: 'Export and backup files are created or shared only after your action. You are responsible for protecting files shared outside the app.',
  },
  {
    title: '6. Data deletion',
    body: 'You can remove stored data and related chart images from Settings. Copies previously exported outside the app remain separate.',
  },
  {
    title: '7. Contact',
    body: 'support@tradelog.app',
  },
];

export default function PrivacyScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { theme, isRTL, language } = useApp();
  const sections = language === 'fa' ? faSections : enSections;
  const textAlign = isRTL ? 'right' as const : 'left' as const;

  return (
    <Screen>
      <Title
        eyebrow="TradeLog"
        subtitle={language === 'fa' ? 'آخرین بروزرسانی: ۲۰۲۶' : 'Last updated: 2026'}
        right={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={language === 'fa' ? 'بازگشت' : 'Go back'}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={theme.colors.text} />
          </Pressable>
        )}
      >
        {language === 'fa' ? 'حریم خصوصی' : 'Privacy Policy'}
      </Title>

      <Card elevated>
        <View style={{ width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft, marginBottom: 16, alignSelf: isRTL ? 'flex-end' : 'flex-start' }}>
          <Feather name="shield" size={28} color={theme.colors.primaryGlow} />
        </View>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign, lineHeight: 28 }}>
          {language === 'fa' ? 'اطلاعات شما متعلق به خود شماست.' : 'Your data belongs to you.'}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700', textAlign, lineHeight: 22, marginTop: 8 }}>
          {language === 'fa'
            ? 'TradeLog به‌صورت آفلاین طراحی شده و اطلاعات ژورنال شما را روی دستگاه نگه می‌دارد.'
            : 'TradeLog is designed to work offline and keeps your journal information on your device.'}
        </Text>
      </Card>

      {sections.map((section, index) => (
        <Card compact key={section.title}>
          <Text style={{ color: theme.colors.primaryGlow, fontSize: 15, fontWeight: '900', textAlign }}>{section.title}</Text>
          {index === sections.length - 1 ? (
            <Pressable onPress={() => Linking.openURL('mailto:support@tradelog.app')} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800', textAlign, lineHeight: 23, marginTop: 10 }}>support@tradelog.app</Text>
            </Pressable>
          ) : (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700', textAlign, lineHeight: 23, marginTop: 10 }}>{section.body}</Text>
          )}
        </Card>
      ))}
    </Screen>
  );
}
