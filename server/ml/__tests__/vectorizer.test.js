import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TfidfVectorizer, cosineSimilarity, productDocument } from "../vectorizer.js";
import { products } from "./fixtures.js";

const docs = products.map(productDocument);

describe("TfidfVectorizer", () => {
  it("builds a vocabulary from the corpus", () => {
    const v = new TfidfVectorizer().fit(docs);
    assert.ok(v.vocabularySize > 10);
    assert.equal(v.documentCount, products.length);
  });

  it("produces L2-normalised vectors", () => {
    const v = new TfidfVectorizer().fit(docs);
    const vector = v.transform(docs[0]);
    const norm = Math.sqrt([...vector.values()].reduce((n, w) => n + w * w, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9, `expected unit norm, got ${norm}`);
  });

  it("weights rare terms above common ones", () => {
    const v = new TfidfVectorizer().fit(docs);
    // "dairy" appears in two docs, "apple" in two as well; "cheddar" only once.
    assert.ok(v.idf.get("cheddar") > v.idf.get("dairy"));
  });

  it("ignores out-of-vocabulary terms", () => {
    const v = new TfidfVectorizer().fit(docs);
    const vector = v.transform(["quinoa", "xyzzy"]);
    assert.equal(vector.size, 0);
  });

  it("handles an empty corpus without throwing", () => {
    const v = new TfidfVectorizer().fit([]);
    assert.equal(v.vocabularySize, 0);
    assert.equal(v.transform(["apple"]).size, 0);
  });
});

describe("cosineSimilarity", () => {
  const v = new TfidfVectorizer().fit(docs);
  const vec = (i) => v.transform(docs[i]);
  const index = (id) => products.findIndex((p) => p._id === id);

  it("is 1 for a vector against itself", () => {
    assert.ok(Math.abs(cosineSimilarity(vec(0), vec(0)) - 1) < 1e-9);
  });

  it("ranks two apples above apple vs milk", () => {
    const appleToGreenApple = cosineSimilarity(vec(index("p_apple")), vec(index("p_green_apple")));
    const appleToMilk = cosineSimilarity(vec(index("p_apple")), vec(index("p_milk")));
    assert.ok(appleToGreenApple > appleToMilk);
  });

  it("is 0 when either vector is empty", () => {
    assert.equal(cosineSimilarity(new Map(), vec(0)), 0);
    assert.equal(cosineSimilarity(null, vec(0)), 0);
  });

  it("is symmetric", () => {
    const a = cosineSimilarity(vec(0), vec(3));
    const b = cosineSimilarity(vec(3), vec(0));
    assert.ok(Math.abs(a - b) < 1e-12);
  });
});

describe("productDocument", () => {
  it("repeats the product name so it outweighs the description", () => {
    const tokens = productDocument({ name: "Milk", category: "Dairy", description: ["creamy"] });
    assert.equal(tokens.filter((t) => t === "milk").length, 3);
  });

  it("tolerates missing fields", () => {
    assert.deepEqual(productDocument({}), []);
    assert.deepEqual(productDocument(null), []);
  });
});
