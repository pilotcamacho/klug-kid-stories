'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { suggestDefinition } from './actions';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { LANGUAGES, languageName } from '@/app/lib/languages';
import { withAuthRetry } from '@/lib/authRetry';

const client = generateClient<Schema>();

type WordMeaning = Schema['WordMeaning']['type'];

// ── Add / Edit form state ────────────────────────────────────────────────────

interface WordForm {
  lemma: string;
  meaning: string;
  targetLanguage: string;
  sourceLanguage: string;
  exampleSentence: string;
}

const EMPTY_FORM: WordForm = {
  lemma: '',
  meaning: '',
  targetLanguage: 'de',
  sourceLanguage: 'en',
  exampleSentence: '',
};

// ── Sub-components ───────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function WordFormFields({
  form,
  onChange,
  onSuggest,
  suggesting,
}: {
  form: WordForm;
  onChange: (f: WordForm) => void;
  onSuggest?: () => void;
  suggesting?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Word (lemma / base form) <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={form.lemma}
          onChange={(e) => onChange({ ...form, lemma: e.target.value })}
          placeholder="e.g. laufen"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Meaning <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={form.meaning}
          onChange={(e) => onChange({ ...form, meaning: e.target.value })}
          placeholder="e.g. to run"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Target language <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.targetLanguage}
            onChange={(e) => onChange({ ...form, targetLanguage: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Source language <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.sourceLanguage}
            onChange={(e) => onChange({ ...form, sourceLanguage: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Example sentence{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={form.exampleSentence}
          onChange={(e) => onChange({ ...form, exampleSentence: e.target.value })}
          placeholder="e.g. Ich laufe jeden Morgen."
        />
      </div>
      {onSuggest && (
        <button
          type="button"
          onClick={onSuggest}
          disabled={!form.lemma.trim() || suggesting}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {suggesting ? 'Suggesting…' : '✦ Suggest meaning & example sentence'}
        </button>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function VocabularyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'my-words' | 'browse'>('my-words');

  // My Words state
  const [myWords, setMyWords] = useState<WordMeaning[]>([]);
  const [myWordsLoading, setMyWordsLoading] = useState(true);
  const [myWordsError, setMyWordsError] = useState<string | null>(null);

  // Browse state
  const [browseWords, setBrowseWords] = useState<WordMeaning[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseFetched, setBrowseFetched] = useState(false);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWord, setEditingWord] = useState<WordMeaning | null>(null);
  const [form, setForm] = useState<WordForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Suggest state
  const [suggesting, setSuggesting] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchMyWords() {
    setMyWordsLoading(true);
    setMyWordsError(null);
    try {
      const { data, errors } = await withAuthRetry(() => client.models.WordMeaning.list({
        filter: { sourceType: { ne: 'preloaded' } },
      }));
      if (errors?.length) throw new Error(errors[0].message);
      setMyWords(data.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')));
    } catch (err) {
      setMyWordsError(err instanceof Error ? err.message : 'Failed to load words.');
    } finally {
      setMyWordsLoading(false);
    }
  }

  async function fetchBrowseWords() {
    if (browseFetched) return;
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const { data, errors } = await withAuthRetry(() => client.models.WordMeaning.list({
        filter: { isShared: { eq: true } },
      }));
      if (errors?.length) throw new Error(errors[0].message);
      setBrowseWords(
        data.sort((a, b) => (a.frequencyRank ?? 9999) - (b.frequencyRank ?? 9999)),
      );
      setBrowseFetched(true);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Failed to load pre-loaded words.');
    } finally {
      setBrowseLoading(false);
    }
  }

  useEffect(() => {
    fetchMyWords();
  }, []);

  useEffect(() => {
    if (tab === 'browse') fetchBrowseWords();
  }, [tab]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function openAddModal() {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowAddModal(true);
  }

  function openEditModal(word: WordMeaning) {
    setForm({
      lemma: word.lemma,
      meaning: word.meaning,
      targetLanguage: word.targetLanguage,
      sourceLanguage: word.sourceLanguage,
      exampleSentence: word.exampleSentence ?? '',
    });
    setSaveError(null);
    setEditingWord(word);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingWord(null);
  }

  async function handleSuggest() {
    if (!form.lemma.trim()) return;
    setSuggesting(true);
    const result = await suggestDefinition({
      lemma: form.lemma.trim(),
      targetLanguage: form.targetLanguage,
      sourceLanguage: form.sourceLanguage,
    });
    if (!result.error) {
      setForm((f) => ({
        ...f,
        meaning: result.meaning || f.meaning,
        exampleSentence: result.exampleSentence || f.exampleSentence,
      }));
    }
    setSuggesting(false);
  }

  async function handleSave() {
    if (!form.lemma.trim() || !form.meaning.trim()) {
      setSaveError('Word and meaning are required.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    if (editingWord) {
      const { errors } = await client.models.WordMeaning.update({
        id: editingWord.id,
        lemma: form.lemma.trim(),
        meaning: form.meaning.trim(),
        targetLanguage: form.targetLanguage,
        sourceLanguage: form.sourceLanguage,
        exampleSentence: form.exampleSentence.trim() || undefined,
      });
      if (errors?.length) {
        setSaveError(errors[0].message);
      } else {
        closeModal();
        await fetchMyWords();
      }
    } else {
      const { errors } = await client.models.WordMeaning.create({
        lemma: form.lemma.trim(),
        meaning: form.meaning.trim(),
        targetLanguage: form.targetLanguage,
        sourceLanguage: form.sourceLanguage,
        exampleSentence: form.exampleSentence.trim() || undefined,
        isShared: false,
        sourceType: 'manual',
      });
      if (errors?.length) {
        setSaveError(errors[0].message);
      } else {
        closeModal();
        await fetchMyWords();
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this word? This cannot be undone.')) return;
    setDeletingId(id);
    await client.models.WordMeaning.delete({ id });
    setDeletingId(null);
    await fetchMyWords();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vocabulary</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/vocabulary/import')}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Import from text
          </button>
          <button
            onClick={openAddModal}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Add word
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            { key: 'my-words', label: `My Words (${myWords.length})` },
            { key: 'browse', label: 'Browse Pre-loaded' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* My Words tab */}
      {tab === 'my-words' && (
        <>
          {myWordsLoading && (
            <p className="text-sm text-gray-400">Loading...</p>
          )}
          {myWordsError && (
            <p className="text-sm text-red-500">{myWordsError}</p>
          )}
          {!myWordsLoading && !myWordsError && myWords.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No words yet.</p>
              <p className="text-xs mt-1">Click &ldquo;+ Add word&rdquo; to get started.</p>
            </div>
          )}
          {!myWordsLoading && myWords.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Word</th>
                    <th className="px-4 py-3">Meaning</th>
                    <th className="px-4 py-3">Language</th>
                    <th className="px-4 py-3">Example</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {myWords.map((word) => (
                    <tr key={word.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {word.lemma}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{word.meaning}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {languageName(word.targetLanguage)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 italic max-w-xs truncate">
                        {word.exampleSentence ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(word)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(word.id)}
                          disabled={deletingId === word.id}
                          className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                        >
                          {deletingId === word.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Browse Pre-loaded tab */}
      {tab === 'browse' && (
        <>
          {browseLoading && (
            <p className="text-sm text-gray-400">Loading...</p>
          )}
          {browseError && (
            <p className="text-sm text-red-500">{browseError}</p>
          )}
          {!browseLoading && !browseError && browseWords.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No pre-loaded words found.</p>
              <p className="text-xs mt-1">
                Run <code className="bg-gray-100 px-1 rounded">npx tsx scripts/seed.ts</code>{' '}
                to populate the word list.
              </p>
            </div>
          )}
          {!browseLoading && browseWords.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 w-16">Rank</th>
                    <th className="px-4 py-3">Word</th>
                    <th className="px-4 py-3">Meaning</th>
                    <th className="px-4 py-3">Language</th>
                    <th className="px-4 py-3">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {browseWords.map((word) => (
                    <tr key={word.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        #{word.frequencyRank}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {word.lemma}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{word.meaning}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {languageName(word.targetLanguage)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 italic max-w-xs truncate">
                        {word.exampleSentence ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add word modal */}
      {showAddModal && (
        <Modal title="Add New Word" onClose={closeModal}>
          <WordFormFields form={form} onChange={setForm} onSuggest={handleSuggest} suggesting={suggesting} />
          {saveError && (
            <p className="mt-3 text-xs text-red-500">{saveError}</p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add Word'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit word modal */}
      {editingWord && (
        <Modal title="Edit Word" onClose={closeModal}>
          <WordFormFields form={form} onChange={setForm} onSuggest={handleSuggest} suggesting={suggesting} />
          {saveError && (
            <p className="mt-3 text-xs text-red-500">{saveError}</p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
