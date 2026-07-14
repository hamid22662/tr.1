import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClosedTrade,
  calculateForexPipValuePerLot,
  calculatePositionSize,
  calculateRr,
} from '../src/services/calculations.ts';

test('calculates EURUSD pip value and risk-based lot size', () => {
  assert.equal(calculateForexPipValuePerLot({
    pipSize: 0.0001,
    contractSize: 100000,
    quoteCurrency: 'USD',
    symbol: 'EURUSD',
    accountCurrency: 'USD',
  }), 10);

  const result = calculatePositionSize({
    market: 'forex', accountBalance: 10000, riskPercent: 1,
    entry: 1.1, stopLoss: 1.095, pipSize: 0.0001, contractSize: 100000,
    quoteCurrency: 'USD', symbol: 'EURUSD', accountCurrency: 'USD',
  });
  assert.ok(Math.abs(result.lotSize - 0.2) < 1e-10);
  assert.equal(result.riskAmount, 100);
});

test('converts USDJPY pip value into USD at entry', () => {
  const value = calculateForexPipValuePerLot({
    pipSize: 0.01, contractSize: 100000, entryPrice: 150,
    quoteCurrency: 'JPY', symbol: 'USDJPY', accountCurrency: 'USD',
  });
  assert.ok(Math.abs(value - 6.6666666667) < 1e-8);
});

test('rejects unsupported offline currency conversion', () => {
  const result = calculatePositionSize({
    market: 'crypto', accountBalance: 10000, riskPercent: 1,
    entry: 60000, stopLoss: 59000, pipSize: 0.01, contractSize: 1,
    quoteCurrency: 'USDT', symbol: 'BTCUSDT', accountCurrency: 'EUR',
  });
  assert.equal(result.isPipValueConfigured, false);
  assert.equal(result.size, 0);
});

test('calculates closed forex P&L from snapshotted pip value', () => {
  const result = calculateClosedTrade({
    market: 'forex', symbol: 'EURUSD', direction: 'BUY',
    entry_price: 1.1, exit_price: 1.105, pip_size: 0.0001,
    contract_size: 100000, pip_value_at_entry: 10, lot_size: 0.2,
    account_currency: 'USD', quantity: null, commission: 2,
    swap_fee: 1, funding_fee: 0,
  });
  assert.ok(Math.abs(result.grossPnl - 100) < 1e-8);
  assert.ok(Math.abs(result.netPnl - 97) < 1e-8);
});

test('returns null for invalid RR geometry', () => {
  assert.equal(calculateRr('BUY', 100, 101, 110), null);
  assert.equal(calculateRr('SELL', 100, 99, 90), null);
  assert.equal(calculateRr('BUY', 100, 95, 110), 2);
});
