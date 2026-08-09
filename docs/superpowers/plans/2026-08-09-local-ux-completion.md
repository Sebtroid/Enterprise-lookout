# Enterprise Lookout V2 Local UX Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar la experiencia local de Enterprise Lookout V2 con navegación, filtros, búsqueda, correo responsive y una Configuración lista para Vault, Gmail, Microsoft 365 y presupuesto, sin depender todavía de una base Supabase activa.

**Architecture:** Mantener App Router y el lenguaje visual teal/navy existente. Las páginas servidor seguirán obteniendo snapshots; componentes cliente pequeños manejarán filtros y estados transitorios. Todo comportamiento persistente conservará contratos separados para conectarlo a Supabase después, sin simular que datos demo fueron guardados remotamente.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Lucide, Vitest y Testing Library.

## Global Constraints

- Interfaz en español, zona horaria `America/Santiago` y CLP por defecto.
- Mantener el lenguaje visual sobrio teal/navy existente.
- El trabajo de este plan debe funcionar con datos demo y no requiere credenciales Supabase.
- Ningún control puede afirmar que persistió un secreto o presupuesto cuando la base no está conectada.
- Primeros correos siempre requieren aprobación; la interfaz nunca envía automáticamente.
- En móvil se priorizan aprobación, respuesta, tareas y consulta, sin overflow horizontal oculto.
- Toda interacción nueva debe tener nombre accesible, foco visible y un estado que no dependa únicamente del color.
- Las consultas independientes de Server Components deben permanecer paralelas.
- No añadir dependencias de producción.

---

### Task 1: Base UX compartida y texto español correcto

**Files:**
- Create: `src/components/v2/segmented-control.tsx`
- Create: `src/components/v2/empty-state.tsx`
- Create: `src/components/v2/__tests__/segmented-control.test.tsx`
- Modify: `src/components/v2/*.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/mobile-nav.tsx`
- Modify: `src/lib/v2/types.ts`
- Modify: `src/lib/v2/demo-data.ts`
- Modify: `src/app/(dashboard)/**/*.tsx`

**Interfaces:**
- Produces: `SegmentedControl<T extends string>({ label, value, options, onChange })`.
- Produces: `EmptyState({ icon, title, description, action })`.
- All visible source strings must be valid UTF-8 Spanish: `Configuración`, `Investigación`, `José Miguel`, `Última interacción`, `aprobación`.

- [ ] **Step 1: Write the failing segmented-control test**

```tsx
it("announces and changes the active option", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<SegmentedControl label="Filtrar proyectos" value="all" options={[{ value: "all", label: "Todos" }, { value: "shared", label: "Compartidos" }]} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Compartidos" }));
  expect(onChange).toHaveBeenCalledWith("shared");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- src/components/v2/__tests__/segmented-control.test.tsx`

Expected: FAIL because `SegmentedControl` does not exist.

- [ ] **Step 3: Implement the shared primitives**

Implement a labelled group with `aria-pressed`, keyboard-native buttons, compact wrapping and the existing `primary/muted/border` tokens. Implement `EmptyState` as a semantic section with optional icon and action.

- [ ] **Step 4: Normalize corrupted Spanish source strings**

Replace mojibake sequences such as `Ã³`, `Ã©`, `Ã±`, `Ãš`, `Â·` and `â€¢` with their intended UTF-8 characters in V2 screens, navigation, demo data and V2 types. Verify the affected files are stored as UTF-8.

- [ ] **Step 5: Run focused and inherited tests**

Run: `pnpm test -- src/components/v2/__tests__/segmented-control.test.tsx src/components/__tests__/app-sidebar.test.tsx`

Expected: PASS with no React accessibility warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/v2 src/components/app-sidebar.tsx src/components/mobile-nav.tsx src/lib/v2 src/app
git commit -m "feat: establish accessible V2 UX primitives"
```

---

### Task 2: Hoy y Proyectos con filtros reales

**Files:**
- Modify: `src/components/v2/today-view.tsx`
- Modify: `src/components/v2/projects-view.tsx`
- Create: `src/components/v2/__tests__/today-view.test.tsx`
- Create: `src/components/v2/__tests__/projects-view.test.tsx`

**Interfaces:**
- `TodayView` filters attention by `mine`, `shared`, or teammate name using the current user, item owner and matching project access.
- `ProjectsView` filters by `all`, `mine`, `shared`, or teammate name using `ownerName` and `accessMode`.

- [ ] **Step 1: Write failing Today filter tests**

```tsx
it("shows only José Miguel attention after selecting his filter", async () => {
  const user = userEvent.setup();
  render(<TodayView snapshot={v2DemoSnapshot} />);
  await user.click(screen.getByRole("button", { name: "José Miguel" }));
  expect(screen.getByText("Soprole respondió")).toBeVisible();
  expect(screen.queryByText("4 candidatos listos para aprobar")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify Today test RED**

Run: `pnpm test -- src/components/v2/__tests__/today-view.test.tsx`

Expected: FAIL because the existing filter buttons do not change content.

- [ ] **Step 3: Implement Today client filtering**

Convert only `TodayView` to a client component. Derive counts and rows from the selected scope, preserve the two-column desktop layout, and show `EmptyState` when a scope has no attention items.

- [ ] **Step 4: Write failing Projects filter tests**

```tsx
it("filters personal projects owned by the teammate", async () => {
  const user = userEvent.setup();
  render(<ProjectsView projects={v2DemoSnapshot.projects} currentUser="Sebastián" teammates={["José Miguel"]} />);
  await user.click(screen.getByRole("button", { name: "José Miguel" }));
  expect(screen.getByText("Pastoral Invierno 2026")).toBeVisible();
  expect(screen.queryByText("Bienvenida novatos 2027")).not.toBeInTheDocument();
});
```

- [ ] **Step 5: Verify Projects test RED, implement and verify GREEN**

Run before implementation: `pnpm test -- src/components/v2/__tests__/projects-view.test.tsx`

Expected before implementation: FAIL because `ProjectsView` lacks the user context and state.

Update the projects page to pass `currentUser` and `teammates`, implement the segmented filter, and then run the same command expecting PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/v2/today-view.tsx src/components/v2/projects-view.tsx src/components/v2/__tests__ src/app/'(dashboard)'/projects/page.tsx
git commit -m "feat: make workspace attention filters actionable"
```

---

### Task 3: Empresas y Contactos con búsqueda operativa

**Files:**
- Create: `src/components/v2/companies-directory.tsx`
- Create: `src/components/v2/contacts-directory.tsx`
- Create: `src/components/v2/__tests__/companies-directory.test.tsx`
- Create: `src/components/v2/__tests__/contacts-directory.test.tsx`
- Modify: `src/app/(dashboard)/companies/page.tsx`
- Modify: `src/app/(dashboard)/contacts/page.tsx`

**Interfaces:**
- `CompaniesDirectory({ companies })` searches normalized name, domain, industry, contact and project names.
- `ContactsDirectory({ contacts })` searches normalized name, company, role and email.
- Search must ignore case and Spanish diacritics through a shared local `normalizeSearchText(value: string): string` helper.

- [ ] **Step 1: Write the failing company search test**

```tsx
it("finds a company without requiring accents or exact case", async () => {
  const user = userEvent.setup();
  render(<CompaniesDirectory companies={v2DemoSnapshot.companies} />);
  await user.type(screen.getByRole("searchbox", { name: "Buscar empresas" }), "preferida");
  expect(screen.getByText("La Preferida")).toBeVisible();
  expect(screen.queryByText("Soprole")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED and implement company directory**

Run: `pnpm test -- src/components/v2/__tests__/companies-directory.test.tsx`

Expected before implementation: FAIL because the directory component does not exist. Implement it using the current table anatomy on desktop and stacked labelled rows on mobile.

- [ ] **Step 3: Write the failing contact search test**

```tsx
it("searches contacts by role and exposes a clear empty state", async () => {
  const user = userEvent.setup();
  render(<ContactsDirectory contacts={v2DemoSnapshot.contacts} />);
  await user.type(screen.getByRole("searchbox", { name: "Buscar contactos" }), "asuntos corporativos");
  expect(screen.getByText("Martín Silva")).toBeVisible();
  await user.clear(screen.getByRole("searchbox", { name: "Buscar contactos" }));
  await user.type(screen.getByRole("searchbox", { name: "Buscar contactos" }), "sin coincidencias");
  expect(screen.getByText("No encontramos contactos")).toBeVisible();
});
```

- [ ] **Step 4: Verify RED, implement and run both tests GREEN**

Run: `pnpm test -- src/components/v2/__tests__/companies-directory.test.tsx src/components/v2/__tests__/contacts-directory.test.tsx`

Expected after implementation: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/v2/companies-directory.tsx src/components/v2/contacts-directory.tsx src/components/v2/__tests__ src/app/'(dashboard)'/companies/page.tsx src/app/'(dashboard)'/contacts/page.tsx
git commit -m "feat: add searchable CRM directories"
```

---

### Task 4: Correo unificado responsive y accionable

**Files:**
- Modify: `src/components/v2/mail-workspace.tsx`
- Create: `src/components/v2/__tests__/mail-workspace.test.tsx`
- Modify: `src/lib/v2/types.ts`
- Modify: `src/lib/v2/demo-data.ts`

**Interfaces:**
- Add `provider: "gmail" | "microsoft"` to `V2InboxThread`.
- Mail filters: `all`, `unread`, `drafts`.
- Account filter uses the exact account email or `all`.
- Sender selector appears only when two or more eligible accounts exist.

- [ ] **Step 1: Write failing filter and sender tests**

```tsx
it("filters unread conversations and identifies Microsoft accounts", async () => {
  const user = userEvent.setup();
  render(<MailWorkspace threads={v2DemoSnapshot.threads} />);
  await user.click(screen.getByRole("button", { name: "No leídas" }));
  expect(screen.getByText("Soprole")).toBeVisible();
  expect(screen.queryByText("PF Alimentos")).not.toBeInTheDocument();
  expect(screen.getByText("Microsoft 365")).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- src/components/v2/__tests__/mail-workspace.test.tsx`

Expected: FAIL because filters are inert and provider metadata does not exist.

- [ ] **Step 3: Implement filters and responsive states**

Keep the three-column layout at `lg`. Below `lg`, show a conversation selector and stack the AI context below the thread/editor. Ensure selecting a thread updates draft state, active account badge and mobile list visibility. Add explicit busy labels to approve, request change and send actions.

- [ ] **Step 4: Add approval regression test**

```tsx
it("requires approval before exposing the send action", async () => {
  const user = userEvent.setup();
  render(<MailWorkspace threads={v2DemoSnapshot.threads} initialThreadId="thread-pf" />);
  expect(screen.queryByRole("button", { name: "Enviar ahora" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Aprobar borrador" }));
  expect(screen.getByRole("button", { name: "Enviar ahora" })).toBeVisible();
});
```

- [ ] **Step 5: Run focused tests GREEN**

Run: `pnpm test -- src/components/v2/__tests__/mail-workspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/v2/mail-workspace.tsx src/components/v2/__tests__/mail-workspace.test.tsx src/lib/v2/types.ts src/lib/v2/demo-data.ts
git commit -m "feat: complete responsive unified inbox UX"
```

---

### Task 5: Configuración lista para Vault, Gmail, Microsoft y presupuesto

**Files:**
- Create: `src/components/v2/settings-workspace.tsx`
- Create: `src/components/v2/__tests__/settings-workspace.test.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/lib/v2/repository.ts`
- Modify: `src/lib/v2/types.ts`

**Interfaces:**
- `SettingsWorkspace({ settings, budget, isDemo })` renders Team, Mail, Integrations, Vault and Budget sections.
- Provider states: `connected`, `not_configured`, `action_required`, `unavailable`.
- Demo submission returns the visible message `Conecta Supabase para guardar este cambio.` and never claims persistence.
- Secret inputs remain blank after closing and use `autocomplete="new-password"`.

- [ ] **Step 1: Write failing settings information-architecture test**

```tsx
it("shows Gmail, Microsoft 365, integrations, Vault and budget", () => {
  render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);
  expect(screen.getByRole("heading", { name: "Cuentas de correo" })).toBeVisible();
  expect(screen.getByText("Microsoft 365")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Integraciones" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Caja fuerte" })).toBeVisible();
  expect(screen.getByLabelText("Presupuesto mensual de MiniMax en USD")).toHaveValue(5);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- src/components/v2/__tests__/settings-workspace.test.tsx`

Expected: FAIL because `SettingsWorkspace` does not exist.

- [ ] **Step 3: Implement the settings workspace shell**

Build full-width sections with compact rows instead of equal card grids. Gmail and Microsoft have distinct provider labels and connection buttons. MiniMax and Hunter expose Configure/Test actions. Vault lists the Supabase database password and external provider secrets by status, with owner-only Reveal/Replace controls represented in the view model. Budget uses a labelled numeric field, progress bar and 80%/100% explanation.

- [ ] **Step 4: Write and pass the demo honesty test**

```tsx
it("does not pretend to persist settings in demo mode", async () => {
  const user = userEvent.setup();
  render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);
  await user.clear(screen.getByLabelText("Presupuesto mensual de MiniMax en USD"));
  await user.type(screen.getByLabelText("Presupuesto mensual de MiniMax en USD"), "8");
  await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }));
  expect(screen.getByRole("status")).toHaveTextContent("Conecta Supabase para guardar este cambio.");
});
```

Run: `pnpm test -- src/components/v2/__tests__/settings-workspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/v2/settings-workspace.tsx src/components/v2/__tests__/settings-workspace.test.tsx src/app/'(dashboard)'/settings/page.tsx src/lib/v2/repository.ts src/lib/v2/types.ts
git commit -m "feat: prepare settings UX for Vault and Microsoft"
```

---

### Task 6: Navegación, sala de proyecto y verificación visual

**Files:**
- Modify: `src/components/mobile-nav.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/v2/project-room.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/__tests__/app-sidebar.test.tsx`
- Create: `src/components/v2/__tests__/project-room.test.tsx`

**Interfaces:**
- Mobile navigation closes after navigation and exposes the active destination through `aria-current`.
- Project tabs remain horizontally scrollable only as an explicitly visible tab strip; operational content never requires horizontal scrolling.
- Unsupported project tabs render a specific empty state instead of reusing Summary.

- [ ] **Step 1: Write the failing project-tab test**

```tsx
it("renders a specific state for activity instead of the summary panel", () => {
  render(<ProjectRoom project={v2DemoSnapshot.projects[0]} companies={v2DemoSnapshot.companies} activeTab="activity" />);
  expect(screen.getByText("La actividad aparecerá aquí")).toBeVisible();
  expect(screen.queryByText("Siguiente mejor acción")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED and implement explicit tab states**

Run: `pnpm test -- src/components/v2/__tests__/project-room.test.tsx`

Expected before implementation: FAIL because unsupported tabs currently render Summary.

- [ ] **Step 3: Improve mobile navigation semantics**

Replace the uncontrolled `details` menu with a client-controlled menu button using `aria-expanded`, close on link click and Escape, and retain focus-visible styling.

- [ ] **Step 4: Run all automated verification**

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: all inherited and new tests pass, lint exits 0 and the production build completes.

- [ ] **Step 5: Browser QA at required widths**

Inspect `/today`, `/projects`, `/projects/asado-dieciocho?tab=research`, `/mail`, `/companies`, `/contacts` and `/settings` at 1440x900, 1024x768 and 390x844. Verify: no accidental horizontal overflow; primary actions visible; filters change results; mobile navigation closes; mail switches threads; labels and Spanish accents render correctly; keyboard focus remains visible.

- [ ] **Step 6: Commit**

```bash
git add src/components/mobile-nav.tsx src/components/app-sidebar.tsx src/components/v2/project-room.tsx src/app/globals.css src/components/__tests__ src/components/v2/__tests__
git commit -m "feat: finish responsive V2 navigation and project UX"
```

