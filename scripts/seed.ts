/**
 * Seed script — loads pre-built frequency word lists into DynamoDB via the
 * AppSync API using API key authentication.
 *
 * Usage:
 *   npx tsx scripts/seed.ts [--lang de-en] [--dry-run]
 *
 * Prerequisites:
 *   - Run `npx ampx sandbox` first so amplify_outputs.json exists.
 *   - The Amplify sandbox must be running (or the Amplify environment deployed).
 *
 * The script is idempotent: it skips words that already exist (matched by
 * lemma + targetLanguage + sourceLanguage).
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { Schema } from '../amplify/data/resource';

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const langFilter = (() => {
  const idx = args.indexOf('--lang');
  return idx !== -1 ? args[idx + 1] : null;
})();

// ── Amplify configuration ────────────────────────────────────────────────────

const outputsPath = join(process.cwd(), 'amplify_outputs.json');
let outputs: Record<string, unknown>;
try {
  outputs = JSON.parse(readFileSync(outputsPath, 'utf-8'));
} catch {
  console.error(
    '✗ amplify_outputs.json not found. Run `npx ampx sandbox` first.',
  );
  process.exit(1);
}

Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);
const client = generateClient<Schema>({ authMode: 'apiKey' });

// ── Seed entry type ──────────────────────────────────────────────────────────

interface SeedEntry {
  lemma: string;
  meaning: string;
  targetLanguage: string;
  sourceLanguage: string;
  exampleSentence?: string;
  frequencyRank: number;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  const seedsDir = join(process.cwd(), 'data', 'seeds');
  let files: string[];

  try {
    files = readdirSync(seedsDir).filter((f) => f.endsWith('.json'));
  } catch {
    console.error(`✗ Seed directory not found: ${seedsDir}`);
    process.exit(1);
  }

  if (langFilter) {
    files = files.filter((f) => f === `${langFilter}.json`);
    if (files.length === 0) {
      console.error(`✗ No seed file found for language pair: ${langFilter}`);
      process.exit(1);
    }
  }

  console.log(
    `Seeding ${files.length} file(s)${dryRun ? ' [DRY RUN]' : ''}...\n`,
  );

  for (const file of files) {
    const langPair = basename(file, '.json');
    console.log(`── ${langPair} ──────────────────────────────`);

    const entries: SeedEntry[] = JSON.parse(
      readFileSync(join(seedsDir, file), 'utf-8'),
    );

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const entry of entries) {
      // Check for existing record (deduplication by lemma + language pair)
      const { data: existing } = await client.models.WordMeaning.list({
        filter: {
          and: [
            { lemma: { eq: entry.lemma } },
            { targetLanguage: { eq: entry.targetLanguage } },
            { sourceLanguage: { eq: entry.sourceLanguage } },
            { isShared: { eq: true } },
          ],
        },
      });

      if (existing.length > 0) {
        console.log(`  ~ skip  [#${entry.frequencyRank}] ${entry.lemma}`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  + would create [#${entry.frequencyRank}] ${entry.lemma}`);
        created++;
        continue;
      }

      const { errors: createErrors } = await client.models.WordMeaning.create({
        lemma: entry.lemma,
        meaning: entry.meaning,
        targetLanguage: entry.targetLanguage,
        sourceLanguage: entry.sourceLanguage,
        exampleSentence: entry.exampleSentence,
        frequencyRank: entry.frequencyRank,
        isShared: true,
        sourceType: 'preloaded',
      });

      if (createErrors && createErrors.length > 0) {
        console.error(
          `  ✗ error  [#${entry.frequencyRank}] ${entry.lemma}:`,
          createErrors,
        );
        errors++;
      } else {
        console.log(`  ✓ created [#${entry.frequencyRank}] ${entry.lemma}`);
        created++;
      }
    }

    console.log(
      `\n  ${langPair}: ${created} created, ${skipped} skipped, ${errors} errors\n`,
    );
  }

  console.log('Done.');
}

seed().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
