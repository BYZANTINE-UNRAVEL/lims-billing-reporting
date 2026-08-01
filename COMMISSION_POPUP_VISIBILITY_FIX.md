# Commission popup visibility fix

- Global Exit/Application confirmation dialog is now `display:none` unless the native `<dialog>` has the `open` attribute.
- Commission group, settlement, and rich confirmation dialogs now use the same explicit `[open]` visibility rule.
- Removed unconditional `display:grid` from closed native dialogs.
- Popups still use native `showModal()` and therefore remain above full-screen modals when intentionally opened.
