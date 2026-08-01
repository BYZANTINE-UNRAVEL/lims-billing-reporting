# Test Master Formula Mode Patch

Updated `src/app/features/masters/masters-page.component.ts`.

- Predefined formulas use a read-only system-managed expression.
- Formula expression is no longer required/validated for predefined formulas.
- eGFR still requires the mapped creatinine (`SCR`) source test.
- Manual formulas still require an expression and at least one mapped source-test variable.
- Manual clear/backspace, test insertion, constants, and symbol builder are hidden while a predefined formula is active.
- Existing eGFR saved structure and calculation key are unchanged.

Build verification could not be completed in the sandbox because dependency installation did not finish within the available command timeout. The edited Angular template and TypeScript logic were inspected directly.
