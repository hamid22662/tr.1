import React, { useCallback, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { closeTrade, getTrade } from '@/db/repositories';
import { Emotion, Trade } from '@/types';
import type { CloseTradeRoute, RootNavigation } from '@/types/navigation';
import { useApp } from '@/context/AppContext';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, ChipGroup, CollapsibleCard, Field, HeroCard, MiniKpi, MetricHero, Screen, SectionHeading, Title } from '@/components/ui';
import { calculateClosedTrade, calculateSlDistance, formatMoney, formatNumber } from '@/services/calculations';
import { formatRMultiple, getTradeDurationLabel } from '@/services/tradeMetrics';
import { pickAndPersistChartImage } from '@/services/images';

const emotions: Emotion[] = ['greed', 'fear', 'neutral', 'confident', 'rushed'];

export default function CloseTradeScreen() {
  const { params } = useRoute<CloseTradeRoute>();
  const id = Number(params?.id);
  const { t } = useTranslation();
  const { theme, isRTL, currency, refresh } = useApp();
  const { showToast } = useFeedback();
  const navigation = useNavigation<RootNavigation>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [exit, setExit] = useState('');
  const [commission, setCommission] = useState('0');
  const [swap, setSwap] = useState('0');
  const [funding, setFunding] = useState('0');
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [exitNotes, setExitNotes] = useState('');
  const [lesson, setLesson] = useState('');
  const [images, setImages] = useState<string[]>([]);

  useFocusEffect(useCallback(() => { getTrade(id).then((item) => setTrade(item ?? null)); }, [id]));
  const preview = useMemo(() => trade && exit && Number(exit) > 0 ? calculateClosedTrade({
    ...trade,
    exit_price: Number(exit),
    commission: Number(commission),
    swap_fee: Number(swap),
    funding_fee: Number(funding),
  }) : null, [trade, exit, commission, swap, funding]);

  if (!trade) return null;

  const save = async () => {
    const exitValue = Number(exit);
    if (!Number.isFinite(exitValue) || exitValue <= 0) {
      showToast({ title: t('common.checkFields'), message: t('trade.invalidExit'), tone: 'warning' });
      return;
    }
    await closeTrade(trade, {
      exit_price: exitValue,
      close_time: new Date().toISOString(),
      emotion_exit: emotion,
      exit_notes: exitNotes || undefined,
      lesson_learned: lesson || undefined,
      commission: Number(commission) || 0,
      swap_fee: Number(swap) || 0,
      funding_fee: Number(funding) || 0,
      images: images.map((uri) => ({ uri, type: 'exit' as const })),
    });
    refresh();
    showToast({ title: t('common.saved'), message: t('trade.closeSaved'), tone: 'success' });
    navigation.goBack();
  };

  const size = trade.market === 'forex' ? `${trade.lot_size} Lot` : `${trade.quantity ?? '—'} Qty`;
  const distance = exit ? calculateSlDistance(Number(trade.entry_price), Number(exit), trade.pip_size) : 0;
  const previewTone = preview ? preview.netPnl >= 0 ? 'success' : 'danger' : 'primary';
  const estimatedR = preview && trade.risk_amount ? preview.netPnl / Math.abs(Number(trade.risk_amount)) : null;
  const duration = getTradeDurationLabel({ open_time: trade.open_time, close_time: new Date().toISOString() } as Trade, isRTL);
  const rowDirection = isRTL ? 'row-reverse' as const : 'row' as const;
  const quickExit = (value?: number | null) => { if (value && Number(value) > 0) setExit(String(value)); };
  const addExitImage = async () => {
    try {
      const uri = await pickAndPersistChartImage();
      if (uri) setImages((old) => [...old, uri]);
    } catch {
      showToast({ title: isRTL ? 'تصویر خیلی بزرگ است' : 'Image is too large', message: isRTL ? 'حداکثر حجم مجاز هر تصویر ۸ مگابایت است.' : 'Each image must be 8 MB or smaller.', tone: 'warning' });
    }
  };

  return <Screen bottomActionPlacement="screen" bottomAction={<Button title={t('trade.saveClose')} icon="check" onPress={save} />}>
    <Title eyebrow="Exit Desk" subtitle={isRTL ? 'خروج را دقیق ثبت کن؛ درس معامله را همان لحظه بنویس.' : 'Log the exit cleanly and capture the lesson while it is fresh.'}>{t('trade.closeTrade')}</Title>

    <HeroCard
      eyebrow={trade.market === 'forex' ? t('common.forex') : t('common.crypto')}
      title={trade.symbol}
      value={preview ? formatMoney(preview.netPnl, currency) : trade.direction}
      caption={`${t('trade.entry')}: ${trade.entry_price} · ${size}`}
      tone={previewTone}
      footer={(
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 9 }}>
          <MiniKpi label={t('trade.pips')} value={exit ? formatNumber(distance, 1) : '—'} tone="info" />
          <MiniKpi label={t('trade.grossPnl')} value={preview ? formatMoney(preview.grossPnl, currency) : '—'} tone={previewTone} />
          <MiniKpi label="R" value={formatRMultiple(estimatedR)} tone={previewTone} />
        </View>
      )}
    />

    <Card>
      <SectionHeading title={isRTL ? '۱. خروج' : '1. Exit'} icon="log-out" />
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge label={trade.direction} tone={trade.direction === 'BUY' ? 'success' : 'danger'} />
        <Badge label={t('common.open')} tone="info" />
        <Badge label={size} tone="primary" />
      </View>
      <Field label={t('trade.exit')} value={exit} onChangeText={setExit} keyboardType="decimal-pad" icon="log-out" />
      <View style={{ flexDirection: rowDirection, gap: 9, marginTop: 4 }}>
        <View style={{ flex: 1 }}><Button title={isRTL ? 'بستن با TP' : 'Close at TP'} variant="secondary" icon="target" onPress={() => quickExit(trade.take_profit)} disabled={!trade.take_profit} /></View>
        <View style={{ flex: 1 }}><Button title={isRTL ? 'بستن با SL' : 'Close at SL'} variant="secondary" icon="shield-off" onPress={() => quickExit(trade.stop_loss)} disabled={!trade.stop_loss} /></View>
      </View>
    </Card>

    <CollapsibleCard
      title={isRTL ? '⚙ هزینه‌های پیشرفته' : 'Advanced Fees'}
      subtitle={isRTL ? 'کمیسیون، سواپ و فاندینگ را فقط وقتی لازم داری باز کن.' : 'Open only when you need commission, swap or funding.'}
      icon="settings"
    >
      <Field label={t('trade.commission')} value={commission} onChangeText={setCommission} keyboardType="decimal-pad" suffix={currency} icon="credit-card" />
      <Field label={t('trade.swap')} value={swap} onChangeText={setSwap} keyboardType="decimal-pad" suffix={currency} icon="repeat" />
      <Field label={t('trade.funding')} value={funding} onChangeText={setFunding} keyboardType="decimal-pad" suffix={currency} icon="trending-up" />
    </CollapsibleCard>

    {preview ? <Card style={{ borderColor: preview.netPnl >= 0 ? theme.colors.success : theme.colors.danger, borderWidth: 1.5 }}>
      <SectionHeading title={isRTL ? 'پیش‌نمایش خروج' : 'Preview close'} icon="activity" />
      <MetricHero label={t('trade.netPnl')} value={formatMoney(preview.netPnl, currency)} caption={`${formatRMultiple(estimatedR)} · ${t('trade.pips')}: ${formatNumber(preview.pips, 1)} · ${duration}`} tone={preview.netPnl >= 0 ? 'success' : 'danger'} />
      <View style={{ flexDirection: rowDirection, gap: 9, marginTop: 12 }}>
        <MiniKpi label={t('trade.grossPnl')} value={formatMoney(preview.grossPnl, currency)} tone={previewTone} />
        <MiniKpi label={isRTL ? 'مدت' : 'Duration'} value={duration} tone="info" />
        <MiniKpi label="R" value={formatRMultiple(estimatedR)} tone={previewTone} />
      </View>
      {trade.market === 'forex' ? <Text style={{ color: theme.colors.textSubtle, marginTop: 12, textAlign: isRTL ? 'right' : 'left', fontSize: 11, fontWeight: '800' }}>{t('trade.pipValueAtEntry')}: {currency} {formatNumber(preview.pipValue, 4)} / 1 Lot</Text> : null}
    </Card> : null}

    <Card>
      <SectionHeading title={isRTL ? '۲. مرور ذهنی' : '2. Review'} icon="message-circle" />
      <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', marginBottom: 8, textAlign: isRTL ? 'right' : 'left' }}>{t('trade.emotionExit')}</Text>
      <ChipGroup value={emotion} onChange={(value) => setEmotion(value as Emotion)} options={emotions.map((item) => ({ value: item, label: t(`emotions.${item}`) }))} />
      <View style={{ height: 14 }} />
      <Field label={t('trade.exitNotes')} value={exitNotes} onChangeText={setExitNotes} multiline />
      <Field label={t('trade.lesson')} value={lesson} onChangeText={setLesson} multiline />
      <Button title={t('trade.addImage')} icon="image" variant="secondary" onPress={addExitImage} />
      {images.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>{images.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 78, height: 78, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border }} />)}</View> : null}
    </Card>
  </Screen>;
}
