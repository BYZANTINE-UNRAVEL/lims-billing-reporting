import { test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { approveRequest, createBillViaBillingUi, expectReportQueueContains, startCollectionAndSave, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('In-house Collection component: Start Collection saves in-house and creates Reporting Pending Results', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    const patient = uniquePatient('E2E Inhouse');
    await createBillViaBillingUi(page, patient, uniqueMobile('94'));
    await approveRequest(page, patient);
    await startCollectionAndSave(page, patient, 'INHOUSE');
    await expectReportQueueContains(page, 'DRAFT', patient);
  } finally {
    await closeLims(electronApp);
  }
});
