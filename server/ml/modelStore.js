import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { HybridRecommender } from "./recommender.js";

/**
 * In-process model registry.
 *
 * Training is cheap (pure CPU over the catalogue) but not free, so the fitted
 * recommender is cached for TTL_MS and refitted lazily on the next request.
 * Concurrent callers share a single in-flight training promise.
 */
const TTL_MS = Number(process.env.ML_MODEL_TTL_MS ?? 5 * 60 * 1000);

let model = null;
let trainedAt = 0;
let inFlight = null;

/** How much order history feeds the collaborative signal. */
const ORDER_LOOKBACK_DAYS = Number(process.env.ML_ORDER_LOOKBACK_DAYS ?? 90);

export async function loadTrainingData() {
  const since = new Date(Date.now() - ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [products, orders] = await Promise.all([
    Product.find().lean(),
    Order.find({ createdAt: { $gte: since } })
      .select("items amount createdAt")
      .lean(),
  ]);

  return { products, orders };
}

/**
 * Returns a trained recommender, refitting when the cache is cold or stale.
 * @param {{force?: boolean}} options
 */
export async function getModel({ force = false } = {}) {
  const fresh = model && Date.now() - trainedAt < TTL_MS;
  if (fresh && !force) return model;
  if (inFlight && !force) return inFlight;

  inFlight = (async () => {
    try {
      const { products, orders } = await loadTrainingData();
      const trained = new HybridRecommender().fit(products, orders);
      model = trained;
      trainedAt = Date.now();
      return trained;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Called after catalogue mutations so the next request retrains. */
export function invalidateModel() {
  trainedAt = 0;
}

export function modelMeta() {
  return {
    trained: Boolean(model),
    trainedAt: model ? new Date(trainedAt).toISOString() : null,
    ttlMs: TTL_MS,
    ageMs: model ? Date.now() - trainedAt : null,
    stats: model ? model.stats : null,
  };
}

/** Test seam: drop the cached model between test cases. */
export function __resetModelCache() {
  model = null;
  trainedAt = 0;
  inFlight = null;
}
