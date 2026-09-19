import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { getModel, modelMeta, invalidateModel } from "../ml/modelStore.js";
import { forecastDemand } from "../ml/forecaster.js";
import { idOf } from "../ml/recommender.js";

const clampLimit = (value, fallback, max = 24) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
};

/**
 * GET /api/ai/similar/:id
 * Content + collaborative "more like this" for a single product.
 */
export const similarProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = clampLimit(req.query.limit, 5);

    const model = await getModel();
    const results = model.similarTo(id, { limit });

    res.status(200).json({
      success: true,
      productId: id,
      recommendations: results.map(toDto),
      model: model.stats,
    });
  } catch (error) {
    console.error("similarProducts error:", error.message);
    res.status(500).json({ success: false, message: "Failed to compute recommendations" });
  }
};

/**
 * POST /api/ai/recommendations
 * Personalised feed. Seeds come from (in order of precedence):
 *   1. explicit `productIds` in the body
 *   2. the signed-in user's saved cart
 *   3. the signed-in user's past orders
 * Falls back to trending when there is no signal at all.
 */
export const personalRecommendations = async (req, res) => {
  try {
    const limit = clampLimit(req.body?.limit, 8);
    const explicit = Array.isArray(req.body?.productIds)
      ? req.body.productIds.map(idOf).filter(Boolean)
      : [];

    const userId = req.body?.userId ?? null;
    let seeds = explicit;
    let source = explicit.length ? "selection" : "trending";

    if (seeds.length === 0 && userId) {
      const user = await User.findById(userId).select("cartItems").lean();
      const cartSeeds = Object.entries(user?.cartItems ?? {})
        .filter(([, qty]) => Number(qty) > 0)
        .map(([productId]) => productId);

      if (cartSeeds.length) {
        seeds = cartSeeds;
        source = "cart";
      } else {
        const orders = await Order.find({ userId })
          .select("items")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        const historySeeds = [
          ...new Set(orders.flatMap((o) => (o.items ?? []).map((i) => idOf(i.product)))),
        ].filter(Boolean);
        if (historySeeds.length) {
          seeds = historySeeds;
          source = "order-history";
        }
      }
    }

    const model = await getModel();
    const results = model.recommendForSeeds(seeds, { limit });

    res.status(200).json({
      success: true,
      source,
      seedCount: seeds.length,
      recommendations: results.map(toDto),
      model: model.stats,
    });
  } catch (error) {
    console.error("personalRecommendations error:", error.message);
    res.status(500).json({ success: false, message: "Failed to compute recommendations" });
  }
};

/**
 * GET /api/ai/search?q=...
 * TF-IDF ranked catalogue search with typo tolerance.
 */
export const smartSearch = async (req, res) => {
  try {
    const query = String(req.query.q ?? "").trim();
    const limit = clampLimit(req.query.limit, 12);

    if (!query) {
      return res.status(400).json({ success: false, message: "Query `q` is required" });
    }

    const model = await getModel();
    const results = model.search(query, { limit });

    res.status(200).json({
      success: true,
      query,
      count: results.length,
      results: results.map(toDto),
    });
  } catch (error) {
    console.error("smartSearch error:", error.message);
    res.status(500).json({ success: false, message: "Search failed" });
  }
};

/**
 * GET /api/ai/forecast  (seller only)
 * Holt linear demand forecast per product plus restock advice.
 */
export const demandForecast = async (req, res) => {
  try {
    const historyDays = clampLimit(req.query.historyDays, 30, 180);
    const horizon = clampLimit(req.query.horizon, 7, 30);
    const limit = clampLimit(req.query.limit, 50, 200);

    const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
    const [products, orders] = await Promise.all([
      Product.find().lean(),
      Order.find({ createdAt: { $gte: since } })
        .select("items createdAt")
        .lean(),
    ]);

    const report = forecastDemand(products, orders, { historyDays, horizon, limit });
    res.status(200).json({ success: true, ...report });
  } catch (error) {
    console.error("demandForecast error:", error.message);
    res.status(500).json({ success: false, message: "Failed to build forecast" });
  }
};

/** GET /api/ai/health — model freshness, used by CI smoke tests and monitoring. */
export const modelHealth = async (_req, res) => {
  try {
    res.status(200).json({ success: true, ...modelMeta() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /api/ai/retrain (seller only) — force a refit after catalogue changes. */
export const retrainModel = async (_req, res) => {
  try {
    invalidateModel();
    const model = await getModel({ force: true });
    res.status(200).json({ success: true, message: "Model retrained", stats: model.stats });
  } catch (error) {
    console.error("retrainModel error:", error.message);
    res.status(500).json({ success: false, message: "Retraining failed" });
  }
};

function toDto({ product, score, contentScore, collabScore, reason }) {
  return {
    _id: idOf(product),
    name: product?.name,
    category: product?.category,
    price: product?.price,
    offerPrice: product?.offerPrice,
    image: product?.image ?? [],
    description: product?.description ?? [],
    inStock: product?.inStock !== false,
    score,
    contentScore,
    collabScore,
    reason,
  };
}
