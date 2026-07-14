import React from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Card, Screen, Title } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import type { RootNavigation } from '@/types/navigation';

const privacyUrl = 'https://tradelog.app/privacy';
const marketUrl = 'market://details?id=com.tradelog.app';
const marketFallbackUrl = 'https://myket.ir/app/com.tradelog.app';
const supportEmail = 'mailto:support@tradelog.app';

export default function AboutScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { theme, isRTL, language } = useApp();
  const textAlign = isRTL ? 'right' as const : 'left' as const;
  const rowDirection = isRTL ? 'row-reverse' as const : 'row' as const;

  const openMarket = async () => {
    try {
      await Linking.openURL(marketUrl);
    } catch {
      await Linking.openURL(marketFallbackUrl);
    }
  };

  const rows = [
    {
      icon: 'file-text' as const,
      title: 'Privacy Policy',
      onPress: () => Linking.openURL(privacyUrl),
    },
    {
      icon: 'star' as const,
      title: language === 'fa' ? 'امتیاز بده' : 'Rate TradeLog',
      onPress: openMarket,
    },
    {
      icon: 'mail' as const,
      title: language === 'fa' ? 'ارتباط با ما' : 'Contact Us',
      onPress: () => Linking.openURL(supportEmail),
    },
    {
      icon: 'refresh-cw' as const,
      title: language === 'fa' ? 'بررسی آپدیت' : 'Check for Updates',
      onPress: openMarket,
    },
  ];

  return (
    <Screen>
      <Title
        eyebrow="TradeLog"
        subtitle={language === 'fa' ? 'اطلاعات اپلیکیشن' : 'Application information'}
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
            <Feather name="x" size={20} color={theme.colors.text} />
          </Pressable>
        )}
      >
        {language === 'fa' ? 'درباره اپ' : 'About'}
      </Title>

      <Card elevated>
        <View
          style={{
            width: 112,
            height: 112,
            borderRadius: 35,
            alignSelf: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.primarySoft,
            borderWidth: 1,
            borderColor: `${theme.colors.primary}55`,
          }}
        >
          <Image source={require('../../../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 30 }} resizeMode="contain" />
        </View>
        <Text style={{ color: theme.colors.text, fontSize: 31, fontWeight: '900', textAlign: 'center', marginTop: 18 }}>TradeLog</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 7 }}>
          {language === 'fa' ? 'نسخه ۱.۰.۰' : 'Version 1.0.0'}
        </Text>
      </Card>

      <Card>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center', lineHeight: 28 }}>
          {language === 'fa' ? 'ساخته شده با ❤️ برای\nتریدرهای فارسی‌زبان' : 'Made with ❤️ for\nPersian-speaking traders'}
        </Text>
      </Card>

      <Card compact>
        {rows.map((row, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={row.title}
            key={row.title}
            onPress={row.onPress}
            style={({ pressed }) => ({
              flexDirection: rowDirection,
              alignItems: 'center',
              gap: 12,
              minHeight: 58,
              paddingVertical: 9,
              borderBottomWidth: index === rows.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft }}>
              <Feather name={row.icon} size={18} color={theme.colors.primaryGlow} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900', flex: 1, textAlign }}>{row.title}</Text>
            <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={theme.colors.textSubtle} />
          </Pressable>
        ))}
      </Card>

      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '900' }}>© 2026 TradeLog</Text>
        <Text style={{ color: theme.colors.textSubtle, fontSize: 11, fontWeight: '700', marginTop: 5 }}>All rights reserved</Text>
      </View>
    </Screen>
  );
}
