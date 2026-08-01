# Commission Groups and Formula Implementation

Implemented in the Commissions module without adding any commission UI to Billing.

## Test Master
- `running_cost` is presented as **Test cost**.
- Added **Allow commission** toggle.
- Existing profile cost supports automatic sum of component test costs or manual profile cost.

## Commission Groups
- Create, edit, archive/delete reusable groups.
- Add any number of tests and profiles.
- Assign the group directly to multiple consultants.
- Effective date range, minimum and maximum commission.
- Calculation methods:
  - Percentage of net amount
  - Percentage of profit
  - Percentage of selling price
  - Fixed amount per quantity
  - Custom formula

## Formula engine
- Restricted parser; does not use `eval` or JavaScript expression execution.
- Variables: SELLING_PRICE, NET_AMOUNT, TEST_COST, PROFIT, DISCOUNT, QUANTITY, COLLECTED_AMOUNT, DUE_AMOUNT.
- Functions: MIN, MAX, ABS, ROUND.
- Supports brackets and +, -, *, /.
- Detects unknown tokens, malformed brackets, unsupported functions and division by zero.
- Validate and test button uses sample financial values.

## Rule resolution
1. Existing consultant-specific test/profile exception.
2. Assigned commission group containing the billed test/profile, ordered by priority.
3. Existing consultant default commission profile.
4. Legacy consultant default.
5. No commission.

## Historical protection
Bill items store the commission amount and new snapshot fields:
- formula expression
- evaluated variable values
- commission group id
- rule version
- test/profile cost
- rule source and group name

Changing a group or test cost later does not rewrite old bill-item commission snapshots.
