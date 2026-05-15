# Tizora — AI Wardrobe Assistant

A premium mobile-first wardrobe management app. Upload photos of clothes, let AI organise your closet, get intelligent outfit suggestions, and track what needs washing.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Express + TypeScript + Kysely |
| Database | PostgreSQL 16 (Docker) |
| AI | Claude API (Vision + Text) |
| Styling | Plain CSS + CSS variables |
| Package manager | pnpm (monorepo) |

## Project Structure

```
tizora/
├── apps/
│   ├── backend/        Express API
│   └── frontend/       React PWA
├── docker-compose.yml  PostgreSQL
└── package.json        Root monorepo
```

## Getting Started

### 1. Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop

### 2. Clone and install
```bash
git clone <repo>
cd tizora
pnpm install
```

### 3. Environment
```bash
cp apps/backend/.env.example apps/backend/.env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 4. Start database
```bash
pnpm db:up
```

### 5. Run migrations
```bash
pnpm db:migrate
```

### 6. Start development servers
```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:7777

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | /scan | Upload image → detect clothing items |
| GET | /clothes | List all clothes |
| POST | /clothes | Save a single item |
| PATCH | /clothes/:id | Edit item |
| DELETE | /clothes/:id | Remove item |
| POST | /wear/:id/wear | Mark as worn today |
| POST | /wear/:id/wash | Mark as washed |
| GET | /wear/laundry | Items needing wash |
| POST | /suggest | AI outfit suggestions |
| GET | /health | Health check |

## Deployment

- **Frontend**: Vercel (connect GitHub, auto-deploy)
- **Backend**: Railway (Dockerfile or nixpacks)
- **Database**: Railway Postgres or Supabase
