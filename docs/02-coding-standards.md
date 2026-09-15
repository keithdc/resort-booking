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
- Guest search must treat stay dates as the primary filter (nights, not a single calendar day). Guest **count** is a number up to house capacity — not a list of names.
- **Guest calendars** (`apps/web`): **disable all days before today** (property timezone). Guests cannot pick a past check-in.
- **Admin calendars** (`apps/admin`): **do not disable past days**. Staff have full rights (history, blocks, corrections). Guest `minDate` logic must not be reused on admin pickers.
- Search and admin lists are property-aware: guests can search one resort or all resorts; staff always work inside a selected property unless the screen is the property list.

## API / NestJS

- Controllers are thin — delegate to services.
- Validate every request (class-validator DTOs + ValidationPipe).
- Repositories use parameterized queries or the query builder. No string-concatenated SQL.
- Error body shape: `{ status: "error", message: string, code?: string }`.
- Success mutations may return `{ status: "ok", data: T }`.
- Group HTTP routes by feature module, not by verb.
- Redis is allowed for holds, locks, cache, and queues — never as the source of truth for reservations.

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
- **PhotoGallery** (`shared/components/photo-gallery.tsx`) — all property and house galleries.
- Do not port CRM-only editors (mention chips, workflow localStorage) unless a story explicitly needs them.

## Testing

- Every feature has tests.
- Frontends: `[filename].test.tsx` next to the file or in `__tests__/`.
- API: `[filename].spec.ts` next to the Nest provider.
- Test hooks, utils, component behavior, and service rules (holds, overlap, cancel).
- Mock Redis, Postgres, and HTTP. Never hit real services in unit tests.
- Tests must be fast, isolated, and deterministic.
