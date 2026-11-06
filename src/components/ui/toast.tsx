"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; tone: Tone; message: string };

const ToastContext = createContext<{ toast: (message: string, tone?: Tone) => void } | null>(null);

const icons = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const toneClass: Record<Tone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent",
};

/** Bottom right on desktop, bottom full width on mobile. Auto-dismisses after 5 s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((message: string, tone: Tone = "info") => {
    const id = nextId.current++;
    setItems((xs) => [...xs.slice(-3), { id, tone, message }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 sm:inset-x-auto sm:right-0 sm:w-96"
        aria-live="polite"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 5000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);
  const Icon = icons[item.tone];
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-pop"
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-[18px] shrink-0", toneClass[item.tone])}
        strokeWidth={1.5}
      />
      <p className="flex-1 text-small">{item.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        className="-m-2 inline-flex size-11 items-center justify-center rounded-control text-muted hover:bg-surface-2"
        onClick={() => onDismiss(item.id)}
      >
        <X aria-hidden className="size-[18px]" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
