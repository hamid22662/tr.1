import { getDb } from './database';
import {
  ChecklistItem,
  CloseTradeInput,
  NewSymbolInput,
  NewTradeInput,
  StrategyRow,
  Summary,
  SymbolRow,
  Trade,
  TradeImage,
} from '@/types';
import { calculateClosedTrade, calculateRr } from '@/services/calculations';
import * as FileSystem from 'expo-file-system/legacy';
import { BackupRecord, validateBackupData } from '@/services/backupValidation';

async function removeLocalFiles(uris: Array<string | null | undefined>) {
  await Promise.all(uris.filter((uri): uri is string => Boolean(uri)).map(async (uri) => {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* already removed */ }
  }));
}

export async function getSettings() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getTradeCount() {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM trades');
  return Number(row?.count ?? 0);
}

export async function getTradesByDayOfWeek(): Promise<
  { dow: string; pnl: number; trades: number }[]
> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ dow: string; pnl: number; trades: number }>(
    `SELECT strftime('%w', close_time, 'localtime') as dow,
            SUM(pnl_net) as pnl,
            COUNT(*) as trades
     FROM trades
     WHERE status = 'CLOSED'
     GROUP BY dow
     ORDER BY dow`,
  );

  return rows.map((row) => ({
    dow: String(row.dow),
    pnl: Number(row.pnl ?? 0),
    trades: Number(row.trades ?? 0),
  }));
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/** Active symbols only: this is the list that powers the New Trade dropdown. */
export async function getSymbols(market?: string) {
  const db = await getDb();
  const sql = market
    ? 'SELECT * FROM symbols WHERE active = 1 AND market = ? ORDER BY symbol'
    : 'SELECT * FROM symbols WHERE active = 1 ORDER BY market, symbol';
  return db.getAllAsync<SymbolRow>(sql, ...(market ? [market] : []));
}

/** Includes inactive assets so Settings can manage every default and custom symbol. */
export async function getManagedSymbols() {
  const db = await getDb();
  return db.getAllAsync<SymbolRow>('SELECT * FROM symbols ORDER BY market, symbol');
}

export async function setSymbolActive(id: number, active: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE symbols SET active = ? WHERE id = ?', active ? 1 : 0, id);
}

export async function createSymbol(input: NewSymbolInput) {
  const symbol = input.symbol.trim().toUpperCase().replace(/\s+/g, '');
  const quoteCurrency = input.quote_currency.trim().toUpperCase();
  const pipSize = Number(input.pip_size);
  const contractSize = Number(input.contract_size);

  if (!symbol || !quoteCurrency || !Number.isFinite(pipSize) || pipSize <= 0 || !Number.isFinite(contractSize) || contractSize <= 0) {
    throw new Error('INVALID_SYMBOL');
  }

  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM symbols WHERE symbol = ?', symbol);
  if (existing) throw new Error('SYMBOL_EXISTS');

  const result = await db.runAsync(
    `INSERT INTO symbols (market, symbol, active, is_custom, pip_size, contract_size, quote_currency)
     VALUES (?, ?, 1, 1, ?, ?, ?)`,
    input.market,
    symbol,
    pipSize,
    contractSize,
    quoteCurrency,
  );
  return Number(result.lastInsertRowId);
}

/** Only user-added assets can be deleted. Default assets remain available for reactivation. */
export async function deleteCustomSymbol(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM symbols WHERE id = ? AND is_custom = 1', id);
}

export async function getStrategies() {
  const db = await getDb();
  return db.getAllAsync<StrategyRow>('SELECT * FROM strategies ORDER BY name');
}

/** Adds a strategy that becomes immediately selectable in the New Trade screen. */
export async function createStrategy(name: string, description?: string) {
  const value = name.trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('Strategy name is required.');
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO strategies (name, description) VALUES (?, ?)',
    value,
    description?.trim() || null,
  );
  return Number(result.lastInsertRowId);
}

/** Removing a strategy does not change the strategy text already saved on historical trades. */
export async function deleteStrategy(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM strategies WHERE id = ?', id);
}

export async function getChecklist() {
  const db = await getDb();
  return db.getAllAsync<ChecklistItem>('SELECT * FROM checklist_items WHERE active = 1 ORDER BY position ASC');
}

export async function createTrade(input: NewTradeInput) {
  const db = await getDb();
  const accountCurrency = input.account_currency.trim().toUpperCase();
  if (!/^[A-Z]{3,6}$/.test(accountCurrency)) throw new Error('INVALID_ACCOUNT_CURRENCY');
  const rr = calculateRr(input.direction, input.entry_price, input.stop_loss, input.take_profit);
  let tradeId: number | null = null;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO trades (
        market, symbol, direction, status, entry_price, stop_loss, take_profit, lot_size, quantity,
        risk_percent, account_balance, account_currency, risk_amount, pip_size, contract_size, pip_value_at_entry,
        rr_ratio, open_time, strategy, emotion_entry, setup_notes, checklist
      ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.market,
      input.symbol,
      input.direction,
      input.entry_price,
      input.stop_loss ?? null,
      input.take_profit ?? null,
      input.lot_size ?? null,
      input.quantity ?? null,
      input.risk_percent,
      input.account_balance,
      accountCurrency,
      input.risk_amount,
      input.pip_size,
      input.contract_size,
      input.pip_value_at_entry ?? null,
      rr,
      input.open_time,
      input.strategy ?? null,
      input.emotion_entry ?? null,
      input.setup_notes ?? null,
      JSON.stringify(input.checklist),
    );
    tradeId = Number(result.lastInsertRowId);

    for (const image of input.images) {
      await db.runAsync(
        'INSERT INTO trade_images (trade_id, image_type, image_uri) VALUES (?, ?, ?)',
        tradeId,
        image.type,
        image.uri,
      );
    }
  });

  if (tradeId === null) throw new Error('TRADE_CREATE_FAILED');
  return tradeId;
}

export async function getTrade(id: number) {
  const db = await getDb();
  return db.getFirstAsync<Trade>('SELECT * FROM trades WHERE id = ?', id);
}

export async function getTradeImages(tradeId: number) {
  const db = await getDb();
  return db.getAllAsync<TradeImage>('SELECT * FROM trade_images WHERE trade_id = ? ORDER BY id', tradeId);
}

export async function closeTrade(trade: Trade, input: CloseTradeInput) {
  const db = await getDb();
  const calc = calculateClosedTrade({ ...trade, ...input });
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE trades SET status = 'CLOSED', exit_price = ?, close_time = ?, emotion_exit = ?, exit_notes = ?, lesson_learned = ?,
        commission = ?, swap_fee = ?, funding_fee = ?, pnl_gross = ?, pnl_net = ?, pnl_pips = ?
       WHERE id = ? AND status = 'OPEN'`,
      input.exit_price,
      input.close_time,
      input.emotion_exit ?? null,
      input.exit_notes ?? null,
      input.lesson_learned ?? null,
      input.commission ?? 0,
      input.swap_fee ?? 0,
      input.funding_fee ?? 0,
      calc.grossPnl,
      calc.netPnl,
      calc.pips,
      trade.id,
    );

    if (result.changes !== 1) throw new Error('TRADE_NOT_OPEN');

    for (const image of input.images ?? []) {
      await db.runAsync(
        'INSERT INTO trade_images (trade_id, image_type, image_uri) VALUES (?, ?, ?)',
        trade.id,
        image.type,
        image.uri,
      );
    }
  });
}


export type UpdateTradeInput = Partial<Pick<Trade,
  | 'market'
  | 'symbol'
  | 'direction'
  | 'entry_price'
  | 'exit_price'
  | 'stop_loss'
  | 'take_profit'
  | 'lot_size'
  | 'quantity'
  | 'risk_percent'
  | 'account_balance'
  | 'account_currency'
  | 'risk_amount'
  | 'pip_size'
  | 'contract_size'
  | 'pip_value_at_entry'
  | 'open_time'
  | 'close_time'
  | 'strategy'
  | 'emotion_entry'
  | 'emotion_exit'
  | 'setup_notes'
  | 'exit_notes'
  | 'lesson_learned'
  | 'checklist'
  | 'commission'
  | 'swap_fee'
  | 'funding_fee'
>>;

export async function updateTrade(id: number, input: UpdateTradeInput) {
  const db = await getDb();
  const current = await getTrade(id);
  if (!current) throw new Error('TRADE_NOT_FOUND');
  const merged: Trade = { ...current, ...input, id };
  const rr = calculateRr(merged.direction, Number(merged.entry_price), merged.stop_loss ?? null, merged.take_profit ?? null);
  let grossPnl: number | null = merged.pnl_gross ?? null;
  let netPnl: number | null = merged.pnl_net ?? null;
  let pnlPips: number | null = merged.pnl_pips ?? null;
  if (merged.status === 'CLOSED' && merged.exit_price !== null && merged.exit_price !== undefined) {
    const calc = calculateClosedTrade({ ...merged, exit_price: Number(merged.exit_price) });
    grossPnl = calc.grossPnl;
    netPnl = calc.netPnl;
    pnlPips = calc.pips;
  }
  await db.runAsync(
    `UPDATE trades SET
      market = ?, symbol = ?, direction = ?, entry_price = ?, exit_price = ?, stop_loss = ?, take_profit = ?, lot_size = ?, quantity = ?,
      risk_percent = ?, account_balance = ?, account_currency = ?, risk_amount = ?, pip_size = ?, contract_size = ?, pip_value_at_entry = ?,
      rr_ratio = ?, open_time = ?, close_time = ?, strategy = ?, emotion_entry = ?, emotion_exit = ?, setup_notes = ?, exit_notes = ?, lesson_learned = ?,
      checklist = ?, commission = ?, swap_fee = ?, funding_fee = ?, pnl_gross = ?, pnl_net = ?, pnl_pips = ? WHERE id = ?`,
    merged.market,
    merged.symbol,
    merged.direction,
    Number(merged.entry_price),
    merged.exit_price ?? null,
    merged.stop_loss ?? null,
    merged.take_profit ?? null,
    merged.lot_size ?? null,
    merged.quantity ?? null,
    merged.risk_percent ?? null,
    merged.account_balance ?? null,
    merged.account_currency,
    merged.risk_amount ?? null,
    Number(merged.pip_size),
    Number(merged.contract_size),
    merged.pip_value_at_entry ?? null,
    rr,
    merged.open_time,
    merged.close_time ?? null,
    merged.strategy ?? null,
    merged.emotion_entry ?? null,
    merged.emotion_exit ?? null,
    merged.setup_notes ?? null,
    merged.exit_notes ?? null,
    merged.lesson_learned ?? null,
    merged.checklist || '{}',
    Number(merged.commission ?? 0),
    Number(merged.swap_fee ?? 0),
    Number(merged.funding_fee ?? 0),
    grossPnl,
    netPnl,
    pnlPips,
    id,
  );
}

export async function addTradeImage(tradeId: number, imageUri: string, imageType: 'entry' | 'exit' | 'analysis' = 'analysis') {
  const db = await getDb();
  const result = await db.runAsync('INSERT INTO trade_images (trade_id, image_type, image_uri) VALUES (?, ?, ?)', tradeId, imageType, imageUri);
  return Number(result.lastInsertRowId);
}

export async function deleteTradeImage(id: number) {
  const db = await getDb();
  const image = await db.getFirstAsync<{ image_uri: string }>('SELECT image_uri FROM trade_images WHERE id = ?', id);
  await db.runAsync('DELETE FROM trade_images WHERE id = ?', id);
  await removeLocalFiles([image?.image_uri]);
}

export async function deleteTrade(id: number) {
  const db = await getDb();
  const images = await db.getAllAsync<{ image_uri: string }>('SELECT image_uri FROM trade_images WHERE trade_id = ?', id);
  await db.runAsync('DELETE FROM trades WHERE id = ?', id);
  await removeLocalFiles(images.map((image) => image.image_uri));
}

export async function listTrades(params: {
  status?: 'OPEN' | 'CLOSED';
  query?: string;
  limit?: number;
  since?: string;
  dateRange?: 'week' | 'month' | 'all';
  market?: 'forex' | 'crypto' | 'all';
  direction?: 'BUY' | 'SELL' | 'all';
  result?: 'win' | 'loss' | 'all';
  strategy?: string;
  sort?: 'newest' | 'oldest' | 'pnl_desc' | 'pnl_asc' | 'rr_desc';
} = {}) {
  const db = await getDb();
  const conditions: string[] = [];
  const args: (string | number)[] = [];
  if (params.status) { conditions.push('status = ?'); args.push(params.status); }
  if (params.query?.trim()) {
    const query = `%${params.query.trim()}%`;
    conditions.push("(symbol LIKE ? OR COALESCE(strategy, '') LIKE ?)");
    args.push(query, query);
  }
  if (params.since) { conditions.push('open_time >= ?'); args.push(params.since); }
  const effectiveDate = "COALESCE(close_time, open_time)";
  if (params.dateRange === 'week') conditions.push(
    `date(${effectiveDate}, 'localtime') >= date('now', 'localtime', '-' || ((CAST(strftime('%w', 'now', 'localtime') AS INTEGER) + 6) % 7) || ' days')`,
  );
  if (params.dateRange === 'month') conditions.push(
    `strftime('%Y-%m', ${effectiveDate}, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`,
  );
  if (params.market && params.market !== 'all') { conditions.push('market = ?'); args.push(params.market); }
  if (params.direction && params.direction !== 'all') { conditions.push('direction = ?'); args.push(params.direction); }
  if (params.result === 'win') conditions.push("status = 'CLOSED' AND COALESCE(pnl_net, 0) > 0");
  if (params.result === 'loss') conditions.push("status = 'CLOSED' AND COALESCE(pnl_net, 0) < 0");
  if (params.strategy?.trim()) { conditions.push("COALESCE(strategy, '') LIKE ?"); args.push(`%${params.strategy.trim()}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit ? `LIMIT ${Number(params.limit)}` : '';
  const orderBy = params.sort === 'oldest'
    ? "ORDER BY status = 'OPEN' DESC, open_time ASC"
    : params.sort === 'pnl_desc'
      ? "ORDER BY status = 'OPEN' DESC, COALESCE(pnl_net, 0) DESC, open_time DESC"
      : params.sort === 'pnl_asc'
        ? "ORDER BY status = 'OPEN' DESC, COALESCE(pnl_net, 0) ASC, open_time DESC"
        : params.sort === 'rr_desc'
          ? "ORDER BY status = 'OPEN' DESC, COALESCE(rr_ratio, 0) DESC, open_time DESC"
          : "ORDER BY status = 'OPEN' DESC, open_time DESC";
  return db.getAllAsync<Trade>(`SELECT * FROM trades ${where} ${orderBy} ${limit}`, ...args);
}

export async function getDashboardSummary(): Promise<Summary> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ pnl: number; trades: number; wins: number; openTrades: number }>(
    `SELECT
      COALESCE(SUM(CASE WHEN status = 'CLOSED' AND strftime('%Y-%m', close_time, 'localtime') = strftime('%Y-%m', 'now', 'localtime') THEN pnl_net ELSE 0 END), 0) AS pnl,
      SUM(CASE WHEN status = 'CLOSED' AND strftime('%Y-%m', close_time, 'localtime') = strftime('%Y-%m', 'now', 'localtime') THEN 1 ELSE 0 END) AS trades,
      SUM(CASE WHEN status = 'CLOSED' AND strftime('%Y-%m', close_time, 'localtime') = strftime('%Y-%m', 'now', 'localtime') AND pnl_net > 0 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS openTrades
     FROM trades`,
  );
  const trades = Number(row?.trades ?? 0);
  return {
    pnl: Number(row?.pnl ?? 0),
    trades,
    winRate: trades ? Math.round((Number(row?.wins ?? 0) / trades) * 100) : 0,
    openTrades: Number(row?.openTrades ?? 0),
  };
}

export async function getAnalytics() {
  const db = await getDb();
  const totals = await db.getFirstAsync<{
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
    avgRr: number;
    best: number;
    worst: number;
    grossProfit: number;
    grossLoss: number;
    avgWin: number;
    avgLoss: number;
  }>(
    `SELECT COALESCE(SUM(pnl_net), 0) pnl, COUNT(*) trades,
      SUM(CASE WHEN pnl_net > 0 THEN 1 ELSE 0 END) wins,
      SUM(CASE WHEN pnl_net < 0 THEN 1 ELSE 0 END) losses,
      COALESCE(AVG(rr_ratio), 0) avgRr, COALESCE(MAX(pnl_net), 0) best, COALESCE(MIN(pnl_net), 0) worst,
      COALESCE(SUM(CASE WHEN pnl_net > 0 THEN pnl_net ELSE 0 END), 0) grossProfit,
      ABS(COALESCE(SUM(CASE WHEN pnl_net < 0 THEN pnl_net ELSE 0 END), 0)) grossLoss,
      COALESCE(AVG(CASE WHEN pnl_net > 0 THEN pnl_net END), 0) avgWin,
      COALESCE(AVG(CASE WHEN pnl_net < 0 THEN pnl_net END), 0) avgLoss
      FROM trades WHERE status = 'CLOSED'`,
  );
  const byEmotion = await db.getAllAsync<{ emotion: string; trades: number; wins: number; avgPnl: number; pnl: number }>(
    `SELECT COALESCE(emotion_entry, 'neutral') emotion, COUNT(*) trades,
      SUM(CASE WHEN pnl_net > 0 THEN 1 ELSE 0 END) wins, COALESCE(AVG(pnl_net), 0) avgPnl, COALESCE(SUM(pnl_net), 0) pnl
      FROM trades WHERE status = 'CLOSED' GROUP BY emotion ORDER BY avgPnl DESC`,
  );
  const byStrategy = await db.getAllAsync<{ strategy: string; pnl: number; trades: number; wins: number; avgRr: number }>(
    `SELECT COALESCE(strategy, '—') strategy, COALESCE(SUM(pnl_net), 0) pnl, COUNT(*) trades,
      SUM(CASE WHEN pnl_net > 0 THEN 1 ELSE 0 END) wins, COALESCE(AVG(rr_ratio), 0) avgRr
      FROM trades WHERE status = 'CLOSED' GROUP BY strategy ORDER BY pnl DESC`,
  );
  const bySymbol = await db.getAllAsync<{ symbol: string; pnl: number; trades: number; wins: number }>(
    `SELECT symbol, COALESCE(SUM(pnl_net), 0) pnl, COUNT(*) trades,
      SUM(CASE WHEN pnl_net > 0 THEN 1 ELSE 0 END) wins
      FROM trades WHERE status = 'CLOSED' GROUP BY symbol ORDER BY ABS(pnl) DESC LIMIT 12`,
  );
  const byMonth = await db.getAllAsync<{ month: string; pnl: number; trades: number }>(
    `SELECT strftime('%Y-%m', close_time, 'localtime') month, COALESCE(SUM(pnl_net), 0) pnl, COUNT(*) trades
      FROM trades WHERE status = 'CLOSED' AND close_time IS NOT NULL
      GROUP BY month ORDER BY month DESC LIMIT 6`,
  );
  const recentCurve = await db.getAllAsync<{ day: string; pnl: number; trades: number }>(
    `SELECT date(close_time, 'localtime') day, COALESCE(SUM(pnl_net), 0) pnl, COUNT(*) trades
      FROM trades WHERE status = 'CLOSED' AND date(close_time, 'localtime') >= date('now', 'localtime', '-55 days')
      GROUP BY day ORDER BY day ASC`,
  );
  return {
    totals: {
      ...totals,
      pnl: Number(totals?.pnl ?? 0),
      trades: Number(totals?.trades ?? 0),
      wins: Number(totals?.wins ?? 0),
      losses: Number(totals?.losses ?? 0),
      avgRr: Number(totals?.avgRr ?? 0),
      best: Number(totals?.best ?? 0),
      worst: Number(totals?.worst ?? 0),
      grossProfit: Number(totals?.grossProfit ?? 0),
      grossLoss: Number(totals?.grossLoss ?? 0),
      profitFactor: Number(totals?.grossLoss ?? 0) > 0
        ? Number(totals?.grossProfit ?? 0) / Number(totals?.grossLoss ?? 1)
        : Number(totals?.grossProfit ?? 0) > 0 ? Number.POSITIVE_INFINITY : 0,
      avgWin: Number(totals?.avgWin ?? 0),
      avgLoss: Number(totals?.avgLoss ?? 0),
    },
    byEmotion,
    byStrategy,
    bySymbol,
    byMonth: byMonth.reverse(),
    recentCurve,
  };
}

export async function getBackupData() {
  const db = await getDb();
  const [settings, strategies, symbols, checklist, trades, trade_images, daily_notes] = await Promise.all([
    db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings'),
    db.getAllAsync<StrategyRow>('SELECT * FROM strategies'),
    db.getAllAsync<SymbolRow>('SELECT * FROM symbols'),
    db.getAllAsync<ChecklistItem>('SELECT * FROM checklist_items'),
    db.getAllAsync<Trade>('SELECT * FROM trades'),
    db.getAllAsync<TradeImage>('SELECT * FROM trade_images'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM daily_notes'),
  ]);
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    settings,
    strategies,
    symbols,
    checklist,
    trades,
    trade_images,
    daily_notes,
  };
}

export async function restoreBackupData(data: unknown) {
  validateBackupData(data);
  const db = await getDb();
  const backupCurrency = String(
    (data.settings as BackupRecord[]).find((row) => row.key === 'default_currency')?.value || 'USD',
  ).trim().toUpperCase();
  const previousImages = await db.getAllAsync<{ image_uri: string }>('SELECT image_uri FROM trade_images');
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM trade_images;
      DELETE FROM trades;
      DELETE FROM strategies;
      DELETE FROM symbols;
      DELETE FROM checklist_items;
      DELETE FROM daily_notes;
      DELETE FROM settings;
    `);
    for (const row of data.settings ?? []) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', row.key, row.value);
    }
    for (const row of data.strategies ?? []) {
      await db.runAsync('INSERT OR REPLACE INTO strategies (id, name, description, created_at) VALUES (?, ?, ?, ?)', row.id, row.name, row.description ?? null, row.created_at ?? new Date().toISOString());
    }
    for (const row of data.symbols ?? []) {
      await db.runAsync(
        'INSERT OR REPLACE INTO symbols (id, market, symbol, active, is_custom, pip_size, contract_size, quote_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        row.id, row.market, row.symbol, row.active, row.is_custom, row.pip_size, row.contract_size, row.quote_currency ?? null,
      );
    }
    for (const row of data.checklist ?? []) {
      await db.runAsync(
        'INSERT OR REPLACE INTO checklist_items (id, label_fa, label_en, active, position) VALUES (?, ?, ?, ?, ?)',
        row.id, row.label_fa, row.label_en, row.active, row.position,
      );
    }
    for (const row of data.trades ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO trades (
          id, created_at, market, symbol, direction, status, entry_price, exit_price, stop_loss, take_profit, lot_size, quantity,
          risk_percent, account_balance, account_currency, risk_amount, pip_size, contract_size, pip_value_at_entry, commission, swap_fee, funding_fee,
          pnl_gross, pnl_net, pnl_pips, rr_ratio, open_time, close_time, strategy, emotion_entry, emotion_exit, setup_notes, exit_notes, lesson_learned, checklist
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.created_at, row.market, row.symbol, row.direction, row.status, row.entry_price, row.exit_price ?? null, row.stop_loss ?? null, row.take_profit ?? null,
        row.lot_size ?? null, row.quantity ?? null, row.risk_percent ?? null, row.account_balance ?? null, row.account_currency ?? backupCurrency, row.risk_amount ?? null, row.pip_size, row.contract_size,
        row.pip_value_at_entry ?? null, row.commission ?? 0, row.swap_fee ?? 0, row.funding_fee ?? 0, row.pnl_gross ?? null, row.pnl_net ?? null, row.pnl_pips ?? null,
        row.rr_ratio ?? null, row.open_time, row.close_time ?? null, row.strategy ?? null, row.emotion_entry ?? null, row.emotion_exit ?? null, row.setup_notes ?? null,
        row.exit_notes ?? null, row.lesson_learned ?? null, row.checklist || '{}',
      );
    }
    for (const row of data.trade_images ?? []) {
      await db.runAsync('INSERT OR REPLACE INTO trade_images (id, trade_id, image_type, image_uri, created_at) VALUES (?, ?, ?, ?, ?)', row.id, row.trade_id, row.image_type, row.image_uri, row.created_at);
    }
    for (const row of data.daily_notes ?? []) {
      await db.runAsync(
        'INSERT OR REPLACE INTO daily_notes (id, date, mood, market_bias, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        row.id, row.date, row.mood ?? null, row.market_bias ?? null, row.notes ?? null, row.created_at ?? new Date().toISOString(),
      );
    }
  });

  const restoredUris = new Set((data.trade_images as BackupRecord[]).map((row) => String(row.image_uri)));
  await removeLocalFiles(previousImages.map((image) => image.image_uri).filter((uri) => !restoredUris.has(uri)));
}
