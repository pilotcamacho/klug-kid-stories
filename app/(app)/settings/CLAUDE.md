# app/(app)/settings/ — User Settings (Phase 4–5)

## Daily Limits

| Setting | Description | Default |
|---|---|---|
| `maxNewWordsPerDay` | Maximum new word meanings introduced in a single day. Once reached, the session only shows reviews. | 10 |
| `maxReviewsPerDay` | Maximum review items surfaced in a single day. Once reached, no further reviews are offered until the next day. | 100 |

**Behavior rules:**
- Both limits are enforced at session-start time and rechecked if a session spans midnight.
- "New word" counts any `UserWordProgress` record created for the first time on that calendar day (in the user's local timezone).
- "Review" counts each individual word meaning presented during a review session, not each story.
- Sensible defaults apply if no `UserSettings` record exists yet for a user.
- **Language filtering:** Review sessions only surface words whose `targetLanguage` matches `UserSettings.targetLanguage`. If no target language is configured, the session blocks with a prompt to visit Settings. Daily review counts are scoped to the active target language, so switching languages mid-day does not consume another language's quota.

**New word ordering:**
- Words from the **pre-loaded frequency list** are introduced in ascending frequency rank order (most frequent first).
- Words added **manually or via text import** are introduced in insertion order (oldest first).
- When both sources are available, pre-loaded words take priority over user-added words within the same day's new-word slot.

## Student Profile

Collected on this page. Used exclusively to personalise AI-generated stories — not used for any SRS scheduling logic.

| Field | UI input | Purpose |
|---|---|---|
| `profileDateOfBirth` | Date picker | Age is calculated at runtime from DOB; drives story complexity |
| `profileGender` | Dropdown | Main story character matches the student's gender |
| `profileInterests` | Free text | Story themes are drawn from the student's interests |

Profile changes invalidate the cached `ProfileTopics` record — the story page detects this via `profileSnapshot` comparison and regenerates topics automatically on the next story session.
