import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/context/AppContext';
import DashboardScreen from '@/features/dashboard/DashboardScreen';
import NewTradeScreen from '@/features/trades/NewTradeScreen';
import TradeListScreen from '@/features/trades/TradeListScreen';
import TradeDetailScreen from '@/features/trades/TradeDetailScreen';
import CloseTradeScreen from '@/features/trades/CloseTradeScreen';
import EditTradeScreen from '@/features/trades/EditTradeScreen';
import AnalyticsScreen from '@/features/analytics/AnalyticsScreen';
import CalculatorScreen from '@/features/calculator/CalculatorScreen';
import SettingsScreen from '@/features/settings/SettingsScreen';
import OnboardingScreen from '@/features/settings/OnboardingScreen';
import ImportScreen from '@/features/settings/ImportScreen';
import AboutScreen from '@/features/settings/AboutScreen';
import PrivacyScreen from '@/features/settings/PrivacyScreen';
import { RootStackParamList, TabParamList } from '@/types/navigation';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
  Dashboard: 'grid',
  NewTrade: 'plus-circle',
  Trades: 'list',
  Analytics: 'bar-chart-2',
  Calculator: 'sliders',
  Settings: 'settings',
};

function Tabs() {
  const { t } = useTranslation();
  const { theme, isRTL } = useApp();
  const insets = useSafeAreaInsets();
  const screens = [
    ['Dashboard', DashboardScreen, t('tabs.dashboard')],
    ['NewTrade', NewTradeScreen, t('tabs.newTrade')],
    ['Trades', TradeListScreen, t('tabs.trades')],
    ['Analytics', AnalyticsScreen, t('tabs.analytics')],
    ['Calculator', CalculatorScreen, isRTL ? 'ماشین حساب' : 'Calc'],
    ['Settings', SettingsScreen, t('tabs.settings')],
  ] as const;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 8,
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 9,
          paddingHorizontal: 8,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderWidth: 1,
          borderTopColor: theme.colors.border,
          borderColor: theme.colors.border,
          borderRadius: 30,
          elevation: 26,
          shadowColor: '#000',
          shadowOpacity: 0.24,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
        },
        tabBarItemStyle: { borderRadius: 22, paddingVertical: 2 },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '900', marginTop: 2 },
        tabBarIcon: ({ color, focused }) => (
          <View
            style={{
              width: focused ? 38 : 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: focused ? theme.colors.primary : 'transparent',
              borderWidth: focused ? 1 : 0,
              borderColor: focused ? theme.colors.primaryGlow : 'transparent',
            }}
          >
            <Feather name={iconMap[route.name] ?? 'circle'} color={focused ? '#FFFFFF' : color} size={focused ? 18 : 20} />
          </View>
        ),
      })}
    >
      {screens.map(([name, component, title]) => <Tab.Screen key={name} name={name} component={component} options={{ tabBarLabel: title }} />)}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { theme, ready, onboarded } = useApp();
  if (!ready) return null;
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
      notification: theme.colors.primary,
    },
  };
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!onboarded ? <Stack.Screen name="Onboarding" component={OnboardingScreen} /> : <>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="TradeDetail" component={TradeDetailScreen} />
          <Stack.Screen name="CloseTrade" component={CloseTradeScreen} />
          <Stack.Screen name="EditTrade" component={EditTradeScreen} />
          <Stack.Screen
            name="Import"
            component={ImportScreen}
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="About" component={AboutScreen} />
          <Stack.Screen name="Privacy" component={PrivacyScreen} />
        </>}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
