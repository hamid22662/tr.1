import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '@/context/AppContext';
import { useFeedback } from '@/components/feedback';
import type { AppNavigation } from '@/types/navigation';
import { AnimatedCard, Badge, Button, Card, Screen, Title } from '@/components/ui';
import { formatMoney, formatNumber } from '@/services/calculations';
import {
  BrokerFormat,
  CSVSelectionResult,
  ImportResult,
  confirmImport,
  importFromCSV,
} from '@/services/csvImport';

type ImportState = 'idle' | 'preview' | 'result';

const brokerNames: Record<BrokerFormat, string> = {
  mt4: 'MetaTrader 4',
  mt5: 'MetaTrader 5',
  binance: 'Binance',
  unknown: 'Unknown',
};

export default function ImportScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { theme, isRTL, currency, refresh } = useApp();
  const { showToast } = useFeedback();
  const [screenState, setScreenState] = useState<ImportState>('idle');
  const [selection, setSelection] = useState<CSVSelectionResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const rowDirection = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const formatIsKnown = selection?.format !== 'unknown';

  const copy = useMemo(() => ({
    title: isRTL ? 'وارد کردن تریدها' : 'Import trades',
    subtitle: isRTL ? 'تاریخچه معاملات بروکر را از فایل CSV به ژورنال اضافه کن.' : 'Add your broker trade history to the journal from a CSV file.',
    supported: isRTL ? 'فرمت‌های پشتیبانی‌شده' : 'Supported formats',
    choose: isRTL ? 'انتخاب فایل CSV' : 'Choose CSV file',
    detected: isRTL ? 'فرمت تشخیص داده‌شده' : 'Detected format',
    preview: isRTL ? 'پیش‌نمایش ۵ ردیف اول' : 'First 5 rows preview',
    symbol: isRTL ? 'نماد' : 'Symbol',
    direction: isRTL ? 'جهت' : 'Side',
    entry: isRTL ? 'ورود' : 'Entry',
    pnl: 'P&L',
    cancel: isRTL ? 'لغو' : 'Cancel',
    confirm: isRTL ? 'تأیید و Import' : 'Confirm & import',
    importing: isRTL ? 'در حال وارد کردن...' : 'Importing...',
    completed: isRTL ? 'Import انجام شد' : 'Import completed',
    success: isRTL ? 'موفق' : 'Successful',
    failed: isRTL ? 'ناموفق' : 'Failed',
    trades: isRTL ? 'ترید' : 'trades',
    warnings: isRTL ? 'مشاهده اخطارها' : 'View warnings',
    hideWarnings: isRTL ? 'بستن اخطارها' : 'Hide warnings',
    backToTrades: isRTL ? 'بازگشت به تریدها' : 'Back to trades',
    unknown: isRTL ? 'فرمت فایل شناسایی نشد' : 'File format was not recognized',
    unknownHint: isRTL ? 'فایل باید خروجی CSV استاندارد MT4، MT5 یا Binance باشد.' : 'Use a standard MT4, MT5, or Binance CSV export.',
    rows: isRTL ? 'ردیف' : 'rows',
  }), [isRTL]);

  const reset = () => {
    setScreenState('idle');
    setSelection(null);
    setResult(null);
    setShowErrors(false);
  };

  const pickFile = async () => {
    setLoading(true);
    try {
      const picked = await importFromCSV();
      setSelection(picked);
      setResult(null);
      setShowErrors(false);
      setScreenState('preview');
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled') return;
      const isTooLarge = error instanceof Error && ['CSV_TOO_LARGE', 'CSV_TOO_MANY_ROWS'].includes(error.message);
      showToast({
        title: isTooLarge ? (isRTL ? 'فایل بیش از حد بزرگ است' : 'File is too large') : (isRTL ? 'فایل خوانده نشد' : 'Could not read file'),
        message: isTooLarge
          ? (isRTL ? 'حداکثر حجم CSV برابر ۱۰ مگابایت و حداکثر تعداد ردیف ۵۰ هزار است.' : 'CSV files are limited to 10 MB and 50,000 rows.')
          : (isRTL ? 'فایل CSV معتبر انتخاب کن و دوباره تلاش کن.' : 'Choose a valid CSV file and try again.'),
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!selection || selection.format === 'unknown') return;
    setLoading(true);
    try {
      const imported = await confirmImport(selection.csvText, selection.format);
      setResult(imported);
      setScreenState('result');
      refresh();
    } catch {
      showToast({
        title: isRTL ? 'Import ناموفق بود' : 'Import failed',
        message: isRTL ? 'هنگام ذخیره معاملات خطایی رخ داد.' : 'An error occurred while saving trades.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const goToTrades = () => navigation.navigate('Tabs', { screen: 'Trades' });

  const backButton = (
    <Pressable
      onPress={() => navigation.goBack()}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={theme.colors.text} />
    </Pressable>
  );

  return (
    <Screen bottomActionPlacement="screen">
      <Title eyebrow="CSV IMPORT" subtitle={copy.subtitle} right={backButton}>{copy.title}</Title>

      {screenState === 'idle' ? (
        <AnimatedCard index={0} elevated>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 74, height: 74, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: `${theme.colors.primary}55`, marginBottom: 18 }}>
              <Feather name="folder-plus" size={32} color={theme.colors.primaryGlow} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', textAlign }}>{copy.title}</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 20, fontWeight: '700', textAlign, marginTop: 8 }}>{copy.supported}</Text>
          </View>

          <View style={{ gap: 9, marginVertical: 18 }}>
            {['MetaTrader 4', 'MetaTrader 5', 'Binance'].map((name) => (
              <View key={name} style={{ flexDirection: rowDirection, alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.border }}>
                <View style={{ width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.successSoft }}>
                  <Feather name="check" size={16} color={theme.colors.success} />
                </View>
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900', flex: 1, textAlign }}>{name}</Text>
              </View>
            ))}
          </View>

          <Button title={loading ? (isRTL ? 'در حال خواندن فایل...' : 'Reading file...') : copy.choose} icon="upload" onPress={pickFile} disabled={loading} />
          {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 14 }} /> : null}
        </AnimatedCard>
      ) : null}

      {screenState === 'preview' && selection ? (
        <>
          <AnimatedCard index={0} compact>
            <View style={{ flexDirection: rowDirection, justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', textAlign }}>{copy.detected}</Text>
                <Text style={{ color: formatIsKnown ? theme.colors.success : theme.colors.danger, fontSize: 19, fontWeight: '900', textAlign, marginTop: 6 }}>
                  {formatIsKnown ? `✓ ${brokerNames[selection.format]}` : copy.unknown}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.colors.textSubtle, fontSize: 11, fontWeight: '700', textAlign, marginTop: 7 }}>{selection.fileName} · {selection.totalRows} {copy.rows}</Text>
              </View>
              <Badge label={formatIsKnown ? 'CSV OK' : 'UNKNOWN'} tone={formatIsKnown ? 'success' : 'danger'} icon={formatIsKnown ? 'check-circle' : 'alert-circle'} />
            </View>
            {!formatIsKnown ? <Text style={{ color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderRadius: 14, padding: 11, marginTop: 14, fontSize: 11, lineHeight: 18, fontWeight: '800', textAlign }}>{copy.unknownHint}</Text> : null}
          </AnimatedCard>

          <AnimatedCard index={1} compact>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', textAlign, marginBottom: 13 }}>{copy.preview}</Text>
            <View style={{ borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ flexDirection: rowDirection, backgroundColor: theme.colors.backgroundElevated, paddingVertical: 10, paddingHorizontal: 9 }}>
                {[copy.symbol, copy.direction, copy.entry, copy.pnl].map((label) => (
                  <Text key={label} style={{ flex: 1, color: theme.colors.textMuted, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>{label}</Text>
                ))}
              </View>
              {selection.preview.map((row, index) => (
                <View key={`${row.symbol}-${index}`} style={{ flexDirection: rowDirection, paddingVertical: 11, paddingHorizontal: 9, backgroundColor: index % 2 ? theme.colors.surfaceMuted : theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.text, fontSize: 11, fontWeight: '900', textAlign: 'center' }}>{row.symbol}</Text>
                  <Text style={{ flex: 1, color: row.direction === 'BUY' ? theme.colors.success : row.direction === 'SELL' ? theme.colors.danger : theme.colors.textSubtle, fontSize: 11, fontWeight: '900', textAlign: 'center' }}>{row.direction}</Text>
                  <Text style={{ flex: 1, color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{row.entry === null ? '—' : formatNumber(row.entry, row.entry < 10 ? 5 : 2)}</Text>
                  <Text style={{ flex: 1, color: Number(row.pnl) >= 0 ? theme.colors.success : theme.colors.danger, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>{row.pnl === null ? '—' : formatMoney(row.pnl, currency)}</Text>
                </View>
              ))}
            </View>
          </AnimatedCard>

          <View style={{ flexDirection: rowDirection, gap: 10 }}>
            <View style={{ flex: 1 }}><Button title={copy.cancel} variant="secondary" onPress={reset} disabled={loading} /></View>
            <View style={{ flex: 1 }}><Button title={loading ? copy.importing : copy.confirm} icon="check" onPress={runImport} disabled={loading || !formatIsKnown} /></View>
          </View>
          {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
        </>
      ) : null}

      {screenState === 'result' && result ? (
        <>
          <AnimatedCard index={0} elevated>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 76, height: 76, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: result.success > 0 ? theme.colors.successSoft : theme.colors.dangerSoft, borderWidth: 1, borderColor: result.success > 0 ? `${theme.colors.success}55` : `${theme.colors.danger}55` }}>
                <Feather name={result.success > 0 ? 'check-circle' : 'alert-circle'} size={35} color={result.success > 0 ? theme.colors.success : theme.colors.danger} />
              </View>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', textAlign, marginTop: 16 }}>{copy.completed}</Text>
            </View>

            <View style={{ flexDirection: rowDirection, gap: 10, marginTop: 16 }}>
              <View style={{ flex: 1, borderRadius: 18, padding: 15, backgroundColor: theme.colors.successSoft, borderWidth: 1, borderColor: `${theme.colors.success}44` }}>
                <Text style={{ color: theme.colors.success, fontSize: 11, fontWeight: '900', textAlign }}>{copy.success}</Text>
                <Text style={{ color: theme.colors.text, fontSize: 25, fontWeight: '900', textAlign, marginTop: 5 }}>{result.success}</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', textAlign }}>{copy.trades}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 18, padding: 15, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: `${theme.colors.danger}44` }}>
                <Text style={{ color: theme.colors.danger, fontSize: 11, fontWeight: '900', textAlign }}>{copy.failed}</Text>
                <Text style={{ color: theme.colors.text, fontSize: 25, fontWeight: '900', textAlign, marginTop: 5 }}>{result.failed}</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', textAlign }}>{copy.trades}</Text>
              </View>
            </View>
          </AnimatedCard>

          {result.errors.length ? (
            <>
              <Button title={showErrors ? copy.hideWarnings : copy.warnings} icon={showErrors ? 'chevron-up' : 'alert-triangle'} variant="secondary" onPress={() => setShowErrors((value) => !value)} />
              {showErrors ? (
                <Card compact>
                  <View style={{ gap: 9 }}>
                    {result.errors.slice(0, 50).map((error, index) => (
                      <View key={`${error}-${index}`} style={{ flexDirection: rowDirection, alignItems: 'flex-start', gap: 8 }}>
                        <Feather name="alert-circle" size={15} color={theme.colors.warning} style={{ marginTop: 2 }} />
                        <Text style={{ color: theme.colors.textMuted, flex: 1, fontSize: 11, lineHeight: 18, fontWeight: '700', textAlign }}>{error}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}

          <Button title={copy.backToTrades} icon="list" onPress={goToTrades} />
          <Button title={isRTL ? 'Import فایل دیگر' : 'Import another file'} icon="refresh-cw" variant="secondary" onPress={reset} />
        </>
      ) : null}
    </Screen>
  );
}
