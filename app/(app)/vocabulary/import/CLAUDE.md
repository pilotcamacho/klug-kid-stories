# app/(app)/vocabulary/import/ — Text Import (Phase 6)

Paste-a-text flow: Claude extracts content words, lemmatizes them, and the student selects which ones to add to their vocabulary.

## Files

| File | Purpose |
|---|---|
| `page.tsx` | Four-phase UI: paste → extracting → review → done |
| `actions.ts` | Server Action: `extractVocabulary()` → Claude Haiku |

## Flow

1. **Paste** — student pastes a text in the target language. Languages default from `UserSettings`; a link to Settings is shown if they need to change them.
2. **Extracting** — `extractVocabulary()` server action calls Claude Haiku. Button shows "Extracting…" and is disabled.
3. **Review** — table of extracted words with per-row status. Student can edit meanings inline before saving.
4. **Done** — success screen with count; options to import another text or return to vocabulary.

## Word status logic

After extraction, the page fetches all `WordMeaning` records for `targetLanguage` and builds a status map:

| Status | Meaning | Checkbox |
|---|---|---|
| `new` | No existing record for this lemma | Enabled, checked by default |
| `my_vocabulary` | User already owns a word with this lemma | Disabled (greyed out) |
| `preloaded` | Pre-loaded shared word exists for this lemma | Disabled (greyed out), shown as "Available" |

User-owned status takes precedence over preloaded if both exist for the same lemma.

## Claude extraction rules (actions.ts)

- Model: Claude Haiku (fast + cheap for this structured extraction task).
- Extracts only content words: nouns, verbs, adjectives, adverbs — skips function words.
- Lemmatizes to base/dictionary form (infinitive for verbs, nominative singular for nouns, etc.).
- Returns polysemous words twice if both senses appear relevant to the text.
- Returns JSON array: `[{ lemma, meaning, pos }]`, max 50 entries.
- Strips markdown code fences defensively before JSON parsing.
- `sourceType: 'text_import'` is set on all created `WordMeaning` records.
- No `UserWordProgress` is created on save — the scheduler introduces words in insertion order.
