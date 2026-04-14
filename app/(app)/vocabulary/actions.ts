'use server';

import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '@/app/lib/languages';

export interface SuggestDefinitionInput {
  lemma: string;
  targetLanguage: string;
  sourceLanguage: string;
}

export interface SuggestDefinitionOutput {
  meaning: string;
  exampleSentence: string;
  error: string | null;
}

export async function suggestDefinition(
  input: SuggestDefinitionInput,
): Promise<SuggestDefinitionOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { meaning: '', exampleSentence: '', error: 'Missing API key.' };
  }

  const { lemma, targetLanguage, sourceLanguage } = input;

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You provide concise word definitions for language learners.
Given a word in the target language, return a JSON object with:
- "meaning": a concise 1–5 word definition in the source language (use the base/dictionary form, e.g. "to run" not "running")
- "exampleSentence": one natural example sentence in the target language using the word in context

Return valid JSON only — no markdown, no code fences, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Word: ${lemma}
Target language: ${languageName(targetLanguage)}
Source language: ${languageName(sourceLanguage)}

Return JSON only.`,
        },
      ],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { meaning: '', exampleSentence: '', error: 'Could not parse response.' };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { meaning: '', exampleSentence: '', error: 'Unexpected response format.' };
    }

    const obj = parsed as Record<string, unknown>;
    const meaning = String(obj.meaning ?? '').trim();
    const exampleSentence = String(obj.exampleSentence ?? '').trim();

    if (!meaning) {
      return { meaning: '', exampleSentence: '', error: 'No definition returned.' };
    }

    return { meaning, exampleSentence, error: null };
  } catch (err) {
    return {
      meaning: '',
      exampleSentence: '',
      error: err instanceof Error ? err.message : 'Suggestion failed.',
    };
  }
}
