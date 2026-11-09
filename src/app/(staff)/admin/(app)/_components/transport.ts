/**
 * Production QA-05: a server action call whose promise rejects (network drop, offline, a deploy
 * mid request) used to reach the error boundary and wipe the editor. `send` turns that rejection
 * into a value so the form keeps every choice and offers Retry.
 *
 * A rejection says nothing about the server: the request may never have left, or the write may
 * have committed and only the answer was lost. So the caller never reports success, and the
 * admin writes it retries are idempotent (set a rate, set an allotment, offline/online a range),
 * so a Retry after a lost answer converges on the same saved state.
 */
export type Sent<T> = { sent: true; value: T } | { sent: false };

export async function send<T>(call: () => Promise<T>): Promise<Sent<T>> {
  try {
    return { sent: true, value: await call() };
  } catch {
    return { sent: false };
  }
}

export const CONNECTION_TITLE = "Connection problem";

export const CONNECTION_TEXT =
  "We could not reach the server, so this change is not confirmed. Your choices are kept. Retry, or reload the grid to see what is saved.";
