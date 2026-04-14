# app/(app)/review/ — Core Review Sessions (Phase 4)

Word-by-word typed-answer review. This is the default review mode (`/review`); story mode (`/review/story`) is opt-in via a "Try Story Mode" button.

## Components

| File | Purpose |
|---|---|
| `page.tsx` | Session state machine and DynamoDB orchestration |
| `components/AnswerInput.tsx` | Controlled text input for typed answers |
| `components/FeedbackBanner.tsx` | Shows correct/incorrect feedback + next review label |
| `components/ReviewCard.tsx` | Renders one word card: question, example sentence, input, feedback |
| `components/SessionHeader.tsx` | Progress bar and word count |
| `components/EmptySession.tsx` | Shown when no words are due |
| `components/SessionSummary.tsx` | End-of-session summary screen |

## State machine (`page.tsx`)

`loading → active → complete | error`

- **loading**: parallel DynamoDB fetch (`UserSettings`, `UserWordProgress`, `ReviewEvent` today, `WordMeaning`), wrapped in `withAuthRetry`.
- **active**: one `SessionItem` at a time; `submitAnswer()` called on submit.
- **complete**: `SessionSummary` shown.
- Midnight recheck: `location.reload()` triggered on group transition if wall-clock date has advanced.

## Key design decisions

- All data access is client-side via `generateClient<Schema>()` — no Server Actions or API routes.
- `introducedAt` is set in JS at `UserWordProgress` creation time; the page computes local calendar day boundaries and passes them to `buildSession()`.
- Reviews are shown before new words within a session (reinforce before introducing new load).
- Words are filtered to `settings.targetLanguage` before `buildSession()` is called. Review event counts are scoped to that language's word IDs so daily quotas are per-language, not global.

## ReviewCard answer display (post-submit)

After submission the input is replaced by a static display:
- Wrong answer: struck-through in red, then correct lemma in green.
- Correct answer: just the lemma in green.
- Enter key advances to the next card (via `keydown` listener keyed on the `submitted` state).
