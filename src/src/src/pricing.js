import { feetOrInToFeet, feetToSqft, perimeterFeet, estimateGrommets, toCents } from "./utils";

// Product catalog & rules
export const PRODUCTS = {
  banner13oz: {
    key: "banner13oz",
    name: "13oz Vinyl Banner",
    type: "sqft",
    basePerSqft: 5.5,
    options: { hems: true, grommets: true, lamination: false, polePockets: true, doubleSided: true },
    quickSizes: [
      { w: 2, h: 4, unit: "ft" }, { w: 3, h: 6, unit: "ft" }, { w: 4, h: 8, unit: "ft" }
    ]
  },
  adhesiveVinyl: {
    key: "adhesiveVinyl",
    name: "Adhesive Vinyl (Print/Cut)",
    type: "sqft",
    basePerSqft: 8.0,
    options: { hems: false, grommets: false, lamination: true, polePockets: false, doubleSided: false },
    quickSizes: [
      { w: 12, h: 12, unit: "in" }, { w: 24, h: 24, unit: "in" }, { w: 48, h: 24, unit: "in" }
    ]
  },
  coroplast4mm: {
    key: "coroplast4mm",
    name: "Coroplast 4mm (Yard Sign)",
    type: "sqft",
    basePerSqft: 9.0,
    options: { hems: false, grommets: false, lamination: true, polePockets: false, doubleSided: false },
    quickSizes: [
      { w: 18, h: 24, unit: "in" }, { w: 24, h: 36, unit: "in" }, { w: 24, h: 18, unit: "in" }
    ]
  }
};

// Options pricing constants
const HEM_PER_LF = 0.5; // $/linear ft
const GROMMET_EACH = 0.35; // $ each
const LAM_PER_SQFT = 2.0; // $/sqft
const POCKET_PER_LF_BASE = 2.0; // $/lf
const MIN_PER_ITEM = 15.0; // $ min per item
const DOUBLE_SIDED_FACTOR = 0.60; // +60% of base area cost

// Volume discounts by qty (per item)
export function volumeRate(qty) {
  if (qty >= 50) return 0.12;
  if (qty >= 25) return 0.08;
  if (qty >= 10) return 0.05;
  return 0.0;
}

export function priceLine({ productKey, w, h, unit, qty, opts }) {
  // Convert to feet for area/lf; keep inches for grommet estimate
  const wFt = feetOrInToFeet(w, unit);
  const hFt = feetOrInToFeet(h, unit);
  const wIn = unit === "in" ? Number(w || 0) : Number(w || 0) * 12;
  const hIn = unit === "in" ? Number(h || 0) : Number(h || 0) * 12;

  const prod = PRODUCTS[productKey];
  if (!prod) return { error: "Unknown product" };

  const areaSqft = feetToSqft(wFt, hFt);
  const perimeterLf = perimeterFeet(wFt, hFt);

  // Base area cost
  const baseAreaCost = areaSqft * prod.basePerSqft;

  // Options
  let hemsCost = 0;
  let grommetCost = 0;
  let lamCost = 0;
  let pocketCost = 0;
  let doubleSidedExtra = 0;
  let grommetCount = 0;

  if (opts.hems && prod.options.hems) {
    hemsCost = perimeterLf * HEM_PER_LF;
  }

  if (opts.grommets && prod.options.grommets) {
    grommetCount = estimateGrommets(wIn, hIn);
    grommetCost = grommetCount * GROMMET_EACH;
  }

  if (opts.lamination && prod.options.lamination) {
    lamCost = areaSqft * LAM_PER_SQFT;
  }

  if (prod.options.polePockets && opts.polePockets?.sides?.length) {
    // Assumption: pocket adder scales with pocket size vs 3" baseline
    const pocketFactor = Math.max(0.5, (Number(opts.polePockets.sizeIn) || 3) / 3);
    const sides = opts.polePockets.sides;
    let lf = 0;
    if (sides.includes("top")) lf += wFt;
    if (sides.includes("bottom")) lf += wFt;
    if (sides.includes("left")) lf += hFt;
    if (sides.includes("right")) lf += hFt;
    pocketCost = lf * POCKET_PER_LF_BASE * pocketFactor;
  }

  if (opts.doubleSided && prod.options.doubleSided) {
    doubleSidedExtra = baseAreaCost * DOUBLE_SIDED_FACTOR;
  }

  const oneItemBeforeMin =
    baseAreaCost + hemsCost + grommetCost + lamCost + pocketCost + doubleSidedExtra;

  const oneItem = Math.max(oneItemBeforeMin, MIN_PER_ITEM);
  const lineSub = oneItem * Math.max(1, qty || 1);
  const rate = volumeRate(qty || 1);
  const discount = lineSub * rate;
  const lineTotal = lineSub - discount;

  return {
    productName: prod.name,
    sqft: areaSqft,
    perimeterLf,
    grommetCount,
    breakdown: {
      baseAreaCost,
      hemsCost,
      grommetCost,
      lamCost,
      pocketCost,
      doubleSidedExtra,
      minApplied: oneItem === MIN_PER_ITEM && oneItemBeforeMin < MIN_PER_ITEM
    },
    cents: {
      oneItem: toCents(oneItem),
      lineSub: toCents(lineSub),
      discount: toCents(discount),
      total: toCents(lineTotal)
    },
    volumeRate: rate
  };
}
