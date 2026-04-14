import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Wraps an async data-fetch in a single-retry guard for Amplify auth races.
 *
 * Why this exists:
 *   Amplify v6 refreshes the Cognito access token in the background. When a page
 *   mounts during (or just after) a token refresh, its first DynamoDB request can
 *   land before the new token is written to storage and throws "no current user".
 *   A manual retry always succeeds because the refresh has completed by then.
 *
 * How it works:
 *   On an auth-shaped error, call fetchAuthSession() — which either:
 *     (a) resolves immediately if the refresh just completed, or
 *     (b) waits for the in-progress refresh and then resolves.
 *   Then retry fn() once. Any other error (network, DynamoDB, etc.) is re-thrown
 *   immediately without retrying.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAuthError(err)) {
      // fetchAuthSession waits for any in-progress token refresh to settle.
      await fetchAuthSession();
      return fn();
    }
    throw err;
  }
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no current user|not authenticated|unauthenticated|unauthorized|token/i.test(msg);
}
