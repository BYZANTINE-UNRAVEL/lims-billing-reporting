import { test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { approveRequest, cancelAcceptedPendingCollection, createBillViaBillingUi, expectCollectionPending, expectPendingRequestOnlyApprove, expectVisibleText, openLabWorkflow, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('Pending Collection component: defaults to pending/specimen workflow, can cancel before collection, Start Collection opens form', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    const patient = uniquePatient('E2E Pending Collection');
    await createBillViaBillingUi(page, patient, uniqueMobile('93'));

    await approveRequest(page, patient);
    await expectCollectionPending(page, patient);

    await cancelAcceptedPendingCollection(page, patient);
    await expectPendingRequestOnlyApprove(page, patient);

    await approveRequest(page, patient);
    await openLabWorkflow(page, 'Collection', 'Pending');
    await page.locator('tr').filter({ hasText: patient }).first().getByRole('button', { name: /Start Collection/i }).click();
    await expectVisibleText(page, /Collect specimen|Pending tests|Collection details/i);
  } finally {
    await closeLims(electronApp);
  }
});
