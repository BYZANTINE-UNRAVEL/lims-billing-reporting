# Commission popup z-index fix

- Exit Application overlay remains at `2147483647`.
- Commission rich UI popups now use `2147483646`.
- This keeps commission confirmations above the application and commission full-screen modals, while ensuring the Exit Application overlay always remains the topmost UI layer.
- No native Electron/browser popup was introduced.
