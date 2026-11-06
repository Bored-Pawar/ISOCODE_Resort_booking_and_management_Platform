"use client";

import { useRef, useState } from "react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { TableSkeleton } from "./skeleton";

export type GridColumn = {
  key: string;
  header: React.ReactNode;
  /** Shade the whole column, e.g. weekends. */
  shaded?: boolean;
  /** Per-column edit switch; defaults to the grid's `editable`. */
  editable?: boolean;
};

export type GridRow = {
  id: string;
  /** Sticky first column. */
  label: React.ReactNode;
  /** Value shown (and edited) per column key. */
  cells: Record<string, string | number>;
  /** Small secondary text under a cell value, e.g. "sold 3 · held 1". */
  sub?: Record<string, string>;
};

/**
 * Dense table: sticky header and first column, tabular numbers, 44px rows, inline cell edit.
 * `onCommit` returns an error message to reject the edit (the cell stays open and explains why).
 */
export function DataGrid({
  columns,
  rows,
  editable = false,
  onCommit,
  state = "ready",
  onRetry,
  emptyMessage = "Nothing to show yet.",
  emptyAction,
  className,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  editable?: boolean;
  onCommit?: (rowId: string, key: string, value: string) => Promise<string | void> | string | void;
  state?: "ready" | "loading" | "error";
  onRetry?: () => void;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState<{ rowId: string; key: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const committing = useRef(false);

  if (state === "loading") return <TableSkeleton rows={6} cols={Math.min(columns.length + 1, 8)} />;
  if (state === "error") return <ErrorState onRetry={onRetry} />;
  if (rows.length === 0) {
    return (
      <EmptyState icon={<Table2 strokeWidth={1.5} />} message={emptyMessage} action={emptyAction} />
    );
  }

  const start = (rowId: string, key: string, current: string | number) => {
    setEditing({ rowId, key });
    setDraft(String(current));
    setError(null);
  };
  const cancel = () => {
    setEditing(null);
    setError(null);
  };
  const commit = async () => {
    if (!editing || committing.current) return;
    committing.current = true;
    try {
      const message = await onCommit?.(editing.rowId, editing.key, draft);
      if (message) setError(message);
      else cancel();
    } finally {
      committing.current = false;
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="max-h-[70vh] overflow-auto rounded-card border border-border bg-surface">
        <table className="w-full border-separate border-spacing-0 text-small tabular-nums">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 h-11 min-w-40 border-b border-border bg-surface-2 px-3 text-left font-semibold"
              />
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="sticky top-0 z-10 h-11 min-w-20 border-b border-border bg-surface-2 px-3 text-right font-semibold"
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
                  const isEditing = editing?.rowId === row.id && editing.key === c.key;
                  const canEdit = editable && (c.editable ?? true);
                  const value = row.cells[c.key];
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "h-11 border-b border-border px-1 text-right",
                        c.shaded && "bg-surface-2/60",
                      )}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          aria-label={`Edit ${c.key}`}
                          aria-invalid={error ? true : undefined}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commit();
                            if (e.key === "Escape") cancel();
                          }}
                          onBlur={() => {
                            if (!error) cancel();
                          }}
                          className={cn(
                            "h-9 w-full min-w-16 rounded-control border bg-surface px-2 text-right",
                            error ? "border-danger" : "border-accent",
                          )}
                        />
                      ) : canEdit ? (
                        <button
                          type="button"
                          onClick={() => start(row.id, c.key, value ?? "")}
                          className="flex h-11 w-full flex-col items-end justify-center rounded-control px-2 hover:bg-accent-soft"
                          aria-label={`Edit ${c.key} for ${typeof row.label === "string" ? row.label : row.id}`}
                        >
                          <span>{value ?? ""}</span>
                          {row.sub?.[c.key] ? (
                            <span className="text-xs text-muted">{row.sub[c.key]}</span>
                          ) : null}
                        </button>
                      ) : (
                        <div className="flex h-11 flex-col items-end justify-center px-2">
                          <span>{value ?? ""}</span>
                          {row.sub?.[c.key] ? (
                            <span className="text-xs text-muted">{row.sub[c.key]}</span>
                          ) : null}
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
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
