import { expect, test } from '@playwright/test';
import { closeLims, launchLims, resetTransactionData } from '../lims-test-utils';
import { api, approveRequest, createBillViaBillingUi, expectNoVisibleText, expectPendingRequestOnlyApprove, expectVisibleText, findCollectionForPatient, openLabWorkflow, startCollectionAndSave, uniqueMobile, uniquePatient } from './workflow-component-test-utils';

test('Rejected Collection component: collected sample reject stays in Rejected, not Pending Collection; delete rejected returns to Pending Requests', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await resetTransactionData(page);
    const patient = uniquePatient('E2E Rejected Collection');
    await createBillViaBillingUi(page, patient, uniqueMobile('97'));
    await approveRequest(page, patient);
    await startCollectionAndSave(page, patient, 'INHOUSE');

    const collection = await findCollectionForPatient(page, patient, row => String(row.status || '').toUpperCase() !== 'REJECTED');
    expect(collection, 'Expected an active collected in-house sample before rejecting it').toBeTruthy();
    await api(page, 'rejectCollection', Number(collection.id), 'E2E reject collected in-house sample');

    await openLabWorkflow(page, 'Collection', 'Rejected');
    await expectVisibleText(page, patient);
    const rejectedRow = page.locator('tr').filter({ hasText: patient }).first();
    await expectNoVisibleText(page, /Cancel Collection/i, rejectedRow);

    await openLabWorkflow(page, 'Collection', 'Pending');
    await expectNoVisibleText(page, patient);

    await api(page, 'deleteRejectedCollection', Number(collection.id));
    await expectPendingRequestOnlyApprove(page, patient);
  } finally {
    await closeLims(electronApp);
  }
});
