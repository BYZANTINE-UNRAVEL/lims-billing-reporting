import { expect, test } from '@playwright/test';
import { approveFirstWaitingReport, closeLims, collectFirstPendingBill, createBasicBill, enterAndSubmitFirstReport, launchLims, resetTransactionData, openMenu } from './lims-test-utils';

test('normal flow: bill -> collection -> result entry -> approval -> approved actions', async () => {
  const { electronApp, page } = await launchLims();
  try {
    const patient = `Auto Patient ${Date.now()}`;
    const mobile = `9${String(Date.now()).slice(-9)}`;

    await resetTransactionData(page);
    await createBasicBill(page, patient, mobile, ['CBC', 'Lipid Profile']);
    await collectFirstPendingBill(page, patient);
    await enterAndSubmitFirstReport(page, patient);
    await approveFirstWaitingReport(page, patient);

    await openMenu(page, 'Reporting');
    await page.getByText('Approved', { exact: true }).first().click();
    await expect(page.getByText(patient).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /PDF/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Print/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Email/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /SMS/i }).first()).toBeVisible();
  } finally {
    await closeLims(electronApp);
  }
});
