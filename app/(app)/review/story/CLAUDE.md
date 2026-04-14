# app/(app)/review/story/ — Story-Based Review (Phase 5)

Stories are generated on-demand per session group. Target words appear as blanks; the student types each missing word inline.

## Files

| File | Purpose |
|---|---|
| `page.tsx` | Session state machine, DynamoDB orchestration, topic/story generation |
| `actions.ts` | Server Actions: `generateProfileTopics()` and `generateStory()` (call Claude API) |
| `components/StoryDisplay.tsx` | Renders the story with inline blanks, per-blank input and feedback |
| `components/StoryGenerating.tsx` | Shimmer skeleton shown while Claude generates |

## State machine (`page.tsx`)

`loading | generating | active | fallback | complete | empty | error | no_settings`

- **loading**: parallel DynamoDB fetch (`UserSettings`, `UserWordProgress`, `ReviewEvent` today, `WordMeaning`, `ProfileTopics`), wrapped in `withAuthRetry`.
- **generating**: Claude is generating the story for the current group.
- **active**: student is answering blanks sequentially.
- **fallback**: Claude failed (API error, blank count mismatch, missing key) → falls back to Phase 4 plain-card mode automatically.
- Midnight recheck on group transition via `location.reload()`.

## Topic generation pipeline

Profile → 20 cached topics → random topic per story:

1. After loading, compute `profileSnapshot` (JSON of `{ age, gender, interests }`).
2. Compare against `ProfileTopics.profileSnapshot` in DynamoDB.
3. If missing or stale: call `generateProfileTopics({ userProfile })` → save/update `ProfileTopics`. Non-fatal on failure — stories proceed without a topic.
4. Topics cached in `topicsRef` for the session lifetime.
5. `startGroup()` picks one topic at random from `topicsRef` and passes it to `generateStory`.

## Story generation (`actions.ts`)

`generateProfileTopics(input)`:
- Model: Claude Haiku (fast + cheap for a list task).
- Returns 20 diverse topic phrases suited to the user's profile.
- Caller saves to `ProfileTopics` in DynamoDB.

`generateStory(input)`:
- Model: Claude Opus, `temperature: 1` (maximum creativity).
- Input: `targetWords`, `knownVocab` (up to 80 words), `targetLanguage`, `sourceLanguage`, `storyTopic`, `userProfile` (age + gender as soft hints).
- `storyTopic` is the primary theme driver; `userProfile` only influences sentence complexity (age) and character gender.
- Blank format in generated text: `___ [conjugated-form] (source-translation)`.
- Validates blank count matches `targetWords.length`; returns `{ error }` on mismatch so caller can fall back.
- Narrative style: one of 12 tones (comic/absurd, suspenseful/mysterious, heartwarming/cozy, etc.) picked at random server-side per call — independent of topic, for variety.

## Story content rules (system prompt)

- Always write in the TARGET language — never the source language.
- Use only ALLOWED VOCABULARY (known words) for non-blank content, plus grammatical function words.
- Each target word appears exactly once as a blank.
- Complexity scales with vocabulary level (simple words → short sentences; advanced → richer prose).
- Stories must be imaginative/fantastical (dragons, time travel, absurd situations) to maximise memorability.

## StoryDisplay answer flow

- Blanks answered sequentially; each calls `submitAnswer()` with `storyContext = storyText`.
- After answering: correct conjugated form shown in green (with `bg-green-50` highlight); wrong answer struck-through in red.
- Enter key advances to the next blank (via `keydown` listener keyed on `currentAnswer?.submitted`).
- `onNextRef` pattern prevents stale closures in the keydown listener.
- `Story.create()` is performed client-side after successful generation; the Server Action only calls Claude.

## Key design decisions

- `loadGenRef` counter prevents React 18 StrictMode double-useEffect from generating two stories on mount.
- Non-streaming generation — full story returned before rendering to avoid layout shifts.
- `sourceLanguage` is read from `settings.sourceLanguage` in the page (not threaded through `SessionItem`) since all items in a session share the same source language.
- `Story.create()` is client-side (Amplify user pool auth); Server Actions have no Amplify client.

## Planned: AI answer evaluation (Phase 7c)

**Status: designed, not yet implemented.**

The goal is to accept valid conjugated/inflected forms that the Levenshtein check rejects — e.g. the student types `laufe` when the story hint shows `[läuft]`.

### Three-tier evaluation

| Tier | Condition | Action |
|---|---|---|
| 1 | Local score ≥ 0.8 | Correct — no API call |
| 2 | Local score = 0.0 (edit cap exceeded) | Wrong — clearly wrong, no API call |
| 3 | 0.0 < local score < 0.8 | Call Claude Haiku: "Is this a valid form?" |

Tier 3 adds ~500 ms latency only for borderline answers; fast-path answers are unaffected.

### Implementation plan

1. Add `evaluateAnswerAI(input)` server action to `actions.ts` — calls Haiku, returns `{ isAccepted, explanation, error }`.
2. Add `scoreOverride?: number` to `SubmitAnswerInput` in `lib/progressActions.ts`. When set, it bypasses the internal `evaluateAnswer()` call.
3. Add `aiNote?: string` to `BlankAnswer` in `story/page.tsx` and `StoryDisplay.tsx`.
4. Add `aiNote?: string` to `FeedbackBanner` props — shown as an italic green line when the AI accepted a borderline answer (e.g. *"Correct past tense form."*).
5. In `handleStorySubmit()`: compute local score first; if borderline, call `evaluateAnswerAI()`; if accepted, pass `scoreOverride: 1.0` and the explanation to `submitAnswer()` and `setStory()`.
6. Also import `evaluateAnswer` from `lib/similarity` and `CORRECT_THRESHOLD` from `lib/progressActions` into `story/page.tsx` for the local pre-check.

This feature is **story mode only** — Phase 4 (word-by-word) always asks for the base lemma form so AI validation is not needed there.

## AI integration surface (all Claude usage in the app)

| Feature | Location | Model | Notes |
|---|---|---|---|
| Topic generation | `actions.ts` | Haiku | Once per profile change; cached in `ProfileTopics` |
| Story generation | `actions.ts` | Opus, temp=1 | Per session group; on-demand |
| Word extraction from text | Phase 6 (planned) | TBD | Paste-a-text flow |
| Answer evaluation | Phase 7 (planned) | TBD | Accept valid inflected forms |
| Word definition suggestions | Phase 7 (planned) | TBD | On manual word entry |
| Forgetting curve personalization | Phase 7 (planned) | TBD | Uses student's recall history |
