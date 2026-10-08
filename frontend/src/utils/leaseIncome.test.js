import test from 'node:test';
import assert from 'node:assert/strict';
import sumActiveLeaseIncome from './leaseIncome.js';
import * as income from './leaseIncome.js';

test('monthly income sums active signed rents and excludes other lease states', () => {
  assert.equal(sumActiveLeaseIncome([
    { status: 'Active', rentAmount: '1200.00' },
    { status: 'active', rentAmount: '300.25' },
    { status: 'Pending', rentAmount: '5000.00' },
    { status: 'Terminated', rentAmount: '9000.00' },
    { status: 'Expired', rentAmount: '4000.00' },
  ]), 1500.25);
});

test('no active leases produce zero income', () => {
  assert.equal(sumActiveLeaseIncome([]), 0);
  assert.equal(sumActiveLeaseIncome([{ status: 'Pending', rentAmount: '1000.00' }]), 0);
});

test('cent amounts do not accumulate fractional rounding noise', () => {
  assert.equal(sumActiveLeaseIncome([
    { status: 'Active', rentAmount: '0.10' }, { status: 'Active', rentAmount: '0.20' },
  ]), 0.30);
});

test('failed overview with unloaded contracts does not claim zero income', () => {
  assert.equal(income.resolveMonthlyIncome(null, [], undefined), null);
});

test('a contracts page never represents the whole portfolio income', () => {
  const firstPage = Array.from({ length: 50 }, () => ({ status: 'Active', rentAmount: '1000.00' }));
  assert.equal(income.resolveMonthlyIncome(null, firstPage, 51), null);
  assert.equal(income.resolveMonthlyIncome(null, [{ status: 'Active', rentAmount: '2000.00' }], 51), null);
});

test('complete scoped contracts support an accurate fallback after overview failure', () => {
  assert.equal(income.resolveMonthlyIncome(null, [
    { status: 'Active', rentAmount: '800.00' }, { status: 'Pending', rentAmount: '900.00' },
  ], 2), 800);
  assert.equal(income.resolveMonthlyIncome(null, [], 0), 0);
});

test('server overview income remains authoritative over paginated contracts', () => {
  assert.equal(income.resolveMonthlyIncome({ totalMonthlyIncome: '12345.67' }, [
    { status: 'Active', rentAmount: '1000.00' },
  ], 51), 12345.67);
});
