/** Money is always integer paise. Never use floats for amounts. */
export type Paise = number;

export function assertPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) throw new Error(`Not integer paise: ${value}`);
  return value;
}

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/** Basis points of an amount, rounded half up to the nearest paisa. */
export function applyBp(amount: Paise, bp: number): Paise {
  return Math.round((amount * bp) / 10_000);
}

/** "₹12,400" with Indian digit grouping; paise shown only when non-zero. */
export function formatInr(paise: Paise): string {
  const hasPaise = paise % 100 !== 0;
  return (
    "₹" +
    new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(paise / 100)
  );
}
