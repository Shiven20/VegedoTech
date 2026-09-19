import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailySeries,
  holtLinear,
  linearTrend,
  meanAbsoluteError,
  forecastDemand,
  FORECAST_DEFAULTS,
} from "../forecaster.js";
import { products, makeOrders, makeRisingOrders } from "./fixtures.js";

const NOW = new Date("2026-01-20T10:00:00Z");

describe("buildDailySeries", () => {
  it("produces one bucket per day in the window", () => {
    const series = buildDailySeries(makeOrders(NOW), { days: 30, now: NOW });
    assert.equal(series.get("p_milk").length, 30);
  });

  it("sums quantities into the right day bucket", () => {
    const series = buildDailySeries(makeOrders(NOW), { days: 30, now: NOW });
    // 2 + 1 + 3 + 1 + 2 = 9 units of milk in the fixture window
    assert.equal(series.get("p_milk").reduce((a, b) => a + b, 0), 9);
  });

  it("puts the newest order in the last bucket", () => {
    const series = buildDailySeries(
      [{ createdAt: NOW, items: [{ product: "p_milk", quantity: 5 }] }],
      { days: 7, now: NOW }
    );
    assert.equal(series.get("p_milk").at(-1), 5);
  });

  it("drops orders outside the window", () => {
    const old = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);
    const series = buildDailySeries(
      [{ createdAt: old, items: [{ product: "p_milk", quantity: 5 }] }],
      { days: 30, now: NOW }
    );
    assert.equal(series.size, 0);
  });

  it("defaults a missing quantity to 1", () => {
    const series = buildDailySeries([{ createdAt: NOW, items: [{ product: "p_milk" }] }], {
      days: 7,
      now: NOW,
    });
    assert.equal(series.get("p_milk").at(-1), 1);
  });

  it("returns an empty map for no orders", () => {
    assert.equal(buildDailySeries([], { now: NOW }).size, 0);
  });
});

describe("holtLinear", () => {
  it("forecasts a flat series as its own level", () => {
    const { forecast } = holtLinear([5, 5, 5, 5, 5, 5], { horizon: 3 });
    for (const value of forecast) assert.ok(Math.abs(value - 5) < 0.5);
  });

  it("extrapolates an upward trend", () => {
    const { forecast, trend } = holtLinear([1, 2, 3, 4, 5, 6, 7], { horizon: 3 });
    assert.ok(trend > 0);
    assert.ok(forecast[2] > forecast[0]);
    assert.ok(forecast[0] > 7);
  });

  it("extrapolates a downward trend", () => {
    const { trend } = holtLinear([10, 8, 6, 4, 2], { horizon: 3 });
    assert.ok(trend < 0);
  });

  it("never forecasts negative demand", () => {
    const { forecast } = holtLinear([10, 5, 1, 0, 0], { horizon: 10 });
    assert.ok(forecast.every((v) => v >= 0));
  });

  it("returns the requested horizon length", () => {
    assert.equal(holtLinear([1, 2, 3], { horizon: 14 }).forecast.length, 14);
  });

  it("handles a single observation", () => {
    const { forecast } = holtLinear([4], { horizon: 3 });
    assert.deepEqual(forecast, [4, 4, 4]);
  });

  it("handles empty input", () => {
    const { forecast, level, trend } = holtLinear([], { horizon: 2 });
    assert.deepEqual(forecast, [0, 0]);
    assert.equal(level, 0);
    assert.equal(trend, 0);
  });

  it("produces one fitted value per observation", () => {
    const values = [3, 4, 5, 6];
    assert.equal(holtLinear(values).fitted.length, values.length);
  });

  describe("trend damping", () => {
    const rising = [1, 2, 3, 4, 5, 6, 7, 8];

    it("defaults to undamped Holt (phi = 1)", () => {
      const undamped = holtLinear(rising, { horizon: 10 });
      const explicit = holtLinear(rising, { horizon: 10, phi: 1 });
      assert.deepEqual(undamped.forecast, explicit.forecast);
    });

    it("forecasts lower than undamped Holt at a long horizon", () => {
      const undamped = holtLinear(rising, { horizon: 14, phi: 1 });
      const damped = holtLinear(rising, { horizon: 14, phi: 0.8 });
      assert.ok(damped.forecast.at(-1) < undamped.forecast.at(-1));
    });

    it("flattens out instead of growing without bound", () => {
      const { forecast } = holtLinear(rising, { horizon: 30, phi: 0.8, alpha: 0.1, beta: 0.02 });
      const earlyStep = forecast[1] - forecast[0];
      const lateStep = forecast.at(-1) - forecast.at(-2);
      assert.ok(lateStep < earlyStep, "damped steps should shrink over the horizon");
    });

    it("still respects the non-negative floor", () => {
      const { forecast } = holtLinear([10, 7, 4, 1, 0], { horizon: 20, phi: 0.8 });
      assert.ok(forecast.every((v) => v >= 0));
    });
  });
});

describe("FORECAST_DEFAULTS", () => {
  it("uses a damped trend tuned by backtesting", () => {
    assert.ok(FORECAST_DEFAULTS.phi > 0 && FORECAST_DEFAULTS.phi < 1);
    assert.ok(FORECAST_DEFAULTS.alpha > 0 && FORECAST_DEFAULTS.alpha <= 1);
    assert.ok(FORECAST_DEFAULTS.beta > 0 && FORECAST_DEFAULTS.beta <= 1);
  });

  it("beats undamped Holt on a bursty weekly-repeating series", () => {
    // Demand arrives in weekly bursts, which is what over-extrapolates badly.
    const daily = [];
    for (let week = 0; week < 6; week++) daily.push(3, 0, 0, 2, 0, 0, 0);

    const train = daily.slice(0, -7);
    const actual = daily.slice(-7).reduce((a, b) => a + b, 0);

    const sum = (opts) =>
      holtLinear(train, { ...opts, horizon: 7 }).forecast.reduce((a, b) => a + b, 0);

    const dampedError = Math.abs(sum(FORECAST_DEFAULTS) - actual);
    const undampedError = Math.abs(sum({ alpha: 0.5, beta: 0.3, phi: 1 }) - actual);

    assert.ok(
      dampedError <= undampedError,
      `damped error ${dampedError} should not exceed undamped ${undampedError}`
    );
  });
});

describe("linearTrend", () => {
  it("recovers the slope of a perfect line", () => {
    const { slope } = linearTrend([0, 2, 4, 6, 8]);
    assert.ok(Math.abs(slope - 2) < 1e-9);
  });

  it("returns a zero slope for a flat series", () => {
    assert.equal(linearTrend([3, 3, 3, 3]).slope, 0);
  });

  it("returns a negative slope for a falling series", () => {
    assert.ok(linearTrend([9, 6, 3, 0]).slope < 0);
  });

  it("handles fewer than two points", () => {
    assert.deepEqual(linearTrend([]), { slope: 0, intercept: 0 });
    assert.deepEqual(linearTrend([7]), { slope: 0, intercept: 7 });
  });
});

describe("meanAbsoluteError", () => {
  it("is 0 for a perfect fit", () => {
    assert.equal(meanAbsoluteError([1, 2, 3], [1, 2, 3]), 0);
  });

  it("averages absolute deviations", () => {
    assert.equal(meanAbsoluteError([1, 2, 3], [2, 3, 4]), 1);
  });

  it("is 0 for empty input", () => {
    assert.equal(meanAbsoluteError([], []), 0);
  });
});

describe("forecastDemand", () => {
  it("returns a row for every product", () => {
    const report = forecastDemand(products, makeOrders(NOW), { now: NOW });
    assert.equal(report.products.length, products.length);
    assert.equal(report.totals.products, products.length);
  });

  it("reports the window and generation timestamp", () => {
    const report = forecastDemand(products, makeOrders(NOW), {
      now: NOW,
      historyDays: 14,
      horizon: 5,
    });
    assert.equal(report.window.historyDays, 14);
    assert.equal(report.window.horizon, 5);
    assert.equal(report.window.generatedAt, NOW.toISOString());
    assert.equal(report.products[0].forecastDaily.length, 5);
  });

  it("ranks the best seller first", () => {
    const report = forecastDemand(products, makeOrders(NOW), { now: NOW });
    assert.equal(report.products[0].productId, "p_milk");
  });

  it("totals units sold across the catalogue", () => {
    const report = forecastDemand(products, makeOrders(NOW), { now: NOW });
    const expected = makeOrders(NOW)
      .flatMap((o) => o.items)
      .reduce((n, i) => n + i.quantity, 0);
    assert.equal(report.totals.unitsSoldLastPeriod, expected);
  });

  it("labels a rising product as rising and advises stocking up", () => {
    const report = forecastDemand(products, makeRisingOrders(NOW), { now: NOW, historyDays: 10 });
    const milk = report.products.find((p) => p.productId === "p_milk");
    assert.equal(milk.trendLabel, "rising");
    assert.ok(milk.trendPerDay > 0);
    assert.ok(milk.forecastUnits > 0);
    assert.match(milk.recommendation, /rising/i);
    assert.ok(report.risingCount >= 1);
  });

  it("flags an out-of-stock product with forecast demand", () => {
    const orders = [
      { createdAt: NOW, items: [{ product: "p_cake", quantity: 6 }] },
      {
        createdAt: new Date(NOW.getTime() - 86400000),
        items: [{ product: "p_cake", quantity: 4 }],
      },
    ];
    const report = forecastDemand(products, orders, { now: NOW, historyDays: 10 });
    const cake = report.products.find((p) => p.productId === "p_cake");
    assert.equal(cake.inStock, false);
    assert.match(cake.recommendation, /restock/i);
  });

  it("advises promotion for products with no demand signal", () => {
    const report = forecastDemand(products, [], { now: NOW });
    assert.ok(report.products.every((p) => p.unitsSoldLastPeriod === 0));
    assert.ok(report.products.every((p) => /no demand signal/i.test(p.recommendation)));
  });

  it("keeps confidence inside [0.05, 0.95]", () => {
    const report = forecastDemand(products, makeOrders(NOW), { now: NOW });
    for (const row of report.products) {
      assert.ok(row.confidence >= 0.05 && row.confidence <= 0.95, `got ${row.confidence}`);
    }
  });

  it("never forecasts negative units", () => {
    const report = forecastDemand(products, makeOrders(NOW), { now: NOW });
    assert.ok(report.products.every((p) => p.forecastUnits >= 0));
  });

  it("respects the row limit", () => {
    const report = forecastDemand(products, makeOrders(NOW), { now: NOW, limit: 3 });
    assert.equal(report.products.length, 3);
    assert.equal(report.totals.products, products.length); // totals still cover everything
  });

  it("handles an empty catalogue", () => {
    const report = forecastDemand([], [], { now: NOW });
    assert.deepEqual(report.products, []);
    assert.equal(report.totals.forecastUnits, 0);
  });
});
