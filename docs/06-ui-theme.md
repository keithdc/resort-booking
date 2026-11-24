# UI theme

Hospitality site, not a playful consumer app and not the old CRM. Guest (`apps/web`) and admin (`apps/admin`) share **shape and type**. Guest may use warmer brand color; admin stays quieter (more paper, less hero photography).

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
