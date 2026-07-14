import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import '@/i18n';
import { AppProvider, useApp } from '@/context/AppContext';
import { FeedbackProvider } from '@/components/feedback';
import AppNavigator from '@/AppNavigator';
import { getDb } from '@/db/database';
import { getSettings } from '@/db/repositories';
import { checkInactivityAndNotify, requestNotificationPermission, scheduleDailyReminder } from '@/services/notifications';

function AppShell() {
  const { theme } = useApp();
  useEffect(() => {
    const setupNotifications = async () => {
      const settings = await getSettings();
      if ((settings.notif_enabled ?? '0') !== '1') return;
      if (!(await requestNotificationPermission())) return;

      const language = settings.language === 'en' ? 'en' : 'fa';
      await scheduleDailyReminder(
        Number(settings.notif_hour ?? '20'),
        Number(settings.notif_minute ?? '0'),
        language,
      );
      const db = await getDb();
      const latest = await db.getFirstAsync<{ open_time: string | null }>(
        'SELECT open_time FROM trades ORDER BY open_time DESC LIMIT 1',
      );
      await checkInactivityAndNotify(latest?.open_time ?? null, language);
    };
    setupNotifications().catch(console.warn);
  }, []);
  return <FeedbackProvider><StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} /><AppNavigator /></FeedbackProvider>;
}

export default function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><AppProvider><AppShell /></AppProvider></SafeAreaProvider></GestureHandlerRootView>;
}
