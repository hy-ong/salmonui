## What and why

<!-- What does this change, and which issue does it address? -->

## Checks

This repository has no hosted CI, so please run the relevant checks locally
(see CONTRIBUTING.md) and tick what you ran:

- [ ] `npm run build` and `npm run typecheck`
- [ ] `npm run test:unit` (and `npm run test:ssr` for rendering changes)
- [ ] `npm run test:browser` / `npm run test:a11y` for UI changes
- [ ] `npm run bundle:check` (budgets are never raised; optimize instead)
- [ ] Docs page and demo updated for user-facing changes
- [ ] A changeset (`npx changeset`) for changes to published packages
