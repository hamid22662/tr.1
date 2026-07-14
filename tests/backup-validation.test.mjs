import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackupData } from '../src/services/backupValidation.ts';

const validBackup = () => ({
  version: 2,
  settings: [{ key: 'default_currency', value: 'USD' }],
  strategies: [{ id: 1, name: 'Breakout' }],
  symbols: [{ id: 1, market: 'forex', symbol: 'EURUSD', active: 1, is_custom: 0, pip_size: 0.0001, contract_size: 100000 }],
  checklist: [{ id: 1, label_fa: 'روند', label_en: 'Trend', active: 1, position: 1 }],
  trades: [{
    id: 1, market: 'forex', symbol: 'EURUSD', direction: 'BUY', status: 'CLOSED',
    entry_price: 1.1, exit_price: 1.11, pip_size: 0.0001, contract_size: 100000,
    account_currency: 'USD', open_time: '2026-01-01T10:00:00.000Z',
    close_time: '2026-01-01T11:00:00.000Z', checklist: '{}',
  }],
  trade_images: [{ id: 1, trade_id: 1, image_type: 'entry', image_uri: 'file:///chart.jpg' }],
  daily_notes: [{ id: 1, date: '2026-01-01' }],
});

test('accepts a structurally valid backup', () => {
  assert.doesNotThrow(() => validateBackupData(validBackup()));
});

test('rejects duplicate trade IDs', () => {
  const backup = validBackup();
  backup.trades.push({ ...backup.trades[0] });
  assert.throws(() => validateBackupData(backup), /INVALID_BACKUP_TRADES/);
});

test('rejects orphan images', () => {
  const backup = validBackup();
  backup.trade_images[0].trade_id = 999;
  assert.throws(() => validateBackupData(backup), /INVALID_BACKUP_IMAGES/);
});

test('rejects mixed account currencies', () => {
  const backup = validBackup();
  backup.trades[0].account_currency = 'EUR';
  assert.throws(() => validateBackupData(backup), /INVALID_BACKUP_TRADES/);
});
