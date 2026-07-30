// Money is always stored and passed around as integer cents. These are the
// only functions permitted to convert between cents and a display string or
// a human-entered value — never do ad-hoc `price / 100` elsewhere.

const MIN_PRICE_CENTS = 100;        // $1.00 floor — prevents accidental $0 sales
const MAX_PRICE_CENTS = 500_000_00; // $500,000.00 ceiling — sanity cap on Owner input

export function isValidPriceCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PRICE_CENTS &&
    value <= MAX_PRICE_CENTS
  );
}

/**
 * Parses an Owner-entered price string ("29", "29.00", "29.5") into integer
 * cents. Returns null for anything that isn't a clean, non-negative, at-most
 * two-decimal-place number — never rounds silently, since silent rounding on
 * money is exactly the kind of bug that erodes trust.
 */
export function parsePriceInputToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const paddedFraction = (fractionPart + "00").slice(0, 2);
  const cents = Number(wholePart) * 100 + Number(paddedFraction);
  return isValidPriceCents(cents) ? cents : null;
}

export function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export { MIN_PRICE_CENTS, MAX_PRICE_CENTS };
