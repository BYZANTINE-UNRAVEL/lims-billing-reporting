import { expect, test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { api, approveRequest, createBillViaBillingUi, ensureOutsourceVendor, expectReportQueueContains, expectVisibleText, findCollectionForPatient, openLabWorkflow, startCollectionAndSave, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('Outsource Collection component: saves outsource, appears in Outsource, receiving vendor result returns to Reporting Pending Results', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    await ensureOutsourceVendor(page);
    const patient = uniquePatient('E2E Outsource');
    await createBillViaBillingUi(page, patient, uniqueMobile('95'));
    await approveRequest(page, patient);
    await startCollectionAndSave(page, patient, 'OUTSOURCE');

    await openLabWorkflow(page, 'Collection', 'Outsource');
    await expectVisibleText(page, patient);

    const collection = await findCollectionForPatient(page, patient, row => Number(row.outsource_test_count || 0) > 0);
    expect(collection, 'Expected outsourced collection sample').toBeTruthy();
    await api(page, 'receiveOutsourceVendorResult', Number(collection.id), {
      result_status: 'RECEIVED',
      result_value: 'Vendor result received by E2E',
      remarks: 'E2E vendor receive'
    });
    await expectReportQueueContains(page, 'DRAFT', patient);
  } finally {
    await closeLims(electronApp);
  }
});
