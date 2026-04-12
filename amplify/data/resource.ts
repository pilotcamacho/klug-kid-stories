import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

/**
 * Data schema for Klug Kid Stories.
 *
 * Core design decisions:
 * - WordMeaning is the atomic unit: one row per distinct semantic sense of a lemma.
 * - UserWordProgress links a user to a word meaning and holds the SRS scheduling state.
 * - ReviewEvent is the immutable audit log used to refine the forgetting curve.
 * - Story is a generated review artefact; it is ephemeral and not queried historically.
 */
const schema = a.schema({
  // ─── Vocabulary ────────────────────────────────────────────────────────────

  WordMeaning: a
    .model({
      /** Lemma (base form, no inflection). e.g. "run", "être", "correr" */
      lemma: a.string().required(),
      /** Human-readable definition in the student's source language */
      meaning: a.string().required(),
      /** ISO 639-1 code of the language being learned. e.g. "de", "fr" */
      targetLanguage: a.string().required(),
      /** ISO 639-1 code of the student's native/reference language. e.g. "en" */
      sourceLanguage: a.string().required(),
      /** Optional example sentence in the target language */
      exampleSentence: a.string(),
      /**
       * When true this word meaning can appear in stories and progress data
       * of other users (used for pre-loaded frequency vocabulary).
       */
      isShared: a.boolean(),
      userProgress: a.hasMany('UserWordProgress', 'wordMeaningId'),
      reviewEvents: a.hasMany('ReviewEvent', 'wordMeaningId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  // ─── SRS Progress ──────────────────────────────────────────────────────────

  UserWordProgress: a
    .model({
      wordMeaningId: a.id().required(),
      wordMeaning: a.belongsTo('WordMeaning', 'wordMeaningId'),
      /**
       * Estimated retention: value in [0, 1] where 1 = fully retained.
       * Computed by the proprietary SRS algorithm after each review event.
       */
      retentionScore: a.float(),
      /** Timestamp when the scheduler will surface this word for review again */
      nextReviewAt: a.datetime().required(),
      lastReviewedAt: a.datetime(),
      reviewCount: a.integer(),
      correctCount: a.integer(),
    })
    .authorization((allow) => [allow.owner()]),

  // ─── Review History ────────────────────────────────────────────────────────

  ReviewEvent: a
    .model({
      wordMeaningId: a.id().required(),
      wordMeaning: a.belongsTo('WordMeaning', 'wordMeaningId'),
      wasCorrect: a.boolean().required(),
      /** Time the student took to answer, in milliseconds */
      responseTimeMs: a.integer(),
      /**
       * The story snippet presented to the student (for audit/ML use).
       * Stored as plain text with the blank represented as "___".
       */
      storyContext: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  // ─── Stories ───────────────────────────────────────────────────────────────

  Story: a
    .model({
      /** Full story text. Blanks are represented as "___". */
      content: a.string().required(),
      /** IDs of the word meanings being tested in this story */
      targetWordMeaningIds: a.string().array().required(),
      /** Language of the story */
      targetLanguage: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
