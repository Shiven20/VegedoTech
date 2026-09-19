import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenize, stem, termFrequency, diceSimilarity } from "../tokenizer.js";

describe("tokenizer", () => {
  it("lowercases, strips punctuation and drops stopwords", () => {
    assert.deepEqual(tokenize("The Fresh, Red Apple!"), ["fresh", "red", "apple"]);
  });

  it("flattens nested string arrays (product description fields)", () => {
    const tokens = tokenize(["Organic Banana", ["Sweet", "ripe"]]);
    assert.deepEqual(tokens, ["organic", "banana", "sweet", "ripe"]);
  });

  it("returns an empty array for empty or non-text input", () => {
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(""), []);
    assert.deepEqual(tokenize({}), []);
    assert.deepEqual(tokenize(["   "]), []);
  });

  it("collapses singular and plural forms to one stem", () => {
    assert.equal(stem("apples"), stem("apple"));
    assert.equal(stem("berries"), "berry");
    assert.equal(stem("boxes"), "box");
  });

  it("keeps double-s words intact", () => {
    assert.equal(stem("glass"), "glass");
  });

  it("counts term frequency", () => {
    const tf = termFrequency(["milk", "milk", "bread"]);
    assert.equal(tf.get("milk"), 2);
    assert.equal(tf.get("bread"), 1);
  });

  describe("diceSimilarity", () => {
    it("is 1 for identical strings", () => {
      assert.equal(diceSimilarity("tomato", "tomato"), 1);
    });

    it("scores a single-character typo highly", () => {
      assert.ok(diceSimilarity("tomatoe", "tomato") > 0.7);
    });

    it("scores unrelated words low", () => {
      assert.ok(diceSimilarity("apple", "cement") < 0.2);
    });

    it("handles empty and one-character input", () => {
      assert.equal(diceSimilarity("", "apple"), 0);
      assert.equal(diceSimilarity("a", "apple"), 0);
    });
  });
});
