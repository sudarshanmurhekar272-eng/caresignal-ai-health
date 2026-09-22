# CareSignal

CareSignal is a full-stack educational prototype for **Primary Disease Prediction using Machine Learning**. It lets an authenticated user record symptoms, receive a transparent preliminary pattern result, review safe general guidance, save prediction history, update a profile, and ask an in-app health assistant questions.

> **Medical safety:** This application is informational and educational only. It is not a diagnosis, does not replace professional medical advice, and does not prescribe medicines or dosages. Emergency warnings are shown before a prediction is returned.

## What is implemented

- Responsive healthcare + AI frontend
- Registration and login with secure Node `scrypt` password hashing
- Bearer-token sessions held server-side
- Protected profile, prediction, and history API routes
- Symptom search and multi-select UI
- Emergency symptom guardrails
- Transparent prediction service in `ml/predict.js`
- Prediction history with deletion
- Floating chatbot backed by `POST /api/chat`
- JSON persistence for local prototype use
- Basic per-IP rate limiting and input validation
- No confidence score is shown because this version does not use a validated probabilistic model

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm start
```

Open http://localhost:3000.

For development with automatic server restarts:

```bash
npm run dev
```

The app stores prototype data in `data/store.json`. That file is ignored by Git after the initial empty seed, so do not use this storage design for real health data.

## API

| Method | Route | Auth |
| --- | --- | --- |
| GET | `/api/health` | No |
| GET | `/api/symptoms` | No |
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| POST | `/api/auth/logout` | Token |
| POST | `/api/auth/forgot-password` | No |
| GET | `/api/user/profile` | Token |
| PUT | `/api/user/profile` | Token |
| POST | `/api/predict` | Token |
| GET | `/api/predictions` | Token |
| GET | `/api/predictions/:id` | Token |
| DELETE | `/api/predictions/:id` | Token |
| POST | `/api/chat` | No |

## Prediction service

The current service is an explicitly labeled heuristic fallback. It is not trained or clinically validated. Before production use:

1. Add a documented, consented dataset.
2. Create a reproducible preprocessing and training pipeline.
3. Compare models with held-out validation data.
4. Calibrate any probability output and report actual metrics.
5. Perform clinical, privacy, security, and regulatory review.

No model score is returned by the current API because fabricating confidence would be unsafe.

## Security and privacy limitations

This is a local prototype, not a production medical system. Before deployment, replace JSON storage with a protected database, use a durable session store, configure HTTPS and secure cookies, add CSRF protection, add stronger audit logging and abuse controls, encrypt sensitive data at rest, define retention/deletion policies, and complete an appropriate security and privacy review.

Never commit `.env`, passwords, API keys, session secrets, or real patient information.