export type BackupRecord = Record<string, any>;

const isRecord = (value: unknown): value is BackupRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value);

const hasUniqueNumericIds = (rows: BackupRecord[]) => {
  const ids = rows.map((row) => row.id);
  return ids.every((id) => Number.isInteger(id) && id > 0) && new Set(ids).size === ids.length;
};

/** Validates an untrusted backup before any current user data is deleted. */
export function validateBackupData(data: unknown): asserts data is BackupRecord {
  if (!isRecord(data) || ![1, 2].includes(Number(data.version))) throw new Error('INVALID_BACKUP_VERSION');

  const requiredArrays = ['settings', 'strategies', 'symbols', 'checklist', 'trades', 'trade_images', 'daily_notes'] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(data[key]) || !data[key].every(isRecord)) throw new Error(`INVALID_BACKUP_${key.toUpperCase()}`);
  }

  const settings = data.settings as BackupRecord[];
  const strategies = data.strategies as BackupRecord[];
  const symbols = data.symbols as BackupRecord[];
  const checklist = data.checklist as BackupRecord[];
  const trades = data.trades as BackupRecord[];
  const images = data.trade_images as BackupRecord[];
  const notes = data.daily_notes as BackupRecord[];

  if (!settings.every((row) => typeof row.key === 'string' && row.key.length > 0 && typeof row.value === 'string')) {
    throw new Error('INVALID_BACKUP_SETTINGS');
  }
  if (new Set(settings.map((row) => row.key)).size !== settings.length) throw new Error('DUPLICATE_BACKUP_SETTINGS');
  const backupCurrency = String(settings.find((row) => row.key === 'default_currency')?.value || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3,6}$/.test(backupCurrency)) throw new Error('INVALID_BACKUP_CURRENCY');

  if (!hasUniqueNumericIds(strategies) || !strategies.every((row) => typeof row.name === 'string' && row.name.trim().length > 0)) {
    throw new Error('INVALID_BACKUP_STRATEGIES');
  }
  if (!hasUniqueNumericIds(symbols) || !symbols.every((row) =>
    ['forex', 'crypto'].includes(row.market)
    && typeof row.symbol === 'string'
    && row.symbol.trim().length > 0
    && [0, 1].includes(row.active)
    && [0, 1].includes(row.is_custom)
    && isFiniteNumber(row.pip_size)
    && row.pip_size > 0
    && isFiniteNumber(row.contract_size)
    && row.contract_size > 0
  )) throw new Error('INVALID_BACKUP_SYMBOLS');

  if (!hasUniqueNumericIds(checklist) || !checklist.every((row) =>
    typeof row.label_fa === 'string'
    && typeof row.label_en === 'string'
    && [0, 1].includes(row.active)
    && Number.isInteger(row.position)
  )) throw new Error('INVALID_BACKUP_CHECKLIST');

  if (!hasUniqueNumericIds(trades) || !trades.every((row) =>
    ['forex', 'crypto'].includes(row.market)
    && ['BUY', 'SELL'].includes(row.direction)
    && ['OPEN', 'CLOSED'].includes(row.status)
    && typeof row.symbol === 'string'
    && row.symbol.length > 0
    && isFiniteNumber(row.entry_price)
    && row.entry_price > 0
    && isFiniteNumber(row.pip_size)
    && row.pip_size > 0
    && isFiniteNumber(row.contract_size)
    && row.contract_size > 0
    && (row.account_currency === undefined || row.account_currency === backupCurrency)
    && typeof row.open_time === 'string'
    && !Number.isNaN(Date.parse(row.open_time))
    && typeof row.checklist === 'string'
    && (row.status !== 'CLOSED' || (isFiniteNumber(row.exit_price) && typeof row.close_time === 'string' && !Number.isNaN(Date.parse(row.close_time))))
  )) throw new Error('INVALID_BACKUP_TRADES');

  const tradeIds = new Set(trades.map((row) => row.id));
  if (!hasUniqueNumericIds(images) || !images.every((row) =>
    tradeIds.has(row.trade_id)
    && ['entry', 'exit', 'analysis'].includes(row.image_type)
    && typeof row.image_uri === 'string'
    && row.image_uri.length > 0
  )) throw new Error('INVALID_BACKUP_IMAGES');

  if (!hasUniqueNumericIds(notes) || !notes.every((row) =>
    typeof row.date === 'string' && !Number.isNaN(Date.parse(row.date))
  )) throw new Error('INVALID_BACKUP_NOTES');
}
