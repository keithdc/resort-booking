# Coding standards

Follow these rules when generating or modifying code. Architecture lives in `docs/01-architecture.md`. Feature workflow lives in `docs/03-feature-implementation.md`.

## Tech stack

- Guest: Next.js, React, TypeScript, MUI, App Router (`apps/web`)
- Admin: Next.js, React, TypeScript, MUI, App Router (`apps/admin`)
- API: NestJS, TypeScript, PostgreSQL, Redis (`apps/api`)
- Monorepo: npm workspaces
- Linting: ESLint with `strict-type-checked`
- Formatting: Prettier
- Tests: Vitest + React Testing Library (frontends); Jest or Vitest (API)

## TypeScript (strict — non-negotiable)

`strict: true` in every `tsconfig`. ESLint: `strictTypeChecked` plus `@typescript-eslint/no-explicit-any` as **error**. Treat unused and unsafe `any` as errors, not warnings.

### No `any`

Forbidden everywhere, including tests, mocks, and generated-looking helpers we write:

- `any`, `any[]`, `Promise<any>`, `Record<string, any>`
- `as any`, `as unknown as SomeType` used to dodge checking
- untyped catch: `catch (e: any)`
- ESLint disables for `no-explicit-any` / `no-unsafe-*`

If a value is not typed yet, use **`unknown`** and **narrow** (typeof, in, type guards, Zod/class-validator). JSON from `fetch` is `unknown` until parsed into an interface.

```ts
// BAD
function load(data: any): any {
  return data.house;
}

// GOOD
interface HousePayload {
  id: string;
  name: string;
}

function load(data: unknown): HousePayload {
  // narrow or validate, then return HousePayload
}
```

### `interface` vs `type`

- **`interface` for every object shape:** models, DTOs, API bodies, props, hook results, repository rows.
- **`type` only for:** unions, intersections, mapped/utility types, function types, aliases of primitives (`type HouseId = string`).
- Do not use `type { foo: string }` for a domain object when `interface` works.
- Prop interfaces sit **above** the component: `interface RoomCardProps { ... }`.
- NestJS DTOs are classes for runtime validation, but the **shared contract** is still an `interface` in `packages/shared-types` (or the DTO class implements that interface).

### Also required

- Explicit return types on every function, including arrow callbacks exported from modules.
- `import type { Reservation } from "./reservation"`.
- No `!` non-null assertions unless unavoidable, with a one-line why comment.
- No `// @ts-ignore` or `@ts-expect-error` without a why comment and a ticket; prefer fixing the type.
- `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes` on when we scaffold.

Prisma/Stripe client types: wrap in our interfaces at the module boundary. Do not leak `any` from SDKs into feature code.

## Naming

- Files: kebab-case (`room-card.tsx`)
- Components: PascalCase (`RoomCard`)
- Functions/hooks: camelCase (`useAvailability`)
- Interfaces: PascalCase (`Reservation`)
- Constants: SCREAMING_SNAKE_CASE (`HOLD_TTL_SECONDS`)
- Feature folders: kebab-case (`reservations`)
- NestJS files: dot notation (`reservations.controller.ts`, `reservations.service.ts`)

## Feature modules

1. Each feature is self-contained in its own folder.
2. Public API is the feature `index.ts` (frontends) or Nest module exports (API).
3. Features must not import another feature's internal files.
4. Shared code used by 2+ features in the *same app* goes in that app's `shared/`.
5. Types used by web, admin, and API go in `packages/shared-types`.
6. Create in order: models → services/repository → UI or controller → page/route.
7. **Every new page/feature must have a backend implementation:** routes, service logic, table(s), and migration. No hardcoded/in-memory data. Persist in PostgreSQL.

## Next.js routing

- App Router only. Route files live under `src/app/`.
- `page.tsx` / `layout.tsx` only compose providers and feature page components. No business logic in route files.
- Feature page components live in `features/[feature]/`.
- Use `loading.tsx` and `error.tsx` for route-level async and failure UI.
- Guest routes stay in `apps/web`. Admin routes stay in `apps/admin`.
- Do not put route config in a central `routes.tsx` (that was the Vite CRM pattern).

## React components

- Functional components only.
- Extract logic into custom hooks when a component exceeds ~50 lines.
- Define prop interfaces above the component.
- Keep components pure — side effects go in hooks or services.
- Use MUI for UI. Avoid raw HTML when a MUI equivalent exists.
- Server Components by default in Next.js. Add `"use client"` only for browser interactivity.
- **No business logic in the frontend.** Availability, holds, refunds, rebook fees, and payments are NestJS only. UI calls feature `services/` and renders `data`. Guest `minDate` on a picker is UX; the API still validates.

## File annotations

- Every file starts with a JSDoc block: `@file`, `@feature` or `@shared`, `@dependencies`.
- Every exported function/component gets a one-line JSDoc explaining what it does.
- Use `// --- Section Name ---` for logical sections.
- TODOs: `// TODO(author): description`. Never bare TODOs.
- Comment **why**, not **what**. Keep annotations to 1–2 lines. If you need more, refactor.

## UI/UX

- Design for guests and staff, not developers.
- List/card items are clickable and open a detail view (dialog or page) with all relevant fields.
- Loading: skeletons or spinners for async data.
- Empty states with helpful messaging — never a blank region.
- Spacing, type, and color come from the MUI theme. Buttons and fields: **8px radius** (`docs/06-ui-theme.md`).
- Forms: labels, validation messages, disabled submit while in flight.
- Destructive actions require a confirmation dialog.
- Toast/snackbar for success and error on mutations.
- Keyboard: dialogs trap focus; controls are Tab-reachable.
- Responsive: desktop first, usable on tablet. Guest web must also work on mobile.

## Dark mode

- Never hardcode colors like `grey.50`, `#f8fafc`, `#dbeafe`. Use theme tokens: `background.default`, `background.paper`, `action.hover`, `text.primary`, `text.secondary`, `divider`.
- Custom chips/surfaces: CSS variables such as `var(--background)`, `var(--foreground)`, `var(--border)`.
- Theme mode is owned by each app's theme provider. Toggle a class on `<html>` if using CSS variables.

## Search and date UX

- Search fields always show a clear (×) control when populated.
- Date range **To** must not allow a date before **From** (`min` constraint).
- Checkout / end date cannot be before check-in / start date in any picker.
- Guest search must treat booking dates as the primary filter (nights, not a single calendar day). Guest **count** is a number up to stay capacity — not a list of names.
- **Guest calendars** (`apps/web`): **disable all days before today** (property timezone). Guests cannot pick a past check-in. Also disable **already-booked dates** using the unavailable ranges and `maxCheckOutDate` from the availability API (`docs/04-product-domain.md`). The UI renders what the API returns and never works out overlaps itself. The API still rejects a taken range with `DATES_UNAVAILABLE`.
- **Admin calendars** (`apps/admin`): **do not disable past days or booked days** (bookings are shown with details instead). Staff have full rights (history, blocks, corrections). Guest `minDate` logic must not be reused on admin pickers.
- Search and admin lists are property-aware: guests can search one property or all properties; staff always work inside a selected property unless the screen is the property list.

## API / NestJS

- Controllers are thin — delegate to services.
- Validate every request (class-validator DTOs + ValidationPipe).
- Repositories use parameterized queries or the query builder. No string-concatenated SQL.
- Error body shape: `{ status: "error", message: string, code?: string }`.
- Success mutations may return `{ status: "ok", data: T }`.
- Group HTTP routes by feature module, not by verb.
- **The global ValidationPipe does not convert types** (`enableImplicitConversion: false`, `shared/validation/validation-exception.factory.ts`). A wrong type fails validation instead of becoming a valid value (`"false"` into `true`, `{}` into `"[object Object]"`). So: never put `@Type(() => Number)` or `@Type(() => Boolean)` on a JSON body field (use `@IsInt()`, `@IsNumber()`, `@IsBoolean()` on the raw value); a number that arrives in a **query string** gets `@QueryNumber()` (`shared/validation/query-number.ts`, plain decimals only) before `@IsInt()`/`@IsNumber()`; nested objects keep `@ValidateNested()` with `@Type(() => Class)`. Confirmations and legal acceptance still add `@KeepRawValue()` with `@Equals(true)` as a second line of defence (checkout `termsAccepted`, staff bulk-rate `confirmed`). DTO tests run through the real pipe (see `shared/validation/dto-strict-types.spec.ts`) or `plainToInstance` without conversion options.
- Redis is allowed for holds, locks, cache, and queues — never as the source of truth for reservations.

### No N+1 queries (strict)

The API must never run one query per row of a parent result. This is a hard rule, not a performance nicety: list screens (calendar, reports, search, property and stay lists) grow with every property and stay added.

- **Never query inside a loop.** No `await repo.find…()` inside `for`, `map`, `forEach`, or `Promise.all(rows.map(...))` when the query depends on the row. Fetch all children for all parents in one query, then group in memory.
- **Batch by ids.** Load related rows with `WHERE parent_id = ANY($1)` (parameterized array), or a `JOIN`, then index the result in a `Map` keyed by id.
- **Use SQL for aggregation.** Counts, sums, occupancy, and revenue per property or per stay are computed with `GROUP BY` / joins / `json_agg` in the repository, never by fetching rows and looping with extra lookups.
- **Repositories expose set-based methods.** Prefer `findByIds(ids)`, `listHousesForProperties(propertyIds)`, `listPhotosForHouses(houseIds)` over single-row `findById` used repeatedly. A single-row method is for single-row endpoints.
- **Services compose, repositories fetch.** A service may call several repository methods, but each is called once per request with the full id set, never once per item.
- **Cross-module reads follow the same rule.** If module A needs data for N rows owned by module B, it calls B's batch method through B's public exports.
- **Pagination and bounds.** List endpoints take a bounded date range or page size so one request cannot load unbounded rows.
- **Review check.** Any new or changed list endpoint states its query count (constant, not proportional to row count). A reviewer rejects a change where the count grows with the data.

```ts
// BAD — 1 + N queries
const houses = await this.repo.listHouses(propertyId);
for (const house of houses) {
  house.photos = await this.repo.listPhotos(house.id);
}

// GOOD — 2 queries regardless of N
const houses = await this.repo.listHouses(propertyId);
const photos = await this.repo.listPhotosForHouses(houses.map((h) => h.id));
const byHouse = groupBy(photos, (p) => p.houseId);
```

## Code reuse

- Same logic in 2 places → extract immediately.
- Shared UI in an app → `src/shared/components/`
- Shared client API helpers → `src/shared/services/`
- Cross-app types → `packages/shared-types`
- Utilities → `shared/utils/` — pure, no side effects

## Imports

- Remove unused imports immediately (value, type, and side-effect).
- `npm run lint` treats unused imports as errors.

## Mock data

- Mocks live in `features/[feature]/mocks/`. Never inline in hooks or components.
- Export constants: `MOCK_HOUSES`, `MOCK_PROPERTIES`, `MOCK_RESERVATIONS`, `MOCK_GUESTS`.
- Files are named `[resource].mock.ts`.
- Mocks are for tests and Story-like UI only. Runtime app data comes from the API.

## Shared UI (mandatory)

- **UserAvatar** (`shared/components/user-avatar.tsx`) — all staff/guest avatars. Deterministic color from initials. Never a raw MUI `Avatar` with a hardcoded `bgcolor` for people.
- **getAvatarColor / getInitials** (`shared/utils/avatar-color.ts`) — same person, same color in web and admin.
- **PropertyMap** (`shared/components/property-map.tsx`) — MapLibre + OpenFreeMap pin from `lat`/`lng`. Directions links to Google Maps and Apple Maps. Never paste a raw iframe with hardcoded coordinates.
- **PhoneField / EmailField** (`packages/ui`, `import { PhoneField, EmailField } from '@resort-booking/ui/contact'` (a separate entry on purpose: it carries the phone-number library, which must not load on pages without a phone field)) — every phone and email input in web and admin. `PhoneField` shows a country flag + calling code, takes the national number, and reports clean E.164 (`+33612345678`). Both validate with `isValidPhone` / `isValidEmail` (from the same package), show the message after the field is left, and the form disables submit while invalid. Never a plain `TextField type="tel"` or `type="email"`. The API re-checks with `@IsEmail()` and `@IsPhoneNumber()` (international format); phone numbers are stored as E.164.
- **PhotoGallery** (`shared/components/photo-gallery.tsx`) — all property and stay galleries.
- Do not port CRM-only editors (mention chips, workflow localStorage) unless a story explicitly needs them.

## Performance and lazy loading (guest app)

- **Each route is split automatically** by Next.js: a guest only downloads the code of the page they open. Nothing to configure.
- **Heavy libraries must not ride along on pages that do not use them.** Load them on demand or give them their own entry:
  - **Map** (MapLibre): loaded on demand after the page appears (`PropertyMap`, `SearchResultsMap`).
  - **Date picker** (MUI X + dayjs): `StayDateField` loads it on demand and holds the space with a placeholder showing the chosen date. Pages import `StayDateField`, never `StayDatePicker` directly.
  - **Phone and email fields** (phone-number library, ~100 kB): import from `@resort-booking/ui/contact`, **not** the main `@resort-booking/ui` barrel, so only pages with a phone field download it.
- **Measure before and after any dependency change.** A normal build would overwrite a running dev server's folder, so build elsewhere: `cd apps/web && NEXT_DIST_DIR=.next-measure npx next build`, then `git checkout -- tsconfig.json` (Next rewrites it) and read the "First Load JS" column.
- **Measured (production build, first-load JS):** home 247 kB, property 247 kB, search 236 kB, stay page 312 kB (it carries the phone library on purpose). Before the split these were 370, 370, 361 and 373 kB. Treat a jump of more than about 20 kB on a page as something to explain.

## Testing

- **Non-negotiable: all code has tests.** No code merges without test cases in the same change. Tests are how we see what the system does and catch bugs before guests do.
- What "has tests" means:
  - Every new or changed exported function, service method, repository method, controller route, hook, and component is covered.
  - Cover the happy path, boundaries (first/last night, check-out day, empty list, one item, max window), error paths (not found, conflict, invalid input, unauthorized), and any bug you can foresee.
  - Business rules live in pure functions (`*.rules.ts`) so they can be tested without Nest, Redis, or Postgres. Services are tested with mocked repositories.
  - Controllers and DTOs: test that validation rejects bad input and the route returns the documented error `code`.
  - Privacy-sensitive responses (e.g. guest availability) have a test asserting no guest data leaks.
- **Bug fixes start with a failing test** that reproduces the bug, then the fix.
- A change is not done until `npm run lint:<app>` and `npm run test` pass for every app touched. Never skip, delete, or weaken a test to get green; if a test is wrong, fix it and say why in the commit.
- Frontends: `[filename].test.tsx` next to the file or in `__tests__/`.
- API: `[filename].spec.ts` next to the Nest provider.
- Test hooks, utils, component behavior, and service rules (holds, overlap, cancel).
- API list endpoints and repositories that return parents with children: test that the query count stays constant as rows grow (e.g. assert the repository is called once with all ids).
- **Tenant isolation (every staff route):** staff of one organization must never reach another organization's rows. A staff route that names rows by id puts `@TenantScoped({ resource, from, key })` on the handler and `TenantGuard` after `StaffGuard` (the guard answers 404, never 403). A route that names no id (a list, a create, "my own profile") carries `@TenantExempt('how it is scoped')`, filters by `organization_id` in SQL, and gets one line in the exempt table of `apps/api/src/shared/tenancy/tenant-isolation.spec.ts`. That suite reads every controller's metadata and fails the build for a staff route with neither decoration, so a new route cannot ship without the decision. Repository methods that list across rows take `organizationId` as a required parameter and have a spec asserting it is in the SQL and the parameters.
- Mock Redis, Postgres, and HTTP. Never hit real services in unit tests.
- Tests must be fast, isolated, and deterministic.
