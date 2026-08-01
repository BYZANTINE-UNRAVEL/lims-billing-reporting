import { expect, Locator, Page, test } from '@playwright/test';
import { closeLims, dismissExitDialog, launchLims, openMenu, resetTransactionData } from './lims-test-utils';

type AnyRow = Record<string, any>;

test.describe.serial('blueprint workflow: billing registration -> requests -> collection -> reporting', () => {
  test('billing starts at Registration, then patient registration, request approval, cancel pending collection, in-house collection, reporting approval', async () => {
    const { electronApp, page } = await launchLims();
    try {
      await resetTransactionData(page);

      const patient = `E2E Inhouse ${Date.now()}`;
      const mobile = uniqueMobile('91');
      const tests = await chooseBillableTests(page, 1);

      await createBillFromBillingFirstRegistrationStep(page, patient, mobile, tests);
      await expectPendingRequestOnlyApprove(page, patient);

      await approveRequest(page, patient);
      await expectCollectionPending(page, patient);

      await cancelAcceptedPendingCollection(page, patient);
      await expectPendingRequestOnlyApprove(page, patient);

      await approveRequest(page, patient);
      await expectCollectionPending(page, patient);
      await startCollectionAndSave(page, patient, 'INHOUSE');

      await expectReportQueueContains(page, 'DRAFT', patient);
      await enterResultsAndSubmitForApproval(page, patient);
      await expectReportQueueContains(page, 'TYPED', patient);
      await approveWaitingReport(page, patient);
      await expectReportQueueContains(page, 'APPROVED', patient);
    } finally {
      await closeLims(electronApp);
    }
  });

  test('collected in-house sample can be rejected, stays in Collection Rejected, then delete rejected returns to Pending Requests', async () => {
    const { electronApp, page } = await launchLims();
    try {
      await resetTransactionData(page);

      const patient = `E2E Reject ${Date.now()}`;
      const mobile = uniqueMobile('92');
      const tests = await chooseBillableTests(page, 1);

      await createBillFromBillingFirstRegistrationStep(page, patient, mobile, tests);
      await approveRequest(page, patient);
      await startCollectionAndSave(page, patient, 'INHOUSE');

      const collection = await findCollectionForPatient(page, patient, c => String(c.status || '').toUpperCase() !== 'REJECTED');
      expect(collection, 'Expected an active collected in-house sample before rejecting it').toBeTruthy();

      await api(page, 'rejectCollection', Number(collection.id), 'E2E reject collected in-house sample');
      await openLabWorkflow(page, 'Collection', 'Rejected');
      await expectVisibleText(page, patient);
      await expectNoVisibleText(page, /Pending Requests/i, page.locator('tr').filter({ hasText: patient }).first());

      await api(page, 'deleteRejectedCollection', Number(collection.id));
      await openLabWorkflow(page, 'Requests', 'Pending Requests');
      await expectVisibleText(page, patient);
      await expectPendingRequestOnlyApprove(page, patient);
    } finally {
      await closeLims(electronApp);
    }
  });

  test('outsource collection path reaches outsource queue and then reporting after vendor result is received', async () => {
    const { electronApp, page } = await launchLims();
    try {
      await resetTransactionData(page);
      await ensureOutsourceVendor(page);

      const patient = `E2E Outsource ${Date.now()}`;
      const mobile = uniqueMobile('93');
      const tests = await chooseBillableTests(page, 1);

      await createBillFromBillingFirstRegistrationStep(page, patient, mobile, tests);
      await approveRequest(page, patient);
      await startCollectionAndSave(page, patient, 'OUTSOURCE');

      await openLabWorkflow(page, 'Collection', 'Outsource');
      await expectVisibleText(page, patient);

      const collection = await findCollectionForPatient(page, patient, c => Number(c.outsource_test_count || 0) > 0);
      expect(collection, 'Expected outsourced collection sample').toBeTruthy();

      await api(page, 'receiveOutsourceVendorResult', Number(collection.id), {
        result_status: 'RECEIVED',
        result_value: 'Vendor result received by E2E',
        remarks: 'E2E vendor receive'
      });

      await expectReportQueueContains(page, 'DRAFT', patient);
    } finally {
      await closeLims(electronApp);
    }
  });

  test('pending result recheck is separate from pending results, reject recheck restores parent to pending results', async () => {
    const { electronApp, page } = await launchLims();
    try {
      await resetTransactionData(page);

      const patient = `E2E Recheck ${Date.now()}`;
      const mobile = uniqueMobile('94');
      const tests = await chooseBillableTests(page, 1);

      await createBillFromBillingFirstRegistrationStep(page, patient, mobile, tests);
      await approveRequest(page, patient);
      await startCollectionAndSave(page, patient, 'INHOUSE');

      await requestRecheckFromPendingResults(page, patient);
      await expectReportQueueContains(page, 'RECHECK', patient);

      await setReportStatus(page, 'DRAFT');
      await expectNoVisibleText(page, patient);

      await rejectFirstPendingRecheck(page, patient);
      await expectReportQueueContains(page, 'DRAFT', patient);
      await setReportStatus(page, 'RECHECK');
      await expectNoVisibleText(page, patient);
    } finally {
      await closeLims(electronApp);
    }
  });
});

function uniqueMobile(prefix: string) {
  const suffix = String(Date.now()).slice(-8);
  return `${prefix}${suffix}`.slice(0, 10).padEnd(10, '7');
}

async function api<T = any>(page: Page, method: string, ...args: any[]): Promise<T> {
  return await page.evaluate(async ({ method, args }) => {
    const limsApi = (window as any).limsApi;
    if (!limsApi?.[method]) throw new Error(`window.limsApi.${method} is not available`);
    return await limsApi[method](...args);
  }, { method, args });
}

async function chooseBillableTests(page: Page, count: number): Promise<string[]> {
  const tests = await api<AnyRow[]>(page, 'listTests', true);
  const names = tests
    .filter(t => String(t.name || t.test_name || '').trim())
    .map(t => String(t.name || t.test_name).trim())
    .filter(Boolean);
  if (names.length < count) throw new Error(`Need at least ${count} active billable test(s), found ${names.length}`);
  return names.slice(0, count);
}

async function firstVisible(locator: Locator, label: string): Promise<Locator> {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible({ timeout: 500 }).catch(() => false)) return item;
  }
  throw new Error(`No visible locator found for ${label}`);
}

async function clickVisible(locator: Locator, label: string) {
  const item = await firstVisible(locator, label);
  await expect(item).toBeEnabled({ timeout: 20_000 });
  await item.scrollIntoViewIfNeeded().catch(() => {});
  await item.click();
  await dismissExitDialog(locator.page());
}

async function clickVisibleButton(page: Page, name: RegExp | string) {
  await clickVisible(page.getByRole('button', { name }), `button ${String(name)}`);
}

async function clickVisibleTabButton(page: Page, text: RegExp | string) {
  const pattern = typeof text === 'string' ? new RegExp(`^${escapeRegExp(text)}(\\s|$)`, 'i') : text;
  await clickVisible(page.locator('button').filter({ hasText: pattern }), `tab ${String(text)}`);
}

async function expectVisibleText(page: Page, text: RegExp | string) {
  const locator = typeof text === 'string' ? page.getByText(text, { exact: true }) : page.getByText(text);
  const item = await firstVisible(locator, `text ${String(text)}`);
  await expect(item).toBeVisible({ timeout: 20_000 });
}

async function expectNoVisibleText(page: Page, text: RegExp | string, scope?: Locator) {
  const root = scope || page.locator('body');
  const locator = typeof text === 'string' ? root.getByText(text, { exact: true }) : root.getByText(text);
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    expect(await locator.nth(i).isVisible().catch(() => false), `Text should be hidden/absent: ${String(text)}`).toBeFalsy();
  }
}

async function fillVisibleInput(page: Page, locator: Locator, value: string, label: string) {
  const input = await firstVisible(locator, label);
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.fill(value);
}

async function selectVisibleOption(locator: Locator, option: string | { label?: string; value?: string }) {
  const select = await firstVisible(locator, 'select');
  await select.selectOption(option).catch(async () => {
    if (typeof option === 'string') await select.selectOption({ label: option });
    else throw new Error(`Unable to select option ${JSON.stringify(option)}`);
  });
}

async function createBillFromBillingFirstRegistrationStep(page: Page, patientName: string, mobile: string, tests: string[]) {
  await openMenu(page, 'Billing');

  // This is the important first step in Billing: Registration comes before Patient Registration.
  await expectVisibleText(page, /Step 1/i);
  await expectVisibleText(page, /^Registration$/i);
  await selectVisibleOption(page.locator('.registration-type-field select, select').filter({ hasText: /Walk-in|Referral|Camp|Insurance/i }), { label: 'Walk-in' });
  await clickVisibleButton(page, /^Continue$/i);

  await expectVisibleText(page, /Patient Registration/i);
  await clickVisibleButton(page, /New Patient/i).catch(() => {});
  await fillVisibleInput(page, page.locator('input[placeholder="Enter patient name"]'), patientName, 'patient name');
  await selectVisibleOption(page.locator('.gender-field select'), { label: 'Male' });
  await fillVisibleInput(page, page.locator('.age-combo-field input[type="number"]'), '32', 'age');
  await fillVisibleInput(page, page.locator('input[placeholder="Enter mobile number"]'), mobile, 'mobile');
  await clickVisibleButton(page, /^Continue$/i);

  await expectVisibleText(page, /Select Items|Search tests or profiles/i);
  for (const testName of tests) await addBillableItem(page, testName);

  await clickVisibleButton(page, /Continue to Payment/i);
  await expectVisibleText(page, /Payment & Receipt|Create Bill/i);
  await clickVisibleButton(page, /Create Bill/i);

  await waitForApiRow(page, 'listBills', row => String(row.patient_name || row.patient?.name || '').includes(patientName), 30_000);
}

async function addBillableItem(page: Page, testName: string) {
  const search = await firstVisible(
    page.locator('input[name="billItemSearch"], input[placeholder="Search tests or profiles..."], input[placeholder*="Search tests"]'),
    'bill item search'
  );
  await search.click();
  await search.fill(testName);
  await page.waitForTimeout(500);
  await search.press('Enter');
  await page.waitForTimeout(700);

  const selected = page.locator('.selected-test-row, .selected-compact-row, .selected-name').filter({ hasText: new RegExp(escapeRegExp(testName), 'i') }).first();
  if (await selected.isVisible({ timeout: 1000 }).catch(() => false)) return;

  const result = page.locator('.template-result-row, [data-testid="bill-item-suggestion"], .suggestion-row').filter({ hasText: new RegExp(escapeRegExp(testName), 'i') }).first();
  if (await result.isVisible({ timeout: 2000 }).catch(() => false)) {
    await result.click({ force: true });
    await page.waitForTimeout(700);
  }
  await expect(selected).toBeVisible({ timeout: 10_000 });
}

async function openLabWorkflow(page: Page, workflow: 'Requests' | 'Collection' | 'Reporting' | 'Logs', nested?: string) {
  await openMenu(page, 'Collection');
  await clickVisibleTabButton(page, workflow);
  if (nested) await clickVisibleTabButton(page, nested);
  await page.waitForTimeout(700);
}

async function expectPendingRequestOnlyApprove(page: Page, patient: string) {
  await openLabWorkflow(page, 'Requests', 'Pending Requests');
  await expectVisibleText(page, patient);
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await expect(row.getByRole('button', { name: /Approve Request/i })).toBeVisible({ timeout: 20_000 });
  await expectNoVisibleText(page, /Start Collection/i, row);
  await expectNoVisibleText(page, /Recollection Requests/i);
}

async function approveRequest(page: Page, patient: string) {
  await openLabWorkflow(page, 'Requests', 'Pending Requests');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Approve Request/i }), 'Approve Request');
  await waitForApiRow(page, 'listAcceptedCollectionPending', row => String(row.patient_name || '').includes(patient), 30_000);
}

async function expectCollectionPending(page: Page, patient: string) {
  await openLabWorkflow(page, 'Collection', 'Pending');
  await expectVisibleText(page, patient);
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await expect(row.getByRole('button', { name: /Start Collection/i })).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole('button', { name: /Cancel Collection/i })).toBeVisible({ timeout: 20_000 });
}

async function cancelAcceptedPendingCollection(page: Page, patient: string) {
  await openLabWorkflow(page, 'Collection', 'Pending');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Cancel Collection/i }), 'Cancel Collection');
  await waitForApiRow(page, 'listCollectionPending', row => String(row.patient_name || '').includes(patient), 30_000);
}

async function startCollectionAndSave(page: Page, patient: string, mode: 'INHOUSE' | 'OUTSOURCE' | 'BOTH') {
  await openLabWorkflow(page, 'Collection', 'Pending');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Start Collection/i }), 'Start Collection');
  await expectVisibleText(page, /Collect specimen/i);

  await clickVisibleButton(page, /Next: Collection details/i);
  await selectVisibleOption(page.locator('select[name="bulkMode"]'), { value: mode });
  if (mode === 'OUTSOURCE' || mode === 'BOTH') await selectFirstVisibleVendor(page);
  await fillRequiredSpecimenSelects(page);

  await clickVisibleButton(page, /Next: Tubes/i);
  if (await page.getByText(/Specimen type required|Select the actual tube\/specimen/i).first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await clickVisibleButton(page, /Select specimen/i);
    await fillRequiredSpecimenSelects(page);
    await clickVisibleButton(page, /Next: Tubes/i);
  }

  await expectVisibleText(page, /Tubes|containers/i);
  await clickVisibleButton(page, /^Review$/i);
  await expectVisibleText(page, /Review & save|Save collection/i);
  await clickVisibleButton(page, /Save Collection|Save collection/i);

  await waitForApiRow(page, 'listCollections', row => String(row.patient_name || '').includes(patient), 30_000, [{ from: '1900-01-01', to: '2999-12-31' }]);
}

async function fillRequiredSpecimenSelects(page: Page) {
  const selects = page.locator('.compact-collection-design select, .profile-collection-list select, select[name="bulkSpecimenId"]');
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    const select = selects.nth(i);
    if (!(await select.isVisible().catch(() => false))) continue;
    const name = await select.getAttribute('name');
    if (name === 'bulkMode' || /vendor/i.test(name || '')) continue;
    const current = await select.inputValue().catch(() => '');
    if (current && current !== '0' && current !== 'MIXED') continue;
    await selectFirstNonPlaceholderOption(select);
  }
}

async function selectFirstVisibleVendor(page: Page) {
  await ensureOutsourceVendor(page);
  const vendorSelects = page.locator('select').filter({ hasText: /Select vendor|E2E Vendor|Vendor/i });
  const count = await vendorSelects.count();
  for (let i = 0; i < count; i++) {
    const select = vendorSelects.nth(i);
    if (!(await select.isVisible().catch(() => false))) continue;
    await selectFirstNonPlaceholderOption(select);
  }
}

async function selectFirstNonPlaceholderOption(select: Locator) {
  const options = select.locator('option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const value = await option.getAttribute('value');
    const label = ((await option.textContent()) || '').trim();
    if (value && value !== '0' && !/select|mixed|default|not needed/i.test(label)) {
      await select.selectOption(value).catch(() => {});
      return;
    }
  }
}

async function ensureOutsourceVendor(page: Page) {
  const vendors = await api<AnyRow[]>(page, 'listOutsourceVendors');
  if (vendors.some(v => /E2E Vendor/i.test(String(v.name || '')))) return;
  await api(page, 'saveOutsourceVendor', { name: 'E2E Vendor', phone: '9999999999', address: 'E2E', active: 1 });
}

async function setReportStatus(page: Page, status: 'DRAFT' | 'TYPED' | 'RECHECK' | 'APPROVED' | 'CANCELLED' | 'LOG') {
  await openLabWorkflow(page, 'Reporting');
  const label = status === 'DRAFT' ? 'Pending Results' : status === 'TYPED' ? 'Waiting Approval' : status === 'RECHECK' ? 'Pending Rechecks' : status === 'APPROVED' ? 'Approved' : status === 'CANCELLED' ? 'Cancelled' : 'Report log';
  await clickVisibleTabButton(page, label);
}

async function expectReportQueueContains(page: Page, status: 'DRAFT' | 'TYPED' | 'RECHECK' | 'APPROVED', patient: string) {
  await setReportStatus(page, status);
  await expectVisibleText(page, patient);
  const rows = await api<AnyRow[]>(page, 'listReports', status);
  expect(rows.some(r => String(r.patient_name || '').includes(patient)), `Expected ${patient} in report status ${status}`).toBeTruthy();
}

async function enterResultsAndSubmitForApproval(page: Page, patient: string) {
  await setReportStatus(page, 'DRAFT');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Enter Results/i }), 'Enter Results');
  await fillVisibleResultInputs(page);
  await clickVisibleButton(page, /Submit for Approval/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['TYPED']);
}

async function approveWaitingReport(page: Page, patient: string) {
  await setReportStatus(page, 'TYPED');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Verify \/ Approve/i }), 'Verify / Approve');
  await clickVisibleButton(page, /Verify & Approve|Approve Report|^Approve$/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['APPROVED']);
}

async function requestRecheckFromPendingResults(page: Page, patient: string) {
  await setReportStatus(page, 'DRAFT');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Enter Results/i }), 'Enter Results');
  await expectVisibleText(page, /Enter results|Result entry/i);
  await clickVisibleButton(page, /Recheck Selected/i);
  await expectVisibleText(page, /Recheck selected tests/i);
  const reason = await firstVisible(page.locator('textarea[placeholder="Enter recheck reason / remarks"]'), 'recheck reason');
  await reason.fill('E2E pending result recheck request');
  await clickVisibleButton(page, /Save Recheck/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['RECHECK']);
}

async function rejectFirstPendingRecheck(page: Page, patient: string) {
  await setReportStatus(page, 'RECHECK');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Reject recheck/i }), 'Reject recheck');
  await clickVisibleButton(page, /Reject recheck/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['DRAFT']);
}

async function fillVisibleResultInputs(page: Page) {
  const inputs = page.locator('input[type="number"], input.result-input');
  const count = await inputs.count();
  let filled = 0;
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    if (await input.isVisible().catch(() => false)) {
      await input.fill(String(10 + filled));
      filled++;
    }
  }
  if (!filled) {
    const fallback = page.locator('input:not([type="date"]):not([type="search"]):not([disabled])');
    const fallbackCount = await fallback.count();
    for (let i = 0; i < Math.min(fallbackCount, 8); i++) {
      const input = fallback.nth(i);
      if (await input.isVisible().catch(() => false)) await input.fill(String(10 + i));
    }
  }
}

async function findCollectionForPatient(page: Page, patient: string, predicate: (row: AnyRow) => boolean) {
  const rows = await api<AnyRow[]>(page, 'listCollections', { from: '1900-01-01', to: '2999-12-31' });
  return rows.find(row => String(row.patient_name || '').includes(patient) && predicate(row));
}

async function waitForApiRow(page: Page, method: string, predicate: (row: AnyRow) => boolean, timeout = 20_000, args: any[] = []) {
  await expect.poll(async () => {
    const rows = await api<AnyRow[]>(page, method, ...args);
    return rows.some(predicate);
  }, { timeout, intervals: [500, 1000, 1500] }).toBeTruthy();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
