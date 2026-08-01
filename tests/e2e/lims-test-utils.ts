import { _electron as electron, expect, Page } from '@playwright/test';
import path from 'node:path';

export const projectRoot = process.env.LIMS_E2E_PROJECT_ROOT ? path.resolve(process.env.LIMS_E2E_PROJECT_ROOT) : path.resolve(__dirname, '../..');

const menuIdMap: Record<string, string> = {
  Dashboard: 'dashboard',
  Billing: 'billing',
  Reporting: 'reports',
  Reports: 'reports',
  Masters: 'masters',
  Consultants: 'consultants',
  Operations: 'operations',
  Collection: 'collection',
  Statements: 'statements',
  'Billing & Statements': 'statements',
  'Patient History': 'patients',
  Patients: 'patients',
  Settings: 'settings',
  'Settings & Backup': 'settings'
};

export async function launchLims() {
  const electronMain = path.join(projectRoot, 'dist-electron', 'main.js');
  const electronApp = await electron.launch({
    args: [electronMain],
    cwd: projectRoot,
    env: { ...process.env, LIMS_E2E: '1' }
  });
  const page = await electronApp.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !!(window as any).limsApi, undefined, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await dismissExitDialog(page);
  return { electronApp, page };
}

export async function closeLims(electronApp: Awaited<ReturnType<typeof electron.launch>>) {
  try {
    const proc = electronApp.process();
    if (proc && !proc.killed) {
      proc.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch {}
}

export async function dismissExitDialog(page: Page) {
  const possibleExitText = page.getByText(/close app|exit application|exit app|are you sure.*exit|are you sure.*close/i).first();
  if (await possibleExitText.isVisible({ timeout: 500 }).catch(() => false)) {
    const cancel = page.getByRole('button', { name: /cancel|no|stay/i }).first();
    if (await cancel.isVisible({ timeout: 500 }).catch(() => false)) await cancel.click();
  }
}

export async function clickText(page: Page, text: string | RegExp) {
  await dismissExitDialog(page);
  await page.getByText(text, { exact: typeof text === 'string' }).first().click();
  await dismissExitDialog(page);
}

export async function clickButton(page: Page, name: string | RegExp) {
  await dismissExitDialog(page);
  const button = page.getByRole('button', { name }).filter({ hasNotText: /close app|exit/i }).first();
  await expect(button).toBeVisible();
  await button.click();
  await dismissExitDialog(page);
}

export async function maybeClickButton(page: Page, name: string | RegExp) {
  await dismissExitDialog(page);
  const buttons = page.getByRole('button', { name }).filter({ hasNotText: /close app|exit/i });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      if (await btn.isEnabled().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click();
        await page.waitForTimeout(500);
        await dismissExitDialog(page);
        return true;
      }
    }
  }
  return false;
}

export async function openMenu(page: Page, menu: string) {
  await dismissExitDialog(page);
  const id = menuIdMap[menu] || menu.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Prefer the test hook. It bypasses collapsed/hidden sidebar labels and uses the app's real tab setter.
  const openedByHook = await page.evaluate(async (tabId) => {
    const hook = (window as any).__limsE2e;
    if (!hook?.openTab) return false;
    return await hook.openTab(tabId);
  }, id).catch(() => false);

  if (!openedByHook) {
    const byTestId = page.getByTestId(`nav-${id}`).first();
    if (await byTestId.isVisible({ timeout: 2000 }).catch(() => false)) {
      await byTestId.click();
    } else {
      const exact = page.getByText(menu, { exact: true }).first();
      if (await exact.isVisible({ timeout: 1000 }).catch(() => false)) await exact.click();
      else await page.getByText(new RegExp(`^${menu}$`, 'i')).first().click();
    }
  }

  await page.waitForTimeout(500);
  await dismissExitDialog(page);
}

export async function resetTransactionData(page: Page) {
  await page.waitForFunction(() => !!(window as any).__limsE2e?.resetWorkflowData, undefined, { timeout: 30_000 });
  const result = await page.evaluate(async () => await (window as any).__limsE2e.resetWorkflowData());
  if (!result?.ok) throw new Error(`E2E reset failed: ${result?.error || 'unknown error'}`);
  await page.waitForTimeout(1000);
  await dismissExitDialog(page);
}

export async function fillByLabelOrPlaceholder(page: Page, labelOrPlaceholder: string | RegExp, value: string) {
  const byLabel = page.getByLabel(labelOrPlaceholder).first();
  if (await byLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
    await byLabel.fill(value);
    return;
  }
  const byPlaceholder = page.getByPlaceholder(labelOrPlaceholder).first();
  if (await byPlaceholder.isVisible({ timeout: 1000 }).catch(() => false)) {
    await byPlaceholder.fill(value);
    return;
  }
  throw new Error(`Input not found: ${labelOrPlaceholder}`);
}

async function addBillItemBySearch(page: Page, testName: string) {
  const search = page.getByPlaceholder(/Search or click for suggestions/i).first();
  await expect(search).toBeVisible();
  await search.click();
  await search.fill(testName);
  await page.waitForTimeout(500);

  // Prefer keyboard Enter because the suggestion list uses pointer/mousedown handlers
  // and can re-render while Playwright is clicking the small text node.
  // Enter calls the app's real addFirstMatch() handler and avoids intercepted pointer events.
  await search.press('Enter');
  await page.waitForTimeout(500);

  const selectedItem = page.locator('.selected-compact-row, .selected-name').filter({ hasText: new RegExp(testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
  if (await selectedItem.isVisible({ timeout: 1000 }).catch(() => false)) return;

  // Fallback 1: click the stable suggestion row/container, not the inner <small> text.
  const row = page.locator('[data-testid="bill-item-suggestion"], .suggestion-row').filter({ hasText: new RegExp(testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
  if (await row.isVisible({ timeout: 1500 }).catch(() => false)) {
    await row.dispatchEvent('pointerdown');
    await row.dispatchEvent('mousedown');
    await page.waitForTimeout(500);
    if (await selectedItem.isVisible({ timeout: 1000 }).catch(() => false)) return;
    await row.click({ force: true });
    await page.waitForTimeout(500);
    if (await selectedItem.isVisible({ timeout: 1000 }).catch(() => false)) return;
  }

  // Fallback 2: the Add button runs the same first-match logic.
  await clickButton(page, /^Add$/i);
  await page.waitForTimeout(500);
}

export async function createBasicBill(page: Page, patientName: string, mobile: string, tests: string[] = ['CBC', 'Lipid Profile']) {
  await openMenu(page, 'Billing');
  await fillByLabelOrPlaceholder(page, /Patient name/i, patientName);
  await fillByLabelOrPlaceholder(page, /Mobile/i, mobile);
  await clickButton(page, /Continue to Test Selection/i);
  for (const testName of tests) {
    await addBillItemBySearch(page, testName);
  }
  await clickButton(page, /Continue to Payment/i);
  await clickButton(page, /Create Bill/i);
  await page.waitForTimeout(1500);
  await dismissExitDialog(page);
}


async function selectFirstOptionsForVisibleSpecimenSelects(page: Page) {
  const selects = page.locator('select').filter({ has: page.locator('option') });
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    const select = selects.nth(i);
    if (!(await select.isVisible().catch(() => false))) continue;
    const current = await select.inputValue().catch(() => '');
    if (current && current !== '0') continue;
    const options = select.locator('option');
    const optionCount = await options.count();
    for (let j = 0; j < optionCount; j++) {
      const option = options.nth(j);
      const value = await option.getAttribute('value');
      const label = ((await option.textContent()) || '').trim();
      if (value && value !== '0' && !/select/i.test(label)) {
        await select.selectOption(value).catch(() => {});
        break;
      }
    }
  }
}

async function saveVisibleCollectionForm(page: Page) {
  // The collection UI is a 4-step workflow. Manual testing works because users go:
  // Collection details -> Tubes -> Review -> Save. Automation must do the same.
  await maybeClickButton(page, /Next: Collection details/i);
  await selectFirstOptionsForVisibleSpecimenSelects(page);

  // If required specimen prompt appears, close it, select visible first options, and continue.
  const specimenPrompt = page.getByText(/Specimen type required|Select the actual tube\/specimen/i).first();
  if (await specimenPrompt.isVisible({ timeout: 800 }).catch(() => false)) {
    await maybeClickButton(page, /Select specimen/i);
    await selectFirstOptionsForVisibleSpecimenSelects(page);
  }

  await maybeClickButton(page, /Next: Tubes/i);
  if (await specimenPrompt.isVisible({ timeout: 800 }).catch(() => false)) {
    await maybeClickButton(page, /Select specimen/i);
    await selectFirstOptionsForVisibleSpecimenSelects(page);
    await maybeClickButton(page, /Next: Tubes/i);
  }

  await expect(page.getByText(/Tubes \/ containers needed|Tubes/i).first()).toBeVisible({ timeout: 20_000 });
  await maybeClickButton(page, /^Review$/i);
  await expect(page.getByText(/Review & save|Specimens to create|Save collection/i).first()).toBeVisible({ timeout: 20_000 });

  const saved = await maybeClickButton(page, /Save Collection|Save collection/i);
  if (!saved) {
    const submitButtons = page.locator('form button[type="submit"], button[type="submit"]');
    const count = await submitButtons.count();
    for (let i = 0; i < count; i++) {
      const submit = submitButtons.nth(i);
      if (await submit.isVisible().catch(() => false)) {
        await expect(submit).toBeEnabled({ timeout: 10_000 });
        await submit.click();
        break;
      }
    }
  }
}

export async function collectFirstPendingBill(page: Page, patientName: string) {
  await openMenu(page, 'Collection');
  await expect(page.getByText(patientName).first()).toBeVisible({ timeout: 20_000 });
  await clickButton(page, /^Collect$/i);

  await expect(page.getByText(/Collect specimen|Pending tests|Collection details/i).first()).toBeVisible({ timeout: 20_000 });
  await saveVisibleCollectionForm(page);

  // Wait for the collection workflow to close or move away from the collect form.
  await page.waitForTimeout(1500);
  await dismissExitDialog(page);

  // Do not let the test proceed silently if collection did not create report-ready items.
  await openMenu(page, 'Reporting');
  await clickText(page, 'Pending Results');
  await expect(page.getByText(patientName).first()).toBeVisible({ timeout: 30_000 });
}

export async function enterAndSubmitFirstReport(page: Page, patientName: string) {
  await openMenu(page, 'Reporting');
  await clickText(page, 'Pending Results');
  await expect(page.getByText(patientName).first()).toBeVisible();
  await clickButton(page, /Enter Results/i);
  const resultInputs = page.locator('input[type="number"], input.result-input');
  const count = await resultInputs.count();
  for (let i = 0; i < Math.min(count, 8); i++) {
    const input = resultInputs.nth(i);
    if (await input.isVisible().catch(() => false)) await input.fill(String(10 + i));
  }
  if (count === 0) {
    const visibleInputs = page.locator('input:not([type="date"]):not([type="search"])');
    const fallbackCount = await visibleInputs.count();
    for (let i = 0; i < Math.min(fallbackCount, 8); i++) {
      const input = visibleInputs.nth(i);
      if (await input.isVisible().catch(() => false)) await input.fill(String(10 + i));
    }
  }
  await clickButton(page, /Submit for Approval/i);
  await page.waitForTimeout(1500);
  await dismissExitDialog(page);
}

export async function approveFirstWaitingReport(page: Page, patientName: string) {
  await openMenu(page, 'Reporting');
  await clickText(page, 'Waiting Approval');
  await expect(page.getByText(patientName).first()).toBeVisible();
  await clickButton(page, /Verify \/ Approve|Verify|Approve/i);
  await page.waitForTimeout(500);
  await clickButton(page, /^Approve$|Approve Report|Verify & Approve/i);
  await page.waitForTimeout(1500);
  await dismissExitDialog(page);
}
