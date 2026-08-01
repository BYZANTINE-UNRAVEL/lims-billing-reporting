# Commissions module

- Separate Commissions navigation item; Billing UI is unchanged.
- Billing continues to calculate and snapshot item commission silently when a bill is created or updated.
- Consultant Master remains the only place where commission profiles and test/profile exceptions are configured.
- Commission register supports period, consultant, status and text filters.
- Workflow statuses: Pending review, Approved, Held, Paid and Reversed.
- Settlement groups only approved entries belonging to one consultant.
- Cancelled bills appear as Reversed and cannot be approved or paid.
- Settlement history records payment mode, reference number, notes, amount and included item count.
