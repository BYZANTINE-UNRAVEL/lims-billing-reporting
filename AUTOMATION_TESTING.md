# LIMS Automation Testing

This project now includes Playwright automation for the Electron LIMS app.

## Install once

```bash
npm install
npx playwright install
```

## Run all automation tests

```bash
npm run test:e2e
```

## Run with browser visible

```bash
npm run test:e2e:headed
```

## Open Playwright UI runner

```bash
npm run test:e2e:ui
```

## Debug one test

```bash
npm run test:e2e:debug
```

## What the tests cover

The included starter suite is inside `tests/e2e`:

- `01-normal-flow.spec.ts`  
  Billing -> Collection -> Reporting -> Waiting Approval -> Approved -> approved actions visible.

- `02-report-reject-recheck.spec.ts`  
  Reject report from waiting approval -> Pending Rechecks -> enter recheck -> return to waiting approval.

- `03-report-reject-recollection.spec.ts`  
  Reject report from waiting approval -> Pending recollection in Collection.

- `04-approved-delivery-logs.spec.ts`  
  Approved PDF / Email / SMS actions and delivery logs.

- `05-smoke-navigation.spec.ts`  
  Opens Billing, Collection, Reporting, and Settings.

## Notes

These tests launch the real Electron app, not only the Angular page. This is important because the app uses Electron preload APIs such as `window.limsApi`.

The test runner starts Angular at `http://127.0.0.1:4500`, builds the Electron TypeScript files, then launches Electron with Playwright.

If a selector fails because a button label or layout changed, run:

```bash
npm run test:e2e:ui
```

or

```bash
npm run test:e2e:debug
```

Then update the selector in `tests/e2e/lims-test-utils.ts` or the specific `.spec.ts` file.

## Recommended next improvement

For very stable automation, add `data-testid` attributes to important buttons and inputs, for example:

```html
<button data-testid="create-bill-btn">Create Bill</button>
```

Then use:

```ts
await page.getByTestId('create-bill-btn').click();
```

That is more stable than testing by button text when UI labels change.
