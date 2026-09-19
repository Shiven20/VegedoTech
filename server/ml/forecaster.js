import { idOf } from "./recommender.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lightweight demand forecasting for the seller dashboard.
 *
 * Pipeline: order history -> daily units-sold series per product -> Holt linear
 * (double exponential smoothing) -> n-day ahead forecast + restock advice.
 * Falls back to an ordinary-least-squares trend when there is too little data
 * for smoothing to mean anything.
 */

/**
 * Buckets order line items into a per-product daily time series.
 * @param {object[]} orders
 * @param {{days?: number, now?: Date}} options
 * @returns {Map<string, number[]>} productId -> array of daily units (oldest first)
 */
export function buildDailySeries(orders = [], { days = 30, now = new Date() } = {}) {
  const end = startOfDay(now).getTime();
  const start = end - (days - 1) * DAY_MS;
  const series = new Map();

  for (const order of orders) {
    const created = new Date(order?.createdAt ?? order?.updatedAt ?? now);
    const bucketDay = startOfDay(created).getTime();
    if (Number.isNaN(bucketDay) || bucketDay < start || bucketDay > end) continue;
    const index = Math.round((bucketDay - start) / DAY_MS);

    for (const item of order?.items ?? []) {
      const id = idOf(item?.product);
      if (!id) continue;
      if (!series.has(id)) series.set(id, new Array(days).fill(0));
      const qty = Number(item?.quantity) > 0 ? Number(item.quantity) : 1;
      series.get(id)[index] += qty;
    }
  }

  return series;
}

/**
 * Tuned production defaults, chosen by backtesting against held-out weeks
 * (see scripts/evaluate-model.js). Low alpha smooths the day-to-day spikiness of
 * grocery orders; heavy damping stops a short run of growth from extrapolating
 * into an absurd forecast.
 */
export const FORECAST_DEFAULTS = { alpha: 0.1, beta: 0.02, phi: 0.8 };

/**
 * Holt's linear trend method with optional damping.
 *
 * `phi` is the damping factor on the trend: 1 is textbook (undamped) Holt, and
 * values below 1 flatten the projection as the horizon grows. Undamped linear
 * trend badly over-shoots on bursty retail demand, so the production path uses
 * FORECAST_DEFAULTS.
 *
 * @param {number[]} values oldest first
 */
export function holtLinear(values, { alpha = 0.5, beta = 0.3, phi = 1, horizon = 7 } = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return { level: 0, trend: 0, forecast: new Array(horizon).fill(0), fitted: [] };
  }
  if (values.length === 1) {
    return {
      level: values[0],
      trend: 0,
      forecast: new Array(horizon).fill(Math.max(0, values[0])),
      fitted: [values[0]],
    };
  }

  let level = values[0];
  let trend = values[1] - values[0];
  const fitted = [level];

  for (let t = 1; t < values.length; t++) {
    const prevLevel = level;
    fitted.push(level + phi * trend);
    level = alpha * values[t] + (1 - alpha) * (prevLevel + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }

  // Damped horizons accumulate phi^1 + phi^2 + ... + phi^h rather than h.
  const forecast = [];
  let dampSum = 0;
  for (let h = 1; h <= horizon; h++) {
    dampSum += phi ** h;
    forecast.push(Math.max(0, level + dampSum * trend));
  }

  return { level, trend, forecast, fitted };
}

/** Ordinary least squares slope/intercept over an index-based x axis. */
export function linearTrend(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: n ? values[0] : 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }

  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

/** Mean absolute error between a series and its one-step-ahead fitted values. */
export function meanAbsoluteError(actual, fitted) {
  const n = Math.min(actual.length, fitted.length);
  if (n === 0) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.abs(actual[i] - fitted[i]);
  return total / n;
}

/**
 * Full forecast report for the seller dashboard.
 *
 * @param {object[]} products
 * @param {object[]} orders
 * @param {{historyDays?: number, horizon?: number, now?: Date, limit?: number}} options
 */
export function forecastDemand(
  products = [],
  orders = [],
  { historyDays = 30, horizon = 7, now = new Date(), limit = 50 } = {}
) {
  const series = buildDailySeries(orders, { days: historyDays, now });
  const rows = [];

  for (const product of products) {
    const id = idOf(product);
    if (!id) continue;

    const history = series.get(id) ?? new Array(historyDays).fill(0);
    const unitsSold = history.reduce((a, b) => a + b, 0);
    const { forecast, fitted, trend } = holtLinear(history, {
      ...FORECAST_DEFAULTS,
      horizon,
    });
    const { slope } = linearTrend(history);

    const forecastUnits = Math.round(forecast.reduce((a, b) => a + b, 0));
    const dailyAverage = unitsSold / historyDays;
    const mae = round(meanAbsoluteError(history, fitted));
    // Confidence shrinks with error and with sparse history.
    const confidence = round(
      clamp(
        (unitsSold > 0 ? 0.55 : 0.2) +
          0.3 * clamp(unitsSold / (historyDays * 2), 0, 1) -
          0.25 * clamp(mae / Math.max(1, dailyAverage * 2), 0, 1),
        0.05,
        0.95
      )
    );

    rows.push({
      productId: id,
      name: product?.name ?? "Unknown",
      category: product?.category ?? "Uncategorised",
      inStock: product?.inStock !== false,
      unitsSoldLastPeriod: unitsSold,
      dailyAverage: round(dailyAverage),
      forecastUnits,
      forecastDaily: forecast.map(round),
      trendPerDay: round(slope || trend),
      trendLabel: labelTrend(slope || trend, dailyAverage),
      confidence,
      mae,
      recommendation: advise({
        forecastUnits,
        unitsSold,
        slope: slope || trend,
        inStock: product?.inStock !== false,
      }),
      history,
    });
  }

  rows.sort((a, b) => b.forecastUnits - a.forecastUnits || b.unitsSoldLastPeriod - a.unitsSoldLastPeriod);
  const top = rows.slice(0, limit);

  return {
    window: { historyDays, horizon, generatedAt: new Date(now).toISOString() },
    totals: {
      products: rows.length,
      ordersAnalysed: orders.length,
      unitsSoldLastPeriod: rows.reduce((n, r) => n + r.unitsSoldLastPeriod, 0),
      forecastUnits: rows.reduce((n, r) => n + r.forecastUnits, 0),
    },
    risingCount: rows.filter((r) => r.trendLabel === "rising").length,
    fallingCount: rows.filter((r) => r.trendLabel === "falling").length,
    products: top,
  };
}

function advise({ forecastUnits, unitsSold, slope, inStock }) {
  if (!inStock && forecastUnits > 0) return "Out of stock but demand is forecast — restock now";
  if (forecastUnits === 0 && unitsSold === 0) return "No demand signal yet — consider promoting";
  if (slope > 0.15) return `Demand rising — stock at least ${Math.ceil(forecastUnits * 1.2)} units`;
  if (slope < -0.15) return "Demand falling — avoid over-ordering";
  return `Steady demand — keep about ${Math.max(1, forecastUnits)} units on hand`;
}

function labelTrend(slope, dailyAverage) {
  const threshold = Math.max(0.05, dailyAverage * 0.1);
  if (slope > threshold) return "rising";
  if (slope < -threshold) return "falling";
  return "steady";
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round(n) {
  return Math.round(n * 100) / 100;
}
