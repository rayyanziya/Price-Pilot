# PricePilot

PricePilot is an Indonesia resale pricing assistant for smartphones. MVP v1 focuses on a simple local quote flow: submit a smartphone profile, run the deterministic pricing engine, and return a resale price range with confidence and explanations.

## Current MVP Scope

- Frontend smartphone listing form built with Next.js
- Backend quote API built with Node.js, TypeScript, and Express
- Deterministic pricing engine with low, average, high, and recommended prices
- PostgreSQL-backed seed import and normalization flow for the initial smartphone dataset

## Supported Smartphones

The current seeded MVP supports these model and storage cohorts:

- iPhone 11: 128GB, 256GB
- iPhone 12: 128GB
- iPhone 12 Pro Max: 128GB, 512GB
- iPhone 13: 128GB
- iPhone 13 Pro: 128GB
- iPhone 13 Pro Max: 128GB

## Input Behavior

- Model input is case-insensitive and alias-tolerant. For example, `iphone 13`, `iPhone 13`, `Iphone 13`, and `iphone13` are treated as the same model.
- Brand is currently expected as the canonical value `Apple`.

## Local Run

Install dependencies and start the backend:

```bash
npm install
npm run dev
```

Install dependencies and start the frontend:

```bash
npm run frontend:install
npm run frontend:dev
```

The backend listens on port `4000` by default and the frontend runs on port `3000`.

## Upcoming Features

- More phone models and storage variants
- Indonesia-specific feature selection such as iBox vs inter status
- Improved condition and metadata selection, and broader pricing intelligence
