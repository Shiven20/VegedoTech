import { TfidfVectorizer, cosineSimilarity, productDocument } from "./vectorizer.js";
import { tokenize, diceSimilarity } from "./tokenizer.js";

/**
 * Hybrid recommender.
 *
 *  - Content based: TF-IDF cosine similarity over name + category + description.
 *  - Collaborative: item-to-item co-occurrence lift mined from past orders.
 *  - Blended with `contentWeight` / `collabWeight`, then nudged by a popularity
 *    prior so cold-start catalogues still return sensible results.
 *
 * Training is pure CPU work over plain objects, which makes it trivial to unit
 * test and cheap enough to retrain in-process on a TTL.
 */
export class HybridRecommender {
  constructor({ contentWeight = 0.6, collabWeight = 0.4, popularityWeight = 0.1 } = {}) {
    this.contentWeight = contentWeight;
    this.collabWeight = collabWeight;
    this.popularityWeight = popularityWeight;

    this.vectorizer = new TfidfVectorizer();
    /** @type {Map<string, Map<string, number>>} productId -> tfidf vector */
    this.vectors = new Map();
    /** @type {Map<string, object>} productId -> product */
    this.products = new Map();
    /** @type {Map<string, Map<string, number>>} productId -> (coProductId -> count) */
    this.coOccurrence = new Map();
    /** @type {Map<string, number>} productId -> units sold */
    this.purchaseCounts = new Map();
    this.totalBaskets = 0;
    this.maxPurchaseCount = 0;
    this.trainedAt = null;
  }

  /**
   * @param {object[]} products documents from the product collection
   * @param {object[]} orders   documents from the order collection (items[].product)
   */
  fit(products = [], orders = []) {
    const docs = [];
    this.products = new Map();

    for (const product of products) {
      const id = idOf(product);
      if (!id) continue;
      this.products.set(id, product);
      docs.push({ id, tokens: productDocument(product) });
    }

    this.vectorizer.fit(docs.map((d) => d.tokens));
    this.vectors = new Map(docs.map((d) => [d.id, this.vectorizer.transform(d.tokens)]));

    this.#fitCollaborative(orders);
    this.trainedAt = new Date();
    return this;
  }

  #fitCollaborative(orders) {
    this.coOccurrence = new Map();
    this.purchaseCounts = new Map();
    this.totalBaskets = 0;

    for (const order of orders) {
      const basket = [
        ...new Set(
          (order?.items ?? [])
            .map((item) => idOf(item?.product))
            .filter((id) => id && this.products.has(id))
        ),
      ];

      for (const item of order?.items ?? []) {
        const id = idOf(item?.product);
        if (!id) continue;
        const qty = Number(item?.quantity) > 0 ? Number(item.quantity) : 1;
        this.purchaseCounts.set(id, (this.purchaseCounts.get(id) ?? 0) + qty);
      }

      if (basket.length < 2) continue;
      this.totalBaskets++;

      for (const a of basket) {
        let row = this.coOccurrence.get(a);
        if (!row) {
          row = new Map();
          this.coOccurrence.set(a, row);
        }
        for (const b of basket) {
          if (a === b) continue;
          row.set(b, (row.get(b) ?? 0) + 1);
        }
      }
    }

    this.maxPurchaseCount = Math.max(0, ...this.purchaseCounts.values());
  }

  /** Normalised popularity prior in [0, 1]. */
  popularity(productId) {
    if (!this.maxPurchaseCount) return 0;
    return (this.purchaseCounts.get(productId) ?? 0) / this.maxPurchaseCount;
  }

  /** Collaborative score: how often `candidate` shares a basket with `seedId`. */
  collaborativeScore(seedId, candidateId) {
    const row = this.coOccurrence.get(seedId);
    if (!row) return 0;
    const together = row.get(candidateId) ?? 0;
    if (!together) return 0;
    const seedBaskets = Math.max(1, row.get(seedId) ?? maxOf(row));
    return together / seedBaskets;
  }

  /**
   * "More like this" for a single product.
   * @returns {{product: object, score: number, contentScore: number, collabScore: number, reason: string}[]}
   */
  similarTo(productId, { limit = 5, excludeOutOfStock = true } = {}) {
    const seedVector = this.vectors.get(productId);
    if (!seedVector) return [];
    const seed = this.products.get(productId);

    const scored = [];
    for (const [candidateId, candidate] of this.products) {
      if (candidateId === productId) continue;
      if (excludeOutOfStock && candidate.inStock === false) continue;

      const contentScore = cosineSimilarity(seedVector, this.vectors.get(candidateId));
      const collabScore = this.collaborativeScore(productId, candidateId);
      const categoryBoost =
        seed?.category && candidate?.category === seed.category ? 0.08 : 0;

      const score =
        this.contentWeight * contentScore +
        this.collabWeight * collabScore +
        this.popularityWeight * this.popularity(candidateId) +
        categoryBoost;

      if (score <= 0) continue;
      scored.push({
        product: candidate,
        score: round(score),
        contentScore: round(contentScore),
        collabScore: round(collabScore),
        reason: explain(contentScore, collabScore, categoryBoost),
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Personalised feed from a set of seeds (cart contents and/or order history).
   * Scores are aggregated across seeds so items related to several seeds win.
   * @param {string[]} seedIds
   */
  recommendForSeeds(seedIds = [], { limit = 8, excludeOutOfStock = true } = {}) {
    const seeds = seedIds.filter((id) => this.vectors.has(id));

    if (seeds.length === 0) return this.trending({ limit, excludeOutOfStock });

    const totals = new Map();
    for (const seedId of seeds) {
      for (const hit of this.similarTo(seedId, {
        limit: limit * 3,
        excludeOutOfStock,
      })) {
        const id = idOf(hit.product);
        if (seeds.includes(id)) continue; // never re-recommend a seed
        const prev = totals.get(id);
        if (prev) {
          prev.score += hit.score;
          prev.contentScore = Math.max(prev.contentScore, hit.contentScore);
          prev.collabScore = Math.max(prev.collabScore, hit.collabScore);
        } else {
          totals.set(id, { ...hit });
        }
      }
    }

    return [...totals.values()]
      .map((hit) => ({ ...hit, score: round(hit.score / seeds.length) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Popularity fallback for anonymous / cold-start visitors. */
  trending({ limit = 8, excludeOutOfStock = true } = {}) {
    const items = [...this.products.entries()]
      .filter(([, p]) => !excludeOutOfStock || p.inStock !== false)
      .map(([id, product]) => ({
        product,
        score: round(this.popularity(id)),
        contentScore: 0,
        collabScore: 0,
        reason: "trending",
      }));

    const anySales = items.some((i) => i.score > 0);
    if (!anySales) return items.slice(0, limit);
    return items.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Semantic-ish catalogue search: TF-IDF cosine on the query, with a
   * character-bigram fallback so misspellings still land on the right product.
   */
  search(query, { limit = 12, minScore = 0.02 } = {}) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const queryVector = this.vectorizer.transform(tokens);
    const results = [];

    for (const [id, product] of this.products) {
      let score = cosineSimilarity(queryVector, this.vectors.get(id));

      if (score < 0.15) {
        const nameTokens = tokenize(product?.name ?? "");
        let fuzzy = 0;
        for (const qt of tokens) {
          for (const nt of nameTokens) {
            fuzzy = Math.max(fuzzy, diceSimilarity(qt, nt));
          }
        }
        // Discounted so exact TF-IDF hits always outrank fuzzy ones.
        if (fuzzy > 0.6) score = Math.max(score, fuzzy * 0.45);
      }

      // Popularity only breaks ties between products that already match the
      // query. Applying it unconditionally would leak best sellers into
      // searches with no textual relevance at all.
      if (score <= 0) continue;
      score += this.popularityWeight * this.popularity(id);

      if (score < minScore) continue;
      results.push({ product, score: round(score), reason: "semantic-match" });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  get stats() {
    return {
      products: this.products.size,
      vocabulary: this.vectorizer.vocabularySize,
      baskets: this.totalBaskets,
      coOccurrencePairs: [...this.coOccurrence.values()].reduce((n, row) => n + row.size, 0),
      trainedAt: this.trainedAt,
    };
  }
}

function explain(contentScore, collabScore, categoryBoost) {
  if (collabScore >= contentScore && collabScore > 0) return "frequently-bought-together";
  if (contentScore > 0) return "similar-product";
  return categoryBoost > 0 ? "same-category" : "popular";
}

function maxOf(row) {
  let max = 0;
  for (const value of row.values()) max = Math.max(max, value);
  return max;
}

/** Mongo ids, populated docs and plain strings all end up as a string here. */
export function idOf(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return idOf(value._id);
    if (typeof value.toString === "function") {
      const str = value.toString();
      return str === "[object Object]" ? null : str;
    }
  }
  return null;
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}
