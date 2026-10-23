# 02 — Product Requirements

## Version

PRD v1.2 — MVP source of truth.

## 1. Product goal

A personal mobile training app for a custom hybrid Power + Strength + Circuit system.

Primary goals:

- improve strength;
- improve relative strength;
- improve explosiveness;
- improve conditioning and strength endurance;
- monitor bodyweight;
- support boxing-relevant performance without unnecessary bodyweight gain.

## 2. Product principles

### Structure without rigidity
Guide workout structure while allowing exercise variation.

### Track what matters
Detailed logging only where it provides useful progress information.

### Relative performance matters
Show bodyweight context and relative metrics where appropriate.

### No fake score
Do not create a synthetic overall fitness score.

## 3. User model

MVP:
- one local user;
- no account;
- no login;
- no backend;
- no cloud sync.

Architecture should not intentionally prevent later multi-user expansion.

## 4. MVP features

### Home
- next cycle item;
- current cycle position;
- start normal workout;
- manually change workout type;
- Power Benchmark status;
- Circuit Benchmark status;
- active workout resume entry;
- latest workout summary.

### Profile / Settings
- current bodyweight;
- bodyweight history;
- Power rest timer;
- Strength rest timer.

Defaults:
- Power 2:30
- Strength 2:00

### Workout Builder
- Last Workout as Default per workout type;
- choose Power exercise;
- choose both Strength exercises;
- editable Circuit;
- configurable station count;
- configurable round count;
- editable roles;
- editable exercises;
- reorder stations;
- automatically calculated duration.

### Exercise Library
Exercise fields:
- name;
- Area(s);
- Effect(s);
- thumbnail image;
- Active/Inactive.

Users can create custom exercises.

Inactive exercises remain valid in historical data.

### Normal Power
- selected exercise;
- 3–4 set guidance;
- rest timer;
- no rep/load performance logging.

### Strength
Two exercises displayed on the same screen.

Each has:
- 4 working sets;
- weight;
- reps;
- RIR.

The user may alternate exercises set-by-set.

After each saved set:
- persist immediately;
- calculate set metrics;
- start Strength rest timer.

Metrics:
- Exercise Volume;
- Strength Benchmark / Volume PR;
- e1RM;
- Relative e1RM;
- Relative Strength where applicable.

### Circuit
- fixed 60-second stations;
- configurable station count and round count;
- show current exercise prominently;
- show next exercise at all times;
- current exercise thumbnail;
- next exercise thumbnail;
- pause/resume;
- automatic station progression;
- explicit Circuit completion after final station/final round;
- no normal rep logging.

### History
Chronological record of:
- complete workouts;
- incomplete workouts;
- Power Benchmarks;
- Circuit Benchmarks.

### Progress
Sections:
- Power;
- Strength;
- Circuit;
- Bodyweight.

### Power Benchmark
Four standardized tests as defined in `01_training_system.md`.

### Strength Benchmark
Automatic per-exercise highest Exercise Volume.

### Circuit Benchmark
Standardized six-station benchmark as defined in `01_training_system.md`.

### Reliability
- auto-save;
- resume active workout;
- end as incomplete;
- restart Power/Strength/Circuit section.

## 5. Last Workout as Default

For each normal workout type, preload the last used configuration:

- Power exercise;
- Strength A;
- Strength B;
- Circuit station count;
- Circuit round count;
- station roles;
- station exercises;
- station order.

Previous performance data is shown as reference but is never pre-recorded as completed data for the new workout.

## 6. Exercise filtering

Exercise selection should prioritize active exercises matching:

- requested Area;
- requested Effect where relevant.

Users can choose `Show all` to intentionally override recommended filtering.

Power selection is primarily filtered by Area=Power.

## 7. Workout editing locks

Power:
- exercise editable until Power has started.

Strength:
- each exercise editable until the first set for that exercise is saved.

Circuit:
- configuration editable until Circuit starts;
- after start, use Restart Circuit to change it.

Circuit start creates an immutable configuration snapshot for the workout history.

## 8. Bodyweight

Current bodyweight is manually editable.

Each change creates a history record.

Benchmark sessions store immutable bodyweight snapshots.

## 9. Benchmark terminology

Use exactly:

- Power Benchmark
- Strength Benchmark
- Circuit Benchmark

Do not use previous working names.

## 10. Scheduled benchmark rules

Only Power Benchmark and Circuit Benchmark have independent 30-day schedules.

Completion starts a new 30-day interval.

Incomplete benchmark sessions:
- remain in history;
- do not reset the schedule;
- do not replace the latest complete benchmark.

## 11. Progress requirements

### Strength
Per exact exercise:
- weight;
- reps;
- RIR;
- Exercise Volume;
- Strength Benchmark / Volume PR;
- e1RM;
- Relative e1RM;
- relevant Relative Strength;
- historical trend.

### Power
Per benchmark test:
- historical best result;
- left/right where applicable;
- test conditions;
- only directly compare compatible conditions.

### Circuit
- total volume;
- Relative Performance;
- total reps per exercise;
- volume per exercise;
- round-by-round reps;
- fatigue pattern;
- bodyweight snapshot;
- benchmark loads.

### Bodyweight
- history/trend.

## 12. Explicit non-goals

Not in MVP:

- authentication;
- cloud accounts;
- cloud sync;
- multi-user;
- social features;
- challenges;
- trainer portal;
- subscriptions;
- payments;
- nutrition/macros/calories;
- AI coach;
- Apple Health;
- Health Connect;
- smartwatch;
- push notifications;
- exercise recognition;
- form assessment;
- video analysis;
- warm-up module;
- public training programs.

## 13. Core acceptance criteria

1. Calendar days do not advance the training cycle.
2. Rest cycle items are explicitly completed.
3. Manual workout override asks how to treat the cycle on completion.
4. Last configuration loads for the same workout type.
5. Both Strength exercises are available on the same active Strength screen.
6. Strength set order across the two exercises is unrestricted.
7. Set save persists weight/reps/RIR immediately.
8. Strength rest timer starts after a set is saved.
9. Exercise Volume is calculated from all working sets for that exercise.
10. Highest historical Exercise Volume becomes Strength Benchmark.
11. Circuit stations/rounds/roles/exercises/order are configurable before start.
12. Circuit duration is derived from stations × rounds × 60 sec.
13. Circuit shows current and next exercise.
14. Circuit does not loop after the final station of the final round.
15. Each major section can be restarted independently.
16. Active workouts survive app restart.
17. Partially completed workouts can be stored as Incomplete.
18. Custom exercises can be created and deactivated.
19. Exercise thumbnails appear in selectors and useful workout screens.
20. Power Benchmark stores attempts and test conditions.
21. Incompatible Power Benchmark conditions are not directly compared.
22. Circuit Benchmark locks bodyweight and loads at start.
23. Circuit Benchmark logs reps by exercise and round.
24. Circuit Benchmark calculates volume and Relative Performance.
25. Power and Circuit due schedules are independent.
26. Strength Benchmark has no due schedule.
27. Before first scheduled benchmark completion, status is Not tested yet.
28. Incomplete normal workouts do not automatically advance the cycle.
