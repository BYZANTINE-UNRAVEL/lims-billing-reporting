import { test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { approveRequest, createBillViaBillingUi, expectCollectionPending, expectPendingRequestOnlyApprove, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('Requests component: pending bill has only Approve Request, approval moves it to Collection Pending', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    const patient = uniquePatient('E2E Request');
    await createBillViaBillingUi(page, patient, uniqueMobile('92'));

    await expectPendingRequestOnlyApprove(page, patient);
    await approveRequest(page, patient);
    await expectCollectionPending(page, patient);
  } finally {
    await closeLims(electronApp);
  }
});
