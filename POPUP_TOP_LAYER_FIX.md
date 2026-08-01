# Popup top-layer fix

- Converted the shared application confirmation/exit popup from a fixed div to a native modal dialog.
- Converted Commission confirmation/input popups to native modal dialogs.
- Popup order now follows the browser top layer: the most recently opened popup is always above the underlying full-screen modal.
- Exit Application, warnings, archive/delete confirmations, validation messages, and hold-reason prompts no longer depend on z-index to cross a native dialog boundary.
