import test from 'node:test';
import assert from 'node:assert/strict';
import { getPropertyUnitSummary, getPortfolioUnitSummary } from './propertyAvailability.js';

test('multi-unit property availability is derived from every unit state', () => {
  const summary = getPropertyUnitSummary({
    propertyType: 'Condo',
    status: 'Available',
    units: [
      { status: 'Occupied' },
      { status: 'Reserved' },
      { status: 'Maintenance' },
    ],
  });

  assert.deepEqual(summary, {
    total: 3,
    available: 0,
    reserved: 1,
    occupied: 1,
    maintenance: 1,
    availabilityLabel: 'No available units',
  });
});

test('portfolio totals count only Available units as vacant', () => {
  const summary = getPortfolioUnitSummary([
    { propertyType: 'Apartment', units: [{ status: 'Reserved' }, { status: 'Maintenance' }] },
    { propertyType: 'House', status: 'Available', units: [] },
  ]);

  assert.deepEqual(summary, { total: 3, available: 1, reserved: 1, occupied: 0, maintenance: 1 });
});

test('unitless properties use their property status as the single unit state', () => {
  assert.deepEqual(getPropertyUnitSummary({ propertyType: 'House', status: 'Under Maintenance', units: [] }), {
    total: 1,
    available: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 1,
    availabilityLabel: 'No available units',
  });
});

test('empty multi-unit properties do not invent an available unit', () => {
  assert.deepEqual(getPropertyUnitSummary({ propertyType: 'Apartment', status: 'Available', units: [] }), {
    total: 0,
    available: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 0,
    availabilityLabel: 'No available units',
  });
});
