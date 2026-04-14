'use server';

import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '@/app/lib/languages';
import { countBlanks } from '@/lib/storySession';
import type { KnownVocabWord } from '@/lib/storySession';

// --- Types ---

export interface GenerateStoryInput {
  targetWords: Array<{
    wordMeaningId: string;
    lemma: string;
    meaning: string;
  }>;
  knownVocab: KnownVocabWord[];
  targetLanguage: string;   // ISO 639-1, e.g. "de"
  sourceLanguage: string;   // ISO 639-1, e.g. "en"
}

export interface GenerateStoryOutput {
  storyText: string;
  targetWordMeaningIds: string[];
  error: string | null;
}

// --- Prompt ---

const SYSTEM_PROMPT = `You are a language learning story generator. Your task is to write a short, engaging story (3–6 sentences) to help a student practise vocabulary.

Rules you must follow without exception:
1. Write the story in the TARGET language.
2. Every word you use (except the blank words) must come from the ALLOWED VOCABULARY list provided by the user, or be a common grammatical function word (articles, prepositions, conjunctions, auxiliary verbs, pronouns, numbers). Do not introduce vocabulary outside these categories.
3. For each TARGET WORD, replace its occurrence in the story with a blank in EXACTLY this format: ___ [conjugated-form] (source-translation)
   - ___ is the blank marker (three underscores).
   - [conjugated-form] is the actual inflected/conjugated/declined form of the target word as it appears in that sentence (e.g. [läuft], [couraient], [corriendo]).
   - (source-translation) is the base/lemma form in the SOURCE language, exactly as provided in the TARGET WORDS list.
   - Example: ___ [runs] (to run)
4. Each target word must appear exactly once in the story as a blank.
5. If the ALLOWED VOCABULARY list has fewer than 15 words, write the story entirely in the SOURCE language instead, but still insert the blanks in the same ___ [conjugated-form] (source-translation) format — the blank is always the target-language word the student must type.
6. Output only the story text. No headers, labels, commentary, or explanation.
7. The story should be coherent and the correct word for each blank should be reasonably inferable from context.`;

function buildUserPrompt(input: GenerateStoryInput): string {
  const targetLang = languageName(input.targetLanguage);
  const sourceLang = languageName(input.sourceLanguage);

  const targetWordLines = input.targetWords
    .map((w) => `- ${w.lemma} (${w.meaning})`)
    .join('\n');

  // Cap at 80 words; they are pre-sorted by retention score descending by buildKnownVocab()
  const vocabList = input.knownVocab
    .slice(0, 80)
    .map((w) => w.lemma)
    .join(', ');

  return `TARGET LANGUAGE: ${targetLang}
SOURCE LANGUAGE: ${sourceLang}

TARGET WORDS (these become blanks in the story):
${targetWordLines}

ALLOWED VOCABULARY (use only these words for non-blank content, plus grammatical function words):
${vocabList || '(none yet)'}

Write the story now.`;
}

// --- Server Action ---

/**
 * Calls the Claude API to generate a story for a group of target words.
 * Never throws — returns { error } on any failure so the caller can fall back gracefully.
 */
export async function generateStory(input: GenerateStoryInput): Promise<GenerateStoryOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('[generateStory] ANTHROPIC_API_KEY present:', !!apiKey, '| length:', apiKey?.length ?? 0);
  if (!apiKey) {
    return {
      storyText: '',
      targetWordMeaningIds: [],
      error: 'Story generation is not configured (missing API key).',
    };
  }

  try {
    // Instantiate inside the function body — never at module scope — so the key
    // is only read server-side and never bundled into client code.
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    const storyText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    // Validate that the response contains exactly the expected number of blanks.
    const expectedBlanks = input.targetWords.length;
    if (countBlanks(storyText) !== expectedBlanks) {
      return {
        storyText: '',
        targetWordMeaningIds: [],
        error: `Story generation produced an unexpected number of blanks (expected ${expectedBlanks}). Falling back to word-by-word mode.`,
      };
    }

    return {
      storyText,
      targetWordMeaningIds: input.targetWords.map((w) => w.wordMeaningId),
      error: null,
    };
  } catch (err) {
    return {
      storyText: '',
      targetWordMeaningIds: [],
      error: err instanceof Error ? err.message : 'Story generation failed.',
    };
  }
}
