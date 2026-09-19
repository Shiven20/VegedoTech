# 🥦 Vegedo – Online Grocery Store

**Vegedo** is a modern online grocery store web application that allows users to browse, search, and purchase groceries, while also providing sellers/admins with a dedicated dashboard to manage products and orders.

## 🚀 Deployment

Vegedo is live! You can explore the app here:

- 🔗 **User Login:** [vegedo user login](https://vegedo.onrender.com)
- 🛒 **Seller Login:** [vegedo seller login](https://vegedo.onrender.com/seller)

> You can access the seller login page by appending `/seller` to the main URL.

## 🔐 Demo Login Credentials

### 👤 User Login
- **Email:** `ayush@gmail.com`  
- **Password:** `admin`

### 🛍️ Seller Login
- **Email:** `admin@gmail.com`  
- **Password:** `admin`

## 🧾 Features

### 👤 Buyer Dashboard
- Browse a wide range of grocery items
- Add/remove items from cart
- Secure user authentication
- View order history
- Mobile-responsive UI

### 🛒 Seller/Admin Dashboard
- Add, update, or delete products
- View and manage customer orders
- Admin authentication and protected routes
- Real-time inventory updates
- **Demand forecasting dashboard** with restock recommendations

### 🤖 AI / ML Features
- **Smart search** – TF-IDF ranked catalogue search with typo tolerance ("bananna" → Banana)
- **Hybrid recommendations** – content similarity blended with co-purchase patterns mined from real orders
- **Demand forecasting** – damped exponential smoothing over sales history, with confidence scores and restock advice

---

## 🤖 AI / ML Layer

All models are implemented from scratch in `server/ml/` with **zero extra dependencies**, so they train in-process in milliseconds and need no Python service or model hosting.

| Module | What it does |
|--------|--------------|
| `tokenizer.js` | Normalisation, stopword removal, suffix stemming, character-bigram (Dice) similarity |
| `vectorizer.js` | TF-IDF vector space model with sparse, L2-normalised vectors and cosine similarity |
| `recommender.js` | Hybrid recommender: content similarity + item-to-item collaborative filtering + popularity prior |
| `forecaster.js` | Demand forecasting via damped Holt linear exponential smoothing |
| `modelStore.js` | In-process model cache with TTL, shared in-flight training, and invalidation on catalogue changes |

### How the recommender works

1. **Content signal** – each product becomes a TF-IDF vector over its name (weighted 3×), category and description. Cosine similarity finds textually similar products.
2. **Collaborative signal** – past orders are mined for item-to-item co-occurrence, so Milk → Bread surfaces even though the text has nothing in common.
3. **Blending** – scores combine as `0.6 × content + 0.4 × collaborative + 0.1 × popularity`, with a small same-category boost. Popularity acts only as a tie-breaker in search, so best sellers never leak into irrelevant queries.
4. **Cold start** – with no order history the system degrades to pure content similarity; with no seeds at all it serves trending items.

### API endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/ai/health` | public | Model freshness and stats |
| GET | `/api/ai/search?q=` | public | Ranked catalogue search |
| GET | `/api/ai/similar/:id` | public | "Customers also liked" |
| POST | `/api/ai/recommendations` | optional | Personalised feed (seeded from cart or order history) |
| GET | `/api/ai/forecast` | seller | Per-product demand forecast |
| POST | `/api/ai/retrain` | seller | Force a model refit |

`/api/ai/recommendations` uses optional auth: signed-in shoppers get personalised results, anonymous visitors get trending items. Invalid tokens are ignored rather than rejected.

### Where it appears in the UI

- **Home** – "Recommended for you" strip
- **Product details** – "Customers also liked"
- **Cart** – "Complete your basket" from co-purchase patterns
- **All products** – search results ranked by the model, with an "AI ranked" badge
- **Seller → Demand Forecast** – forecast table with trend, confidence and restock advice

---

## 🔄 CI/CD

Two GitHub Actions workflows live in `.github/workflows/`.

### `ci.yml` — runs on every push and PR

| Job | Steps |
|-----|-------|
| **Server** | `npm ci` → syntax check → 124 ML/API tests → boot smoke test against a live server |
| **Client** | `npm ci` → ESLint → Vite production build → upload `dist` artifact |
| **ML quality gate** | Offline model evaluation against thresholds; **fails the build on regression** |

### The ML quality gate

`server/scripts/evaluate-model.js` trains on a fixed labelled dataset and blocks the merge if relevance or accuracy regress:

| Metric | Threshold | Current |
|--------|-----------|---------|
| precision@5 | ≥ 0.60 | 0.63 |
| recall@5 | ≥ 0.60 | 1.00 |
| MRR | ≥ 0.70 | 1.00 |
| search top-1 accuracy | ≥ 0.85 | 1.00 |
| forecast MAPE | ≤ 0.25 | 0.12 |

Metrics are written to `ml-metrics.json` and uploaded as a CI artifact (30-day retention) so relevance can be tracked over time. This gate caught real problems during development: the forecaster's undamped trend scored 0.86 MAPE and was fixed by adding trend damping tuned through held-out backtesting.

### `deploy.yml` — runs on `main`/`master`

Re-verifies tests, the ML gate and the client build, then deploys the API and web app and probes `/health` and `/api/ai/health` afterwards. Deploy steps skip with a warning when Vercel secrets are absent, so forks and unconfigured repos don't see red builds.

Configure these in repository settings to enable deployment:

- **Secrets:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_SERVER_PROJECT_ID`, `VERCEL_CLIENT_PROJECT_ID`
- **Variables:** `VITE_BACKEND_URL`, `API_URL`

### Running the pipeline locally

```bash
# Server: tests, model quality gate, syntax check, boot smoke test
cd server
npm test
node scripts/evaluate-model.js
node --experimental-vm-modules scripts/lint.js
node scripts/smoke.js

# Client: lint and build
cd client
npm run lint
npm run build
```

---

## 🛠️ Tech Stack

### 💻 Frontend
- **Library:** [React.js](https://reactjs.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Routing:** [React Router DOM](https://reactrouter.com/)
- **State Management:** Context API

### 🧠 Backend
- **Runtime Environment:** [Node.js](https://nodejs.org/)
- **Framework:** [Express.js](https://expressjs.com/)
- **Database:** [MongoDB](https://www.mongodb.com/)
- **ODM:** [Mongoose](https://mongoosejs.com/)

### 🤖 AI / ML
- **Approach:** custom TF-IDF vector space model, item-to-item collaborative filtering, damped exponential smoothing
- **Dependencies:** none (pure JavaScript, runs in the API process)
- **Testing:** Node's built-in test runner, plus a metric-threshold quality gate in CI

### ☁️ Utilities & Integrations
- **Media Storage:** [Cloudinary](https://cloudinary.com/)
- **HTTP Client:** [Axios](https://axios-http.com/)
- **Payments:** [Stripe](https://stripe.com/)
- **CI/CD:** [GitHub Actions](https://github.com/features/actions)
- **Deployment:** [Render](https://render.com/) / [Vercel](https://vercel.com/)
  
---

## 🏁 Getting Started 

### 📦 Installation

```bash
git clone https://github.com/your-username/vegedo.git
cd client
npm install
npm start
```

### 📁 Project Structure 
<pre> <code> vegedo/ ├── public/ ├── src/ │ ├── components/ │ ├── pages/ │ ├── context/ │ ├── assets/ │ └── App.jsx ├── server/ │ ├── controllers/ │ ├── models/ │ ├── routes/ │ ├── middleware/ │ ├── config/ │ ├── index.js │ └── package.json # Backend dependencies ├── package.json # Frontend dependencies ├── README.md </code> </pre>

## ✨ Screenshots

### 🏠 Home Page
![Home Page](https://github.com/user-attachments/assets/1e84145a-13d0-4f35-a750-80a82b4289bd)
![Home Page](https://github.com/user-attachments/assets/a65eca51-9bf2-458b-a44c-01c1aa91d25b)
![Home Page](https://github.com/user-attachments/assets/d52337ca-8f35-49a6-97f5-754d84dabb30)
![Home Page](https://github.com/user-attachments/assets/ace940ad-117d-45cf-ad52-39b742092b0c)

### 🧺 All products page
![All Products Page](https://github.com/user-attachments/assets/ad017f26-e2f0-4059-9b98-a6fdb66e6b9d)

### 🧑‍💼 Contact Page
![Contact Page](https://github.com/user-attachments/assets/bdecfac6-a961-4fe5-826f-af0a5c88a466)

### 📖 About Page
![About Page](https://github.com/user-attachments/assets/f3f32558-16bd-4ee4-91b3-0e5f41572f01)

### 🛒 Cart Page
![Cart Page](https://github.com/user-attachments/assets/771a2a4a-0ad5-49f0-8e09-03fb20839ec2)

### 🏢 Add Address Page
![Add Address Page](https://github.com/user-attachments/assets/45f9ea56-9c22-4c57-969e-531f4e4dc310)

### 🔐 User Login Page
![User Login Page](https://github.com/user-attachments/assets/31c25cb1-5a12-44a8-84c3-5ca5bfc1bb6b)

### 📦 My Orders Page
![My Orders Page](https://github.com/user-attachments/assets/18e4e895-3399-49b4-a8b5-3431577a5fe2)

### 🧑‍💼 Seller Login Page
![Seller Login Page](https://github.com/user-attachments/assets/d69036d0-2c87-4679-8c63-5243b491659f)

### 🛒 Add Producct Page
![Add Product Page](https://github.com/user-attachments/assets/0b8b7f7a-6155-4bce-b317-dc90267be944)

### 🧾 Product List Page
![Product List Page](https://github.com/user-attachments/assets/a6efe5f4-fd6a-4da4-93ae-18580596706d)

### 📦 Orders Page
![Orders Page](https://github.com/user-attachments/assets/9163500f-1066-4429-8371-32d67789f215)

## 👨‍💻 Contributors

| Name           | GitHub Username                            | Role                   |
|----------------|---------------------------------------------|------------------------|
| Shiven Garg    | [@shiven-garg](https://github.com/Shiven20) | Frontend & UI/UX Design |
| Ayush Joshi    | [@ayush-joshi](https://github.com/ayushjoshicodes) | Backend |

