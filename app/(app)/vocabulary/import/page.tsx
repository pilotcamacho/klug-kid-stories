'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { languageName } from '@/app/lib/languages';
import { withAuthRetry } from '@/lib/authRetry';
import { extractVocabulary } from './actions';
import type { ExtractedWord } from './actions';

const client = generateClient<Schema>();

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'extracting' | 'review' | 'saving' | 'done';

type WordStatus = 'new' | 'my_vocabulary' | 'preloaded';

interface ReviewRow {
  lemma: string;
  meaning: string;
  pos: ExtractedWord['pos'];
  status: WordStatus;
  checked: boolean;
}

// ─── Styling helpers ──────────────────────────────────────────────────────────

const POS_LABEL: Record<string, string> = {
  noun: 'noun',
  verb: 'verb',
  adjective: 'adj',
  adverb: 'adv',
  other: 'other',
};

const POS_COLOR: Record<string, string> = {
  noun: 'bg-blue-50 text-blue-700',
  verb: 'bg-purple-50 text-purple-700',
  adjective: 'bg-amber-50 text-amber-700',
  adverb: 'bg-teal-50 text-teal-700',
  other: 'bg-gray-100 text-gray-600',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');

  // Languages from UserSettings
  const [targetLanguage, setTargetLanguage] = useState('de');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Idle step
  const [text, setText] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);

  // Review step
  const [rows, setRows] = useState<ReviewRow[]>([]);

  // Done step
  const [addedCount, setAddedCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load language defaults from UserSettings
  useEffect(() => {
    async function load() {
      try {
        const { data } = await withAuthRetry(() => client.models.UserSettings.list());
        const s = data[0];
        if (s?.targetLanguage) setTargetLanguage(s.targetLanguage);
        if (s?.sourceLanguage) setSourceLanguage(s.sourceLanguage);
      } catch {
        // fall back to defaults
      } finally {
        setSettingsLoaded(true);
      }
    }
    load();
  }, []);

  // ── Extraction ───────────────────────────────────────────────────────────────

  async function handleExtract() {
    if (!text.trim()) return;
    setExtractError(null);
    setPhase('extracting');

    const result = await extractVocabulary({ text, targetLanguage, sourceLanguage });

    if (result.error || result.words.length === 0) {
      setExtractError(result.error ?? 'No words found in the text.');
      setPhase('idle');
      return;
    }

    // Fetch all existing WordMeanings for this target language to determine status
    let existing: Schema['WordMeaning']['type'][] = [];
    try {
      const { data } = await withAuthRetry(() =>
        client.models.WordMeaning.list({
          filter: { targetLanguage: { eq: targetLanguage } },
        }),
      );
      existing = data;
    } catch {
      // non-fatal — treat all as new if fetch fails
    }

    // Build lemma → status map; user-owned words take precedence over preloaded
    const statusMap = new Map<string, WordStatus>();
    for (const w of existing) {
      const key = w.lemma.toLowerCase();
      if (w.sourceType !== 'preloaded') {
        statusMap.set(key, 'my_vocabulary');
      } else if (!statusMap.has(key)) {
        statusMap.set(key, 'preloaded');
      }
    }

    const reviewRows: ReviewRow[] = result.words.map((w) => {
      const status: WordStatus = statusMap.get(w.lemma.toLowerCase()) ?? 'new';
      return {
        lemma: w.lemma,
        meaning: w.meaning,
        pos: w.pos,
        status,
        checked: status === 'new',
      };
    });

    setRows(reviewRows);
    setPhase('review');
  }

  // ── Review controls ──────────────────────────────────────────────────────────

  function toggleRow(index: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, checked: !r.checked } : r)));
  }

  function updateMeaning(index: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, meaning: value } : r)));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => (r.status === 'new' ? { ...r, checked } : r)));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const toAdd = rows.filter(
      (r) => r.checked && r.status === 'new' && r.lemma.trim() && r.meaning.trim(),
    );
    if (toAdd.length === 0) return;

    setSaveError(null);
    setPhase('saving');

    try {
      await Promise.all(
        toAdd.map((r) =>
          client.models.WordMeaning.create({
            lemma: r.lemma.trim(),
            meaning: r.meaning.trim(),
            targetLanguage,
            sourceLanguage,
            isShared: false,
            sourceType: 'text_import',
          }),
        ),
      );
      setAddedCount(toAdd.length);
      setPhase('done');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save words.');
      setPhase('review');
    }
  }

  // ── Derived counts ────────────────────────────────────────────────────────────

  const newCount = rows.filter((r) => r.status === 'new').length;
  const alreadyCount = rows.length - newCount;
  const selectedCount = rows.filter((r) => r.checked && r.status === 'new').length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/vocabulary')}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Import from text</h1>
      </div>

      {/* Step 1 — Paste */}
      {(phase === 'idle' || phase === 'extracting') && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-4">
            Paste a text in{' '}
            <span className="font-medium">
              {settingsLoaded ? languageName(targetLanguage) : '…'}
            </span>
            . Claude will extract up to 50 content words, lemmatize them, and suggest a meaning in{' '}
            <span className="font-medium">
              {settingsLoaded ? languageName(sourceLanguage) : '…'}
            </span>
            .
          </p>

          <textarea
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            rows={8}
            placeholder={`Paste your ${settingsLoaded ? languageName(targetLanguage) : 'target language'} text here…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={phase === 'extracting'}
          />

          {extractError && (
            <p className="mt-2 text-sm text-red-500">{extractError}</p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Language defaults come from your{' '}
              <button
                onClick={() => router.push('/settings')}
                className="underline hover:text-gray-600"
              >
                Settings
              </button>
              .
            </p>
            <button
              onClick={handleExtract}
              disabled={phase === 'extracting' || !text.trim()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {phase === 'extracting' ? 'Extracting…' : 'Extract vocabulary'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Review */}
      {phase === 'review' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">
                {newCount} new word{newCount !== 1 ? 's' : ''}
              </span>{' '}
              found
              {alreadyCount > 0 && (
                <span className="text-gray-400">
                  {' '}· {alreadyCount} already available
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <button
                onClick={() => toggleAll(true)}
                className="hover:text-indigo-600 transition-colors"
              >
                Select all
              </button>
              <span>·</span>
              <button
                onClick={() => toggleAll(false)}
                className="hover:text-indigo-600 transition-colors"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3">Word</th>
                  <th className="px-4 py-3 w-16">Type</th>
                  <th className="px-4 py-3">Meaning</th>
                  <th className="px-4 py-3 w-40">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => {
                  const isNew = row.status === 'new';
                  return (
                    <tr
                      key={`${row.lemma}-${i}`}
                      className={isNew ? 'hover:bg-gray-50' : 'opacity-50 bg-gray-50/50'}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={() => isNew && toggleRow(i)}
                          disabled={!isNew}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.lemma}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${POS_COLOR[row.pos]}`}
                        >
                          {POS_LABEL[row.pos]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isNew ? (
                          <input
                            type="text"
                            value={row.meaning}
                            onChange={(e) => updateMeaning(i, e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="text-gray-500">{row.meaning}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'new' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            New
                          </span>
                        )}
                        {row.status === 'my_vocabulary' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            In your vocabulary
                          </span>
                        )}
                        {row.status === 'preloaded' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                            Available
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {saveError && (
            <p className="mb-3 text-sm text-red-500">{saveError}</p>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setPhase('idle')}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Start over
            </button>
            <button
              onClick={handleSave}
              disabled={selectedCount === 0}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add {selectedCount > 0 ? selectedCount : ''} word
              {selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </>
      )}

      {/* Step 3 — Saving */}
      {phase === 'saving' && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Saving words…</p>
        </div>
      )}

      {/* Step 4 — Done */}
      {phase === 'done' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">
            {addedCount} word{addedCount !== 1 ? 's' : ''} added
          </p>
          <p className="text-sm text-gray-500 mb-6">
            They will appear in your vocabulary and be introduced during review sessions
            in insertion order.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setText('');
                setRows([]);
                setExtractError(null);
                setPhase('idle');
              }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Import another text
            </button>
            <button
              onClick={() => router.push('/vocabulary')}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
            >
              Back to vocabulary
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
