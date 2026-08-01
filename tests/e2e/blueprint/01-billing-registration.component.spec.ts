import { expect, test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { chooseBillableTests, createBillViaBillingUi, expectBillingRegistrationStepOne, uniqueMobile, uniquePatient, waitForApiRow } from './workflow-component-test-utils';

test('Billing component: Registration is first, then Patient Registration, Select Items, Payment, Create Bill', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    await expectBillingRegistrationStepOne(page);

    const patient = uniquePatient('E2E Billing');
    const mobile = uniqueMobile('91');
    const tests = await chooseBillableTests(page, 1);
    await createBillViaBillingUi(page, patient, mobile, tests);

    await waitForApiRow(page, 'listCollectionPending', row => String(row.patient_name || '').includes(patient), 30_000);
    const pendingRows = await page.evaluate(async (patientName) => {
      const rows = await (window as any).limsApi.listCollectionPending();
      return rows.filter((r: any) => String(r.patient_name || '').includes(patientName));
    }, patient);
    expect(pendingRows.length).toBeGreaterThan(0);
  } finally {
    await closeLims(electronApp);
  }
});
