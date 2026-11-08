import { describe, expect, it, vi } from "vitest";
import { COMMIT_FAILED, createCellEditor, type CommitFn } from "./data-grid-editor";

const A = { rowId: "r1", key: "2026-11-14" };
const B = { rowId: "r2", key: "2026-11-15" };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An editor whose Enter always runs `fn`. */
function editorWith(fn: CommitFn) {
  const ed = createCellEditor();
  return { ...ed, commit: () => ed.commit(fn) };
}

describe("DataGrid editor (R06)", () => {
  it("deferred success: the cell stays open and stable until the commit resolves", async () => {
    const d = deferred<void>();
    const commit = vi.fn(() => d.promise);
    const ed = editorWith(commit);
    ed.start(A, 12000);
    ed.type("12500");
    const running = ed.commit();
    expect(ed.get()).toMatchObject({ cell: A, draft: "12500", pending: true });

    // Blur, Escape, typing and opening another cell all wait for the commit.
    ed.blur();
    ed.cancel();
    ed.type("99");
    expect(ed.start(B, 1)).toBe(false);
    expect(ed.get()).toMatchObject({ cell: A, draft: "12500", pending: true });
    await ed.commit(); // a second Enter does not commit twice
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("r1", "2026-11-14", "12500");

    d.resolve();
    await running;
    expect(ed.get()).toMatchObject({ cell: null, pending: false, error: null, saved: A });
  });

  it("a returned message keeps the cell open in its error state", async () => {
    const ed = editorWith(async () => "At least 3 (already sold or held)");
    ed.start(A, 5);
    ed.type("1");
    await ed.commit();
    expect(ed.get()).toMatchObject({
      cell: A,
      draft: "1",
      pending: false,
      error: "At least 3 (already sold or held)",
    });
    ed.blur(); // an error is not dismissed by blur
    expect(ed.get().cell).toEqual(A);
    ed.cancel(); // Esc dismisses it
    expect(ed.get()).toMatchObject({ cell: null, error: null });
  });

  it("deferred rejection becomes the cell's error, never an unhandled rejection", async () => {
    const d = deferred<void>();
    const ed = editorWith(() => d.promise);
    ed.start(A, 5);
    const running = ed.commit();
    d.reject(new Error("network down"));
    await expect(running).resolves.toBeUndefined();
    expect(ed.get()).toMatchObject({ cell: A, pending: false, error: COMMIT_FAILED });
  });

  it("a callback that throws synchronously becomes the cell's error", async () => {
    const ed = editorWith(() => {
      throw new Error("boom");
    });
    ed.start(A, 5);
    await expect(ed.commit()).resolves.toBeUndefined();
    expect(ed.get()).toMatchObject({ cell: A, pending: false, error: COMMIT_FAILED });
  });

  it("a late completion after a reset cannot close or mark another cell", async () => {
    const d = deferred<string | void>();
    const ed = editorWith(() => d.promise);
    ed.start(A, 5);
    const running = ed.commit();
    ed.reset(); // e.g. the grid moved to the next 30 days
    expect(ed.start(B, 7)).toBe(true);
    ed.type("8");
    d.resolve(); // A's success arrives late
    await running;
    expect(ed.get()).toMatchObject({
      cell: B,
      draft: "8",
      pending: false,
      error: null,
      saved: null,
    });
  });

  it("a late failure after a reset does not put its error on another cell", async () => {
    const d = deferred<string | void>();
    const ed = editorWith(() => d.promise);
    ed.start(A, 5);
    const running = ed.commit();
    ed.reset();
    ed.start(B, 7);
    d.resolve("At most 8 (total rooms)");
    await running;
    expect(ed.get()).toMatchObject({ cell: B, error: null });
  });

  it("uses the callback passed with each commit", async () => {
    const ed = createCellEditor();
    ed.start(A, 1);
    await ed.commit(() => "old callback rejects");
    expect(ed.get().error).toBe("old callback rejects");
    await ed.commit(() => undefined);
    expect(ed.get().cell).toBeNull();
  });

  it("blur without an error closes the editor; commit with no open cell does nothing", async () => {
    const commit = vi.fn();
    const ed = editorWith(commit);
    await ed.commit();
    expect(commit).not.toHaveBeenCalled();
    ed.start(A, 1);
    ed.blur();
    expect(ed.get().cell).toBeNull();
  });
});
