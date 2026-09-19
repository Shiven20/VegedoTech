import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.SELLER_EMAIL = process.env.SELLER_EMAIL ?? "seller@test.dev";

const { HybridRecommender } = await import("../recommender.js");
const { forecastDemand } = await import("../forecaster.js");
const optionalAuthUser = (await import("../../middlewares/optionalAuthUser.js")).default;
const authSeller = (await import("../../middlewares/authSeller.js")).default;
const { products, makeOrders } = await import("./fixtures.js");

/** Fixed clock so time-windowed assertions stay deterministic. */
const FIXED_NOW = new Date("2026-01-20T10:00:00Z");

/**
 * Mounts the AI routes against an in-memory model instead of MongoDB.
 * This exercises the real middleware chain, status codes and payload shape
 * without requiring a database in CI.
 */
function buildTestApp() {
  const model = new HybridRecommender().fit(products, makeOrders());
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/ai/health", (_req, res) =>
    res.json({ success: true, trained: true, stats: model.stats })
  );

  app.get("/api/ai/search", (req, res) => {
    const query = String(req.query.q ?? "").trim();
    if (!query) return res.status(400).json({ success: false, message: "Query `q` is required" });
    const results = model.search(query, { limit: Number(req.query.limit) || 12 });
    res.json({ success: true, query, count: results.length, results: results.map(dto) });
  });

  app.get("/api/ai/similar/:id", (req, res) => {
    const results = model.similarTo(req.params.id, { limit: Number(req.query.limit) || 5 });
    res.json({ success: true, productId: req.params.id, recommendations: results.map(dto) });
  });

  app.post("/api/ai/recommendations", optionalAuthUser, (req, res) => {
    const seeds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
    const results = model.recommendForSeeds(seeds, { limit: Number(req.body?.limit) || 8 });
    res.json({
      success: true,
      source: seeds.length ? "selection" : "trending",
      userId: req.body?.userId ?? null,
      recommendations: results.map(dto),
    });
  });

  app.get("/api/ai/forecast", authSeller, (_req, res) => {
    // `now` is pinned so the fixture orders always land inside the window.
    res.json({
      success: true,
      ...forecastDemand(products, makeOrders(FIXED_NOW), { now: FIXED_NOW }),
    });
  });

  return app;
}

function dto({ product, score, reason }) {
  return { _id: product._id, name: product.name, score, reason };
}

let server;
let base;

before(async () => {
  server = http.createServer(buildTestApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });
const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const sellerCookie = () =>
  `sellerToken=${jwt.sign({ email: process.env.SELLER_EMAIL }, process.env.JWT_SECRET)}`;
const userCookie = (id = "user_1") =>
  `token=${jwt.sign({ id, email: "shopper@test.dev" }, process.env.JWT_SECRET)}`;

describe("GET /api/ai/health", () => {
  it("returns 200 with model stats", async () => {
    const res = await get("/api/ai/health");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.stats.products > 0);
  });
});

describe("GET /api/ai/search", () => {
  it("returns ranked results for a valid query", async () => {
    const res = await get("/api/ai/search?q=banana");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.results[0]._id, "p_banana");
    assert.equal(body.count, body.results.length);
  });

  it("rejects a missing query with 400", async () => {
    const res = await get("/api/ai/search");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).success, false);
  });

  it("rejects a blank query with 400", async () => {
    const res = await get("/api/ai/search?q=%20%20");
    assert.equal(res.status, 400);
  });

  it("honours the limit parameter", async () => {
    const res = await get("/api/ai/search?q=fresh%20dairy%20bakery&limit=2");
    assert.ok((await res.json()).results.length <= 2);
  });

  it("returns an empty result set rather than an error for nonsense", async () => {
    const res = await get("/api/ai/search?q=zzzzqqqq");
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).results, []);
  });
});

describe("GET /api/ai/similar/:id", () => {
  it("returns recommendations for a known product", async () => {
    const res = await get("/api/ai/similar/p_apple");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.productId, "p_apple");
    assert.ok(body.recommendations.length > 0);
    assert.ok(body.recommendations.every((r) => r._id !== "p_apple"));
  });

  it("returns an empty list for an unknown product", async () => {
    const res = await get("/api/ai/similar/nope");
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).recommendations, []);
  });
});

describe("POST /api/ai/recommendations", () => {
  it("serves trending items to an anonymous visitor", async () => {
    const res = await post("/api/ai/recommendations", {});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "trending");
    assert.equal(body.userId, null);
    assert.ok(body.recommendations.length > 0);
  });

  it("personalises from explicit seeds", async () => {
    const res = await post("/api/ai/recommendations", { productIds: ["p_milk"], limit: 4 });
    const body = await res.json();
    assert.equal(body.source, "selection");
    assert.ok(body.recommendations.length <= 4);
    assert.ok(body.recommendations.every((r) => r._id !== "p_milk"));
  });

  it("attaches the userId when a valid session cookie is present", async () => {
    const res = await post("/api/ai/recommendations", {}, { cookie: userCookie("abc123") });
    assert.equal((await res.json()).userId, "abc123");
  });

  it("does not reject an invalid session cookie", async () => {
    const res = await post("/api/ai/recommendations", {}, { cookie: "token=garbage" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).userId, null);
  });
});

describe("GET /api/ai/forecast", () => {
  it("rejects an anonymous request", async () => {
    const res = await get("/api/ai/forecast");
    assert.ok(res.status >= 400);
    assert.notEqual((await res.json()).success, true);
  });

  it("rejects a shopper token", async () => {
    const res = await get("/api/ai/forecast", { cookie: userCookie() });
    assert.ok(res.status >= 400);
  });

  it("rejects a seller token signed with the wrong email", async () => {
    const bad = `sellerToken=${jwt.sign({ email: "hacker@evil.dev" }, process.env.JWT_SECRET)}`;
    const res = await get("/api/ai/forecast", { cookie: bad });
    assert.equal(res.status, 401);
  });

  it("returns the forecast for an authenticated seller", async () => {
    const res = await get("/api/ai/forecast", { cookie: sellerCookie() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.products.length > 0);
    assert.ok(body.totals.unitsSoldLastPeriod > 0);
    assert.ok(body.window.horizon > 0);
  });
});
