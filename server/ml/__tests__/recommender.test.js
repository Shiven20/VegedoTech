import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HybridRecommender, idOf } from "../recommender.js";
import { products, makeOrders } from "./fixtures.js";

const ids = (results) => results.map((r) => r.product._id);

describe("HybridRecommender", () => {
  let model;

  beforeEach(() => {
    model = new HybridRecommender().fit(products, makeOrders());
  });

  describe("fit", () => {
    it("indexes every product and reports stats", () => {
      assert.equal(model.stats.products, products.length);
      assert.ok(model.stats.vocabulary > 0);
      assert.ok(model.stats.baskets > 0);
      assert.ok(model.trainedAt instanceof Date);
    });

    it("aggregates purchase quantities", () => {
      // p_milk: 2 + 1 + 3 + 1 + 2 = 9 units across the fixture orders
      assert.equal(model.purchaseCounts.get("p_milk"), 9);
    });

    it("trains on an empty catalogue without throwing", () => {
      const empty = new HybridRecommender().fit([], []);
      assert.deepEqual(empty.similarTo("p_apple"), []);
      assert.deepEqual(empty.search("apple"), []);
      assert.deepEqual(empty.recommendForSeeds(["p_apple"]), []);
    });

    it("skips products without an id", () => {
      const m = new HybridRecommender().fit([{ name: "Ghost" }, ...products], []);
      assert.equal(m.stats.products, products.length);
    });
  });

  describe("similarTo (content based)", () => {
    it("ranks the other apple first for an apple seed", () => {
      const results = model.similarTo("p_apple", { limit: 3 });
      assert.equal(results[0].product._id, "p_green_apple");
    });

    it("never returns the seed product", () => {
      assert.ok(!ids(model.similarTo("p_milk", { limit: 10 })).includes("p_milk"));
    });

    it("excludes out-of-stock products by default", () => {
      assert.ok(!ids(model.similarTo("p_bread", { limit: 10 })).includes("p_cake"));
    });

    it("includes out-of-stock products when asked", () => {
      const results = model.similarTo("p_bread", { limit: 10, excludeOutOfStock: false });
      assert.ok(ids(results).includes("p_cake"));
    });

    it("returns an empty list for an unknown product", () => {
      assert.deepEqual(model.similarTo("does_not_exist"), []);
    });

    it("respects the limit", () => {
      assert.ok(model.similarTo("p_apple", { limit: 2 }).length <= 2);
    });

    it("returns scores in descending order", () => {
      const scores = model.similarTo("p_milk", { limit: 6 }).map((r) => r.score);
      const sorted = [...scores].sort((a, b) => b - a);
      assert.deepEqual(scores, sorted);
    });

    it("tags every result with a reason", () => {
      for (const hit of model.similarTo("p_milk", { limit: 5 })) {
        assert.ok(
          ["frequently-bought-together", "similar-product", "same-category", "popular"].includes(
            hit.reason
          )
        );
      }
    });
  });

  describe("collaborative signal", () => {
    it("links milk to bread from co-purchase history", () => {
      assert.ok(model.collaborativeScore("p_milk", "p_bread") > 0);
    });

    it("scores unrelated pairs at zero", () => {
      assert.equal(model.collaborativeScore("p_apple", "p_cheese"), 0);
    });

    it("surfaces bread for a milk seed even though the text differs", () => {
      const top = ids(model.similarTo("p_milk", { limit: 3 }));
      assert.ok(top.includes("p_bread"), `expected bread in ${JSON.stringify(top)}`);
    });

    it("drops the co-purchase link when history is removed", () => {
      const contentOnly = new HybridRecommender().fit(products, []);
      assert.equal(contentOnly.collaborativeScore("p_milk", "p_bread"), 0);
      assert.equal(contentOnly.similarTo("p_milk", { limit: 1 })[0].product._id, "p_cheese");
    });

    it("ignores single-item baskets for co-occurrence", () => {
      const m = new HybridRecommender().fit(products, [
        { createdAt: new Date(), items: [{ product: "p_milk", quantity: 1 }] },
      ]);
      assert.equal(m.totalBaskets, 0);
    });
  });

  describe("popularity", () => {
    it("normalises the best seller to 1", () => {
      assert.equal(model.popularity("p_milk"), 1);
    });

    it("is 0 for a never-purchased product", () => {
      assert.equal(model.popularity("p_cake"), 0);
    });

    it("is 0 for every product when there is no order history", () => {
      const m = new HybridRecommender().fit(products, []);
      assert.equal(m.popularity("p_milk"), 0);
    });
  });

  describe("recommendForSeeds", () => {
    it("falls back to trending with no seeds", () => {
      const results = model.recommendForSeeds([], { limit: 3 });
      assert.equal(results[0].product._id, "p_milk");
      assert.equal(results[0].reason, "trending");
    });

    it("falls back to trending when seeds are unknown", () => {
      const results = model.recommendForSeeds(["nope"], { limit: 3 });
      assert.ok(results.length > 0);
      assert.equal(results[0].reason, "trending");
    });

    it("never recommends a seed back to the shopper", () => {
      const seeds = ["p_milk", "p_bread"];
      const returned = ids(model.recommendForSeeds(seeds, { limit: 6 }));
      for (const seed of seeds) assert.ok(!returned.includes(seed));
    });

    it("blends multiple seeds", () => {
      const results = model.recommendForSeeds(["p_apple", "p_milk"], { limit: 5 });
      assert.ok(results.length > 0);
      assert.ok(results.every((r) => r.score > 0));
    });

    it("respects the limit", () => {
      assert.ok(model.recommendForSeeds(["p_apple"], { limit: 2 }).length <= 2);
    });

    it("excludes out-of-stock items", () => {
      const returned = ids(model.recommendForSeeds(["p_bread"], { limit: 10 }));
      assert.ok(!returned.includes("p_cake"));
    });
  });

  describe("trending", () => {
    it("orders by units sold", () => {
      const top = ids(model.trending({ limit: 2 }));
      assert.equal(top[0], "p_milk");
    });

    it("still returns items when nothing has ever sold", () => {
      const m = new HybridRecommender().fit(products, []);
      assert.equal(m.trending({ limit: 3 }).length, 3);
    });
  });

  describe("search", () => {
    it("finds a product by an exact name token", () => {
      assert.equal(model.search("banana")[0].product._id, "p_banana");
    });

    it("is case insensitive", () => {
      assert.equal(model.search("BANANA")[0].product._id, "p_banana");
    });

    it("matches on plural input", () => {
      assert.equal(model.search("apples")[0].product.category, "Fruits");
    });

    it("tolerates a typo via the bigram fallback", () => {
      const results = model.search("bananna");
      assert.ok(results.length > 0);
      assert.equal(results[0].product._id, "p_banana");
    });

    it("matches on category", () => {
      const returned = ids(model.search("dairy", { limit: 5 }));
      assert.ok(returned.includes("p_milk"));
      assert.ok(returned.includes("p_cheese"));
    });

    it("matches on description text", () => {
      const returned = ids(model.search("potassium"));
      assert.deepEqual(returned, ["p_banana"]);
    });

    it("returns nothing for an empty query", () => {
      assert.deepEqual(model.search(""), []);
      assert.deepEqual(model.search("   "), []);
      assert.deepEqual(model.search(null), []);
    });

    it("returns nothing for a query with no signal", () => {
      assert.deepEqual(model.search("zzzzqqqq"), []);
    });

    it("respects the limit", () => {
      assert.ok(model.search("fresh organic dairy bakery", { limit: 2 }).length <= 2);
    });

    it("returns descending scores", () => {
      const scores = model.search("apple dairy bread", { limit: 6 }).map((r) => r.score);
      assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    });
  });
});

describe("idOf", () => {
  it("passes strings through", () => {
    assert.equal(idOf("abc"), "abc");
  });

  it("unwraps a populated document", () => {
    assert.equal(idOf({ _id: "abc", name: "x" }), "abc");
  });

  it("stringifies an ObjectId-like value", () => {
    assert.equal(idOf({ toString: () => "507f1f77bcf86cd799439011" }), "507f1f77bcf86cd799439011");
  });

  it("returns null for empty input", () => {
    assert.equal(idOf(null), null);
    assert.equal(idOf(undefined), null);
    assert.equal(idOf(""), null);
  });

  it("returns null for a plain object with no id", () => {
    assert.equal(idOf({ name: "x" }), null);
  });
});
