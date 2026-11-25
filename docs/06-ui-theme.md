# UI theme

Hospitality site, not a playful consumer app and not the old CRM. Guest (`apps/web`) and admin (`apps/admin`) share **shape and type**. Guest may use warmer brand color; admin has its own, more confident palette (below) with more paper and no hero photography.

## Buttons (required)

- Shape: **square-ish, 8px radius** — professional, not pills.
- MUI: `shape.borderRadius: 8`. Buttons, inputs, selects, dialogs, and cards use this unless a spec says otherwise.
- Do **not** use `borderRadius: 999` / `rounded-full` on primary actions.
- Do **not** use `borderRadius: 0` (sharp corners) on primary actions.
- Height: comfortable (MUI `size="medium"` default). Primary CTA is contained, full contrast, not outlined-only.
- Apple Pay / Google Pay buttons: use the official wallet button (their brand rules). Our primary Book/Pay button still uses 8px.

## Color direction

Do not invent a new palette per screen. Set tokens once in the theme.

| Token | Intent |
| --- | --- |
| Primary | Deep, calm hospitality (navy or forest). One primary only. |
| Secondary | Warm accent (sand / terracotta) used sparingly — links, prices, focus rings, not whole pages. |
| Background | Warm off-white guest; neutral paper admin. |
| Text | Near-black body, muted secondary. No light-gray body text. |

Never hardcode hex in components. Dark mode still uses theme tokens (`docs/02-coding-standards.md`).

## Type and density

- Guest: slightly larger titles, more whitespace, photography-led stay pages.
- Admin: denser tables, same 8px controls, no marketing hero.
- Font: one geometric or humanist sans (theme `typography.fontFamily`). Do not mix five Google fonts.

## Surfaces

- Cards: 8px radius, light border (`divider`) or quiet elevation — not heavy Material shadows.
- Guest stay cards: image, name, capacity, price for selected dates; whole card clickable.
- Property / stay pages: photo **mosaic** (8px), contact row (phone, email), **full-width** MapLibre map under the copy or beside checkout on desktop — never a tiny unreadable widget.
- Checkout: one column on mobile, two on desktop (summary sticky). Same 8px fields.

## Flow we take from Airbnb (not the look)

Guests should feel a **straight path**: dates and guest count → stays that are free → one stay page → name, email, phone, pay. No marketplace, no host chat, no request-to-book.

We do **not** copy Airbnb’s brand, coral pills, round search capsule, or card chrome. Visual language stays this file: navy primary, sand accent, 8px controls, warm paper, photography-led stay pages.

Brand photos and exact hex can wait until the client’s identity pack. **Radius 8 and the payment layout do not wait.**

## Admin look (staff app)

Admin layers its own tokens on the shared theme (`packages/ui/src/admin-tokens.ts`, `admin-theme-options.ts`). The guest theme does not change. Radius stays 8px.

| Token | Value | Use |
| --- | --- | --- |
| Primary | `#0f4c5c` (deep teal), dark `#0a3642` | Primary buttons, selected tabs, the sidebar background |
| Secondary | `#a3471f` (terracotta), light `#f0b48a` | Accent: today marker, tab indicator, sidebar active bar, focus ring |
| Success / info / warning / error | `#1f7a4d` / `#0b66a3` / `#a35c00` / `#b3261e` | Status; always with an icon and words |
| Page / paper | `#eef2f4` / `#ffffff` | Tinted page, white cards with a quiet shadow |
| Text | `#15222b` / `#455a64` | Body / secondary |

- **Contrast is tested.** `adminContrastPairs()` lists every text/background pair; `admin-theme.test.ts` fails if any drops below 4.5:1 (3:1 for UI parts such as the sidebar accent bar). Add a pair there when you add a new combination.
- **Tonal chips** (tone at 14% with the dark tone as text and icon) for statuses; solid primary chips only for a selected filter.
- **Tables** have a tinted header, zebra rows and a hover tint.
- **Status is icon + words + colour** (`shared/utils/status-style.ts`, `StatusChip`). Colour is never the only signal.
- **Shared admin parts** (`apps/admin/src/shared/components`): `PageHeader` (every page's only h1), `SectionCard`, `IconChip`, `EmptyState`, `StatusChip`, `UserAvatar`, and the sidebar (`StaffShell`, `StaffSidebar`, `nav-config`).
- **Sidebar:** deep primary background, groups Operations / Insights / Setup, outlined icons that fill when active, tinted pill plus bright left bar and bold label for the current page (`aria-current="page"`), refunds-waiting badge, icon-only rail on desktop (remembered in `localStorage`, safe if storage is blocked), drawer on phones, signed-in user and Sign out at the bottom.
- **Density:** list rows are as small as their content allows. A booking row in the calendar's day panel is one 56-64px line (name + status, one truncated detail line, amount + reference); do not turn rows into large cards.
- **Server vs client:** shared parts that use MUI with function-valued `sx` (such as the theme callbacks in `IconChip`) are `'use client'`. A server component must never pass a function to a client component; pass icons as elements.
