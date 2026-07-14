import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DAILY_ID_KEY = 'daily_notification_id';
const WEEKLY_ID_KEY = 'weekly_notification_id';
const INACTIVITY_SENT_KEY = 'inactivity_notification_sent';

let handlerConfigured = false;

export function isNotificationRuntimeAvailable() {
  return Constants.executionEnvironment !== 'storeClient';
}

async function loadNotifications() {
  if (!isNotificationRuntimeAvailable()) return null;
  const Notifications = await import('expo-notifications');
  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  }
  return Notifications;
}

async function cancelStoredNotification(key: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const id = await AsyncStorage.getItem(key);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    await AsyncStorage.removeItem(key);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'TradeLog',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleDailyReminder(hour: number, minute: number, language: 'fa' | 'en'): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await cancelStoredNotification(DAILY_ID_KEY);
  const isFa = language === 'fa';
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: isFa ? 'ژورنال ترید' : 'Trade Journal',
      body: isFa ? 'امروز تریدی ثبت کردی؟ یادداشت‌هایت را بنویس.' : 'Did you trade today? Log your notes.',
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  await AsyncStorage.setItem(DAILY_ID_KEY, id);
}

export async function checkInactivityAndNotify(lastTradeDateISO: string | null, language: 'fa' | 'en'): Promise<void> {
  // A new user with no trades must not receive a misleading inactivity alert.
  if (!lastTradeDateISO) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const lastTradeTime = lastTradeDateISO ? new Date(lastTradeDateISO).getTime() : Number.NaN;
  const isInactive = !Number.isFinite(lastTradeTime) || Date.now() - lastTradeTime >= 3 * 24 * 60 * 60 * 1000;
  if (!isInactive) {
    await AsyncStorage.removeItem(INACTIVITY_SENT_KEY);
    return;
  }
  if (await AsyncStorage.getItem(INACTIVITY_SENT_KEY)) return;
  const isFa = language === 'fa';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: isFa ? 'دلت برای ترید تنگ شده؟' : 'Missing the markets?',
      body: isFa ? '۳ روزه ترید ثبت نکردی. برگرد به بازار!' : "You haven't logged a trade in 3 days. Time to get back!",
      sound: true,
    },
    trigger: null,
  });
  await AsyncStorage.setItem(INACTIVITY_SENT_KEY, new Date().toISOString());
}

export async function scheduleWeeklySummary(winRate: number, pnl: number, currency: string, lang: string): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await cancelStoredNotification(WEEKLY_ID_KEY);
  const isFa = lang === 'fa';
  const signedPnl = `${pnl >= 0 ? '+' : '-'}${currency}${Math.abs(pnl).toFixed(2)}`;
  const rate = Math.round(winRate);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: isFa ? 'خلاصه هفته' : 'Weekly Summary',
      body: isFa
        ? `این هفته نرخ برد تو ${rate}% بود و P&L: ${signedPnl}`
        : `This week your win rate was ${rate}% and P&L: ${signedPnl}`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 20, minute: 0 },
  });
  await AsyncStorage.setItem(WEEKLY_ID_KEY, id);
}

export async function cancelAllNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (Notifications) await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.multiRemove([DAILY_ID_KEY, WEEKLY_ID_KEY, INACTIVITY_SENT_KEY]);
}
