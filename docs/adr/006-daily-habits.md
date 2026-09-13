# ADR 006: Daily habits — what is stored and what is derived

Date: 2026-09-13
Status: Accepted

## Context

HealthApp v4 adds **habits** alongside weekly goals. A goal asks for a total by
Sunday; a habit asks for a day to hold, every day, and forgives a set number of
slips. Three kinds:

- **food** — watches one tag on the food log (junk / alcohol / sweets); the day
  breaks the moment a food carrying that tag is logged, and otherwise passes at
  midnight. May instead be checked by hand.
- **sleep** — "asleep before 23:00", judged from the night's sleep onset.
- **other** — the user checks it off.

They surface in three places that must never disagree: the Today card (a row per
habit with the Mon→Sun strip), the Trends 12-week grid (plus the PERFECT WEEK
row, which lights up only when every goal AND every habit held), and the food
log's tag chips.

## Decision

**Statuses are derived, never stored.** `src/state/habits.ts` is a pure module:
given a habit, the recorded days, the food-tag rows and the sleep onsets, it
produces a status per day, a streak and per-week attainment. Every surface calls
the same `buildHabitViews`, so a change to the rules lands everywhere at once and
the whole rule set is testable without a database.

**Only what cannot be re-derived is persisted** (`habit_days`):

- a user's explicit check (`held`) or explicit break (`miss`) — these outrank the
  data, which is what makes the week strip editable in both directions;
- a **sleep** verdict (`auto` / `miss`). A night's onset is only readable while
  the platform's fetch window reaches it; once it rolls out, the row written at
  the time is the only record that the habit held.

Food outcomes are deliberately **not** stored: they re-derive from the `food_tags`
rows, so retagging or deleting a meal retroactively corrects the history.

**Tags live in our SQLite, not in the health store.** Health Connect and HealthKit
have no free-form field on a nutrition record, so a tag row points at the entry by
its native id *and* carries the local day — the day is what the habits actually
read, and it keeps working for an entry whose id the write never returned.

**A day owns the night it starts, not the one it ends.** "Asleep before 23:00"
on Sunday means 23:00 *on Sunday*; the day therefore cannot be settled until
Monday morning, and today's sleep row is legitimately `open` all day. The
alternative (credit the night to the morning you wake on) puts Sunday night's
bedtime on Monday's row, which is not how anyone describes their own bedtime.
`derive.sleepNightsFrom` keys each night to the evening it began — one local day
back from `nightIndexToTime`, which labels nights by the morning — and
`bedtimeDeadline` puts an evening target on the day itself and a small-hours one
("01:00") on the morning after, still the same night. Schema `user_version = 4`
clears `habit_days` once, because rows written under the old rule sit a day off.

**Sleep habits back-fill.** `snapshot.sleepNights` exposes every night in the read
window with its onset (`derive.sleepNightsFrom`), and the sleep branch of the
evaluator runs *before* the "did the habit exist yet" cut-off. A bedtime habit
created today therefore shows and scores the weeks the platform already holds,
instead of filling in one night at a time. Food and manual habits get no such
back-fill — nobody was tagging or checking anything on those days — so their
earlier days read as "no data" (an outlined, still-tappable cell).

**An allowance is spent in day order**, per week or per calendar month. A slip
inside the allowance is `allowed`: it counts as held for the streak and does not
paint the week red. That is why `evaluateHabit` takes the whole window in one
call — evaluating a slice would hand later days a budget earlier ones had used.

**Held is held.** A day decided by the data (`auto`) and a day the user checked
off (`held`) render identically — same green. The distinction is real in the
model, and the detail line still says which it was, but as *colour* it only
prompted "why is yesterday a different colour from today?". Only the outcomes
are colour-coded: held (green), forgiven (gold, dashed), broken (red), undecided
(track / outline).

## Consequences

- Editing the food log changes habit history, which is what users expect and what
  a stored verdict would have got wrong.
- Sleep history is only as good as the reads that happened: a phone that never
  opened the app for a month has a gap there, shown as "no data" rather than as
  misses.
- The 12-week bound is the retention policy for `habit_days` and `food_tags`
  alike; both are pruned to it on startup.
