# Task 5 report — Settings ready for Vault, Gmail, Microsoft and budget

## RED evidence

- Added `src/components/v2/__tests__/settings-workspace.test.tsx` before the component. The first focused Vitest run failed at the unresolved `../settings-workspace` import.
- After the information architecture passed, added demo-honesty and secret-lifecycle regressions. The focused run failed because no status message or secret editor existed.
- During responsive self-review, added a narrow-width Vault-action regression. It failed because the long replacement button inherited `whitespace-nowrap` and its action group shrank on mobile.
- The brief's `@testing-library/user-event` helper is not installed, so the tests use Testing Library's existing `fireEvent`; no dependency was added.

## GREEN evidence

- Focused command: `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\vitest\vitest.mjs run src/components/v2/__tests__/settings-workspace.test.tsx`
- Focused result: 1 file passed, 4 tests passed.
- Full command: `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\vitest\vitest.mjs run`
- Full result: 50 files passed, 192 tests passed.
- Targeted ESLint completed without diagnostics for all Task 5 source and test files.
- `git diff --check` completed without whitespace errors.
- Repository-wide `tsc --noEmit` remains non-zero because of 12 pre-existing errors in unrelated legacy component/prospecting test fixtures; it reports no Task 5 file.

## Files changed

- `src/components/v2/settings-workspace.tsx`
- `src/components/v2/__tests__/settings-workspace.test.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/lib/v2/repository.ts`
- `src/lib/v2/types.ts`
- `.superpowers/sdd/2026-08-09-local-ux-completion/task-5-report.md`

## Implementation and self-review

- The page retains parallel server-side workspace/settings reads and delegates only interactive configuration state to the client component.
- Full-width, compact responsive sections cover Equipo, Cuentas de correo, Integraciones, Caja fuerte and Presupuesto. Long Vault controls become full-width and wrap below `sm` instead of forcing horizontal overflow.
- Gmail and Microsoft 365 have separate provider rows and connection controls. MiniMax and Hunter each expose Configure and Test controls.
- Provider state is a closed union: `connected`, `not_configured`, `action_required`, and `unavailable`; every state has visible text, so meaning is not color-only.
- The Vault view model contains names, state, and owner capabilities only. No secret value crosses the server/client boundary. Live capabilities are owner-gated; demo mode exposes only inert editing UX.
- Secret editors begin blank, use `autocomplete="new-password"`, clear on close, and never claim persistence. Demo submissions show exactly `Conecta Supabase para guardar este cambio.`
- Budget has an accessible numeric input, labelled progress indicator, current spend, and explicit 80% warning / 100% stop guidance. Its demo submit uses the same honest non-persistence message.
- No Supabase credentials, remote database writes, deployment, or production dependency additions were used.

## Review fix round 1 — provider health, Gmail OAuth and modal focus

### RED evidence

- Added a focused Gmail state suite before the adapter existed. It failed on the missing `settings` state module. The cases cover `ready`, `pending`, `syncing`, `error`, `disconnected`, inactive accounts, unknown statuses, no-account OAuth configuration, mixed-account order and provider aggregation.
- Added live/demo Gmail action regressions before restoring the contract. The live case failed because `Conectar Gmail` remained an inert button instead of the existing `/api/gmail?action=connect` link; the demo case preserved the exact honest non-persistence message.
- Added the secret-dialog focus lifecycle regression before replacing the custom modal. It failed because focus remained on the trigger instead of entering the secret input. The regression also covers the modal accessibility boundary, Escape close and trigger focus restoration.
- Tightened the aggregate expectation during self-review. Its RED run proved that the first implementation let one ready account mask an unavailable or action-required account.

### GREEN evidence

- Focused command: `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\vitest\vitest.mjs run src/lib/v2/__tests__/settings.test.ts src/components/v2/__tests__/settings-workspace.test.tsx`
- Focused result: 2 files passed, 15 tests passed.
- Full command: `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\node_modules\vitest\vitest.mjs run`
- Full result: 51 files passed, 203 tests passed.
- Targeted ESLint and `git diff --check` completed without diagnostics or whitespace errors.
- Repository-wide `tsc --noEmit` still reports only the same 12 unrelated legacy test-fixture errors and no Task 5 file.

### Fixes and self-review

- Gmail accounts are connected only when active with `sync_status = 'ready'`. Active `pending`/`syncing` and unknown states are unavailable; `error`/`disconnected` require action; inactive accounts are unavailable.
- Provider aggregation is order-independent and severity-aware: action required outranks unavailable, unavailable outranks connected, and connected requires all represented accounts to be ready. With no accounts, configured OAuth requires connection action and absent OAuth is not configured.
- `actionHref` is an explicit server-provided mail-provider contract. Live Gmail renders the existing OAuth URL; demo Gmail renders a button and reports exactly `Conecta Supabase para guardar este cambio.` without navigating or claiming persistence. Microsoft remains explicitly unavailable live until its backend exists.
- Replaced the plain `aria-modal` div with the repository's Base UI dialog primitive. It provides modal background isolation and focus trapping; the secret field receives initial focus, Escape closes, focus returns to the originating replacement trigger, and close clears the controlled secret value.
- No real secrets, Supabase writes, remote database access or deployments were used.
