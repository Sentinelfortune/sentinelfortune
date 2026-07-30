import { describe, expect, it } from "vitest";
import { formatUsdFromCents, isValidPriceCents, parsePriceInputToCents } from "../src/lib/money";

describe("money", () => {
  it("accepts a valid integer cents value", () => {
    expect(isValidPriceCents(2900)).toBe(true);
  });

  it("rejects non-integer, negative, zero, and out-of-range values", () => {
    expect(isValidPriceCents(29.5)).toBe(false);
    expect(isValidPriceCents(-100)).toBe(false);
    expect(isValidPriceCents(0)).toBe(false);
    expect(isValidPriceCents(50)).toBe(false); // below $1.00 floor
    expect(isValidPriceCents(999_999_999)).toBe(false); // above ceiling
    expect(isValidPriceCents("29" as unknown as number)).toBe(false);
    expect(isValidPriceCents(null as unknown as number)).toBe(false);
  });

  it("parses clean dollar-and-cents strings", () => {
    expect(parsePriceInputToCents("29")).toBe(2900);
    expect(parsePriceInputToCents("29.00")).toBe(2900);
    expect(parsePriceInputToCents("29.5")).toBe(2950);
    expect(parsePriceInputToCents("199.99")).toBe(19999);
  });

  it("rejects malformed price input", () => {
    expect(parsePriceInputToCents("abc")).toBeNull();
    expect(parsePriceInputToCents("-29.00")).toBeNull();
    expect(parsePriceInputToCents("29.999")).toBeNull();
    expect(parsePriceInputToCents("")).toBeNull();
    expect(parsePriceInputToCents("0.50")).toBeNull(); // below $1.00 floor
  });

  it("formats cents as a USD string", () => {
    expect(formatUsdFromCents(2900)).toBe("$29.00");
    expect(formatUsdFromCents(199999)).toBe("$1,999.99");
  });
});
