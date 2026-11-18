# ADR 007: The "friendly" redesign

Date: 2026-11-18
Status: Accepted — rollout in progress

## Context

The v3/v4 "data brief" look (ADR-003) — a dark ink band, condensed Oswald
numerals, 8–10px uppercase mono labels, hairline panels — read as dense and
technical. The owner asked for an app that feels more like a simple, game-like
language-learning app: simple screens, readable text, while keeping every
function the code has today.

A full redesign was drawn on a Claude design canvas, "Healthy — Friendly
redesign" (https://claude.ai/artifact/PpZaxuA8v3xc6zFCa2AztX): all five tabs,
the health detail screens, habit/goal editors, onboarding, the food and workout
flows, and the coach, built from a feature inventory of the code so nothing was
dropped. It takes the _qualities_ of that genre — one idea per card, big
friendly type, chunky pressable buttons, streaks and progress up front — and
deliberately none of any specific product's branding (mascot, colours, font).

## Decision

1. **The canvas is the design source of truth**, replacing the HealthApp v4
   artboard for visual design. ADR-003's conventions still apply: tokens live in
   `src/theme/`, primitives in `src/components/brief.tsx`, screens compose them.
2. **Type:** Nunito only (`@expo-google-fonts/nunito`), replacing Archivo +
   Oswald (both packages removed). `sans()`/`mono()` keep their names; `mono()`
   is now "the number face" — Nunito one weight heavier. `txt()` floors type at
   12px and caps letter-spacing, which lifted every screen's smallest labels
   before any screen was rebuilt.
3. **Colour:** a white page; one bright colour per area (recovery/habits green,
   food orange, lift violet, water sky, sleep indigo, streak amber), blue for
   primary actions. Every token used as text clears 4.5:1; brighter `*Solid`
   fills are for bars, rings and button faces. Dark mode is derived (the canvas
   has no dark artboards). Token names from v3 were kept so screens compiled
   through the switch.
4. **Shape:** cards are 22px-radius tiles with a 2px outline and a 4px bottom
   edge; primary buttons are bright slabs with a darker 4px bottom edge. Both are
   in `chunky()` / `BriefButton`.
5. **No dark band.** The header sits on the page colour in both schemes (status
   bar follows the scheme). `InkBand` became a soft tinted hero card with a
   `tone`; the fixed white-on-dark `BAND` constants became `useBand()`.
6. **Tabs** are icon + word, renamed for plain language: Fuel → Food,
   Trends → Progress, Setup → Me. Route names did not change. Copy that pointed
   users to "Setup" now says "Me".
7. **Rollout:** foundation (tokens, fonts, primitives, header, tab bar) and the
   Today screen (with its Habits and Week cards) first, so the whole app moves at
   once and Today can be judged on a device; the remaining screens are rebuilt
   to their canvas artboards one at a time.

## Consequences

- Screens not yet rebuilt inherit the new colours, type and card shape through
  the primitives but keep their v3 layout and some uppercase copy until their
  turn. That intermediate state is expected, not a regression.
- Tests query by visible text, so each rebuilt screen updates its tests' copy.
- Any new screen should be drawn on the canvas first, then built.
