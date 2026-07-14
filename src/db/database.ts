import * as SQLite from 'expo-sqlite';
import { DEFAULT_CHECKLIST, DEFAULT_STRATEGIES, DEFAULT_SYMBOLS } from '@/constants/defaults';
import { calculateClosedTrade } from '@/services/calculations';
import { Trade } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market TEXT NOT NULL CHECK (market IN ('forex', 'crypto')),
  symbol TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  is_custom INTEGER NOT NULL DEFAULT 0,
  pip_size REAL NOT NULL,
  contract_size REAL NOT NULL,
  quote_currency TEXT
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label_fa TEXT NOT NULL,
  label_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  market TEXT NOT NULL CHECK (market IN ('forex', 'crypto')),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  entry_price REAL NOT NULL,
  exit_price REAL,
  stop_loss REAL,
  take_profit REAL,
  lot_size REAL,
  quantity REAL,
  risk_percent REAL,
  account_balance REAL,
  account_currency TEXT NOT NULL DEFAULT 'USD',
  risk_amount REAL,
  pip_size REAL NOT NULL,
  contract_size REAL NOT NULL,
  pip_value_at_entry REAL,
  commission REAL NOT NULL DEFAULT 0,
  swap_fee REAL NOT NULL DEFAULT 0,
  funding_fee REAL NOT NULL DEFAULT 0,
  pnl_gross REAL,
  pnl_net REAL,
  pnl_pips REAL,
  rr_ratio REAL,
  open_time TEXT NOT NULL,
  close_time TEXT,
  strategy TEXT,
  emotion_entry TEXT,
  emotion_exit TEXT,
  setup_notes TEXT,
  exit_notes TEXT,
  lesson_learned TEXT,
  checklist TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_trades_open_time ON trades(open_time);
CREATE INDEX IF NOT EXISTS idx_trades_status_open_time ON trades(status, open_time);
CREATE INDEX IF NOT EXISTS idx_trades_status_close_time ON trades(status, close_time);
CREATE INDEX IF NOT EXISTS idx_trades_import_duplicate ON trades(symbol, direction, open_time);

CREATE TABLE IF NOT EXISTS trade_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('entry', 'exit', 'analysis')),
  image_uri TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trade_images_trade_id ON trade_images(trade_id, id);
CREATE INDEX IF NOT EXISTS idx_symbols_active_market_symbol ON symbols(active, market, symbol);
CREATE INDEX IF NOT EXISTS idx_checklist_active_position ON checklist_items(active, position);

CREATE TABLE IF NOT EXISTS daily_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  mood TEXT,
  market_bias TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('tradelog.db').then(async (db) => {
      await db.execAsync(schema);
      await ensureSchemaMigrations(db);
      await seed(db);
      await repairClosedTrades(db);
      await db.execAsync('PRAGMA optimize;');
      return db;
    });
  }
  return dbPromise;
}

async function ensureSchemaMigrations(db: SQLite.SQLiteDatabase) {
  // Superseded by composite indexes that also cover status-only and symbol-only lookups.
  await db.execAsync(`
    DROP INDEX IF EXISTS idx_trades_status;
    DROP INDEX IF EXISTS idx_trades_symbol;
  `);

  const symbolColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(symbols)');
  const hasSymbolColumn = (name: string) => symbolColumns.some((column) => column.name === name);

  // The app can safely upgrade databases created before symbol contract metadata existed.
  if (!hasSymbolColumn('pip_size')) await db.execAsync('ALTER TABLE symbols ADD COLUMN pip_size REAL NOT NULL DEFAULT 0.0001');
  if (!hasSymbolColumn('contract_size')) await db.execAsync('ALTER TABLE symbols ADD COLUMN contract_size REAL NOT NULL DEFAULT 1');
  if (!hasSymbolColumn('quote_currency')) await db.execAsync('ALTER TABLE symbols ADD COLUMN quote_currency TEXT');
  if (!hasSymbolColumn('is_custom')) await db.execAsync('ALTER TABLE symbols ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0');

  const tradeColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(trades)');
  const hasTradeColumn = (name: string) => tradeColumns.some((column) => column.name === name);
  const tradeMigrations: Array<[string, string]> = [
    ['account_currency', 'ALTER TABLE trades ADD COLUMN account_currency TEXT'],
    ['risk_amount', 'ALTER TABLE trades ADD COLUMN risk_amount REAL'],
    ['pip_size', 'ALTER TABLE trades ADD COLUMN pip_size REAL NOT NULL DEFAULT 0.0001'],
    ['contract_size', 'ALTER TABLE trades ADD COLUMN contract_size REAL NOT NULL DEFAULT 1'],
    ['pip_value_at_entry', 'ALTER TABLE trades ADD COLUMN pip_value_at_entry REAL'],
    ['commission', 'ALTER TABLE trades ADD COLUMN commission REAL NOT NULL DEFAULT 0'],
    ['swap_fee', 'ALTER TABLE trades ADD COLUMN swap_fee REAL NOT NULL DEFAULT 0'],
    ['funding_fee', 'ALTER TABLE trades ADD COLUMN funding_fee REAL NOT NULL DEFAULT 0'],
    ['pnl_gross', 'ALTER TABLE trades ADD COLUMN pnl_gross REAL'],
    ['pnl_net', 'ALTER TABLE trades ADD COLUMN pnl_net REAL'],
    ['pnl_pips', 'ALTER TABLE trades ADD COLUMN pnl_pips REAL'],
    ['rr_ratio', 'ALTER TABLE trades ADD COLUMN rr_ratio REAL'],
    ['emotion_exit', 'ALTER TABLE trades ADD COLUMN emotion_exit TEXT'],
    ['exit_notes', 'ALTER TABLE trades ADD COLUMN exit_notes TEXT'],
    ['lesson_learned', 'ALTER TABLE trades ADD COLUMN lesson_learned TEXT'],
    ['checklist', "ALTER TABLE trades ADD COLUMN checklist TEXT NOT NULL DEFAULT '{}'"],
  ];
  for (const [column, sql] of tradeMigrations) {
    if (!hasTradeColumn(column)) await db.execAsync(sql);
  }

  const defaultCurrency = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'default_currency'",
  );
  await db.runAsync(
    "UPDATE trades SET account_currency = ? WHERE account_currency IS NULL OR TRIM(account_currency) = ''",
    String(defaultCurrency?.value || 'USD').trim().toUpperCase(),
  );

  await db.execAsync(`CREATE TABLE IF NOT EXISTS trade_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id INTEGER NOT NULL,
    image_type TEXT NOT NULL CHECK (image_type IN ('entry', 'exit', 'analysis')),
    image_uri TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
  );`);

  // Existing, non-default symbols are treated as custom so that they can be deleted later.
  const defaultNames = DEFAULT_SYMBOLS.map((item) => item.symbol);
  if (defaultNames.length) {
    const placeholders = defaultNames.map(() => '?').join(', ');
    await db.runAsync(`UPDATE symbols SET is_custom = 0 WHERE symbol IN (${placeholders})`, ...defaultNames);
    await db.runAsync(`UPDATE symbols SET is_custom = 1 WHERE symbol NOT IN (${placeholders})`, ...defaultNames);
  }
}

async function repairClosedTrades(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<Trade>(
    `SELECT * FROM trades
     WHERE status = 'CLOSED' AND exit_price IS NOT NULL
       AND (pnl_gross IS NULL OR pnl_net IS NULL OR pnl_pips IS NULL)`,
  );
  for (const trade of rows) {
    const calc = calculateClosedTrade({ ...trade, exit_price: Number(trade.exit_price) });
    await db.runAsync(
      'UPDATE trades SET pnl_gross = ?, pnl_net = ?, pnl_pips = ? WHERE id = ?',
      calc.grossPnl, calc.netPnl, calc.pips, trade.id,
    );
  }
}

async function seed(db: SQLite.SQLiteDatabase) {
  const baseSettings: Record<string, string> = {
    language: 'fa',
    theme: 'dark',
    default_currency: 'USD',
    account_balance: '0',
    default_risk_percent: '1',
    default_market: 'forex',
    onboarding_complete: '0',
    experience_mode: 'simple',
    notif_enabled: '0',
    notif_hour: '20',
    notif_minute: '0',
  };
  for (const [key, value] of Object.entries(baseSettings)) {
    await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
  }

  // Old manual pip settings are no longer read by the app. Keep the database key untouched
  // for backwards compatibility, but do not seed or use it for any new calculation.
  for (const strategy of DEFAULT_STRATEGIES) {
    await db.runAsync('INSERT OR IGNORE INTO strategies (name) VALUES (?)', strategy);
  }

  for (const symbol of DEFAULT_SYMBOLS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO symbols (market, symbol, active, is_custom, pip_size, contract_size, quote_currency)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
      symbol.market,
      symbol.symbol,
      symbol.active,
      symbol.pip_size,
      symbol.contract_size,
      symbol.quote_currency,
    );
  }

  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM checklist_items');
  if (!row?.count) {
    for (const item of DEFAULT_CHECKLIST) {
      await db.runAsync(
        'INSERT INTO checklist_items (label_fa, label_en, active, position) VALUES (?, ?, ?, ?)',
        item.label_fa,
        item.label_en,
        item.active,
        item.position,
      );
    }
  }
}

export async function resetDatabase() {
  const db = await getDb();
  const images = await db.getAllAsync<{ image_uri: string }>('SELECT image_uri FROM trade_images');
  await db.execAsync(`
    DELETE FROM trade_images;
    DELETE FROM trades;
    DELETE FROM daily_notes;
    DELETE FROM strategies;
    DELETE FROM symbols;
    DELETE FROM checklist_items;
    DELETE FROM settings;
  `);
  await seed(db);
  await Promise.all(images.map(async ({ image_uri }) => {
    try { await FileSystem.deleteAsync(image_uri, { idempotent: true }); } catch { /* already removed */ }
  }));
}
