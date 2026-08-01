# Analytics modal fix

- Replaced the custom viewport-sized Analytics modal with the same modal geometry and stacking pattern used by the Finished Reports action modal.
- Backdrop covers the complete application, including the sidebar.
- Modal uses centered `min(1320px, 94vw)` sizing, `90vh` maximum height, fixed header/meta/footer, and a scrollable body.
- Removed the `calc(100vw - ...)` panel sizing that could push the panel beyond the left edge inside transformed application containers.
- Preserved Analytics detail tables, loading skeletons, light/dark theme variables, Escape close, backdrop close, and body scroll locking.
