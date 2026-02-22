# Nexteneo Chatbot

A RAG (Retrieval-Augmented Generation) chatbot for the EV charging ecosystem. Ingests domain data from an external database and business rules from JSON, indexes them as vector embeddings, and answers user queries via semantic search + OpenAI.

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Tech Stack

- **Backend**: Fastify, TypeScript, PostgreSQL, ChromaDB, OpenAI, HuggingFace
- **Frontend**: Nuxt 4, Vue 3, Tailwind CSS
- **Monorepo**: pnpm workspaces

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10.19
- [Docker](https://www.docker.com/) & Docker Compose

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Create a `.env` file in `apps/back/`:

```env
# Backend server
API_PORT=3001
CORS_ORIGIN=http://localhost:3000

# Service database (chat messages)
SERVICE_DB_HOST=localhost
SERVICE_DB_PORT=5432
SERVICE_DB_USER=postgres
SERVICE_DB_PASSWORD=postgres
SERVICE_DB_NAME=chatbot

# External database (customers, stations, tariffs - read-only)
SCRAPE_DB_HOST=<your-host>
SCRAPE_DB_PORT=5432
SCRAPE_DB_USER=<your-user>
SCRAPE_DB_PASSWORD=<your-password>
SCRAPE_DB_NAME=<your-db-name>

# OpenAI
OPEN_AI_API_KEY=<your-openai-api-key>
```

### 3. Start databases

```bash
docker compose -f apps/back/docker-compose.db.yml up -d
```

This starts:
- **PostgreSQL** (SERVICE_DB) on port 5432
- **ChromaDB** on port 8000

### 4. Run migrations

```bash
pnpm --filter back migrate
```

This creates the `messages` table in SERVICE_DB.

### 5. Start the application

```bash
# Start backend (http://localhost:3001)
pnpm --filter back dev

# Start frontend (http://localhost:3000)
pnpm --filter front dev
```

### 6. Trigger data ingestion

Once the backend is running, populate ChromaDB with embeddings from the external database and business rules:

```bash
curl -X POST http://localhost:3000/embed \
  -H "Content-Type: application/json" \
  -d '{"options": "customers"}'
```

This reads customers, stations, tariffs from SCRAPE_DB and business rules from JSON, transforms them into text chunks, generates embeddings, and stores them in ChromaDB.

### 7. Start chatting

Open http://localhost:3000 and ask questions about customers, stations, tariffs, or business rules.

## Available Scripts

### Backend (`apps/back`)

| Command | Description |
|---------|-------------|
| `pnpm --filter back dev` | Start dev server with hot reload |
| `pnpm --filter back migrate` | Run database migrations (up) |
| `pnpm --filter back migrate:down` | Rollback last migration |
| `pnpm --filter back migrate:create` | Create a new migration file |
| `pnpm --filter back type-check` | Run TypeScript type checking |
| `pnpm --filter back lint` | Run ESLint |
| `pnpm --filter back lint:fix` | Run ESLint with auto-fix |

### Frontend (`apps/front`)

| Command | Description |
|---------|-------------|
| `pnpm --filter front dev` | Start Nuxt dev server |
| `pnpm --filter front build` | Build for production |
| `pnpm --filter front preview` | Preview production build |
| `pnpm --filter front type-check` | Run TypeScript type checking |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | Health check |
| `GET`  | `/api/messages` | Get all chat messages |
| `POST` | `/api/messages` | Send a message (triggers RAG pipeline) |
| `DELETE` | `/api/messages` | Delete all messages |
| `GET`  | `/api/messages/stream` | SSE stream for real-time updates |
| `POST` | `/api/embed` | Trigger data ingestion into ChromaDB |

## Project Structure

```
chatbot-monorepo/
├── apps/
│   ├── back/              # Fastify backend
│   │   ├── src/
│   │   │   ├── config/    # DB, ChromaDB, DI container
│   │   │   ├── database/  # Migrations
│   │   │   ├── modules/   # Business logic (customers, stations, tariffs, rules, messages)
│   │   │   ├── routes/    # API route definitions
│   │   │   ├── services/  # Chat, ingestion, embedding, OpenAI
│   │   │   └── types/     # Shared types
│   │   ├── docker-compose.db.yml
│   │   └── package.json
│   └── front/             # Nuxt 4 frontend
│       ├── app/
│       │   ├── app.vue
│       │   └── components/
│       └── package.json
├── pnpm-workspace.yaml
└── package.json
```
