import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareTableChildren } from './responsiveTableLayout.js';

function renderRows(headers, rows) {
  return renderToStaticMarkup(h('table', null, prepareTableChildren([
    h('thead', { key: 'head' }, h('tr', null, headers.map((text, index) => h('th', { key: index }, text)))),
    h('tbody', { key: 'body' }, rows),
  ])));
}

test('mobile records retain every field and its column label', () => {
  const html = renderRows(['Time', 'User', 'Action', 'Details'], h('tr', null,
    h('td', null, '10/06/2026'), h('td', null, 'admin@example.com'),
    h('td', null, h('button', { type: 'button' }, 'View record')), h('td', null, 'Property updated'),
  ));
  for (const label of ['Time', 'User', 'Action', 'Details']) assert.ok(html.includes(`data-label="${label}"`));
  for (const value of ['10/06/2026', 'admin@example.com', 'View record', 'Property updated']) assert.ok(html.includes(value));
  assert.ok(html.includes('type="button"'));
});

test('rows inside fragments receive labels and preserve explicit owner labels', () => {
  const html = renderRows(['Property', 'Rent'], h(Fragment, null,
    h('tr', null, h('td', null, 'Grand Center'), h('td', { 'data-label': 'Monthly rent' }, '₱5,000')),
    h('tr', null, h('td', null, 'Modern Manila'), h('td', null, '₱12,345')),
  ));
  assert.equal((html.match(/data-label="Property"/g) || []).length, 2);
  assert.ok(html.includes('data-label="Monthly rent"'));
  assert.ok(html.includes('data-label="Rent"'));
});

test('empty and expanded rows span a whole card without a misleading field label', () => {
  const html = renderRows(['Property', 'Rent', 'Status'], [
    h('tr', { key: 'empty' }, h('td', { colSpan: 3 }, 'No records found')),
    h('tr', { key: 'expanded' }, h('td', { colSpan: 2 }, 'Payment history'), h('td', null, 'Verified')),
  ]);
  assert.ok(html.includes('workspace-table-full-row'));
  assert.ok(html.includes('data-label="Status"'));
  assert.ok(!html.includes('data-label="Property"'));
  assert.ok(!html.includes('data-label="Rent"'));
  assert.ok(html.includes('No records found'));
  assert.ok(html.includes('Payment history'));
});

test('formatted column headings provide readable mobile field names', () => {
  const html = renderRows([h('span', null, 'Monthly ', h('strong', null, 'rent'))], h('tr', null, h('td', null, '₱5,000')));
  assert.ok(html.includes('data-label="Monthly rent"'));
});
