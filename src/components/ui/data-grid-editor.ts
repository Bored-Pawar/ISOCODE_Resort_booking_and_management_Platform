/**
 * Pure editing rules behind DataGrid (R06). The cell being committed stays open and unchanged
 * while an async commit runs (blur, Escape, typing and opening another cell are ignored), a
 * rejected or thrown commit lands in that cell's error state, and a completion that arrives after
 * the editor was reset can never close or overwrite a different cell.
 */

export type CellRef = { rowId: string; key: string };

export type EditorState = {
  /** The open cell, or null. */
  cell: CellRef | null;
  draft: string;
  /** Message for the open cell after a rejected or failed commit. */
  error: string | null;
  /** True while the open cell's commit is running. */
  pending: boolean;
  /** Last cell that saved successfully (for a brief "saved" mark). */
  saved: CellRef | null;
};

export type CommitFn = (
  rowId: string,
  key: string,
  value: string,
) => Promise<string | void> | string | void;

export const COMMIT_FAILED = "Could not save. Check your connection and try again.";

export const initialEditorState: EditorState = {
  cell: null,
  draft: "",
  error: null,
  pending: false,
  saved: null,
};

export function sameCell(a: CellRef | null, b: CellRef | null): boolean {
  return !!a && !!b && a.rowId === b.rowId && a.key === b.key;
}

export type CellEditor = {
  get(): EditorState;
  /** Opens a cell. Ignored (returns false) while a commit is pending. */
  start(cell: CellRef, value: string | number): boolean;
  /** Updates the draft. Ignored while pending. */
  type(draft: string): void;
  /** Esc: closes the editor. Ignored while pending. */
  cancel(): void;
  /** Blur: closes the editor unless a commit is pending or the cell shows an error. */
  blur(): void;
  /** Enter: runs `fn` for the open cell (passed per call, so the latest callback is used). */
  commit(fn: CommitFn | undefined): Promise<void>;
  /** Drops the open cell and any pending completion (e.g. the grid moved to other dates). */
  reset(): void;
};

/** `onChange` receives every new state (the React wrapper stores it). */
export function createCellEditor(onChange: (state: EditorState) => void = () => {}): CellEditor {
  let state = initialEditorState;
  /** Bumped whenever the open cell changes; a completion only applies to its own session. */
  let session = 0;
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  return {
    get: () => state,
    start(cell, value) {
      if (state.pending) return false;
      session += 1;
      set({ cell, draft: String(value), error: null, saved: null });
      return true;
    },
    type(draft) {
      if (state.pending || !state.cell) return;
      set({ draft });
    },
    cancel() {
      if (state.pending) return;
      session += 1;
      set({ cell: null, error: null });
    },
    blur() {
      if (state.pending || state.error) return;
      session += 1;
      set({ cell: null });
    },
    async commit(fn) {
      const cell = state.cell;
      if (!cell || state.pending) return;
      const mine = session;
      const draft = state.draft;
      set({ pending: true, error: null });
      let message: string | void;
      try {
        message = await fn?.(cell.rowId, cell.key, draft);
      } catch {
        message = COMMIT_FAILED;
      }
      if (session !== mine) return; // reset while pending: this completion is stale
      if (message) set({ pending: false, error: message });
      else {
        session += 1;
        set({ pending: false, cell: null, error: null, saved: cell });
      }
    },
    reset() {
      session += 1;
      set({ ...initialEditorState });
    },
  };
}
