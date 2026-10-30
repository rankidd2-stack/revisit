# Revisit design system

Source of truth: the "Revisit" design system artifact (https://claude.ai/artifact/GfSJGuQ75pg7R8Tj31aVNn), mirrored here so builds don't depend on it.

- `tokens.json`: every color (light and dark), type style, spacing step, radius and shadow, each with a usage note.
- `tokens.css`: the same as CSS custom properties plus one class per type style. Import it once at the app root. Never hard-code a color, size or radius that has a token.
- Fonts (all SIL Open Font License): install `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` and import their default CSS. The font stacks in `tokens.css` already include their family names.
- Components to build first, matching the artifact's previews: Button, StatusPill, MetricCard, QueueRow, SmsPreview.

Revisit is a retention console for dental, vet and aesthetic clinics. Its users are front-desk staff and clinic owners with five spare minutes between patients. Every screen answers two questions: what needs my approval right now, and what did this earn us. The look is calm, precise and quietly confident: neutral surfaces, one fresh green for what matters, generous numbers. "Revisit" is a placeholder name; there is no logo yet.

## Product rules that make it sell

- **Lead with the money number.** The home view opens on one `MetricCard`: bookings recovered this month, set in `metric-xl`. Everything else sits below it. Owners renew because of this number.
- **The queue is the product.** AI proposes, a person approves. The daily queue (`QueueRow`) is the default working view, and approving a day's texts takes one action: "Approve 12 texts".
- **One primary action per view.** Only one `Button` variant `primary` per screen, labelled with a verb and a count when there is one.
- **Show the safety.** Consent, quiet hours, stop links and sync health appear as visible status (`StatusPill`, the sync banner), never hidden in settings. Visible guardrails are the trust signal clinics pay for.
- **Preview before send.** Every outgoing text is shown as the patient will see it (`SmsPreview`), footer and segment count included.
- **Empty states teach the next step.** An empty view says what will appear and offers the one action that fills it ("Import your patient list").

## Voice

- Plain, warm and brief. Write the way a capable office manager talks: "3 patients are due this week", not "Recall opportunities identified".
- Sentence case everywhere. Buttons start with a verb: "Approve 12 texts", "Skip", "Import patients".
- Numerals for all numbers. Tabular figures in tables and metrics.
- No emoji, no exclamation marks, no em dashes.
- Patient-facing texts never name a treatment by default and never make results claims ("painless", "guaranteed").
- Errors say what happened and what to do: "Sync failed at 2:10 AM. Re-upload the sheet to resume texts."

## Color

- Screens are mostly `surface`, `surface-raised` and `ink`. `green` covers at most a tenth of any screen.
- `green` means "do this" and "it worked": the primary button, Booked and Sent states, the focus ring, the main chart series. Text on a green fill is `on-green`, never literal white.
- `marigold` means "needs attention": Due, Paused, Sync is stale. Attention text is `marigold-ink` on `marigold-soft`. Marigold never means error.
- `coral` means failed or destructive: a failed send, Delete, a blocked text. Use it rarely.
- `slate` is the comparison series in charts (last month, average). Marks only, never text.
- Tints (`green-soft`, `marigold-soft`, `coral-soft`) only sit behind their own color's text.
- Every status shows a word as well as a color, so meaning survives color blindness and grayscale screenshots.
- All text pairs listed in the token notes hold 4.5:1 or better in both themes; control borders (`line-strong`) and the focus ring hold 3:1.

## Type

- `display` family (Bricolage Grotesque) for numbers and titles only: `metric-xl`, `display`, `title`, `heading`. Never for paragraphs or buttons.
- `sans` family (Geist) for all interface text: `body`, `body-strong`, `label`, `caption`.
- `mono` family (Geist Mono) for phone numbers, SMS segment counters and IDs: `data`.
- Set `font-variant-numeric: tabular-nums` on metrics, tables and counters.
- One `title` per view. Headings use `heading`; don't skip levels for size.

## Space, shape and depth

- 4px grid: `space-1` to `space-12`. Desktop card padding `space-6`, phone card padding `space-4`, page gutter at least `space-4`.
- `radius-md` for buttons and inputs, `radius-lg` for cards and panels, `radius-full` for pills and avatars.
- Cards are `surface-raised` with a 1px `line` border and no shadow. `shadow-md` is for floating things only: menus, popovers, the confirm sheet.
- Console layout: 240px left navigation, content up to 1200px wide, cards in a 12-column grid with `space-6` gutters, stacking to one column under 720px.

## States

- Hover on green fills: `green-strong`. Hover on neutral controls: `surface-sunken`.
- Focus: `outline: 2px solid var(--focus-ring); outline-offset: 2px` on every interactive element.
- Disabled: 45% opacity and no pointer events. Explain why nearby ("Add a reply number to send").
- Loading: keep the layout and show skeleton bars in `surface-sunken`; never a full-screen spinner.
- Motion: 120 to 180ms ease-out on hover and expand. Nothing moves on its own; honor `prefers-reduced-motion`.

## Iconography

- No Revisit icon set exists yet. Use Lucide (open source) at 16px and 20px with a 1.5px stroke, colored by `currentColor`. This is a stand-in, not a brand asset.
- Icons sit beside a word; an icon alone needs an accessible label.
- No emoji in the product or in patient texts.

## Logo

- None yet. Set the name "Revisit" in the `display` family at weight 650 in `ink`. Don't draw a mark until the real brand name is chosen.

## Components

- `Button`: primary, secondary, quiet and danger, at sizes md and sm.
- `StatusPill`: the lifecycle of a text or a patient (Due, Scheduled, Sent, Booked, Paused, Opted out, Failed).
- `MetricCard`: the money number with its change and trend.
- `QueueRow`: one proposed text in the daily queue, with Approve and Skip.
- `SmsPreview`: an outgoing text as the patient's phone shows it, with the counter.

Load React 18, then `components/bundle.css` and `components/bundle.js`; the components are on `window.Revisit`.
