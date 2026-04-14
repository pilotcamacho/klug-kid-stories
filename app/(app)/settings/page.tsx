'use client';

import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { LANGUAGES } from '@/app/lib/languages';
import { withAuthRetry } from '@/lib/authRetry';

const client = generateClient<Schema>();

type UserSettings = Schema['UserSettings']['type'];

const DEFAULT_MAX_NEW_WORDS = 10;
const DEFAULT_MAX_REVIEWS = 100;

export default function SettingsPage() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('de');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [maxNewWordsPerDay, setMaxNewWordsPerDay] = useState(DEFAULT_MAX_NEW_WORDS);
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(DEFAULT_MAX_REVIEWS);
  const [profileDateOfBirth, setProfileDateOfBirth] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const [profileInterests, setProfileInterests] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load existing settings ─────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const { data } = await withAuthRetry(() => client.models.UserSettings.list());
        const existing = data[0] as UserSettings | undefined;
        if (existing) {
          setSettingsId(existing.id);
          setTargetLanguage(existing.targetLanguage ?? 'de');
          setSourceLanguage(existing.sourceLanguage ?? 'en');
          setMaxNewWordsPerDay(existing.maxNewWordsPerDay ?? DEFAULT_MAX_NEW_WORDS);
          setMaxReviewsPerDay(existing.maxReviewsPerDay ?? DEFAULT_MAX_REVIEWS);
          setProfileDateOfBirth(existing.profileDateOfBirth ?? '');
          setProfileGender(existing.profileGender ?? '');
          setProfileInterests(existing.profileInterests ?? '');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const payload = {
      targetLanguage,
      sourceLanguage,
      maxNewWordsPerDay,
      maxReviewsPerDay,
      profileDateOfBirth: profileDateOfBirth || undefined,
      profileGender: profileGender || undefined,
      profileInterests: profileInterests || undefined,
    };

    try {
      if (settingsId) {
        const { errors } = await client.models.UserSettings.update({
          id: settingsId,
          ...payload,
        });
        if (errors?.length) throw new Error(errors[0].message);
      } else {
        const { data, errors } = await client.models.UserSettings.create(payload);
        if (errors?.length) throw new Error(errors[0].message);
        setSettingsId(data?.id ?? null);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <form onSubmit={handleSave} className="space-y-6 max-w-lg">
        {/* Language preferences */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Language
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between px-5 py-4 gap-4">
              <div>
                <label
                  htmlFor="targetLanguage"
                  className="text-sm font-medium text-gray-700"
                >
                  Target language
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  The language you are learning
                </p>
              </div>
              <select
                id="targetLanguage"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between px-5 py-4 gap-4">
              <div>
                <label
                  htmlFor="sourceLanguage"
                  className="text-sm font-medium text-gray-700"
                >
                  Source language
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Your native or reference language
                </p>
              </div>
              <select
                id="sourceLanguage"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Daily limits */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Daily Limits
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between px-5 py-4 gap-4">
              <div>
                <label
                  htmlFor="maxNewWords"
                  className="text-sm font-medium text-gray-700"
                >
                  New words per day
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Maximum new word meanings introduced daily
                </p>
              </div>
              <input
                id="maxNewWords"
                type="number"
                min={1}
                max={200}
                value={maxNewWordsPerDay}
                onChange={(e) =>
                  setMaxNewWordsPerDay(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-20 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between px-5 py-4 gap-4">
              <div>
                <label
                  htmlFor="maxReviews"
                  className="text-sm font-medium text-gray-700"
                >
                  Reviews per day
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Maximum review items surfaced daily
                </p>
              </div>
              <input
                id="maxReviews"
                type="number"
                min={1}
                max={1000}
                value={maxReviewsPerDay}
                onChange={(e) =>
                  setMaxReviewsPerDay(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-20 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        {/* Student profile */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Student Profile
            </h2>
          </div>
          <p className="px-5 pt-3 text-xs text-gray-400">
            Used to personalise story themes and complexity.
          </p>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between px-5 py-4 gap-4">
              <div>
                <label htmlFor="profileDateOfBirth" className="text-sm font-medium text-gray-700">
                  Date of birth
                </label>
                <p className="text-xs text-gray-400 mt-0.5">Used to tailor story complexity and themes</p>
              </div>
              <input
                id="profileDateOfBirth"
                type="date"
                value={profileDateOfBirth}
                onChange={(e) => setProfileDateOfBirth(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between px-5 py-4 gap-4">
              <div>
                <label htmlFor="profileGender" className="text-sm font-medium text-gray-700">
                  Gender
                </label>
                <p className="text-xs text-gray-400 mt-0.5">Helps personalise story characters</p>
              </div>
              <select
                id="profileGender"
                value={profileGender}
                onChange={(e) => setProfileGender(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="px-5 py-4">
              <div className="mb-2">
                <label htmlFor="profileInterests" className="text-sm font-medium text-gray-700">
                  Interests
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Topics you enjoy — used to choose story themes (e.g. dinosaurs, football, cooking)
                </p>
              </div>
              <input
                id="profileInterests"
                type="text"
                placeholder="e.g. football, animals, space"
                value={profileInterests}
                onChange={(e) => setProfileInterests(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        {/* Error / success */}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {saved && (
          <p className="text-sm text-green-600">Settings saved.</p>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
