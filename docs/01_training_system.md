# 01 — Training System

## Status

Approved training-system source of truth for MVP.

## 1. Training cycle

The plan is an event-based six-day cycle:

1. UK Hams
2. OK Brust
3. Rest
4. UK Quads
5. OK Rücken
6. Rest
7. repeat from day 1

Calendar days do not advance the cycle.

A Rest day is a cycle item and must be explicitly completed to advance.

## 2. Normal workout structure

A normal workout is:

1. Power
2. Strength
3. Circuit

Warm-up is outside MVP.

## 3. Power

Normal Power work:

- one selected Power exercise;
- normally 3–4 high-quality sets;
- roughly 3–5 explosive reps/throws depending on exercise;
- long recovery;
- quality and explosiveness rather than fatigue;
- no detailed normal Power performance logging.

Default Power rest timer: 2:30.

Power rest time is independently configurable from Strength.

## 4. Strength

Every normal workout has two equally prioritized Strength exercises.

### Mapping

| Workout | Strength A | Strength B |
|---|---|---|
| UK Hams | Lower Posterior | Lower Anterior |
| OK Brust | Upper Push | Upper Pull |
| UK Quads | Lower Anterior | Lower Posterior |
| OK Rücken | Upper Pull | Upper Push |

Both exercises:

- 4 working sets;
- 5–8 reps;
- weight + reps + RIR per set;
- target about 1–2 RIR;
- routine failure is not the default.

The two exercises may be alternated set-by-set or completed one after the other. The app must not force the order.

### Double progression

Example at same load:

- 8/7/6/6
- 8/8/7/6
- 8/8/8/7
- 8/8/8/8
- then consider increasing weight if RIR is appropriate.

Default Strength rest timer: 2:00.

### Strength volume

Set volume:

`weight × repetitions`

Exercise volume:

`sum of all working-set volumes for that exercise in one workout`

### Strength Benchmark

The Strength Benchmark is the highest historical Exercise Volume for the exact exercise.

It is therefore an automatically derived per-exercise Volume PR.

It:

- has no separate benchmark workout;
- has no 30-day due cycle;
- updates automatically after a higher completed exercise volume;
- compares only the exact same exercise variant.

### e1RM

RIR-aware Epley estimate:

`effective reps = reps + RIR`

`e1RM = weight × (1 + effective reps / 30)`

This is an estimate/trend metric, not a measured 1RM.

Relative e1RM:

`e1RM / bodyweight`

### Relative strength

Standard loaded exercise:

`moved load / bodyweight`

Weighted pull-up/dip effective load:

`bodyweight + added weight`

Relative strength:

`effective load / bodyweight`

## 5. Circuit

Default:

- 6 stations
- 5 rounds
- 60 seconds per station
- 30 minutes total

Number of stations and rounds is configurable per workout.

Station duration remains fixed at 60 seconds in MVP.

The app does not split work and rest. The 60-second station is continuous.

### Default roles

1. Focus
2. Core
3. Focus
4. Conditioning
5. Focus
6. Non-Focus

Roles, exercises and order are editable before Circuit start.

### Focus mapping

| Workout | Focus | Non-Focus |
|---|---|---|
| UK Hams | Lower Posterior | Lower Anterior |
| UK Quads | Lower Anterior | Lower Posterior |
| OK Brust | Upper Push | Upper Pull |
| OK Rücken | Upper Pull | Upper Push |

Core → Core  
Conditioning → Conditioning

Normal Circuit reps/performance are not logged.

## 6. Exercise taxonomy

Effects:

- Upper Push
- Upper Pull
- Lower Anterior
- Lower Posterior
- Core
- Conditioning

Areas:

- Power
- Strength
- Circuit

Exercises may have multiple Areas and Effects.

Each exercise has:

- name;
- Area(s);
- Effect(s);
- thumbnail image;
- active/inactive state.

## 7. Power Benchmark

Independent standardized benchmark approximately every 30 days.

Tests:

1. Standing Broad Jump
   - 3 attempts
   - best counts
   - cm
2. Rotational Medicine Ball Throw
   - left and right
   - 3 attempts each side
   - best each side
3. Medicine Ball Chest Pass
   - 3 attempts
   - best counts
4. Medicine Ball Shot-Put Throw
   - left and right
   - 3 attempts each side
   - best each side

Relevant conditions, especially medicine-ball weight, must be stored per test.

Results with different relevant conditions are not directly comparable.

## 8. Circuit Benchmark

Independent standardized benchmark approximately every 30 days.

Fixed format:

- 6 stations
- 5 rounds
- 60 seconds per station
- 30 minutes

Exercises:

1. Goblet Squat
2. Push-ups
3. Kettlebell Swing
4. Pull-ups / Chin-ups
5. Hanging Leg Raises
6. Burpees

Before start, capture and lock:

- bodyweight;
- Goblet Squat load;
- Kettlebell Swing load;
- pull-up/chin-up added load;
- other required external loads.

During the benchmark, log reps per exercise per round.

Effective weight:

- Goblet Squat = external load
- Kettlebell Swing = external load
- Push-ups = bodyweight
- Hanging Leg Raises = bodyweight
- Burpees = bodyweight
- Pull-ups/Chin-ups = bodyweight + added load

Volume:

`reps × effective weight`

Total benchmark volume = sum of all exercise volumes.

Relative Performance:

`total benchmark volume / bodyweight`

This is called Relative Performance, not Relative Strength.

## 9. Benchmark schedule

Power Benchmark:
- independent 30-day counter.

Circuit Benchmark:
- independent 30-day counter.

Before first completion:
`Not tested yet`

After due date:
`Due`

Overdue example:
`Due · 5 days overdue`

Benchmarks never block normal workouts.

Strength Benchmark has no due cycle.

## 10. Workout state

States:

- Planned
- In Progress
- Complete
- Incomplete

Data is auto-saved.

If an active workout is reopened:

- Continue Workout
- End as Incomplete

Circuit timer must not continue invisibly while the app is closed.

## 11. Restart section

Power, Strength and Circuit each support:

`Bereich neu starten`

Restart discards only that section's current progress after confirmation.

Other section data remains intact.

Circuit configuration is editable again after Circuit restart.

## 12. Cycle advancement

Only Complete normal workouts can advance the cycle automatically.

If the performed workout matches the expected cycle workout, advance to the next cycle item.

If the user manually chose another workout type, completion asks:

- Continue cycle normally
- Count this as current cycle workout

Incomplete workouts do not automatically advance the cycle.
