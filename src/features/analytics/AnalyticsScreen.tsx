import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Dimensions, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  VictoryArea,
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryPie,
  VictoryTheme,
} from 'victory-native';
import { getAnalytics, getTradesByDayOfWeek } from '@/db/repositories';
import { useApp } from '@/context/AppContext';
import { AnimatedCard, Button, Empty, HeroCard, MiniKpi, ProgressRow, Screen, SectionHeading, Title } from '@/components/ui';
import { formatMoney, formatNumber } from '@/services/calculations';
import { generateMonthlyReport } from '@/services/pdfReport';

type Data = Awaited<ReturnType<typeof getAnalytics>>;
type DayOfWeekData = Awaited<ReturnType<typeof getTradesByDayOfWeek>>;

const chartWidth = Dimensions.get('window').width - 48;

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { theme, isRTL, currency, refreshKey } = useApp();
  const [data, setData] = useState<Data | null>(null);
  const [dayOfWeekData, setDayOfWeekData] = useState<DayOfWeekData>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const load = useCallback(async () => {
    const [analytics, byDayOfWeek] = await Promise.all([getAnalytics(), getTradesByDayOfWeek()]);
    setData(analytics);
    setDayOfWeekData(byDayOfWeek);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load, refreshKey]));

  const maxEmotion = useMemo(() => Math.max(1, ...(data?.byEmotion.map((item) => Math.abs(Number(item.avgPnl))) ?? [1])), [data]);
  const maxStrategy = useMemo(() => Math.max(1, ...(data?.byStrategy.map((item) => Math.abs(Number(item.pnl))) ?? [1])), [data]);
  const maxSymbol = useMemo(() => Math.max(1, ...(data?.bySymbol.map((item) => Math.abs(Number(item.pnl))) ?? [1])), [data]);
  const cumulativeCurve = useMemo(() => {
    let total = 0;
    return (data?.recentCurve ?? []).map((item) => {
      total += Number(item.pnl);
      return { x: item.day.slice(5), y: total };
    });
  }, [data]);
  const weeklyPnl = useMemo(() => {
    const weeks = new Map<string, number>();
    for (const item of data?.recentCurve ?? []) {
      const date = new Date(`${item.day}T00:00:00`);
      const offsetFromMonday = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - offsetFromMonday);
      const weekStart = date.toISOString().slice(5, 10);
      weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + Number(item.pnl));
    }
    return [...weeks.entries()].slice(-8).map(([week, pnl]) => ({ week, pnl }));
  }, [data]);
  const pnlByDay = useMemo(() => {
    const labels = isRTL ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const indexed = new Map(dayOfWeekData.map((item) => [(Number(item.dow) + 1) % 7, item]));
    return labels.map((label, index) => {
      const item = indexed.get(index);
      return { label, average: item?.trades ? Number(item.pnl) / Number(item.trades) : 0, trades: Number(item?.trades ?? 0) };
    });
  }, [dayOfWeekData, isRTL]);

  if (!data) return <Screen><Empty text={t('common.loading')} /></Screen>;

  const winRate = data.totals.trades ? Math.round((data.totals.wins / data.totals.trades) * 100) : 0;
  const breakEvenTrades = Math.max(0, data.totals.trades - data.totals.wins - data.totals.losses);
  const profitFactorInfinite = !Number.isFinite(data.totals.profitFactor);
  const bestStrategy = data.byStrategy[0];
  const worstStrategy = [...data.byStrategy].sort((a, b) => Number(a.pnl) - Number(b.pnl))[0];
  const worstEmotion = [...data.byEmotion].sort((a, b) => Number(a.avgPnl) - Number(b.avgPnl))[0];
  const bestSymbol = data.bySymbol[0];
  const tone = data.totals.pnl > 0 ? 'success' : data.totals.pnl < 0 ? 'danger' : 'primary';
  const rowDirection = isRTL ? 'row-reverse' as const : 'row' as const;
  const textAlign = isRTL ? 'right' as const : 'left' as const;
  const behavioralInsight = worstEmotion && Number(worstEmotion.avgPnl) < 0
    ? isRTL
      ? `بیشترین فشار رفتاری فعلاً از احساس «${t(`emotions.${worstEmotion.emotion}`)}» می‌آید. حجم را در این حالت سبک‌تر کن.`
      : `Your weakest behavior state is “${t(`emotions.${worstEmotion.emotion}`)}”. Reduce size when this emotion appears.`
    : isRTL
      ? 'برای تحلیل رفتاری دقیق‌تر، بعد از هر ترید احساس ورود و خروج را ثبت کن.'
      : 'For stronger behavioral insights, log entry and exit emotions on every trade.';

  const createPdfReport = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const now = new Date();
      await generateMonthlyReport({
        lang: isRTL ? 'fa' : 'en',
        currency,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Screen>
      <Title eyebrow="Performance Lab" subtitle={isRTL ? 'عددها را به تصمیم قابل اجرا تبدیل کن.' : 'Turn numbers into actionable trading decisions.'}>{t('analytics.title')}</Title>

      <Button
        title={isGeneratingPdf ? (isRTL ? 'در حال ساخت گزارش…' : 'Generating report…') : (isRTL ? 'گزارش PDF این ماه' : 'This month PDF report')}
        variant="secondary"
        icon="file-text"
        disabled={isGeneratingPdf}
        onPress={createPdfReport}
      />

      <HeroCard
        eyebrow={isRTL ? 'نتیجه کل' : 'Total result'}
        title={t('analytics.totalPnl')}
        value={formatMoney(data.totals.pnl, currency)}
        caption={bestStrategy ? `${isRTL ? 'بهترین استراتژی' : 'Best strategy'}: ${bestStrategy.strategy}` : isRTL ? 'برای تحلیل بهتر، تریدهای بیشتری ثبت کن.' : 'Log more trades to unlock better insights.'}
        tone={tone}
        footer={(
          <View style={{ gap: 9 }}>
            <View style={{ flexDirection: rowDirection, gap: 9 }}>
              <MiniKpi label={t('dashboard.winRate')} value={`${winRate}%`} tone="info" />
              <MiniKpi label={t('analytics.profitFactor')} value={profitFactorInfinite ? '∞' : formatNumber(data.totals.profitFactor, 2)} tone={profitFactorInfinite || data.totals.profitFactor >= 1.4 ? 'success' : data.totals.profitFactor < 1 ? 'danger' : 'warning'} />
              <MiniKpi label={t('analytics.avgRr')} value={`1:${formatNumber(data.totals.avgRr, 2)}`} tone="primary" />
            </View>
            <View style={{ flexDirection: rowDirection, gap: 9 }}>
              <MiniKpi label={t('analytics.avgWin')} value={formatMoney(data.totals.avgWin, currency)} tone="success" />
              <MiniKpi label={t('analytics.avgLoss')} value={formatMoney(data.totals.avgLoss, currency)} tone="danger" />
              <MiniKpi label={t('analytics.trades')} value={formatNumber(data.totals.trades, 0)} />
            </View>
          </View>
        )}
      />

      <AnimatedCard index={0}>
        <SectionHeading title={isRTL ? 'رشد سود و زیان' : 'P&L growth'} icon="trending-up" meta="P&L" />
        {cumulativeCurve.length ? (
          <VictoryChart width={chartWidth} height={200} padding={{ top: 12, bottom: 38, left: 55, right: 18 }} theme={VictoryTheme.material}>
            <VictoryAxis style={{ axis: { stroke: theme.colors.border }, tickLabels: { fill: theme.colors.textSubtle, fontSize: 9 }, grid: { stroke: 'transparent' } }} />
            <VictoryAxis dependentAxis style={{ axis: { stroke: theme.colors.border }, tickLabels: { fill: theme.colors.textSubtle, fontSize: 9 }, grid: { stroke: theme.colors.border, strokeDasharray: '4,4' } }} />
            <VictoryArea data={cumulativeCurve} interpolation="monotoneX" style={{ data: { stroke: theme.colors.primary, strokeWidth: 2.5, fill: theme.colors.primarySoft } }} />
          </VictoryChart>
        ) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={1}>
        <SectionHeading title={isRTL ? 'سود و زیان هفتگی' : 'Weekly P&L'} icon="bar-chart-2" meta={isRTL ? '۸ هفته اخیر' : 'Last 8 weeks'} />
        {weeklyPnl.length ? (
          <VictoryChart width={chartWidth} height={180} padding={{ top: 12, bottom: 38, left: 55, right: 18 }} domainPadding={{ x: 16 }} theme={VictoryTheme.material}>
            <VictoryAxis style={{ axis: { stroke: theme.colors.border }, tickLabels: { fill: theme.colors.textSubtle, fontSize: 9 }, grid: { stroke: 'transparent' } }} />
            <VictoryAxis dependentAxis style={{ axis: { stroke: theme.colors.border }, tickLabels: { fill: theme.colors.textSubtle, fontSize: 9 }, grid: { stroke: theme.colors.border, strokeDasharray: '4,4' } }} />
            <VictoryBar data={weeklyPnl} x="week" y="pnl" cornerRadius={3} style={{ data: { fill: ({ datum }) => Number(datum.pnl) >= 0 ? theme.colors.success : theme.colors.danger } }} />
          </VictoryChart>
        ) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={2}>
        <SectionHeading title={isRTL ? 'عملکرد روزهای هفته' : 'P&L by day of week'} icon="calendar" meta={isRTL ? 'میانگین P&L' : 'Avg P&L'} />
        {dayOfWeekData.length ? (
          <VictoryChart width={chartWidth} height={180} padding={{ top: 12, bottom: 38, left: 55, right: 18 }} domainPadding={{ x: 14 }} theme={VictoryTheme.material}>
            <VictoryAxis style={{ axis: { stroke: theme.colors.border }, tickLabels: { fill: theme.colors.textSubtle, fontSize: 9 }, grid: { stroke: 'transparent' } }} />
            <VictoryAxis dependentAxis style={{ axis: { stroke: theme.colors.border }, tickLabels: { fill: theme.colors.textSubtle, fontSize: 9 }, grid: { stroke: theme.colors.border, strokeDasharray: '4,4' } }} />
            <VictoryBar data={pnlByDay} x="label" y="average" cornerRadius={3} style={{ data: { fill: ({ datum }) => Number(datum.average) >= 0 ? theme.colors.success : theme.colors.danger } }} />
          </VictoryChart>
        ) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={3}>
        <SectionHeading title={isRTL ? 'برد در برابر باخت' : 'Win vs loss'} icon="pie-chart" />
        {data.totals.trades ? (
          <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
            <VictoryPie
              width={chartWidth}
              height={180}
              padding={12}
              innerRadius={54}
              data={[
                { x: 'Win', y: data.totals.wins },
                { x: 'Loss', y: data.totals.losses },
                ...(breakEvenTrades ? [{ x: 'Break-even', y: breakEvenTrades }] : []),
              ]}
              colorScale={[theme.colors.success, theme.colors.danger, theme.colors.warning]}
              labels={() => null}
            />
            <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: 'bold' }}>{winRate}%</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 10, fontWeight: '700' }}>{isRTL ? 'نرخ برد' : 'Win rate'}</Text>
            </View>
          </View>
        ) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={4}>
        <SectionHeading title={isRTL ? 'استراتژی برنده / بازنده' : 'Best / worst strategy'} icon="target" />
        <View style={{ flexDirection: rowDirection, gap: 9 }}>
          <MiniKpi label={isRTL ? 'بهترین' : 'Best'} value={bestStrategy?.strategy ?? '—'} tone="success" />
          <MiniKpi label={isRTL ? 'ضعیف‌ترین' : 'Weakest'} value={worstStrategy?.strategy ?? '—'} tone={worstStrategy && Number(worstStrategy.pnl) < 0 ? 'danger' : 'default'} />
        </View>
      </AnimatedCard>

      <AnimatedCard index={5}>
        <SectionHeading title={isRTL ? 'اثر احساسات روی نتیجه' : 'Emotion impact'} icon="heart" meta={isRTL ? 'میانگین P&L' : 'Avg P&L'} />
        {data.byEmotion.length ? data.byEmotion.map((item) => {
          const avg = Number(item.avgPnl);
          const wr = Math.round((Number(item.wins) / Number(item.trades)) * 100 || 0);
          return <ProgressRow key={item.emotion} label={t(`emotions.${item.emotion}`)} value={`${wr}% · ${formatMoney(avg, currency)}`} detail={`${item.trades} ${isRTL ? 'ترید' : 'trades'}`} progress={(Math.abs(avg) / maxEmotion) * 100} tone={avg >= 0 ? 'success' : 'danger'} />;
        }) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={6}>
        <SectionHeading title={isRTL ? 'عملکرد استراتژی‌ها' : 'Strategy performance'} icon="target" meta="P&L" />
        {data.byStrategy.length ? data.byStrategy.map((item) => {
          const pnl = Number(item.pnl);
          const wr = Math.round((Number(item.wins) / Number(item.trades)) * 100 || 0);
          return <ProgressRow key={item.strategy} label={item.strategy} value={formatMoney(pnl, currency)} detail={`${item.trades} ${isRTL ? 'ترید' : 'trades'} · ${wr}% WR · 1:${formatNumber(Number(item.avgRr), 2)}`} progress={(Math.abs(pnl) / maxStrategy) * 100} tone={pnl >= 0 ? 'success' : 'danger'} />;
        }) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={7}>
        <SectionHeading title={isRTL ? 'نمادهای اثرگذار' : 'Symbol impact'} icon="hash" meta={bestSymbol?.symbol} />
        {data.bySymbol.length ? data.bySymbol.map((item) => {
          const pnl = Number(item.pnl);
          const wr = Math.round((Number(item.wins) / Number(item.trades)) * 100 || 0);
          return <ProgressRow key={item.symbol} label={item.symbol} value={formatMoney(pnl, currency)} detail={`${item.trades} ${isRTL ? 'ترید' : 'trades'} · ${wr}% WR`} progress={(Math.abs(pnl) / maxSymbol) * 100} tone={pnl >= 0 ? 'success' : 'danger'} />;
        }) : <Empty />}
      </AnimatedCard>

      <AnimatedCard index={8} compact>
        <SectionHeading title={isRTL ? 'برداشت رفتاری' : 'Behavioral read'} icon="compass" />
        <Text style={{ color: theme.colors.textMuted, textAlign, lineHeight: 21, fontSize: 12, fontWeight: '800' }}>{behavioralInsight}</Text>
      </AnimatedCard>
    </Screen>
  );
}
