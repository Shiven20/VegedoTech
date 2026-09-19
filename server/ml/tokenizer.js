/**
 * Text normalisation helpers shared by the recommender and the semantic search.
 * Zero dependencies so the whole ML layer stays testable without a DB or network.
 */

export const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "in", "into", "is", "it", "its", "of", "on", "or", "that", "the",
  "their", "then", "there", "these", "they", "this", "to", "was", "were",
  "will", "with", "your", "you", "we", "our", "all", "any", "can", "each",
  "made", "make", "more", "most", "not", "other", "out", "per", "so", "such",
  "than", "too", "very", "also", "get", "gets",
]);

/** Cheap English-ish suffix stripper. Keeps "tomato"/"tomatoes" in the same bucket. */
export function stem(token) {
  let t = token;
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && (t.endsWith("ses") || t.endsWith("xes") || t.endsWith("hes"))) {
    return t.slice(0, -2);
  }
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  return t;
}

/**
 * Lowercases, strips punctuation, drops stopwords and stems what is left.
 * @param {unknown} input string | string[] | nested arrays
 * @returns {string[]}
 */
export function tokenize(input) {
  const text = flatten(input).join(" ");
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function flatten(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

/** Bag of words -> term frequency map. */
export function termFrequency(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

/**
 * Character-bigram Dice coefficient. Used as a typo-tolerant fallback in search
 * ("tomatoe" -> "tomato") without pulling in a fuzzy-match dependency.
 */
export function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }

  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2);
    const count = bigrams.get(gram) ?? 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      hits++;
    }
  }

  return (2 * hits) / (a.length + b.length - 2);
}
