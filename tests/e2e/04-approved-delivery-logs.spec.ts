import { expect, test } from '@playwright/test';
import { approveFirstWaitingReport, closeLims, collectFirstPendingBill, createBasicBill, enterAndSubmitFirstReport, launchLims, openMenu, resetTransactionData } from './lims-test-utils';

test('approved report delivery actions update reporting log', async () => {
  const { electronApp, page } = await launchLims();
  try {
    const patient = `Auto Delivery ${Date.now()}`;
    const mobile = `6${String(Date.now()).slice(-9)}`;

    await resetTransactionData(page);
    await createBasicBill(page, patient, mobile, ['CBC']);
    await collectFirstPendingBill(page, patient);
    await enterAndSubmitFirstReport(page, patient);
    await approveFirstWaitingReport(page, patient);

    await openMenu(page, 'Reporting');
    await page.getByText('Approved', { exact: true }).first().click();
    await page.getByRole('button', { name: /PDF/i }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Email/i }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /SMS/i }).first().click();
    await page.waitForTimeout(400);

    await page.getByText('Report log', { exact: true }).first().click();
    await page.getByText('Delivery', { exact: true }).first().click();
    await expect(page.getByText(/PDF|Email|SMS/i).first()).toBeVisible();
  } finally {
    await closeLims(electronApp);
  }
});
