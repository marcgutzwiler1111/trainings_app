# Exercise Management — CODEX-008

## Boundaries and files

- `src/app/(tabs)/exercises.tsx`: actual Library tab, local name search, Area and
  Effect filters, current status/origin and Create/Edit navigation.
- `src/app/exercise/new.tsx`, `[id].tsx`: routes using one ExerciseEditor.
- `ExerciseEditor.tsx`, `src/components/ExerciseForm.tsx`: reusable Create/Edit form,
  multiple Area/Effect checkboxes, optional image, status, save and safe feedback.
- `services.ts`: Application services, drafts, Library filtering and origin mapping.
- `src/data/exerciseValidation.ts`: one validation rule set shared by services and
  repository entry points. Known Area/Effect values, trimmed name, nonempty taxonomy,
  valid technical load mode and URI values are validated before writes.
- Existing ExerciseRepository: create/get/list/update/setActive are reused. Update
  now atomically includes optional active status in the same transaction as name,
  thumbnail and taxonomy changes. It preserves ID and created_at; no delete API.
- `images.ts`: picker/copy orchestration with injectable ports and safe errors.
- `src/lib/exerciseImages.ts`, `.web.ts`: native and web image adapters.
- Existing ExerciseThumbnail resolves durable web image handles, releases temporary
  render URLs on replacement/unmount and displays a placeholder on missing files.

UI never executes SQL. The existing ApplicationProvider supplies the services per
SQLite connection; there is no additional state provider or persistent library cache.
The existing focus loading/action hooks handle refresh, abandoned loads and repeated
UI actions. Technical failures use the established generic userMessage strategy.

## Library and validation

Library includes active and inactive exercises by default. Search trims whitespace
and compares names without case sensitivity. Area and Effect filters use membership
in each exercise's arrays, combined with search; no duplicate rows are introduced.
All six Effects and all three Areas are supported. No extra taxonomy is added.

Create requires a trimmed nonempty name, at least one valid Area and Effect. Names
need not be unique. New records start active. Edit supports name, multiple Areas,
multiple Effects, image removal/replacement and Active/Inactive, preserving the same
ID. A status change is a draft until Save; the UI explains that deactivation affects
future selection, while prior training data remains available. Reactivation restores
selection eligibility. Successful saves show explicit feedback and return to Library.
Existing technical load_mode values are preserved by Edit; Create uses EXTERNAL_ONLY,
the repository's existing conventional external-load mode. No new load-mode UI or
metric behavior is introduced in this task.

A form-local createCommand latches an in-flight creation and retains its successful
ID for repeat submissions. Failed validation or database writes release the latch
for retry. Combined with the synchronous useFeatureAction lock, a double tap cannot
create duplicate rows. Separate new forms may intentionally create the same name.
There is no global name-based deduplication, new idempotency table or stored draft.

## Seed identity and persistence

No migration is needed: schema version remains 3. Existing exercise, taxonomy,
thumbnail and active columns are sufficient. Predefined/custom is derived from the
29 exact stable seed UUIDs, not from names or an ID prefix. Edited seeds remain
predefined; a custom exercise with the same name remains custom. The seed list and
its insert-missing-only implementation are unchanged. Initialization never replaces
user-edited taxonomy, names, images or active status and never duplicates seed IDs.

## Local images

`expo-image-picker` (~58.0.10) provides the native/system and browser file picker.
`expo-file-system` (~58.0.10, installed 58.0.11) is now a direct dependency for native
durable copies rather than relying on Expo's transitive dependency. Both were added
using `EXPO_OFFLINE=1 npx expo install expo-image-picker expo-file-system` against
installed SDK 58 compatibility metadata. The lockfile includes expo-image-loader
transitively. No camera or microphone workflow is added; the picker config plugin
blocks these permissions and supplies a German photo-library usage description.

Native selection copies the source to a fresh unique file under
Paths.document/exercise-images before the URI can be saved. Cache/picker URIs do
not become the stored image reference. Web copies the selected image Blob to an
origin-private filesystem (OPFS) file and saves only an exercise-image://UUID handle
in SQLite. Rendering opens that file and creates a transient object URL; that URL
is never stored. Picker and render object URLs are released after use. Browser
storage requires a secure context (localhost qualifies) with OPFS support. Unsupported
storage/failed selection/copy produces a recoverable message; editing without an
image remains available. No Base64 or image BLOB is written to SQLite.

All replacement files receive a fresh identity. Removing/replacing an image only
changes the current Library URI. Older files are deliberately retained because
Power, Strength and Circuit snapshots can still reference them. Unsaved images may
also remain; storage cleanup is deferred instead of risking historical references.
Missing files use the existing neutral placeholder and do not block Library/Edit/Save.
No external images are downloaded or new seed illustrations generated.

## Snapshot safety and Builder integration

Power, Strength and Circuit continue displaying their captured names, thumbnail
URIs, roles/effects and IDs. Library updates never rewrite snapshots or saved sets.
The image storage adapters never overwrite or delete old managed image files.
Active, COMPLETE and INCOMPLETE workouts keep their historical content after rename,
image replacement or deactivation. Circuit runtime/progression remains unchanged.

Builder recommendations and Show all use the existing exerciseOptions unchanged.
Normal selection excludes inactive exercises, including Show all. Reopening Builder
loads newly created/edited/reactivated exercises without restarting the app. Start
still rechecks exercise activity transactionally. An inactive Last Workout default
is cleared with the existing warning rather than silently accepted or reactivated.
No changes were made to cycle, workout completion, Strength PR eligibility, benchmark
or timer rules. Complete Strength exercises in INCOMPLETE sessions remain PR-eligible.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 342 passed, no failures/skips (all previous 301 tests unchanged, 41 new).
- `npm run lint`: passed without warnings.
- Android and iOS Metro/Hermes exports passed with two workers.
- Native device tests not performed: this environment has no configured native
  device/emulator or iOS runtime. Bundle exports do not imply native execution.

The Node 24 test script explicitly uses --test-isolation=none. In this cloud
sandbox, the default child-process mode reported only 11 successful test files;
this mode executes/reports all individual tests in the main process. No assertions
or prior tests were removed or weakened and the public npm test command is unchanged.

`tests/exercise-management.test.ts` checks Library/filter/search, create/edit,
validation in services and repositories, multiple taxonomy values, stable identity,
activation, file-backed reopen, seed preservation, Builder/Last Workout integration,
snapshot safety for all session states, Circuit progression, Strength PRs, atomic
rollback, duplicate submission/retry, image URI persistence, cancellation and errors.

Chromium at 390×844 exercised the real Expo SQLite WASM driver and OPFS storage:
Library search/Area/Effect filters → invalid Create → multi-select Create with local
image → double-click Save → Library → reload with rendered image → Edit → deactivate
→ Builder selection exclusion even under Show all → reactivate → matching Strength
and Power selection. Image removal/reselection preserves older files. Deleting the
test context's image file then reloading Edit produces a placeholder and still allows
Save. Dark Library and Editor were visually checked. Tests use temporary scripts and
files outside the repository; no product debug hooks or test dependencies were added.

Three additional independent browser contexts completed the entire normal workout
flow (Builder → Power → both Strength → Circuit → Summary → Completion → Home),
including matching completion and both explicit cycle choices, summary navigation,
reload, refreshed cycle and no remaining active workout.
