import { expect, test } from '@playwright/test';
import { closeLims, collectFirstPendingBill, createBasicBill, enterAndSubmitFirstReport, launchLims, openMenu, resetTransactionData } from './lims-test-utils';

test('reject waiting approval report to pending recheck and return to approval', async () => {
  const { electronApp, page } = await launchLims();
  try {
    const patient = `Auto Recheck ${Date.now()}`;
    const mobile = `8${String(Date.now()).slice(-9)}`;

    await resetTransactionData(page);
    await createBasicBill(page, patient, mobile, ['CBC']);
    await collectFirstPendingBill(page, patient);
    await enterAndSubmitFirstReport(page, patient);

    await openMenu(page, 'Reporting');
    await page.getByText('Waiting Approval', { exact: true }).first().click();
    await expect(page.getByText(patient).first()).toBeVisible();
    await page.getByRole('button', { name: /Reject/i }).first().click();
    await page.getByText(/Request recheck/i).first().click();
    await page.locator('textarea, input').last().fill('Automation recheck required');
    await page.getByRole('button', { name: /Reject|Confirm|Send/i }).last().click();

    await page.getByText('Pending Rechecks', { exact: true }).first().click();
    await expect(page.getByText(patient).first()).toBeVisible();
    await page.getByRole('button', { name: /Enter Recheck Result/i }).first().click();
    const inputs = page.locator('input[type="number"], input.result-input, input');
    for (let i = 0; i < Math.min(await inputs.count(), 4); i++) {
      const input = inputs.nth(i);
      if (await input.isVisible().catch(() => false)) await input.fill(String(20 + i));
    }
    await page.getByRole('button', { name: /Submit for Approval/i }).first().click();

    await page.getByText('Waiting Approval', { exact: true }).first().click();
    await expect(page.getByText(patient).first()).toBeVisible();
  } finally {
    await closeLims(electronApp);
  }
});
