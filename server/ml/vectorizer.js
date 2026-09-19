import { tokenize, termFrequency } from "./tokenizer.js";

/**
 * TF-IDF vector space model over the product catalogue.
 *
 * Vectors are stored sparsely (Map<term, weight>) and L2-normalised, so cosine
 * similarity collapses into a plain dot product over the smaller vector.
 */
export class TfidfVectorizer {
  constructor() {
    /** @type {Map<string, number>} term -> document frequency */
    this.documentFrequency = new Map();
    /** @type {Map<string, number>} term -> inverse document frequency */
    this.idf = new Map();
    this.documentCount = 0;
  }

  /**
   * @param {string[][]} documents pre-tokenized documents
   */
  fit(documents) {
    this.documentFrequency = new Map();
    this.documentCount = documents.length;

    for (const tokens of documents) {
      for (const term of new Set(tokens)) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
    }

    this.idf = new Map();
    for (const [term, df] of this.documentFrequency) {
      // Smoothed IDF keeps weights positive even for terms in every document.
      this.idf.set(term, Math.log((this.documentCount + 1) / (df + 1)) + 1);
    }

    return this;
  }

  /**
   * @param {string[]} tokens
   * @returns {Map<string, number>} L2-normalised sparse vector
   */
  transform(tokens) {
    const tf = termFrequency(tokens);
    const vector = new Map();
    let norm = 0;

    for (const [term, count] of tf) {
      const idf = this.idf.get(term);
      if (idf === undefined) continue; // out-of-vocabulary
      const weight = (1 + Math.log(count)) * idf;
      vector.set(term, weight);
      norm += weight * weight;
    }

    if (norm === 0) return vector;

    norm = Math.sqrt(norm);
    for (const [term, weight] of vector) {
      vector.set(term, weight / norm);
    }
    return vector;
  }

  get vocabularySize() {
    return this.idf.size;
  }
}

/** Cosine similarity between two L2-normalised sparse vectors. */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;

  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  return dot;
}

/**
 * Builds the text document for a product. Name is repeated so it outweighs the
 * long-tail description tokens.
 */
export function productDocument(product) {
  const name = product?.name ?? "";
  return tokenize([name, name, name, product?.category ?? "", product?.description ?? []]);
}
