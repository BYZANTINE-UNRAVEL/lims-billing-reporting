import { expect, type Locator, type Page } from '@playwright/test';
import { dismissExitDialog, openMenu } from '../lims-test-utils';

type AnyRow = Record<string, any>;
export type CollectionMode = 'INHOUSE' | 'OUTSOURCE' | 'BOTH';
export type ReportStatus = 'DRAFT' | 'TYPED' | 'RECHECK' | 'APPROVED' | 'CANCELLED' | 'LOG';

export function uniquePatient(prefix: string) {
  return `${prefix} ${Date.now()}`;
}

export function uniqueMobile(prefix = '90') {
  const suffix = String(Date.now()).slice(-8);
  return `${prefix}${suffix}`.slice(0, 10).padEnd(10, '7');
}

export async function api<T = any>(page: Page, method: string, ...args: any[]): Promise<T> {
  return await page.evaluate(async ({ method, args }) => {
    const limsApi = (window as any).limsApi;
    if (!limsApi?.[method]) throw new Error(`window.limsApi.${method} is not available`);
    return await limsApi[method](...args);
  }, { method, args });
}


export async function clickPlain(action: () => Promise<void>): Promise<void> {
  await action();
}

export async function firstVisible(locator: Locator, label: string, timeout = 20_000): Promise<Locator> {
  const started = Date.now();
  let lastCount = 0;
  while (Date.now() - started < timeout) {
    const count = await locator.count().catch(() => 0);
    lastCount = count;
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (await item.isVisible({ timeout: 150 }).catch(() => false)) return item;
    }
    await locator.page().waitForTimeout(250);
  }
  throw new Error(`No visible locator found for ${label}; matched ${lastCount} hidden/attached node(s)`);
}

export async function clickVisible(locator: Locator, label: string) {
  const item = await firstVisible(locator, label);
  await expect(item).toBeEnabled({ timeout: 20_000 });
  await item.scrollIntoViewIfNeeded().catch(() => {});
  await clickPlain(async () => {
    await item.click();
  });
  await dismissExitDialog(locator.page());
}

export async function clickVisibleButton(page: Page, name: RegExp | string) {
  await clickVisible(page.getByRole('button', { name }), `button ${String(name)}`);
}

export async function maybeClickVisibleButton(page: Page, name: RegExp | string) {
  const locator = page.getByRole('button', { name });
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const button = locator.nth(i);
    if (await button.isVisible({ timeout: 250 }).catch(() => false)) {
      if (await button.isEnabled().catch(() => false)) {
        await button.scrollIntoViewIfNeeded().catch(() => {});
        await clickPlain(async () => {
          await button.click();
        });
        await dismissExitDialog(page);
        return true;
      }
    }
  }
  return false;
}

export async function clickVisibleTabButton(page: Page, text: RegExp | string) {
  const pattern = typeof text === 'string' ? new RegExp(`^${escapeRegExp(text)}(\\s|$)`, 'i') : text;
  await clickVisible(page.locator('button').filter({ hasText: pattern }), `tab ${String(text)}`);
}

export async function expectVisibleText(page: Page, text: RegExp | string) {
  const locator = typeof text === 'string' ? page.getByText(text, { exact: true }) : page.getByText(text);
  const item = await firstVisible(locator, `text ${String(text)}`);
  await expect(item).toBeVisible({ timeout: 20_000 });
}

export async function expectNoVisibleText(page: Page, text: RegExp | string, scope?: Locator) {
  const root = scope || page.locator('body');
  const locator = typeof text === 'string' ? root.getByText(text, { exact: true }) : root.getByText(text);
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    expect(await locator.nth(i).isVisible().catch(() => false), `Text should be hidden/absent: ${String(text)}`).toBeFalsy();
  }
}

export async function expectBillingRegistrationStepOne(page: Page) {
  await openMenu(page, 'Billing');

  // The app does not need visible text assertions for "Step 1"; CSS can hide/squeeze that small label.
  // This asserts the real component structure: Billing starts on Registration before Patient Registration.
  await expect(page.locator('.registration-flow-stepper .step-tab').nth(0)).toContainText(/Step\s*1[\s\S]*Registration/i);
  await expect(page.locator('.registration-flow-stepper .step-tab').nth(1)).toContainText(/Step\s*2[\s\S]*Patient Registration/i);
  await expect(page.locator('.registration-flow-stepper .step-tab.active')).toContainText(/Registration/i);
  await expect(page.locator('.registration-step')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.patient-step')).toBeHidden({ timeout: 5_000 });
}

export async function chooseBillableTests(page: Page, count: number): Promise<string[]> {
  const tests = await api<AnyRow[]>(page, 'listTests', true);
  const names = tests
    .filter(t => String(t.name || t.test_name || '').trim())
    .map(t => String(t.name || t.test_name).trim())
    .filter(Boolean);
  if (names.length < count) throw new Error(`Need at least ${count} active billable test(s), found ${names.length}`);
  return names.slice(0, count);
}

export async function createBillViaBillingUi(page: Page, patientName: string, mobile: string, tests?: string[]) {
  const selectedTests = tests?.length ? tests : await chooseBillableTests(page, 1);
  await expectBillingRegistrationStepOne(page);

  await selectVisibleOption(page.locator('.registration-type-field select'), { label: 'Walk-in' });
  await clickVisibleButton(page, /^Continue$/i);

  await expect(page.locator('.patient-step')).toBeVisible({ timeout: 20_000 });
  await expectVisibleText(page, /Patient Registration/i);
  await maybeClickVisibleButton(page, /New Patient/i);
  await fillVisibleInput(page.locator('input[placeholder="Enter patient name"]'), patientName, 'patient name');
  await selectVisibleOption(page.locator('.gender-field select'), { label: 'Male' });
  await fillVisibleInput(page.locator('.age-combo-field input[type="number"]'), '32', 'age');
  await fillVisibleInput(page.locator('input[placeholder="Enter mobile number"]'), mobile, 'mobile');
  await clickVisibleButton(page, /^Continue$/i);

  await expect(page.locator('.items-step')).toBeVisible({ timeout: 20_000 });
  await expectVisibleText(page, /Search tests or profiles/i);
  for (const testName of selectedTests) await addBillableItem(page, testName);

  await clickVisibleButton(page, /Continue to Payment/i);
  await expect(page.locator('.payment-step')).toBeVisible({ timeout: 20_000 });
  await expectVisibleText(page, /Payment & Receipt|Create Bill/i);
  await clickVisibleButton(page, /Create Bill/i);

  await waitForApiRow(page, 'listBills', row => String(row.patient_name || row.patient?.name || '').includes(patientName), 30_000);
}

async function addBillableItem(page: Page, testName: string) {
  const escaped = escapeRegExp(testName);
  const search = await firstVisible(
    page.locator('input[name="billItemSearch"], input[placeholder="Search tests or profiles..."], input[placeholder*="Search tests"], input[aria-label*="Search"]'),
    'bill item search'
  );

  // Item add is a simple autocomplete/card selection. Do not wait for or accept dialogs here.
  await search.click();
  await search.fill('');
  await search.fill(testName);

  const selected = page
    .locator('.selected-test-row, .selected-compact-row, .selected-name, .selected-item-card')
    .filter({ hasText: new RegExp(escaped, 'i') })
    .first();

  if (await selected.isVisible({ timeout: 750 }).catch(() => false)) return;

  const suggestion = page
    .locator('.template-result-row, [data-testid="bill-item-suggestion"], .suggestion-row, .mat-mdc-option, mat-option, .bill-item-card, .suggestion-card')
    .filter({ hasText: new RegExp(escaped, 'i') })
    .first();

  await expect(suggestion, `Expected visible billing item suggestion/card for ${testName}`).toBeVisible({ timeout: 10_000 });
  await suggestion.scrollIntoViewIfNeeded().catch(() => {});
  await suggestion.click();

  await expect(selected, `Expected ${testName} to be added to selected bill items`).toBeVisible({ timeout: 10_000 });
}

export async function openLabWorkflow(page: Page, workflow: 'Requests' | 'Collection' | 'Reporting' | 'Logs', nested?: string) {
  await openMenu(page, 'Collection');
  await clickVisibleTabButton(page, workflow);
  if (nested) await clickVisibleTabButton(page, nested);
  await page.waitForTimeout(700);
}

export async function expectPendingRequestOnlyApprove(page: Page, patient: string) {
  await openLabWorkflow(page, 'Requests', 'Pending Requests');
  await expectVisibleText(page, patient);
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await expect(row.getByRole('button', { name: /Approve Request/i })).toBeVisible({ timeout: 20_000 });
  await expectNoVisibleText(page, /Start Collection/i, row);
  await expectNoVisibleText(page, /Recollection Requests/i);
}

export async function approveRequest(page: Page, patient: string) {
  await openLabWorkflow(page, 'Requests', 'Pending Requests');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Approve Request/i }), 'Approve Request');
  await waitForApiRow(page, 'listAcceptedCollectionPending', row => String(row.patient_name || '').includes(patient), 30_000);
}

export async function expectCollectionPending(page: Page, patient: string) {
  await openLabWorkflow(page, 'Collection', 'Pending');
  await expectVisibleText(page, patient);
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await expect(row.getByRole('button', { name: /Start Collection/i })).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole('button', { name: /Cancel Collection/i })).toBeVisible({ timeout: 20_000 });
}

export async function cancelAcceptedPendingCollection(page: Page, patient: string) {
  await openLabWorkflow(page, 'Collection', 'Pending');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Cancel Collection/i }), 'Cancel Collection');
  await waitForApiRow(page, 'listCollectionPending', row => String(row.patient_name || '').includes(patient), 30_000);
}

export async function startCollectionAndSave(page: Page, patient: string, mode: CollectionMode) {
  await openLabWorkflow(page, 'Collection', 'Pending');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Start Collection/i }), 'Start Collection');
  await expectVisibleText(page, /Collect specimen|Pending tests|Collection details/i);

  await maybeClickVisibleButton(page, /Next: Collection details/i);
  const bulkMode = page.locator('select[name="bulkMode"]');
  if (await bulkMode.first().isVisible({ timeout: 1500 }).catch(() => false)) await selectVisibleOption(bulkMode, { value: mode });
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

export async function ensureOutsourceVendor(page: Page) {
  const vendors = await api<AnyRow[]>(page, 'listOutsourceVendors');
  if (vendors.some(v => /E2E Vendor/i.test(String(v.name || '')))) return;
  await api(page, 'saveOutsourceVendor', { name: 'E2E Vendor', phone: '9999999999', address: 'E2E', active: 1 });
}

export async function setReportStatus(page: Page, status: ReportStatus) {
  await openLabWorkflow(page, 'Reporting');
  const label = status === 'DRAFT' ? 'Pending Results' : status === 'TYPED' ? 'Waiting Approval' : status === 'RECHECK' ? 'Pending Rechecks' : status === 'APPROVED' ? 'Approved' : status === 'CANCELLED' ? 'Cancelled' : 'Report log';
  await clickVisibleTabButton(page, label);
}

export async function expectReportQueueContains(page: Page, status: Exclude<ReportStatus, 'CANCELLED' | 'LOG'>, patient: string) {
  await setReportStatus(page, status);
  await expectVisibleText(page, patient);
  const rows = await api<AnyRow[]>(page, 'listReports', status);
  expect(rows.some(r => String(r.patient_name || '').includes(patient)), `Expected ${patient} in report status ${status}`).toBeTruthy();
}

export async function enterResultsAndSubmitForApproval(page: Page, patient: string) {
  await setReportStatus(page, 'DRAFT');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Enter Results/i }), 'Enter Results');
  await fillVisibleResultInputs(page);
  await clickVisibleButton(page, /Submit for Approval/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['TYPED']);
}

export async function approveWaitingReport(page: Page, patient: string) {
  await setReportStatus(page, 'TYPED');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Verify \/ Approve|Verify|Approve/i }), 'Verify / Approve');
  await clickVisibleButton(page, /Verify & Approve|Approve Report|^Approve$/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['APPROVED']);
}

export async function requestRecheckFromPendingResults(page: Page, patient: string) {
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

export async function rejectFirstPendingRecheck(page: Page, patient: string) {
  await setReportStatus(page, 'RECHECK');
  const row = page.locator('tr').filter({ hasText: patient }).first();
  await clickVisible(row.getByRole('button', { name: /Reject recheck/i }), 'Reject recheck');
  await clickVisibleButton(page, /Reject recheck/i);
  await waitForApiRow(page, 'listReports', row => String(row.patient_name || '').includes(patient), 30_000, ['DRAFT']);
}

export async function findCollectionForPatient(page: Page, patient: string, predicate: (row: AnyRow) => boolean) {
  const rows = await api<AnyRow[]>(page, 'listCollections', { from: '1900-01-01', to: '2999-12-31' });
  return rows.find(row => String(row.patient_name || '').includes(patient) && predicate(row));
}

export async function waitForApiRow(page: Page, method: string, predicate: (row: AnyRow) => boolean, timeout = 20_000, args: any[] = []) {
  await expect.poll(async () => {
    const rows = await api<AnyRow[]>(page, method, ...args);
    return rows.some(predicate);
  }, { timeout, intervals: [500, 1000, 1500] }).toBeTruthy();
}

async function fillVisibleInput(locator: Locator, value: string, label: string) {
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
