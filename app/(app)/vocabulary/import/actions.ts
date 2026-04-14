'use server';

import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '@/app/lib/languages';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedWord {
  lemma: string;
  meaning: string;
  pos: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
}

export interface ExtractVocabularyInput {
  text: string;
  targetLanguage: string;
  sourceLanguage: string;
}

export interface ExtractVocabularyOutput {
  words: ExtractedWord[];
  error: string | null;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM_PROMPT = `You extract vocabulary from a text for language learners.

Given a text in a TARGET LANGUAGE, extract up to 50 content words and return them as a JSON array.

Rules:
1. Extract only content words: nouns, verbs, adjectives, adverbs. Skip function words (articles, prepositions, conjunctions, pronouns, auxiliary verbs, numbers).
2. Lemmatize every word to its base/dictionary form: infinitive for verbs, nominative singular for nouns, masculine singular nominative for adjectives.
3. If a word has two clearly distinct senses that are both relevant to the text, include it twice with different meanings.
4. Remove duplicates: same lemma + same meaning = one entry only.
5. Provide a concise meaning in the SOURCE LANGUAGE (1–5 words). Use the base/dictionary form for verbs (e.g. "to run" not "running").
6. Label each word's part of speech: noun, verb, adjective, adverb, or other.
7. Return valid JSON only — no markdown, no code fences, no explanation.

Output format:
[
  { "lemma": "laufen", "meaning": "to run", "pos": "verb" },
  { "lemma": "Hund", "meaning": "dog", "pos": "noun" }
]`;

function buildExtractPrompt(input: ExtractVocabularyInput): string {
  return `TARGET LANGUAGE: ${languageName(input.targetLanguage)}
SOURCE LANGUAGE: ${languageName(input.sourceLanguage)}

TEXT:
${input.text.trim()}

Extract up to 50 content words from this text. Return JSON only.`;
}

// ─── Server Action ────────────────────────────────────────────────────────────

export async function extractVocabulary(
  input: ExtractVocabularyInput,
): Promise<ExtractVocabularyOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { words: [], error: 'Missing API key.' };
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildExtractPrompt(input) }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    // Strip markdown code fences if Claude adds them despite the instruction
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { words: [], error: 'Could not parse Claude response. Please try again.' };
    }

    if (!Array.isArray(parsed)) {
      return { words: [], error: 'Unexpected response format. Please try again.' };
    }

    const VALID_POS = new Set(['noun', 'verb', 'adjective', 'adverb']);

    const words: ExtractedWord[] = parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .map((item) => ({
        lemma: String(item.lemma ?? '').trim(),
        meaning: String(item.meaning ?? '').trim(),
        pos: (VALID_POS.has(String(item.pos))
          ? String(item.pos)
          : 'other') as ExtractedWord['pos'],
      }))
      .filter((w) => w.lemma.length > 0 && w.meaning.length > 0)
      .slice(0, 50);

    if (words.length === 0) {
      return { words: [], error: 'No content words found in the text.' };
    }

    return { words, error: null };
  } catch (err) {
    return {
      words: [],
      error: err instanceof Error ? err.message : 'Extraction failed.',
    };
  }
}
