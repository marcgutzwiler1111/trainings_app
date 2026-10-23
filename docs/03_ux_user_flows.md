# 03 — UX and User Flows

## Status

Approved UX direction for MVP.

This file defines interaction behavior, not visual branding.

## 1. UX principles

- Mobile-first.
- Minimize taps during training.
- Use large touch targets for active workout actions.
- Prefer glanceable information during timed work.
- Use dropdown-style selector fields where practical.
- For exercise selection, tapping the selector opens a searchable selection sheet rather than a tiny native dropdown.
- Exercise selectors show thumbnails.
- Avoid modal interruptions during active training unless data loss or an irreversible reset is possible.
- Home stays operational, not analytics-heavy.

## 2. Main navigation

Bottom navigation:

1. Home
2. Progress
3. History
4. Übungen

Settings is accessed from the Home header.

Workout and benchmark screens are contextual flows, not permanent tabs.

## 3. Home

Home displays:

- next cycle item;
- current cycle position;
- `Training starten`;
- `Training ändern`;
- Power Benchmark status;
- Circuit Benchmark status;
- active workout if present;
- last workout summary.

If an active workout exists, `Training fortsetzen` is the dominant action.

A second normal workout should not be started while another normal workout is In Progress.

## 4. Normal workout flow

`Home → Workout Builder → Power → Strength → Circuit Preview → Circuit → Workout Summary → Cycle handling → Home`

### 4.1 Workout Builder

Loads Last Workout as Default for the selected workout type.

Sections:

Power:
`[ Box Jump ▼ ]`

Strength:
`[ Romanian Deadlift ▼ ]`
`[ Front Squat ▼ ]`

Circuit:
- station count;
- round count;
- derived duration;
- station rows with Role and Exercise selectors;
- drag/reorder;
- add/remove station.

Start is disabled until required configuration is valid.

### 4.2 Exercise selector

Exercise selector field:

`[ Exercise name ▼ ]`

Tap opens a searchable sheet containing rows:

- thumbnail;
- exercise name;
- Area;
- Effect.

Recommended matching exercises appear first.

Actions:
- search;
- show all;
- create new exercise.

### 4.3 Power

Show:
- exercise thumbnail;
- exercise name;
- normal prescription guidance;
- set-completed action;
- rest timer.

Normal Power sets do not require reps/load entry.

User explicitly finishes Power.

### 4.4 Strength

Both exercises appear on the same screen.

Each exercise card shows:
- thumbnail;
- name;
- previous-session reference;
- four set rows.

Each set row accepts:
- weight;
- reps;
- RIR.

No forced ordering exists.

Valid sequences include:
- A1, A2, A3, A4, B1, B2, B3, B4;
- A1, B1, A2, B2, A3, B3, A4, B4;
- any other user-selected ordering.

After set save:
- persist;
- calculate;
- begin Strength rest timer.

New Strength Benchmark / Volume PR may be shown non-disruptively.

### 4.5 Circuit Preview

Before Circuit start show:
- rounds;
- stations;
- duration;
- ordered station list.

Circuit remains editable until Start Circuit.

### 4.6 Active Circuit

Primary information:

- Round X / Y;
- Station X / Y;
- current exercise name;
- current exercise large thumbnail/image;
- 60-second countdown;
- next exercise name;
- next exercise small thumbnail;
- Pause.

At timer zero:
- sound and/or vibration;
- advance to next station;
- reset to 60 sec.

At final station/final round:
- do not wrap;
- show `Circuit beendet`.

### 4.7 Pause

Pausing stops the timer.

Resume restarts from the remaining time.

If the app is closed, the timer does not continue in the background for MVP.

On resume after relaunch, restore the station and require the user to restart/continue it deliberately.

### 4.8 Workout summary

Show:
- workout type;
- Power completion;
- both Strength exercises;
- Exercise Volume;
- new Volume PR where applicable;
- Circuit completion and configuration.

Complete workout action finalizes the session.

### 4.9 Cycle handling

If performed type matches expected cycle item:
- complete → advance automatically.

If user manually changed type:
show:
- Continue cycle normally
- Count this as current cycle workout

Incomplete workout:
- no automatic cycle advancement.

## 5. Restart section

Accessible through workout section menu.

Options:
- Power neu starten
- Strength neu starten
- Circuit neu starten

If saved progress exists, show a confirmation explaining exactly what will be discarded.

Restart affects only the selected section.

## 6. Incomplete workout flow

User chooses End Workout before all required sections are complete.

Show section status.

Actions:
- Continue training
- End as Incomplete

Captured data remains.

## 7. Power Benchmark flow

Entry:
- Home benchmark card;
- Progress → Power.

Flow:

`Power Benchmark Overview → Setup → Test 1 → Test 2 → Test 3 → Test 4 → Summary`

### Setup

Set relevant medicine-ball weight separately for each med-ball test:

- Rotational Throw;
- Chest Pass;
- Shot-Put Throw.

Weights are not assumed to be identical.

### Test 1 — Standing Broad Jump
- image;
- attempt 1;
- attempt 2;
- attempt 3;
- automatic best.

### Test 2 — Rotational Throw
- image;
- ball weight;
- Left attempts 1–3;
- Left best;
- Right attempts 1–3;
- Right best.

### Test 3 — Chest Pass
- image;
- ball weight;
- attempts 1–3;
- best.

### Test 4 — Shot-Put Throw
- image;
- ball weight;
- Left attempts 1–3;
- Right attempts 1–3;
- best per side.

Test order is fixed in MVP.

### Comparison

Only show direct delta against a compatible prior result.

If conditions differ:
- show current result and condition;
- state that the condition differs;
- optionally show last comparable result.

### Incomplete benchmark

Auto-save.

Actions on reopening:
- Continue
- End as Incomplete

Incomplete Power Benchmark does not reset due date.

## 8. Strength Benchmark / Progress flow

There is no Start Strength Benchmark action.

Flow:

`Progress → Strength → Exercise list → Exercise detail`

Exercise list row:
- thumbnail;
- exercise name;
- current Volume PR;
- latest e1RM / relevant metric.

Exercise detail:
- Volume PR;
- Exercise Volume history;
- e1RM trend;
- Relative e1RM trend;
- weight/reps/RIR session history.

A new record is derived automatically from normal workouts.

## 9. Circuit Benchmark flow

Entry:
- Home benchmark card;
- Progress → Circuit.

Flow:

`Overview → Setup → Benchmark → Result → History`

### Setup

Required:
- current bodyweight;
- Goblet Squat load;
- Kettlebell Swing load;
- Pull-up/Chin-up added load.

Before start, clearly state that values lock when benchmark starts.

### Active benchmark

Fixed:
- 6 exercises;
- 5 rounds;
- 60 sec station.

Show:
- Round;
- Station;
- current exercise with image;
- next exercise with image;
- timer;
- reps input for current station;
- locked effective load.

Reps must be saved for every exercise/round.

### Result

Show:
- total volume;
- Relative Performance;
- exercise totals;
- exercise volumes;
- round-by-round reps;
- bodyweight snapshot;
- loads.

Incomplete Circuit Benchmark does not reset due date.

## 10. Progress

Top-level categories:

- Power
- Strength
- Circuit
- Bodyweight

### Power
Benchmark test trends.

### Strength
Exercise-specific trends and Volume PR.

### Circuit
Benchmark history and fatigue/volume analysis.

### Bodyweight
Bodyweight trend/history.

## 11. History

Chronological timeline.

Entries:
- Complete normal workout;
- Incomplete normal workout;
- Power Benchmark;
- Circuit Benchmark.

Tap opens immutable session detail.

Historical display uses stored snapshots rather than current Exercise Library text where snapshot fields are available.

## 12. Exercise Library

List:
- search;
- filters for Area;
- Active/Inactive;
- thumbnail rows;
- create exercise.

Exercise editor:
- image;
- name;
- Area multi-select;
- Effect multi-select;
- Active toggle.

Area and Effect selections may use dropdown/multi-select sheets.

Deactivate instead of hard-delete when historical references exist.

## 13. Settings

Profile:
- current bodyweight.

Training:
- Power Rest Timer;
- Strength Rest Timer.

Timer screens allow:
- +30 sec;
- Skip.

## 14. Empty states

Examples:

No workout history:
`Noch keine Trainings vorhanden.`

No Strength history:
`Noch keine Daten für diese Übung.`

Power Benchmark never completed:
`Not tested yet`

Circuit Benchmark never completed:
`Not tested yet`

No matching exercise:
- Show all
- Create Exercise

## 15. UX accessibility baseline

- Never rely only on color to communicate status.
- Use text/icons plus state.
- Timers use large readable numerals.
- Workout actions should be operable one-handed where practical.
- Confirmation is required before discarding captured section data.
