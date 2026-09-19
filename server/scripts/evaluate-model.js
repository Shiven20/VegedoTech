/**
 * ML quality gate.
 *
 * Trains the recommender and forecaster on a fixed labelled dataset, measures
 * offline metrics, writes them to ml-metrics.json for the CI artifact, and exits
 * non-zero when any metric drops below its threshold. This is what stops a
 * "harmless" tweak to the scoring weights from silently degrading relevance.
 *
 * Metrics
 *   precision@k   share of returned items that are in the labelled relevant set
 *   recall@k      share of relevant items that were returned
 *   MRR           mean reciprocal rank of the first relevant hit
 *   search acc.   top-1 accuracy over labelled queries (incl. typos)
 *   forecast MAPE mean absolute percentage error on a held-out final week
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { HybridRecommender } from "../ml/recommender.js";
import { holtLinear, buildDailySeries, FORECAST_DEFAULTS } from "../ml/forecaster.js";

const THRESHOLDS = {
  precisionAt5: 0.6,
  recallAt5: 0.6,
  mrr: 0.7,
  searchTop1Accuracy: 0.85,
  forecastMape: 0.25, // upper bound
};

// ---------------------------------------------------------------------------
// Evaluation dataset: a small grocery catalogue with hand-labelled ground truth.
// ---------------------------------------------------------------------------

const catalogue = [
  { _id: "apple_red", name: "Fresh Red Apple", category: "Fruits", description: ["Crisp sweet apple", "Rich in fibre"], inStock: true },
  { _id: "apple_green", name: "Green Apple", category: "Fruits", description: ["Tart green apple", "Rich in fibre"], inStock: true },
  { _id: "banana", name: "Organic Banana", category: "Fruits", description: ["Sweet ripe banana", "High potassium"], inStock: true },
  { _id: "orange", name: "Valencia Orange", category: "Fruits", description: ["Juicy citrus orange", "Vitamin C"], inStock: true },
  { _id: "milk_full", name: "Amul Full Cream Milk", category: "Dairy", description: ["Full cream dairy milk"], inStock: true },
  { _id: "milk_toned", name: "Toned Milk Pouch", category: "Dairy", description: ["Low fat dairy milk"], inStock: true },
  { _id: "cheese", name: "Cheddar Cheese Block", category: "Dairy", description: ["Aged cheddar dairy cheese"], inStock: true },
  { _id: "paneer", name: "Fresh Paneer", category: "Dairy", description: ["Soft dairy paneer cubes"], inStock: true },
  { _id: "bread_brown", name: "Brown Bread Loaf", category: "Bakery", description: ["Whole wheat bakery bread"], inStock: true },
  { _id: "bread_white", name: "White Bread Loaf", category: "Bakery", description: ["Soft white bakery bread"], inStock: true },
  { _id: "croissant", name: "Butter Croissant", category: "Bakery", description: ["Flaky butter bakery croissant"], inStock: true },
  { _id: "rice_basmati", name: "Basmati Rice", category: "Grains", description: ["Long grain basmati rice"], inStock: true },
  { _id: "rice_brown", name: "Brown Rice", category: "Grains", description: ["Whole grain brown rice"], inStock: true },
  { _id: "cola", name: "Coca Cola Bottle", category: "Drinks", description: ["Chilled cola soft drink"], inStock: true },
  { _id: "pepsi", name: "Pepsi Bottle", category: "Drinks", description: ["Chilled pepsi soft drink"], inStock: true },
];

const DAY = 86_400_000;
const NOW = new Date("2026-01-20T00:00:00Z");

/** Baskets that encode a milk+bread and a cola+croissant co-purchase habit. */
const orders = [];
for (let week = 0; week < 8; week++) {
  const day = (offset) => new Date(NOW.getTime() - (week * 7 + offset) * DAY);
  orders.push(
    { createdAt: day(1), items: [{ product: "milk_full", quantity: 2 }, { product: "bread_brown", quantity: 1 }] },
    { createdAt: day(2), items: [{ product: "milk_toned", quantity: 1 }, { product: "bread_white", quantity: 1 }] },
    { createdAt: day(3), items: [{ product: "cola", quantity: 2 }, { product: "croissant", quantity: 1 }] },
    { createdAt: day(4), items: [{ product: "apple_red", quantity: 3 }, { product: "banana", quantity: 2 }] },
    { createdAt: day(5), items: [{ product: "rice_basmati", quantity: 1 }, { product: "paneer", quantity: 1 }] },
    { createdAt: day(6), items: [{ product: "cheese", quantity: 1 }, { product: "bread_brown", quantity: 1 }] },
  );
}

/** Ground truth: which items a human would accept as a good suggestion. */
const relevance = {
  apple_red: ["apple_green", "banana", "orange"],
  milk_full: ["milk_toned", "cheese", "paneer", "bread_brown"],
  bread_brown: ["bread_white", "croissant", "milk_full", "cheese"],
  cola: ["pepsi", "croissant"],
  rice_basmati: ["rice_brown", "paneer"],
  cheese: ["paneer", "milk_full", "milk_toned", "bread_brown"],
};

/** Labelled search queries, including deliberate misspellings. */
const searchCases = [
  { query: "banana", expected: "banana" },
  { query: "bananna", expected: "banana" },        // typo
  { query: "cheddar", expected: "cheese" },
  { query: "basmati rice", expected: "rice_basmati" },
  { query: "brown bread", expected: "bread_brown" },
  { query: "paneer", expected: "paneer" },
  { query: "coca cola", expected: "cola" },
  { query: "croissant", expected: "croissant" },
  { query: "orannge", expected: "orange" },        // typo
  { query: "green apple", expected: "apple_green" },
  { query: "potassium", expected: "banana" },      // description-only match
  { query: "toned milk", expected: "milk_toned" },
];

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function evaluateRecommendations(model, k = 5) {
  let precisionSum = 0;
  let recallSum = 0;
  let reciprocalSum = 0;
  const perSeed = {};

  const seeds = Object.keys(relevance);
  for (const seed of seeds) {
    const expected = new Set(relevance[seed]);
    const returned = model.similarTo(seed, { limit: k }).map((r) => r.product._id);

    const hits = returned.filter((id) => expected.has(id));
    const precision = returned.length ? hits.length / returned.length : 0;
    const recall = expected.size ? hits.length / expected.size : 0;

    const firstHit = returned.findIndex((id) => expected.has(id));
    const reciprocal = firstHit === -1 ? 0 : 1 / (firstHit + 1);

    precisionSum += precision;
    recallSum += recall;
    reciprocalSum += reciprocal;
    perSeed[seed] = {
      returned,
      precision: round(precision),
      recall: round(recall),
      reciprocalRank: round(reciprocal),
    };
  }

  return {
    [`precisionAt${k}`]: round(precisionSum / seeds.length),
    [`recallAt${k}`]: round(recallSum / seeds.length),
    mrr: round(reciprocalSum / seeds.length),
    perSeed,
  };
}

function evaluateSearch(model) {
  const failures = [];
  let correct = 0;

  for (const { query, expected } of searchCases) {
    const top = model.search(query, { limit: 1 })[0]?.product?._id ?? null;
    if (top === expected) correct++;
    else failures.push({ query, expected, got: top });
  }

  return {
    searchTop1Accuracy: round(correct / searchCases.length),
    searchCases: searchCases.length,
    failures,
  };
}

/**
 * Backtest: train on all but the final 7 days, then compare the forecast for
 * those days against what actually happened.
 */
function evaluateForecast() {
  const historyDays = 56;
  const holdout = 7;
  const series = buildDailySeries(orders, { days: historyDays, now: NOW });

  const errors = [];
  const perProduct = {};

  for (const [productId, daily] of series) {
    const total = daily.reduce((a, b) => a + b, 0);
    if (total < holdout) continue; // too sparse to score meaningfully

    const train = daily.slice(0, daily.length - holdout);
    const actual = daily.slice(-holdout).reduce((a, b) => a + b, 0);
    const predicted = holtLinear(train, {
      ...FORECAST_DEFAULTS,
      horizon: holdout,
    }).forecast.reduce((a, b) => a + b, 0);

    const denominator = Math.max(1, actual);
    const ape = Math.abs(predicted - actual) / denominator;
    errors.push(ape);
    perProduct[productId] = {
      actual,
      predicted: round(predicted),
      absolutePercentageError: round(ape),
    };
  }

  return {
    forecastMape: errors.length ? round(errors.reduce((a, b) => a + b, 0) / errors.length) : 0,
    forecastProductsScored: errors.length,
    perProduct,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const model = new HybridRecommender().fit(catalogue, orders);

const recMetrics = evaluateRecommendations(model, 5);
const searchMetrics = evaluateSearch(model);
const forecastMetrics = evaluateForecast();

const metrics = {
  generatedAt: new Date().toISOString(),
  dataset: {
    products: catalogue.length,
    orders: orders.length,
    labelledSeeds: Object.keys(relevance).length,
    searchCases: searchCases.length,
  },
  model: model.stats,
  recommendations: {
    precisionAt5: recMetrics.precisionAt5,
    recallAt5: recMetrics.recallAt5,
    mrr: recMetrics.mrr,
  },
  search: { top1Accuracy: searchMetrics.searchTop1Accuracy },
  forecast: {
    mape: forecastMetrics.forecastMape,
    productsScored: forecastMetrics.forecastProductsScored,
  },
  thresholds: THRESHOLDS,
  details: {
    perSeed: recMetrics.perSeed,
    searchFailures: searchMetrics.failures,
    perProductForecast: forecastMetrics.perProduct,
  },
};

const checks = [
  { name: "precision@5", value: recMetrics.precisionAt5, min: THRESHOLDS.precisionAt5 },
  { name: "recall@5", value: recMetrics.recallAt5, min: THRESHOLDS.recallAt5 },
  { name: "MRR", value: recMetrics.mrr, min: THRESHOLDS.mrr },
  { name: "search top-1 accuracy", value: searchMetrics.searchTop1Accuracy, min: THRESHOLDS.searchTop1Accuracy },
  { name: "forecast MAPE", value: forecastMetrics.forecastMape, max: THRESHOLDS.forecastMape },
];

const failed = checks.filter((c) =>
  c.min !== undefined ? c.value < c.min : c.value > c.max
);

metrics.passed = failed.length === 0;

await writeFile(
  path.resolve(import.meta.dirname, "..", "ml-metrics.json"),
  JSON.stringify(metrics, null, 2)
);

console.log("\nML quality gate");
console.log("---------------");
for (const c of checks) {
  const bound = c.min !== undefined ? `min ${c.min}` : `max ${c.max}`;
  const ok = c.min !== undefined ? c.value >= c.min : c.value <= c.max;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(22)} ${String(c.value).padEnd(8)} (${bound})`);
}

if (searchMetrics.failures.length) {
  console.log("\n  Search misses:");
  for (const f of searchMetrics.failures) {
    console.log(`    "${f.query}" -> expected ${f.expected}, got ${f.got ?? "nothing"}`);
  }
}

console.log(`\nMetrics written to server/ml-metrics.json`);

if (failed.length) {
  console.error(`\n${failed.length} metric(s) below threshold. Failing the build.`);
  process.exit(1);
}

console.log("All model quality checks passed.\n");

function round(n) {
  return Math.round(n * 10000) / 10000;
}
