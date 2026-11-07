/**
 * Business outcomes are returned, not thrown. Every contract function returns
 * `Ok<...> | Err<code, ...>` so callers must handle each failure code.
 * Throw only for programmer errors and infrastructure failures.
 */
export type Ok<T extends object = object> = { ok: true } & T;
export type Err<C extends string, X extends object = object> = { ok: false; code: C } & X;
