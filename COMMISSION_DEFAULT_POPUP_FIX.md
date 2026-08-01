# Commission default popup fix

- Confirmation popup state now has an independent `popupOpen` guard.
- Commission page initialization explicitly resets and closes popup state.
- Closed native dialogs are forced to `display:none`.
- Delayed popup opening is protected with a sequence token to prevent stale timers from reopening it.
- Popup state is reset when leaving the Commissions page.
- Confirmation dialogs open only through explicit actions such as hold, archive/delete, discard, validation errors, and settlement errors.
