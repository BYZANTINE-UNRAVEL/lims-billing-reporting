import { expect, test } from '@playwright/test';
import { closeLims, launchLims, openMenu } from './lims-test-utils';

test('smoke: main workflow pages open', async () => {
  const { electronApp, page } = await launchLims();
  try {
    await openMenu(page, 'Billing');
    await expect(page.getByText(/Patient Registration/i).first()).toBeVisible();
    await openMenu(page, 'Collection');
    await expect(page.getByText(/Pending Collection|Collection Log/i).first()).toBeVisible();
    await openMenu(page, 'Reporting');
    await expect(page.getByText(/Pending Results|Waiting Approval|Report log/i).first()).toBeVisible();
    await openMenu(page, 'Settings');
    await expect(page.getByText(/Developer \/ Testing tools/i).first()).toBeVisible();
  } finally {
    await closeLims(electronApp);
  }
});
