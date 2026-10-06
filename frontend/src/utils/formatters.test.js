import test from 'node:test';
import assert from 'node:assert/strict';
import formatCurrency from './formatCurrency.js';
import formatNotificationTime from './formatNotificationTime.js';

test('currency formatting preserves zero, partial amounts, and decimal strings', () => {
  assert.equal(formatCurrency(null), '₱0.00');
  assert.equal(formatCurrency(0), '₱0.00');
  assert.equal(formatCurrency('12345.5'), '₱12,345.50');
  assert.equal(formatCurrency(0.01), '₱0.01');
});

test('invalid notification dates do not display a broken timestamp', () => {
  assert.equal(formatNotificationTime('not a date'), '');
});

test('notification timestamps preserve past and future relative time', (t) => {
  const now = Date.UTC(2026, 9, 6, 8);
  t.mock.method(Date, 'now', () => now);
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  assert.equal(formatNotificationTime(new Date(now)), relative.format(0, 'second'));
  assert.equal(formatNotificationTime(new Date(now - 86400000)), relative.format(-1, 'day'));
  assert.equal(formatNotificationTime(new Date(now + 3600000)), relative.format(1, 'hour'));
});
