export type BrokerFormat = 'mt4' | 'mt5' | 'binance' | 'unknown';

const normalizeHeader = (header: string) => String(header ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

/** Detects supported broker exports using normalized CSV column names. */
export function detectFormat(headers: string[]): BrokerFormat {
  const normalized = headers.map(normalizeHeader);
  if (normalized.includes('ticket') && normalized.includes('type') && (normalized.includes('item') || normalized.includes('symbol'))) return 'mt4';
  if (normalized.includes('position') && normalized.includes('symbol') && normalized.includes('action')) return 'mt5';
  if ((normalized.includes('pair') || normalized.includes('symbol')) && normalized.includes('side') && normalized.includes('realized profit')) return 'binance';
  return 'unknown';
}
