import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import { getDb } from '@/db/database';
import { calculateForexPipValuePerLot, calculateRr } from '@/services/calculations';
import { Direction, Market } from '@/types';
import { BrokerFormat, detectFormat } from '@/services/brokerFormat';
import { MAX_CSV_BYTES, MAX_CSV_ROWS, exceedsApproximateBytes } from '@/constants/limits';

export type { BrokerFormat } from '@/services/brokerFormat';

type BrokerRow = Record<string, string>;

type MappedTrade = {
  market: Market;
  symbol: string;
  direction: Direction;
  entry_price: number;
  exit_price: number;
  stop_loss?: number;
  take_profit?: number;
  lot_size?: number;
  quantity?: number;
  pnl_net: number;
  open_time: string;
  close_time: string;
};

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export interface CSVPreviewRow {
  symbol: string;
  direction: Direction | '—';
  entry: number | null;
  pnl: number | null;
}

export interface CSVSelectionResult extends ImportResult {
  preview: CSVPreviewRow[];
  format: BrokerFormat;
  csvText: string;
  fileName: string;
  totalRows: number;
}

const normalizeHeader = (header: string) => String(header ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const getValue = (row: BrokerRow, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return '';
};

const parseNumber = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const negativeByParentheses = raw.startsWith('(') && raw.endsWith(')');
  const normalized = raw
    .replace(/[−–—]/g, '-')
    .replace(/[()]/g, '')
    .replace(/[^0-9+\-.,]/g, '')
    .replace(/,/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
};

const parseBrokerDate = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // Excel serial dates occasionally appear in exported CSV files.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20_000 && serial < 100_000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const date = new Date(excelEpoch + serial * 86_400_000);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  let candidate = raw;
  const ymd = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (ymd) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = ymd;
    candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`;
  } else {
    const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmy) {
      const [, day, month, year, hour = '0', minute = '0', second = '0'] = dmy;
      candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`;
    }
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function parseCSV(csvText: string) {
  return Papa.parse<BrokerRow>(csvText.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  });
}

function mapMT4Row(row: BrokerRow): MappedTrade | null {
  try {
    const type = getValue(row, 'type').toLowerCase();
    if (!type.includes('buy') && !type.includes('sell')) return null;

    const direction: Direction = type.includes('buy') ? 'BUY' : 'SELL';
    const symbol = getValue(row, 'item', 'symbol').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const entry = parseNumber(getValue(row, 'open price', 'price'));
    const exit = parseNumber(getValue(row, 'close price', 'price (close)'));
    const lots = parseNumber(getValue(row, 'size', 'lots', 'volume'));
    const pnl = parseNumber(getValue(row, 'profit', 'p/l', 'pnl'));
    const openTime = parseBrokerDate(getValue(row, 'open time', 'time'));
    const closeTime = parseBrokerDate(getValue(row, 'close time', 'time (close)'));
    const sl = parseNumber(getValue(row, 's / l', 's/l', 'sl', 'stop loss'));
    const tp = parseNumber(getValue(row, 't / p', 't/p', 'tp', 'take profit'));

    if (!symbol || entry <= 0 || exit <= 0 || !openTime) return null;

    return {
      market: 'forex',
      symbol,
      direction,
      entry_price: entry,
      exit_price: exit,
      stop_loss: sl > 0 ? sl : undefined,
      take_profit: tp > 0 ? tp : undefined,
      lot_size: lots > 0 ? lots : undefined,
      pnl_net: pnl,
      open_time: openTime,
      close_time: closeTime ?? openTime,
    };
  } catch {
    return null;
  }
}

function mapMT5Row(row: BrokerRow): MappedTrade | null {
  try {
    const action = getValue(row, 'action', 'type').toLowerCase();
    if (!action.includes('buy') && !action.includes('sell')) return null;

    const symbol = getValue(row, 'symbol').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const entry = parseNumber(getValue(row, 'price', 'open price', 'price (open)'));
    const exit = parseNumber(getValue(row, 'price (close)', 'close price'));
    const openTime = parseBrokerDate(getValue(row, 'time', 'open time', 'time (open)'));
    const closeTime = parseBrokerDate(getValue(row, 'time (close)', 'close time'));
    const pnl = parseNumber(getValue(row, 'profit', 'p/l', 'pnl'));
    const volume = parseNumber(getValue(row, 'volume', 'size', 'lots'));
    const sl = parseNumber(getValue(row, 's / l', 's/l', 'sl', 'stop loss'));
    const tp = parseNumber(getValue(row, 't / p', 't/p', 'tp', 'take profit'));

    if (!symbol || entry <= 0 || exit <= 0 || !openTime) return null;

    return {
      market: 'forex',
      symbol,
      direction: action.includes('buy') ? 'BUY' : 'SELL',
      entry_price: entry,
      exit_price: exit,
      stop_loss: sl > 0 ? sl : undefined,
      take_profit: tp > 0 ? tp : undefined,
      lot_size: volume > 0 ? volume : undefined,
      pnl_net: pnl,
      open_time: openTime,
      close_time: closeTime ?? openTime,
    };
  } catch {
    return null;
  }
}

function mapBinanceRow(row: BrokerRow): MappedTrade | null {
  try {
    const side = getValue(row, 'side').toLowerCase();
    if (side !== 'buy' && side !== 'sell') return null;

    const rawSymbol = getValue(row, 'pair', 'symbol').toUpperCase();
    const symbol = rawSymbol.replace(/[^A-Z0-9]/g, '');
    const entry = parseNumber(getValue(row, 'entry price', 'avg. cost', 'average entry price'));
    const exit = parseNumber(getValue(row, 'exit price', 'avg. closing price', 'average close price'));
    const quantity = parseNumber(getValue(row, 'qty', 'quantity', 'amount', 'executed'));
    const pnl = parseNumber(getValue(row, 'realized profit', 'realized pnl', 'pnl'));
    const openTime = parseBrokerDate(getValue(row, 'open time', 'date', 'time'));
    const closeTime = parseBrokerDate(getValue(row, 'close time', 'date', 'time'));

    if (!symbol || entry <= 0 || exit <= 0 || !openTime) return null;

    return {
      market: 'crypto',
      symbol,
      direction: side === 'buy' ? 'BUY' : 'SELL',
      entry_price: entry,
      exit_price: exit,
      quantity: quantity > 0 ? quantity : undefined,
      pnl_net: pnl,
      open_time: openTime,
      close_time: closeTime ?? openTime,
    };
  } catch {
    return null;
  }
}

function mapRow(row: BrokerRow, format: BrokerFormat): MappedTrade | null {
  if (format === 'mt4') return mapMT4Row(row);
  if (format === 'mt5') return mapMT5Row(row);
  if (format === 'binance') return mapBinanceRow(row);
  return null;
}

function rowToPreview(row: BrokerRow, format: BrokerFormat): CSVPreviewRow {
  const mapped = mapRow(row, format);
  if (mapped) {
    return {
      symbol: mapped.symbol,
      direction: mapped.direction,
      entry: mapped.entry_price,
      pnl: mapped.pnl_net,
    };
  }

  return {
    symbol: getValue(row, 'item', 'symbol', 'pair') || '—',
    direction: '—',
    entry: null,
    pnl: null,
  };
}

function inferForexMetadata(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized.includes('XAU')) return { pipSize: 0.01, contractSize: 100, quoteCurrency: 'USD' };
  if (normalized.includes('XAG')) return { pipSize: 0.001, contractSize: 5_000, quoteCurrency: 'USD' };
  if (normalized.endsWith('JPY')) return { pipSize: 0.01, contractSize: 100_000, quoteCurrency: 'JPY' };
  const quoteCurrency = normalized.length >= 6 ? normalized.slice(-3) : 'USD';
  return { pipSize: 0.0001, contractSize: 100_000, quoteCurrency };
}

async function insertImportedTrade(trade: MappedTrade) {
  const db = await getDb();
  const currencySetting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'default_currency'",
  );
  const accountCurrency = String(currencySetting?.value || 'USD').trim().toUpperCase();
  const duplicate = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM trades WHERE symbol = ? AND direction = ? AND open_time = ?
      AND COALESCE(close_time, '') = COALESCE(?, '') AND entry_price = ? AND COALESCE(exit_price, 0) = ? LIMIT 1`,
    trade.symbol, trade.direction, trade.open_time, trade.close_time, trade.entry_price, trade.exit_price,
  );
  if (duplicate) return false;
  const priceMove = trade.direction === 'BUY'
    ? trade.exit_price - trade.entry_price
    : trade.entry_price - trade.exit_price;

  let pipSize = 1;
  let contractSize = 1;
  let pipValueAtEntry: number | null = null;
  let pnlPips = priceMove;
  let pnlGross = 0;
  let commission = 0;

  if (trade.market === 'forex') {
    const metadata = inferForexMetadata(trade.symbol);
    pipSize = metadata.pipSize;
    contractSize = metadata.contractSize;
    pnlPips = pipSize > 0 ? priceMove / pipSize : 0;
    const lotSize = Number(trade.lot_size ?? 0);
    const denominator = pnlPips * lotSize;
    const exactPipValue = denominator !== 0 ? trade.pnl_net / denominator : 0;

    if (exactPipValue > 0 && Number.isFinite(exactPipValue)) {
      pipValueAtEntry = exactPipValue;
      pnlGross = trade.pnl_net;
    } else {
      const fallbackPipValue = calculateForexPipValuePerLot({
        pipSize,
        contractSize,
        entryPrice: trade.entry_price,
        quoteCurrency: metadata.quoteCurrency,
        symbol: trade.symbol,
        accountCurrency,
      });
      pipValueAtEntry = fallbackPipValue > 0 ? fallbackPipValue : null;
      pnlGross = denominator * fallbackPipValue;
      // Keep the broker's reported net P&L stable when the database repairs closed trades.
      commission = pnlGross - trade.pnl_net;
    }
  } else {
    pnlGross = priceMove * Number(trade.quantity ?? 0);
    commission = pnlGross - trade.pnl_net;
  }

  const rr = calculateRr(trade.direction, trade.entry_price, trade.stop_loss, trade.take_profit);

  await db.runAsync(
    `INSERT INTO trades (
      market, symbol, direction, status, entry_price, exit_price, stop_loss, take_profit, lot_size, quantity,
      risk_percent, account_balance, account_currency, risk_amount, pip_size, contract_size, pip_value_at_entry,
      commission, swap_fee, funding_fee, pnl_gross, pnl_net, pnl_pips, rr_ratio,
      open_time, close_time, emotion_entry, checklist
    ) VALUES (?, ?, ?, 'CLOSED', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 'neutral', '{}')`,
    trade.market,
    trade.symbol,
    trade.direction,
    trade.entry_price,
    trade.exit_price,
    trade.stop_loss ?? null,
    trade.take_profit ?? null,
    trade.lot_size ?? null,
    trade.quantity ?? null,
    accountCurrency,
    pipSize,
    contractSize,
    pipValueAtEntry,
    commission,
    pnlGross,
    trade.pnl_net,
    pnlPips,
    rr,
    trade.open_time,
    trade.close_time,
  );
  return true;
}

// Pick and parse a CSV file. No trade is stored until confirmImport is called.
export async function importFromCSV(): Promise<CSVSelectionResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) throw new Error('cancelled');
  const file = result.assets[0];
  if (!file) throw new Error('empty');
  if (file.size && file.size > MAX_CSV_BYTES) throw new Error('CSV_TOO_LARGE');

  const response = await fetch(file.uri);
  if (!response.ok) throw new Error('read_failed');
  const csvText = await response.text();
  if (exceedsApproximateBytes(csvText, MAX_CSV_BYTES)) throw new Error('CSV_TOO_LARGE');
  const parsed = parseCSV(csvText);

  if (!parsed.data.length) throw new Error('empty');
  if (parsed.data.length > MAX_CSV_ROWS) throw new Error('CSV_TOO_MANY_ROWS');
  const format = detectFormat(parsed.meta.fields ?? []);
  const preview = parsed.data.slice(0, 5).map((row) => rowToPreview(row, format));

  return {
    success: 0,
    failed: 0,
    errors: [],
    preview,
    format,
    csvText,
    fileName: file.name || 'trades.csv',
    totalRows: parsed.data.length,
  };
}

// Validate, map and store every row after the user confirms the preview.
export async function confirmImport(csvText: string, format: BrokerFormat): Promise<ImportResult> {
  if (exceedsApproximateBytes(csvText, MAX_CSV_BYTES)) throw new Error('CSV_TOO_LARGE');
  if (format === 'unknown') {
    return { success: 0, failed: 0, errors: ['فرمت فایل پشتیبانی نمی‌شود.'] };
  }

  const parsed = parseCSV(csvText);
  if (parsed.data.length > MAX_CSV_ROWS) throw new Error('CSV_TOO_MANY_ROWS');
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [index, row] of parsed.data.entries()) {
    try {
      const mapped = mapRow(row, format);
      if (!mapped || !mapped.symbol || mapped.entry_price <= 0 || mapped.exit_price <= 0) {
        failed += 1;
        errors.push(`ردیف ${index + 2}: داده ناقص یا نوع معامله نامعتبر`);
        continue;
      }

      const inserted = await insertImportedTrade(mapped);
      if (inserted) success += 1;
      else {
        failed += 1;
        errors.push(`ردیف ${index + 2}: این معامله قبلاً وارد شده است`);
      }
    } catch {
      failed += 1;
      errors.push(`ردیف ${index + 2}: خطا در ذخیره`);
    }
  }

  return { success, failed, errors };
}
