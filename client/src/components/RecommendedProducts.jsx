import React, { useEffect, useState } from "react";
import ProductCard from "./ProductCard";
import { useAppContext } from "../context/AppContext";

const REASON_LABELS = {
  "frequently-bought-together": "Often bought together",
  "similar-product": "Similar pick",
  "same-category": "Same aisle",
  trending: "Trending now",
  popular: "Popular",
  "semantic-match": "Match",
};

/**
 * Renders an AI recommendation strip.
 *
 * Two modes:
 *  - `productId` set  -> "more like this" from /api/ai/similar/:id
 *  - otherwise        -> personalised feed from /api/ai/recommendations
 *                        (seeded server-side from the signed-in user's cart or
 *                         order history, falling back to trending)
 *
 * Renders nothing when the model has no suggestions, so it degrades quietly if
 * the AI service is unavailable.
 */
const RecommendedProducts = ({
  productId = null,
  seedIds = [],
  title = "Recommended for you",
  subtitle = "Picked by our recommendation model",
  limit = 5,
  showScores = false,
}) => {
  const { fetchSimilarProducts, fetchRecommendations } = useAppContext();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const seedKey = seedIds.join(",");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const results = productId
        ? await fetchSimilarProducts(productId, limit)
        : await fetchRecommendations(seedIds, limit);
      if (!cancelled) {
        setItems(results ?? []);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [productId, seedKey, limit]);

  if (loading) {
    return (
      <section className="mt-16" aria-busy="true" aria-live="polite">
        <Heading title={title} subtitle={subtitle} />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6 mt-6">
          {Array.from({ length: limit }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-md border border-gray-500/20 bg-gray-100 animate-pulse"
            />
          ))}
        </div>
        <span className="sr-only">Loading recommendations</span>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-16">
      <Heading title={title} subtitle={subtitle} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6 mt-6">
        {items.map((item) => (
          <div key={item._id} className="flex flex-col gap-1">
            <ProductCard product={item} />
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] uppercase tracking-wide text-primary/80">
                {REASON_LABELS[item.reason] ?? "Suggested"}
              </span>
              {showScores && (
                <span className="text-[11px] text-gray-400" title="Model relevance score">
                  {Number(item.score ?? 0).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const Heading = ({ title, subtitle }) => (
  <div className="flex flex-col">
    <div className="flex items-center gap-2">
      <h2 className="text-2xl md:text-3xl font-medium">{title}</h2>
      <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-1 rounded-full">
        AI
      </span>
    </div>
    <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    <div className="w-16 h-0.5 bg-primary rounded-full mt-2" />
  </div>
);

export default RecommendedProducts;
