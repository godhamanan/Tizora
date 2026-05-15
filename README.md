# Tizora

AI-powered wardrobe app. Scan clothes with your camera, get outfit suggestions for any occasion, and build a digital wardrobe that knows your style.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + PWA |
| Backend | Express + TypeScript + Kysely ORM |
| Database | PostgreSQL 16 |
| AI | Google Gemini 2.5 Flash (vision + text) |
| Storage | Cloudflare R2 (clothing images) |
| Auth | Better Auth (Google OAuth) |
| Async jobs | Trigger.dev v4 (batch scan) |
| Package manager | pnpm (monorepo) |

---

## Project Structure

```
tizora/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── constants/     Gemini prompts + occasion rules
│   │   │   ├── lib/           scanUtils (classify items)
│   │   │   ├── migrations/    DB migrations (run in order)
│   │   │   ├── routes/        Express routes
│   │   │   └── trigger/       Trigger.dev batch scan task
│   │   ├── Dockerfile
│   │   └── trigger.config.ts
│   └── frontend/
│       ├── public/
│       │   └── occasions/     Occasion images (male + female)
│       └── src/
│           ├── api/           API client
│           ├── constants/     Occasions, outfit ordering
│           ├── context/       Auth + Upload state
│           ├── pages/         All app pages
│           └── types/         TypeScript interfaces
├── docker-compose.yml         Local PostgreSQL
├── package.json               Monorepo root
└── pnpm-workspace.yaml
```

---

## Prerequisites

- **Node.js** 20+
- **pnpm** — `npm install -g pnpm`
- **Docker Desktop** — for local Postgres

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/tizora.git
cd tizora
pnpm install
```

### 2. Set up environment variables

```bash
cp apps/backend/.env.example apps/backend/.env
```

Open `apps/backend/.env` and fill in:

```env
# Database (auto-set if using Docker below)
DATABASE_URL=postgresql://dev:dev@localhost:5433/tizora

# Google Gemini — get from console.cloud.google.com
GOOGLE_API_KEY=

# Google OAuth — get from console.cloud.google.com > Credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Better Auth
BETTER_AUTH_SECRET=any-random-32-char-string
BETTER_AUTH_URL=http://localhost:7777

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Cloudflare R2 (optional for local dev — images fall back to base64 if not set)
USE_CLOUD_STORAGE=false
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Trigger.dev (optional for local dev — only needed for batch scan)
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=
```

### 3. Start the database

```bash
pnpm db:up
```

Starts PostgreSQL on `localhost:5433` via Docker.

### 4. Run migrations

```bash
pnpm db:migrate
```

Runs all migrations in order. Safe to run multiple times.

### 5. Start development servers

```bash
pnpm dev
```

This starts both frontend and backend concurrently:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:7777 |

### 6. (Optional) Start Trigger.dev for batch scan

In a separate terminal:

```bash
cd apps/backend
pnpm trigger:dev
```

Required only if testing batch photo upload. Single scan works without it.

---

## Useful Commands

```bash
# Install all dependencies
pnpm install

# Start everything
pnpm dev

# Start database only
pnpm db:up

# Stop database
pnpm db:down

# Run all migrations
pnpm db:migrate

# Build frontend
pnpm --filter frontend build

# Build backend
pnpm --filter backend build

# Deploy Trigger.dev tasks
cd apps/backend && pnpm trigger:deploy
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/scan` | Scan single image → classify clothing |
| POST | `/scan/batch` | Start batch scan job (async via Trigger.dev) |
| GET | `/scan/batch/:jobId` | Poll batch job results |
| GET | `/clothes` | List wardrobe items |
| POST | `/clothes` | Save item (uploads image to R2) |
| PATCH | `/clothes/:id` | Edit item |
| DELETE | `/clothes/:id` | Delete item |
| DELETE | `/clothes` | Clear entire wardrobe |
| POST | `/suggest` | AI outfit suggestions for an occasion |
| GET | `/catalog` | Browse pre-loaded catalog items |
| GET | `/profile` | Get user profile |
| PATCH | `/profile` | Update profile (gender, onboarding) |
| GET | `/health` | Health check |

---

## Database Migrations

Migrations live in `apps/backend/src/migrations/`. Each file is idempotent — safe to re-run.

To add a new migration:
1. Create `apps/backend/src/migrations/0XX_description.ts`
2. Add it to the `migrate` script in `apps/backend/package.json`
3. Run `pnpm db:migrate`

---

## Deployment

| Service | Platform |
|---|---|
| Frontend | Vercel (root dir: `apps/frontend`) |
| Backend | Railway (uses `apps/backend/Dockerfile`) |
| Database | Railway PostgreSQL |
| Images | Cloudflare R2 |
| Async jobs | Trigger.dev Cloud |

See the deployment guide for step-by-step instructions.

**After deploying backend**, run migrations via Railway Shell:
```bash
pnpm --filter backend migrate
```

**After any code change**, push to GitHub — Vercel and Railway auto-deploy.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `GOOGLE_API_KEY` | ✅ | Gemini API key |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `BETTER_AUTH_SECRET` | ✅ | Random secret for session signing |
| `BETTER_AUTH_URL` | ✅ | Backend public URL |
| `FRONTEND_URL` | ✅ | Frontend public URL (for CORS) |
| `USE_CLOUD_STORAGE` | ⚡ | Set `true` to enable R2 uploads |
| `R2_ACCOUNT_ID` | ⚡ | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | ⚡ | R2 access key |
| `R2_SECRET_ACCESS_KEY` | ⚡ | R2 secret key |
| `R2_BUCKET_NAME` | ⚡ | R2 bucket name |
| `R2_PUBLIC_URL` | ⚡ | R2 public URL for serving images |
| `TRIGGER_SECRET_KEY` | ⚡ | Trigger.dev secret key |
| `TRIGGER_PROJECT_REF` | ⚡ | Trigger.dev project ref |
| `PORT` | — | Backend port (default: 7777) |

✅ = Always required · ⚡ = Required for that feature
