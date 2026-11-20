# ADR 009: Journal — daily tags, carried conditions, and what they did

Date: 2026-11-20
Status: Accepted

## Context

Wearable numbers say *that* recovery dropped, not *why*. The user wants to note
the why — sick, injured, a late drink — the way Bevel's journal does, and have
the app (and the coach) take it into account.

## Decision

**One entry per local day** in a new `journal_days` table (keyed by the day's
local midnight): a set of tags, a set of `ended` conditions, and a free-text
note. User-authored, so it is never pruned and is part of the backup.

**Tags** are a fixed catalog in `src/state/journal.ts`:

- *How you feel*: sick, injured, sore, stressed.
- *What happened*: alcohol, late caffeine, late meal, screens in bed, travel,
  meditated, stretched, sauna.

**Sick and injured carry over.** A condition lasts days, and asking the user to
re-tag it daily would lose it. Today's journal card asks "Still sick? · day 3"
until it is answered — *Still sick* adds the tag to today, *I'm better* records
it in `ended`. An unrelated tag on today (say, "alcohol") does **not** end a
condition; only an explicit answer does, which is why `ended` is its own column
rather than inferred from absence. After 7 days without an entry the condition
is assumed over. Day numbers count from the first day of the stretch, stepping
over days with no entry.

**"What we've noticed"** compares, per tag, the mornings it could have affected
with all other mornings in the trend series (~30 days): recovery (points), HRV
(%), resting HR (bpm), sleep (minutes). Evening tags are matched to the *next*
morning; conditions to the same day. Shown only with ≥3 tagged and ≥3 other
days, and shifts under a noise floor read "no change". It is a plain difference
of means over the user's own data and is labelled as a pattern, not a diagnosis
(privacy invariant 4).

**What the journal changes elsewhere:**

- The readiness *score* is unchanged (ADR-004). Only the advice under it on
  Today changes when today is tagged sick or injured ("rest comes first").
- The coach's data context gains journal lines (today with day numbers, an open
  condition not yet confirmed, yesterday), and the daily brief is told to lead
  with rest when the user is sick or injured. Confirming or ending a condition
  rewrites that day's brief.

## Consequences

- No health data is written — the journal lives only in our SQLite.
- Habits are not paused on sick days yet; that, and a coach tool to journal
  from chat ("I'm sick"), are natural follow-ups.
