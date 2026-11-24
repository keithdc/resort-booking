# Feature implementation

Use this checklist every time you add a guest screen, admin screen, or API capability.

## 1. Name the feature

Use a kebab-case domain name that matches a bounded context, for example:

- `identity`, `property`, `houses`, `inventory`, `extras`, `rates`, `reservations`, `guests`, `payments`, `content`, `reviews`, `reporting`

Do not name features after UI widgets (`calendar-widget`) or HTTP verbs (`get-rooms`).
Property-scoped features must accept `propertyId` (and stay-scoped features `houseId`). Never assume a single property.

## 2. Types first

1. Add or extend **interfaces** in `packages/shared-types` if both a frontend and the API need them.
2. Add app-local **interfaces** under `features/[feature]/models/` only when they are UI-only.
3. **No `any`.** Explicit return types. Object shapes are `interface`; unions are `type`. See `docs/02-coding-standards.md`.

## 3. Persistence

1. Design PostgreSQL tables (constraints, uniqueness, overlap rules).
2. Add a migration under the API (`apps/api` migrations). Sequential and replayable on a fresh install.
3. Add repository methods with parameterized queries.
4. If the flow needs a hold, lock, cache, or job: document Redis key prefixes in the module and implement them in `shared/redis` or the feature service — still persist the durable row in PostgreSQL.

## 4. API module

Create:

- `[feature].module.ts`
- DTOs with validation
- `[feature].controller.ts` (thin)
- `[feature].service.ts` (rules)
- `[feature].repository.ts` (SQL)

Wire the module into the NestJS app module. Add guards so guest tokens cannot call admin routes.

Consistent errors: `{ status: "error", message: string, code?: string }`.

## 5. Frontend feature

In **either** `apps/web` or `apps/admin` (not both unless the story needs two UIs):

```
features/[feature]/
  models/
  services/     # calls apps/api
  hooks/
  components/
  mocks/        # tests only
  index.ts
```

Then add a thin `src/app/.../page.tsx` that renders the feature page component.

If both apps need the same screen patterns, extract MUI wrappers into `packages/ui` — do not copy-paste forms.

## 6. UX requirements (must ship with the feature)

- Loading and empty states
- Clickable list/card → detail
- Form validation + pending submit
- Confirm dialogs for destructive actions
- Snackbar/toast on mutation success/error
- Date pickers enforce check-in ≤ check-out
- Search inputs have a clear button when filled

## 7. Tests (required, not optional)

A feature is not finished without tests. Write them in the same change as the code, covering the happy path, boundaries, error paths, and foreseeable bugs. See `docs/02-coding-standards.md` (Testing).

- API: service rules (availability overlap, expired hold, double book, cancel policy)
- Frontend: hook + critical component interactions
- Mock API/Redis/DB. No live network.

## 8. Lint and leftovers

- Delete unused imports.
- Run the workspace lint for the apps you touched.

## Order of work (do not skip)

models/types → migration → repository → service → controller → frontend service → hook → components → page → tests

## Commands (target; wire these during setup)

- `npm run dev:web` — guest app
- `npm run dev:admin` — admin app
- `npm run dev:api` — NestJS API
- `npm run lint:web` / `lint:admin` / `lint:api`
- `npm run format`
- `npm run test` in the workspace you changed

Until setup lands, treat these names as the contract for scripts in the root `package.json`.
