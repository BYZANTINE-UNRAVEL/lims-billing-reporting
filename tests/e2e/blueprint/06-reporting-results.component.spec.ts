import { test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { approveRequest, approveWaitingReport, createBillViaBillingUi, enterResultsAndSubmitForApproval, expectReportQueueContains, startCollectionAndSave, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('Reporting component: Pending Results -> Result Entry -> Waiting Approval -> Approved', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    const patient = uniquePatient('E2E Reporting');
    await createBillViaBillingUi(page, patient, uniqueMobile('96'));
    await approveRequest(page, patient);
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
