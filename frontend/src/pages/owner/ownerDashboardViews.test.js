import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import * as ReactRuntime from 'react';
import { createElement } from 'react';
import jsxDevRuntime from 'react/jsx-dev-runtime';
import jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = fileURLToPath(new URL('../../../', import.meta.url));
globalThis.__ownerReactRuntime = ReactRuntime;
globalThis.__ownerReactJsxDevRuntime = jsxDevRuntime;
globalThis.__ownerReactJsxRuntime = jsxRuntime;
let viteServer;

const reactModuleId = '\0owner-test-react';
const reactBootstrapModuleId = '\0owner-test-react-bootstrap';
const invoiceServiceModuleId = '\0owner-test-invoice-service';
const reactModuleExports = Object.keys(ReactRuntime)
  .filter((name) => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name))
  .map((name) => `export const ${name} = globalThis.__ownerReactRuntime[${JSON.stringify(name)}];`)
  .join('\n');

const ownerTestRuntime = {
  name: 'owner-test-runtime',
  enforce: 'pre',
  resolveId(source) {
    if (source === 'react') return reactModuleId;
    if (source === 'react/jsx-dev-runtime') return '\0owner-test-jsx-dev-runtime';
    if (source === 'react/jsx-runtime') return '\0owner-test-jsx-runtime';
    if (source === 'react-bootstrap') return reactBootstrapModuleId;
    if (source === '../services/invoiceService') return invoiceServiceModuleId;
  },
  load(id) {
    if (id === reactModuleId) {
      return `${reactModuleExports}\nexport default globalThis.__ownerReactRuntime.default;`;
    }
    if (id === '\0owner-test-jsx-dev-runtime') {
      return 'export const Fragment = globalThis.__ownerReactJsxDevRuntime.Fragment; export const jsxDEV = (...args) => globalThis.__ownerReactJsxDevRuntime.jsxDEV(...args);';
    }
    if (id === '\0owner-test-jsx-runtime') {
      return 'export const Fragment = globalThis.__ownerReactJsxRuntime.Fragment; export const jsx = (...args) => globalThis.__ownerReactJsxRuntime.jsx(...args); export const jsxs = (...args) => globalThis.__ownerReactJsxRuntime.jsxs(...args);';
    }
    if (id === reactBootstrapModuleId) {
      return `
        const React = globalThis.__ownerReactRuntime;
        const classes = (...values) => values.filter(Boolean).join(' ');
        export function Button({ variant = 'primary', size, className, ...props }) {
          return React.createElement('button', { ...props, className: classes('btn', variant && 'btn-' + variant, size && 'btn-' + size, className) });
        }
        export function FormSelect({ size, className, ...props }) {
          return React.createElement('select', { ...props, className: classes('form-select', size && 'form-select-' + size, className) });
        }
        export function FormLabel({ className, ...props }) {
          return React.createElement('label', { ...props, className: classes('form-label', className) });
        }
        export function FormControl({ as = 'input', className, ...props }) {
          return React.createElement(as, { ...props, className: classes('form-control', className) });
        }
        export function Row({ className, ...props }) {
          return React.createElement('div', { ...props, className: classes('row', className) });
        }
        export function Col({ sm, md, xl, xs, className, ...props }) {
          return React.createElement('div', { ...props, className: classes(sm && 'col-sm-' + sm, md && 'col-md-' + md, xl && 'col-xl-' + xl, xs && 'col-' + xs, className) });
        }
        export const Form = { Select: FormSelect, Label: FormLabel, Control: FormControl };
        export function Table({ responsive, className, ...props }) {
          const table = React.createElement('table', { ...props, className: classes('table', className) });
          return responsive ? React.createElement('div', { className: 'table-responsive' }, table) : table;
        }
      `;
    }
    if (id === invoiceServiceModuleId) {
      return 'export async function fetchPaymentAcknowledgment() { throw new Error("Payment downloads are not invoked in SSR tests."); }';
    }
  },
};

async function loadOwnerModule(modulePath) {
  const sourcePath = resolve(frontendRoot, modulePath.replace(/^\//, ''));
  assert.equal(existsSync(sourcePath), true, `${modulePath} should exist before its Owner behavior can be checked`);
  viteServer ??= await createServer({
    root: frontendRoot,
    configFile: false,
    plugins: [ownerTestRuntime, reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  });
  return viteServer.ssrLoadModule(modulePath);
}

async function renderOwnerView(modulePath, exportName, props) {
  const viewModule = await loadOwnerModule(modulePath);
  assert.equal(typeof viewModule[exportName], 'function', `${exportName} should be exported`);
  return renderToStaticMarkup(createElement(viewModule[exportName], props));
}

async function loadPresentation() {
  return loadOwnerModule('/src/pages/owner/ownerDashboardPresentation.js');
}

after(async () => {
  await viteServer?.close();
});

test('Owner status pill maps known statuses and defaults unknown statuses', async () => {
  const known = await renderOwnerView('/src/pages/owner/OwnerStatusPill.jsx', 'OwnerStatusPill', { status: 'Occupied' });
  assert.match(known, /pm-pill-occupied/);
  assert.match(known, />Occupied</);

  const unknown = await renderOwnerView('/src/pages/owner/OwnerStatusPill.jsx', 'OwnerStatusPill', { status: 'Awaiting inspection' });
  assert.match(unknown, /pm-pill-default/);
  assert.match(unknown, />Awaiting inspection</);
});

test('Owner property metrics count occupied units and use active-lease fallback rent', async () => {
  const { getOwnerPropertyMetrics } = await loadPresentation();
  const occupied = getOwnerPropertyMetrics({
    _id: 'property-1',
    units: [
      { status: 'Occupied', monthlyRate: '1500' },
      { status: 'Vacant', monthlyRate: '2100' },
    ],
  }, []);
  assert.deepEqual(occupied, { totalUnits: 2, occupiedCount: 1, yieldAmt: 1500 });

  const fallback = getOwnerPropertyMetrics({ _id: 'property-2', status: 'Occupied' }, [
    { property: { _id: 'property-2' }, status: 'Active', rentAmount: '1750' },
  ]);
  assert.equal(fallback.yieldAmt, 1750);
});

test('Owner rental progress distinguishes pending decisions and active leases', async () => {
  const { getOwnerRentalProgress } = await loadPresentation();
  assert.deepEqual(getOwnerRentalProgress({ status: 'Pending Owner Approval' }, null), {
    label: 'Owner decision needed',
    detail: 'Review the manager’s notes, then approve or decline the application.',
    tone: 'action',
  });
  assert.equal(getOwnerRentalProgress({ status: 'Approved' }, { status: 'Active' }).label, 'Lease active');
});

test('Owner rent-change effective date preserves pending and invalid-date fallbacks', async () => {
  const { getRentChangeEffectiveDate } = await loadPresentation();
  assert.equal(getRentChangeEffectiveDate({ status: 'Pending' }), 'After Owner approval');
  assert.equal(getRentChangeEffectiveDate({ status: 'Rejected' }), '—');
  assert.equal(getRentChangeEffectiveDate({ status: 'Approved', decidedAt: 'not-a-date' }), 'On approval');
});

test('Owner history labels events, sorts newest first, and leaves input order unchanged', async () => {
  const { mapOwnerHistory } = await loadPresentation();
  const events = [
    { id: 'old', action: 'TERMINATE', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'new', action: 'APPLICATION APPROVAL RULE UPDATED', createdAt: '2024-04-01T00:00:00Z' },
  ];
  const history = mapOwnerHistory(events);
  assert.deepEqual(history.map((event) => event.id), ['new', 'old']);
  assert.equal(history[0].category, 'approval');
  assert.equal(history[0].categoryLabel, 'Application approval');
  assert.equal(history[1].title, 'Lease ended');
  assert.deepEqual(events.map((event) => event.id), ['old', 'new']);
});
test('Owner overview keeps incomplete lease income unavailable', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerMetricsSection.jsx', 'default', {
    metrics: {
      totalOwned: 4,
      occupancyRate: 75,
      occupiedUnits: 3,
      totalUnits: 4,
      totalMonthlyIncome: null,
      activeLeasesCount: 2,
    },
  });
  assert.match(html, /data-workspace-section="overview"/);
  for (const label of ['Owned properties', 'Occupancy rate', 'Monthly lease rent', 'Active leases']) {
    assert.ok(html.includes(label), `missing ${label} metric`);
  }
  assert.match(html, />Unavailable</);
  assert.match(html, />4</);
  assert.match(html, />75%</);
  assert.match(html, />\(3\/4 Units\)</);
  assert.match(html, />2</);
});
const emptyPropertyProps = {
  properties: [],
  contracts: [],
  approvalModeDrafts: {},
  savingApprovalPropertyId: null,
  onApprovalModeChange: () => {},
  onApprovalPolicySave: () => {},
  onLeaseAuthorityClick: () => {},
};

test('Owner property view explains an empty portfolio', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerPropertiesSection.jsx', 'default', emptyPropertyProps);
  assert.match(html, /Property/);
  assert.match(html, /Occupancy &amp; yield/);
  assert.match(html, /Application approval/);
  assert.match(html, /Manager authority/);
  assert.match(html, /No property assets linked to your owner account\./);
});

test('unassigned manager cannot receive delegated controls', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerPropertiesSection.jsx', 'default', {
    ...emptyPropertyProps,
    properties: [{
      _id: 'property-1',
      title: 'Harbor House',
      address: '12 Bay Road',
      propertyType: 'Residential',
      status: 'Available',
      units: [{ status: 'Vacant', monthlyRate: 0 }],
      applicationApprovalMode: 'Owner',
    }],
  });
  assert.match(html, /<option value="Manager" disabled="">Manager reviews applications<\/option>/);
  assert.match(html, /Assign a Property Manager to manage lease permissions\./);
  assert.doesNotMatch(html, /aria-label="(?:Grant|Revoke) [^"]* authority/);
  assert.doesNotMatch(html, /<button[^>]*>(?:Grant|Revoke)<\/button>/);
});
const emptyPricingProps = {
  requests: [],
  onDecision: () => {},
};

test('rent changes preserve pending actions and effective dates', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerPricingSection.jsx', 'default', {
    ...emptyPricingProps,
    requests: [
      {
        id: 'change-pending',
        propertyTitle: 'Harbor House',
        targetLabel: 'Unit 1',
        proposedByName: 'Maya',
        createdAt: '2024-03-15T00:00:00Z',
        currentRate: '1200',
        proposedRate: '1350',
        reason: 'Comparable units increased',
        status: 'Pending',
      },
      {
        id: 'change-approved',
        propertyTitle: 'Harbor House',
        targetLabel: 'Unit 2',
        proposedByName: 'Maya',
        createdAt: '2024-02-15T00:00:00Z',
        currentRate: '1100',
        proposedRate: '1250',
        reason: 'Updated maintenance costs',
        status: 'Approved',
        decidedByName: 'Owner',
        decisionNote: 'Approved for new leases',
      },
    ],
  });
  assert.match(html, /data-workspace-section="pricing"/);
  assert.match(html, /Existing leases keep the rent stated in their signed contract\./);
  assert.match(html, /Harbor House/);
  assert.match(html, /After Owner approval/);
  assert.match(html, /On approval/);
  assert.match(html, /Approved for new leases/);
  assert.equal((html.match(/>Approve<\/button>/g) || []).length, 1);
  assert.equal((html.match(/>Decline<\/button>/g) || []).length, 1);
});

test('empty rent-change view explains that no proposals exist', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerPricingSection.jsx', 'default', emptyPricingProps);
  assert.match(html, /No rent-change proposals yet\./);
  assert.match(html, /colSpan="7"/);
});

test('Owner approvals expose actions only for pending Owner decisions', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerApprovalsSection.jsx', 'default', {
    applications: [
      {
        id: 'pending-app',
        applicantName: 'Kai Santos',
        applicantEmail: 'kai@example.test',
        propertyDetails: { title: 'Harbor House' },
        employment: 'Designer',
        monthlyIncome: 62000,
        moveInDate: '2026-11-01',
        reviewNotes: 'Income verified',
        status: 'Pending Owner Approval',
      },
      {
        id: 'approved-app',
        applicantName: 'Lea Reyes',
        propertyDetails: { title: 'Harbor House' },
        status: 'Approved',
      },
    ],
    contracts: [{ sourceApplication: 'approved-app', status: 'Active' }],
    reviewNotes: { 'pending-app': 'Draft owner note' },
    savingApplicationId: null,
    onReviewNoteChange: () => {},
    onDecision: () => {},
  });
  assert.match(html, /Decision notes for Kai Santos/);
  assert.match(html, /Draft owner note/);
  assert.match(html, /Owner decision needed/);
  assert.match(html, /Lease active/);
  assert.match(html, /Decision is read-only/);
  assert.equal((html.match(/>Approve<\/button>/g) || []).length, 1);
  assert.equal((html.match(/>Decline<\/button>/g) || []).length, 1);
});

test('Owner approvals show the empty state', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerApprovalsSection.jsx', 'default', {
    applications: [],
    contracts: [],
    reviewNotes: {},
    savingApplicationId: null,
    onReviewNoteChange: () => {},
    onDecision: () => {},
  });
  assert.match(html, /No applications are recorded for your properties\./);
  assert.match(html, /colSpan="8"/);
});
test('pending lease exposes activation and termination actions', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerContractsSection.jsx', 'default', {
    contracts: [{
      _id: 'pending-contract',
      propertyDetails: { title: 'Harbor House' },
      unitDetails: { unitNumber: 'A1' },
      tenantDetails: { name: 'Alex Cruz', email: 'alex@example.test' },
      rentAmount: '1600',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      status: 'Pending',
    }],
    activatingContractId: null,
    onActivate: () => {},
    onTerminate: () => {},
  });
  assert.match(html, /Record signatures &amp; activate/);
  assert.match(html, /Cancel pending lease/);
  assert.match(html, /Lease prepared\. Waiting for all parties to sign outside the system\./);
  assert.match(html, /Alex Cruz/);
  assert.match(html, /₱1,600\.00/);
});

test('active and ended leases retain their allowed actions', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerContractsSection.jsx', 'default', {
    contracts: [
      {
        id: 'active-contract',
        propertyDetails: { title: 'Harbor House' },
        tenantDetails: { name: 'Mina Lee' },
        rentAmount: 1800,
        status: 'Active',
        activatedAt: '2026-09-01T00:00:00Z',
        activatedBy: { name: 'Owner' },
      },
      {
        id: 'ended-contract',
        propertyDetails: { title: 'Cedar Flat' },
        tenantDetails: { name: 'Noah Park' },
        rentAmount: 1200,
        status: 'Terminated',
        terminationEffectiveDate: '2026-09-15',
        terminationReason: 'Lease completed',
      },
    ],
    activatingContractId: null,
    onActivate: () => {},
    onTerminate: () => {},
  });
  assert.equal((html.match(/>End lease<\/button>/g) || []).length, 1);
  assert.doesNotMatch(html, /Record signatures &amp; activate/);
  assert.match(html, /Activated by Owner/);
  assert.match(html, /Lease completed/);
  assert.match(html, /Ended effective/);
  assert.match(html, /—/);
});
test('Owner history distinguishes no records from no filter matches', async () => {
  const emptyHistory = await renderOwnerView('/src/pages/owner/OwnerHistorySection.jsx', 'default', {
    events: [],
    filter: 'all',
    onFilterChange: () => {},
  });
  assert.match(emptyHistory, /No history yet/);
  assert.match(emptyHistory, /Updates to approval rules, manager permissions, and leases will appear here\./);

  const noMatches = await renderOwnerView('/src/pages/owner/OwnerHistorySection.jsx', 'default', {
    events: [{
      id: 'pricing-event',
      category: 'pricing',
      categoryLabel: 'Rent changes',
      title: 'Rent change approved',
      createdAt: '2026-10-01T12:00:00Z',
      actor: 'Owner',
    }],
    filter: 'authority',
    onFilterChange: () => {},
  });
  assert.match(noMatches, /No matching activity/);
  assert.match(noMatches, /Choose another filter to see more portfolio records\./);
});

test('Owner history filter reflects the active selection', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerHistorySection.jsx', 'default', {
    events: [{
      id: 'authority-event',
      category: 'authority',
      categoryLabel: 'Manager permissions',
      title: 'Lease signing permission granted',
      createdAt: '2026-10-01T12:00:00Z',
      summary: 'Permission recorded for Harbor House.',
      actor: 'Owner',
    }],
    filter: 'authority',
    onFilterChange: () => {},
  });
  assert.match(html, /id="owner-history-filter"/);
  assert.match(html, /value="authority" selected=""/);
  assert.match(html, /Application review, manager permissions, and lease changes are recorded here\./);
  assert.match(html, /Permission recorded for Harbor House\./);
  assert.match(html, /Recorded by Owner/);
});
test('Owner maintenance renders request status and its empty state', async () => {
  const empty = await renderOwnerView('/src/pages/owner/OwnerMaintenanceSection.jsx', 'default', { requests: [] });
  assert.match(empty, /No maintenance requests on record for your properties\./);

  const populated = await renderOwnerView('/src/pages/owner/OwnerMaintenanceSection.jsx', 'default', {
    requests: [{
      id: 'maintenance-1',
      propertyDetails: { title: 'Harbor House' },
      title: 'Leaking kitchen tap',
      status: 'In Progress',
    }],
  });
  assert.match(populated, /Harbor House/);
  assert.match(populated, /Leaking kitchen tap/);
  assert.match(populated, /In Progress/);
});
const emptyBillingProps = {
  metrics: { rentInvoiced: 0, rentCollected: 0, outstandingBalance: 0, paymentsAwaitingReview: 0 },
  invoices: [],
  payments: [],
  paymentCount: 0,
  paymentPage: 1,
  paymentPageCount: 1,
  onPaymentPageChange: () => {},
};

test('Owner billing displays current invoice totals and empty states', async () => {
  const populated = await renderOwnerView('/src/pages/owner/OwnerBillingSection.jsx', 'default', {
    ...emptyBillingProps,
    metrics: { rentInvoiced: 2500, rentCollected: 1000, outstandingBalance: 1500, paymentsAwaitingReview: 2 },
    invoices: [{
      id: 'invoice-1',
      propertyDetails: { title: 'Harbor House' },
      tenantDetails: { name: 'Alex Cruz' },
      totalDue: 1500,
      amountPaid: 500,
      balanceDue: 1000,
      dueDate: '2026-10-20',
      status: 'Overdue',
      pendingPaymentCount: 2,
      isArchived: true,
    }],
  });
  assert.match(populated, /Portfolio rent summary/);
  assert.match(populated, /Rent invoiced/);
  assert.match(populated, /₱2,500\.00/);
  assert.match(populated, /Verified rent collected/);
  assert.match(populated, /₱1,000\.00/);
  assert.match(populated, /Balance outstanding/);
  assert.match(populated, /Harbor House/);
  assert.match(populated, /Alex Cruz/);
  assert.match(populated, /Archived history/);
  assert.match(populated, /₱1,000\.00/);

  const empty = await renderOwnerView('/src/pages/owner/OwnerBillingSection.jsx', 'default', {
    ...emptyBillingProps,
    paymentCount: 120,
    paymentPage: 2,
    paymentPageCount: 3,
  });
  assert.match(empty, /No invoices found for your properties\./);
  assert.match(empty, /No payment transactions recorded for your properties\./);
  assert.match(empty, /Showing 51–100 of 120/);
});

test('only verified Owner payments show acknowledgment download', async () => {
  const html = await renderOwnerView('/src/pages/owner/OwnerBillingSection.jsx', 'default', {
    ...emptyBillingProps,
    payments: [
      {
        id: 'verified-1',
        invoiceDetails: { property: 'Harbor House', tenant: 'Alex Cruz' },
        paymentDate: '2026-10-01',
        amount: 1000,
        paymentMethod: 'Bank transfer',
        referenceNumber: 'REF-100',
        status: 'Verified',
      },
      {
        id: 'pending-1',
        invoiceDetails: { property: 'Harbor House', tenant: 'Alex Cruz' },
        amount: 500,
        status: 'Pending',
        rejectionReason: 'Awaiting review',
      },
    ],
  });
  assert.equal((html.match(/Download PDF/g) || []).length, 1);
  assert.match(html, /Download acknowledgment for payment verified-1/);
  assert.match(html, /Awaiting review/);
});
