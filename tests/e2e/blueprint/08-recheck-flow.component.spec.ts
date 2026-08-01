import { test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { approveRequest, createBillViaBillingUi, expectNoVisibleText, expectReportQueueContains, rejectFirstPendingRecheck, requestRecheckFromPendingResults, setReportStatus, startCollectionAndSave, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('Recheck component: child recheck stays in Pending Rechecks, not normal Pending Results, and Reject Recheck restores parent', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    const patient = uniquePatient('E2E Recheck');
    await createBillViaBillingUi(page, patient, uniqueMobile('98'));
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
