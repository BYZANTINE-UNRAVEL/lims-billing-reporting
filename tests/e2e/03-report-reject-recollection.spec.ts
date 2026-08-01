import { expect, test } from '@playwright/test';
import { closeLims, collectFirstPendingBill, createBasicBill, enterAndSubmitFirstReport, launchLims, openMenu, resetTransactionData } from './lims-test-utils';

test('reject waiting approval report to pending recollection', async () => {
  const { electronApp, page } = await launchLims();
  try {
    const patient = `Auto Recollect ${Date.now()}`;
    const mobile = `7${String(Date.now()).slice(-9)}`;

    await resetTransactionData(page);
    await createBasicBill(page, patient, mobile, ['CBC']);
    await collectFirstPendingBill(page, patient);
    await enterAndSubmitFirstReport(page, patient);

    await openMenu(page, 'Reporting');
    await page.getByText('Waiting Approval', { exact: true }).first().click();
    await page.getByRole('button', { name: /Reject/i }).first().click();
    await page.getByText(/pending collection|recollect|recollection/i).first().click();
    await page.locator('textarea, input').last().fill('Automation recollection required');
    await page.getByRole('button', { name: /Reject|Confirm|Send/i }).last().click();

    await openMenu(page, 'Collection');
    await page.getByText(/Pending recollection/i).first().click();
    await expect(page.getByText(patient).first()).toBeVisible();
  } finally {
    await closeLims(electronApp);
  }
});
