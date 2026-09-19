import express from "express";
import {
  similarProducts,
  personalRecommendations,
  smartSearch,
  demandForecast,
  modelHealth,
  retrainModel,
} from "../controllers/aiController.js";
import authSeller from "../middlewares/authSeller.js";
import optionalAuthUser from "../middlewares/optionalAuthUser.js";

const aiRouter = express.Router();

// Public: model status (no catalogue data leaked, safe for uptime checks).
aiRouter.get("/health", modelHealth);

// Public: ranked catalogue search.
aiRouter.get("/search", smartSearch);

// Public, personalised when a valid session cookie is present.
aiRouter.post("/recommendations", optionalAuthUser, personalRecommendations);

// Public: "more like this" on the product page.
aiRouter.get("/similar/:id", similarProducts);

// Seller only: demand forecasting dashboard + manual retrain.
aiRouter.get("/forecast", authSeller, demandForecast);
aiRouter.post("/retrain", authSeller, retrainModel);

export default aiRouter;
