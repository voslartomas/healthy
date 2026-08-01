# ADR 003: Implementing and keeping in sync with the design prototype

Date: 2026-08-01
Status: Accepted

## Context

HEA-14 asks us to implement the design at
`/home/tomas/workspace/sportbuddy/design/bd2f7ef5-e487-42b9-9d09-a1be47dfeb44`
(an Open Design "web prototype": a single self-contained
`healthy-app-prototype.html`) **and to keep the app in sync as the design
changes**.

The prototype is an iOS-styled HTML/CSS/JS mock. It is the source of truth for
visual design, screen inventory, copy, and interaction behavior — but it is not
React Native, and its colors are authored in `oklch()`, which RN cannot parse.

## Decision

We treat the prototype as a **spec to transcribe**, not code to port, with a
small set of conventions that make re-syncing mechanical:

1. **Design tokens are centralized and traceable.** All colors live in
   `src/theme/colors.ts`, converted from the prototype's `oklch()` values to
   sRGB hex (conversion is documented there). Radii, spacing, and the mono font
   live in `src/theme/theme.ts`. A design change to a token is a one-line edit.
2. **One component per design primitive.** `.card` → `Card`, `.ring` → `Ring`,
   `.bar`/`.gbar` → `ProgressBar`, `.stat` → `StatCard`, `.sec-label` →
   `SectionLabel`, charts → `Charts`, inline SVGs → `Icon`. Screens compose
   these, so structural design changes touch one primitive.
3. **Screen ↔ prototype mapping.** Each prototype `data-od-id` section maps to a
   screen under `src/features/`: `screen-today` → dashboard, `screen-nutrition`
   → nutrition, `screen-coach` → coach, `screen-trends` → trends,
   `screen-recovery` → recovery, `screen-cardio` → cardio, `screen-settings` →
   settings, `goal-sheet` → `GoalDefinitionSheet`.
4. **Sample content is isolated** in `src/data/health.ts` and
   `src/data/goalSources.ts` (transcribed verbatim from the prototype's JS
   data), so copy/number changes don't touch layout code and the eventual real
   data sources (HEA-5) drop into the same shapes.

## Re-sync workflow

When the design changes (a new prototype revision lands in the design folder):

1. Diff the new `healthy-app-prototype.html` against the implemented version.
2. Token change → edit `src/theme`. Copy/data change → edit `src/data`.
   Structural change → edit the relevant primitive or screen.
3. Run `npm run typecheck && npm run lint && npm test`.

## Consequences

- The abstraction (tokens + primitives + data) is what keeps sync cheap; the
  cost is the up-front discipline of not hard-coding colors or copy in screens.
- Pixel-exact parity with a browser is not a goal — RN idioms (safe-area insets,
  `Switch`, native stack transitions) replace CSS-only affordances where the
  platform differs. Behavior and layout intent are preserved.
- `oklch → hex` is a lossy one-way step; the hex values, not the oklch source,
  are authoritative in the app.
