import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAppContext } from "../../context/AppContext";

const TREND_STYLES = {
  rising: "bg-green-100 text-green-700",
  falling: "bg-red-100 text-red-700",
  steady: "bg-gray-100 text-gray-600",
};

const TREND_ARROWS = { rising: "▲", falling: "▼", steady: "▬" };

/**
 * Seller-facing demand forecasting dashboard.
 *
 * Reads /api/ai/forecast, which runs Holt linear (double exponential smoothing)
 * over per-product daily sales and returns an n-day forecast plus restock advice.
 */
const DemandForecast = () => {
  const { axios, currency } = useAppContext();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);
  const [horizon, setHorizon] = useState(7);

  const loadForecast = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/ai/forecast", {
        params: { historyDays, horizon, limit: 100 },
      });
      if (data.success) {
        setReport(data);
      } else {
        toast.error(data.message || "Could not load forecast");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const retrain = async () => {
    setRetraining(true);
    try {
      const { data } = await axios.post("/api/ai/retrain");
      if (data.success) {
        toast.success("Model retrained");
        await loadForecast();
      } else {
        toast.error(data.message || "Retraining failed");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setRetraining(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, [historyDays, horizon]);

  return (
    <div className="flex-1 h-[95vh] overflow-y-scroll flex flex-col justify-between">
      <div className="w-full md:p-10 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="pb-1 text-lg font-medium">Demand Forecast</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                ML
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Exponential smoothing over your sales history, with restock guidance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600">
              History
              <select
                value={historyDays}
                onChange={(e) => setHistoryDays(Number(e.target.value))}
                className="ml-2 border border-gray-300 rounded px-2 py-1 outline-none"
              >
                {[14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-600">
              Forecast
              <select
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="ml-2 border border-gray-300 rounded px-2 py-1 outline-none"
              >
                {[7, 14, 30].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </label>

            <button
              onClick={retrain}
              disabled={retraining}
              className="border border-primary text-primary rounded px-4 py-1.5 text-sm hover:bg-primary/10 transition disabled:opacity-50 cursor-pointer"
            >
              {retraining ? "Retraining..." : "Retrain model"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-8 space-y-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
            <span className="sr-only">Loading forecast</span>
          </div>
        )}

        {!loading && report && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <StatCard label="Units sold" value={report.totals.unitsSoldLastPeriod} hint={`last ${report.window.historyDays} days`} />
              <StatCard label={`Forecast (${report.window.horizon}d)`} value={report.totals.forecastUnits} hint="units" />
              <StatCard label="Rising" value={report.risingCount} hint="products trending up" />
              <StatCard label="Falling" value={report.fallingCount} hint="products trending down" />
            </div>

            <div className="mt-8 overflow-x-auto rounded-md border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <caption className="sr-only">
                  Per-product demand forecast and restock recommendations
                </caption>
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Product</th>
                    <th scope="col" className="px-4 py-3 font-medium">Category</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Sold</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Forecast</th>
                    <th scope="col" className="px-4 py-3 font-medium">Trend</th>
                    <th scope="col" className="px-4 py-3 font-medium">Confidence</th>
                    <th scope="col" className="px-4 py-3 font-medium">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {report.products.map((row) => (
                    <tr key={row.productId} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-700">{row.name}</span>
                        {!row.inStock && (
                          <span className="ml-2 text-[10px] uppercase bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                            out of stock
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{row.category}</td>
                      <td className="px-4 py-3 text-right">{row.unitsSoldLastPeriod}</td>
                      <td className="px-4 py-3 text-right font-medium">{row.forecastUnits}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${TREND_STYLES[row.trendLabel]}`}>
                          <span aria-hidden="true">{TREND_ARROWS[row.trendLabel]}</span>
                          {row.trendLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.round(row.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {Math.round(row.confidence * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{row.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Generated {new Date(report.window.generatedAt).toLocaleString()} from{" "}
              {report.totals.ordersAnalysed} orders. Prices in {currency}.
            </p>
          </>
        )}

        {!loading && !report && (
          <p className="mt-8 text-gray-500">No forecast available yet.</p>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, hint }) => (
  <div className="rounded-md border border-gray-200 bg-white p-4">
    <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
    <p className="text-2xl font-medium text-gray-800 mt-1">{value}</p>
    <p className="text-xs text-gray-400">{hint}</p>
  </div>
);

export default DemandForecast;
