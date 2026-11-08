"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createCellEditor, initialEditorState, sameCell, type CommitFn } from "./data-grid-editor";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { TableSkeleton } from "./skeleton";

export type GridColumn = {
  key: string;
  header: React.ReactNode;
  /** Plain-text column name for screen readers (defaults to the key). */
  label?: string;
  /** Shade the whole column, e.g. weekends. */
  shaded?: boolean;
  /** Per-column edit switch; defaults to the grid's `editable`. */
  editable?: boolean;
};

/** `danger`: red, e.g. a rejected value. `offline`: hatched, e.g. a blacked out date. */
export type CellTone = "danger" | "offline";

export type GridRow = {
  id: string;
  /** Sticky first column. */
  label: React.ReactNode;
  /** Plain-text row name for screen readers (defaults to the label when it is a string). */
  name?: string;
  /** Value edited per column key; also shown unless `display` has an entry. null = no value. */
  cells: Record<string, string | number | null>;
  /** Text shown instead of the raw value, e.g. "₹12,400" for 12400. */
  display?: Record<string, string>;
  /**
   * Small secondary text under a cell value. `{ full, short }` shows `full` from the md
   * breakpoint and `short` below it (e.g. "0 sold · 1 held" / "S 0 · H 1"); explain `short` in a
   * legend. Screen readers always get `full`.
   */
  sub?: Record<string, string | { full: string; short: string }>;
  tone?: Record<string, CellTone>;
  /** Why a cell looks the way it does; shown on hover, focus or tap. */
  note?: Record<string, string>;
  /** Per-row edit switch; defaults to true. */
  editable?: boolean;
};

/**
 * Dense table: sticky header and first column, tabular numbers, 44px rows, inline cell edit.
 * Enter saves, Esc cancels. `onCommit` returns an error message to reject the edit (the cell
 * stays open, red, and explains why); a throw or rejection shows a generic error in the cell.
 * While a commit runs the cell stays open and unchanged (R06). Change `resetKey` (e.g. the first
 * date shown) to drop the open cell and ignore any commit still in flight.
 */
export function DataGrid({
  columns,
  rows,
  editable = false,
  onCommit,
  resetKey,
  state = "ready",
  onRetry,
  emptyMessage = "Nothing to show yet.",
  emptyAction,
  className,
  caption,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  editable?: boolean;
  onCommit?: CommitFn;
  resetKey?: string;
  state?: "ready" | "loading" | "error";
  onRetry?: () => void;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  className?: string;
  caption?: string;
}) {
  const [edit, setEdit] = useState(initialEditorState);
  const [editor] = useState(() => createCellEditor(setEdit));
  const [focusNote, setFocusNote] = useState<string | null>(null);

  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    editor.reset();
  }, [resetKey, editor]);

  if (state === "loading") return <TableSkeleton rows={6} cols={Math.min(columns.length + 1, 8)} />;
  if (state === "error") return <ErrorState onRetry={onRetry} />;
  if (rows.length === 0) {
    return (
      <EmptyState icon={<Table2 strokeWidth={1.5} />} message={emptyMessage} action={emptyAction} />
    );
  }

  const rowName = (row: GridRow) =>
    row.name ?? (typeof row.label === "string" ? row.label : row.id);
  const colName = (c: GridColumn) => c.label ?? c.key;
  const openRow = rows.find((r) => r.id === edit.cell?.rowId);
  const openCol = columns.find((c) => c.key === edit.cell?.key);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative max-h-[70vh] overflow-auto rounded-card border border-border bg-surface">
        <table className="w-full border-separate border-spacing-0 text-small tabular-nums">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 h-11 min-w-36 border-b border-border bg-surface-2 px-3 text-left font-semibold"
              />
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 h-11 min-w-20 border-b border-border px-3 text-right font-semibold",
                    "bg-surface-2",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 h-11 border-b border-border bg-surface px-3 text-left font-semibold whitespace-nowrap"
                >
                  {row.label}
                </th>
                {columns.map((c) => {
                  const here = { rowId: row.id, key: c.key };
                  const isOpen = sameCell(edit.cell, here);
                  const canEdit = editable && (row.editable ?? true) && (c.editable ?? true);
                  const value = row.cells[c.key];
                  const shown =
                    row.display?.[c.key] ?? (value === null ? "—" : String(value ?? ""));
                  const tone = row.tone?.[c.key];
                  const note = row.note?.[c.key];
                  const subText = row.sub?.[c.key];
                  const sub = typeof subText === "object" ? subText.full : subText;
                  const saved = sameCell(edit.saved, here);
                  const content = (
                    <>
                      <span className="flex items-center gap-1">
                        {saved ? (
                          <Check aria-label="Saved" className="size-3.5 text-success" />
                        ) : null}
                        {shown}
                      </span>
                      {typeof subText === "object" ? (
                        <>
                          <span className="hidden text-xs whitespace-nowrap text-muted md:inline">
                            {subText.full}
                          </span>
                          <span className="text-xs whitespace-nowrap text-muted md:hidden">
                            {subText.short}
                          </span>
                        </>
                      ) : sub ? (
                        <span className="text-xs text-muted">{sub}</span>
                      ) : null}
                    </>
                  );
                  return (
                    <td
                      key={c.key}
                      title={note}
                      className={cn(
                        "h-11 border-b border-border px-1 text-right",
                        c.shaded && "bg-surface-2/60",
                        tone === "offline" &&
                          "bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_5px,var(--surface)_5px_10px)] text-muted",
                        tone === "danger" && "bg-danger/10 text-danger",
                      )}
                    >
                      {isOpen ? (
                        <div className="relative">
                          <input
                            autoFocus
                            inputMode="numeric"
                            aria-label={`${rowName(row)}, ${colName(c)}`}
                            aria-invalid={edit.error ? true : undefined}
                            aria-busy={edit.pending || undefined}
                            readOnly={edit.pending}
                            value={edit.draft}
                            onChange={(e) => editor.type(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void editor.commit(onCommit);
                              }
                              if (e.key === "Escape") editor.cancel();
                            }}
                            onBlur={() => editor.blur()}
                            className={cn(
                              "h-9 w-full min-w-16 rounded-control border bg-surface px-2 text-right text-text",
                              edit.error ? "border-danger" : "border-accent",
                              edit.pending && "pr-6 text-muted",
                            )}
                          />
                          {edit.pending ? (
                            <Loader2
                              aria-hidden
                              className="absolute top-2.5 left-1.5 size-4 animate-spin text-muted"
                            />
                          ) : null}
                        </div>
                      ) : canEdit ? (
                        <button
                          type="button"
                          disabled={edit.pending}
                          onClick={() => editor.start(here, value ?? "")}
                          onFocus={() => setFocusNote(note ?? null)}
                          onBlur={() => setFocusNote(null)}
                          className="flex h-11 w-full flex-col items-end justify-center rounded-control px-2 hover:bg-accent-soft disabled:cursor-wait"
                          aria-label={`Edit ${rowName(row)}, ${colName(c)}: ${shown}${sub ? ` (${sub})` : ""}${note ? `. ${note}` : ""}`}
                        >
                          {content}
                        </button>
                      ) : (
                        <div
                          tabIndex={note ? 0 : undefined}
                          onFocus={() => setFocusNote(note ?? null)}
                          onBlur={() => setFocusNote(null)}
                          className="flex h-11 flex-col items-end justify-center px-2"
                        >
                          {content}
                          {note ? <span className="sr-only">{note}</span> : null}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit.error && openRow && openCol ? (
        <p role="alert" className="text-small text-danger">
          {rowName(openRow)}, {colName(openCol)}: {edit.error}
        </p>
      ) : edit.cell && openRow?.note?.[edit.cell.key] ? (
        <p className="text-small text-muted">{openRow.note[edit.cell.key]}</p>
      ) : focusNote ? (
        <p className="text-small text-muted">{focusNote}</p>
      ) : null}
    </div>
  );
}
