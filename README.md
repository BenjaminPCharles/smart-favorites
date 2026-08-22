# Smart Favorites

Find your bookmarks by meaning, not by exact wording.

Smart Favorites is a browser extension that indexes your bookmarks and makes them
searchable through **semantic search**: describe what you remember, and the extension
finds the page — even when none of the words you typed appear in its title.

The project is a **pnpm + Turborepo** monorepo made of two applications:

| App | Role | Stack |
|---|---|---|
| [apps/back](apps/back/) | HTTP API, authentication, embeddings, vector storage | Fastify 5, PostgreSQL + [pgvector](https://github.com/pgvector/pgvector), Hugging Face Inference, TypeScript |
| [apps/smart-favorite](apps/smart-favorite/) | The extension itself (popup, onboarding, API calls) | [Plasmo](https://docs.plasmo.com/), React 18, TypeScript |

Authentication uses no email, no password and no Google account: the account **is** a
12-word recovery phrase (BIP39), following the crypto wallet model. The private key
never leaves the device and only signatures travel over the wire — the server stores
public keys only. The full model is described in [docs/AUTH.md](docs/AUTH.md), and the
cryptographic building blocks are explained from scratch in
[docs/CRYPTO-101.md](docs/CRYPTO-101.md). The four auth tables — what each one stores,
who writes it, when rows disappear — are documented in
[docs/DATABASE-AUTH.md](docs/DATABASE-AUTH.md).

---

## Prerequisites

- **Node.js** ≥ 22 (developed on 24.x)
- **pnpm** 10.19.0 — `corepack enable && corepack prepare pnpm@10.19.0 --activate`
- **Docker** (for the local PostgreSQL database)
- A **Hugging Face token** ([hf.co/settings/tokens](https://huggingface.co/settings/tokens)),
  used by the embedding service
- A Chromium-based browser (Chrome, Brave, Edge…) to load the extension

## 1. Install

```bash
git clone <repo-url>
cd smart-favorites
pnpm install
```

## 2. Configure

Two environment files to create from their examples:

```bash
cp apps/back/.env.example apps/back/.env
cp apps/smart-favorite/.env.example apps/smart-favorite/.env
```

In [apps/back/.env](apps/back/.env.example), fill in at least:

```dotenv
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx

API_PORT=3000
CORS_ORIGIN=http://localhost:3000

SERVICE_DB_HOST=localhost
SERVICE_DB_PORT=5432
SERVICE_DB_USER=smart_favorites
SERVICE_DB_PASSWORD=change-me
SERVICE_DB_NAME=smart_favorites

# Required by node-pg-migrate (missing from .env.example) — same credentials as above
DATABASE_URL=postgres://smart_favorites:change-me@localhost:5432/smart_favorites
```

These variables also feed the database `docker-compose`: the same `.env` file creates
the user and the database inside the container.

In [apps/smart-favorite/.env](apps/smart-favorite/.env.example),
`PLASMO_PUBLIC_API_BASE` must point at the API (`http://localhost:3000` by default,
keep it in sync with `API_PORT`).

## 3. Database

Start PostgreSQL (the `pgvector` image), then apply the migrations:

```bash
./dev.sh                    # docker compose -f apps/back/docker-compose.db.yml up -d
pnpm --filter back migrate  # runs the node-pg-migrate migrations
```

Data is persisted in the `smart-favorites-db-data` Docker volume.

## 4. Run the project

Everything in parallel, from the repo root:

```bash
pnpm dev
```

Or app by app, in two terminals:

```bash
pnpm dev:back                    # API on http://localhost:3000
pnpm --filter smart-favorite dev # extension watch build
```

> ⚠️ The root `pnpm dev:front` shortcut filters on `--filter=front`, a package name that
> does not exist (the app is called `smart-favorite`), so the command starts nothing.
> Use `pnpm --filter smart-favorite dev` instead.

### Load the extension in the browser

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select `apps/smart-favorite/build/chrome-mv3-dev`.
3. Copy the generated extension ID, add it to `CORS_ORIGIN` in `apps/back/.env`, then
   **restart the API**:

   ```dotenv
   CORS_ORIGIN=http://localhost:3000,chrome-extension://<your-extension-id>
   ```

   Without this step every call from the extension to the API is blocked by CORS — the
   allowlist is strict by design.
4. Open the popup: onboarding (account creation and backup of the 12 words) opens in a
   dedicated tab.

## Useful scripts

From the repo root, `turbo` forwards the command to both apps:

| Command | Effect |
|---|---|
| `pnpm dev` | Runs API + extension in watch mode |
| `pnpm build` | Production build (API + extension bundle) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:ts` | Type checking (`tsc --noEmit`) |
| `pnpm lint` / `pnpm lint:fix` | ESLint |

Backend only:

| Command | Effect |
|---|---|
| `pnpm --filter back migrate:up` / `migrate:down` | Apply / roll back a migration |
| `pnpm --filter back migrate:create <name>` | Create a TypeScript migration file |
| `pnpm --filter back test:watch` | Vitest in watch mode |

Extension only: `pnpm --filter smart-favorite build` produces `build/chrome-mv3-prod`,
and `package` zips it up for the store.

## Structure

```
apps/
  back/
    src/
      container.ts # composition root: wires configs and services together
      config/      # PostgreSQL pools, pgvector config
      database/    # node-pg-migrate migrations
      helpers/     # auth crypto: challenges, signatures, session tokens
      plugins/     # fastify: db, auth, cron purge of expired sessions
      routes/      # /health, /auth/*
      schemas/     # Zod validation
      services/    # embeddings (Hugging Face), HTTP client
  smart-favorite/
    components/    # auth (onboarding, mnemonic, restore), favorites, shared UI
    helpers/       # crypto (BIP39, device keys), self-reauthenticating API client
    tabs/          # full-page onboarding
    popup.tsx      # popup entry point
```