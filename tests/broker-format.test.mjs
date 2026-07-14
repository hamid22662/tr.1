import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat } from '../src/services/brokerFormat.ts';

test('detects MT4 headers', () => {
  assert.equal(detectFormat(['Ticket', 'Open Time', 'Type', 'Item', 'Profit']), 'mt4');
});

test('detects MT5 headers with BOM and spacing', () => {
  assert.equal(detectFormat(['\uFEFFPosition', ' Symbol ', 'Action', 'Profit']), 'mt5');
});

test('detects Binance headers', () => {
  assert.equal(detectFormat(['Pair', 'Side', 'Realized Profit', 'Date']), 'binance');
});

test('returns unknown for unsupported exports', () => {
  assert.equal(detectFormat(['Date', 'Asset', 'Price']), 'unknown');
});
