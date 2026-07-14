import type { CompositeNavigationProp, NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Trade } from '@/types';

export type TabParamList = {
  Dashboard: undefined;
  NewTrade: { cloneTrade?: Partial<Trade> } | undefined;
  Trades: undefined;
  Analytics: undefined;
  Calculator: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  TradeDetail: { id: number };
  CloseTrade: { id: number };
  EditTrade: { id: number };
  Import: undefined;
  About: undefined;
  Privacy: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
export type AppNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  RootNavigation
>;

export type NewTradeRoute = RouteProp<TabParamList, 'NewTrade'>;
export type TradeDetailRoute = RouteProp<RootStackParamList, 'TradeDetail'>;
export type CloseTradeRoute = RouteProp<RootStackParamList, 'CloseTrade'>;
export type EditTradeRoute = RouteProp<RootStackParamList, 'EditTrade'>;
