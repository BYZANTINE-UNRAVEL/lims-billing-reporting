# Commission modal and confirmation UI update

- Commission Group Master now uses a native top-layer HTML dialog, matching the Analytics full-screen modal behavior.
- The backdrop covers the sidebar, header, and application content.
- The group modal uses full available width/height with fixed header/footer and independently scrollable body.
- Settlement modal also uses the top-layer dialog pattern.
- Native browser/Electron alerts, confirms, and prompts were removed from the Commissions page.
- Archive/delete, discard changes, validation errors, settlement errors, and hold-reason input now use the application's rich themed confirmation UI.
- Light and dark theme variables are preserved.
