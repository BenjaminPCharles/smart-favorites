# Architecture

## Overview

A **RAG (Retrieval-Augmented Generation) chatbot** for the EV charging / Nexteneo ecosystem. The system ingests domain data (customers, stations, tariffs) from an external database and business rules from a JSON file, indexes them as vector embeddings in ChromaDB, and answers user queries via semantic search + OpenAI LLM generation.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Nuxt 4)                                │
│                         http://localhost:3000                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP / SSE
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FASTIFY SERVER                                    │
│                                                                             │
│  Routes:                                                                    │
│  ┌──────────────────────┬───────────────────────────────────────────────┐   │
│  │ GET  /               │ Health check                                  │   │
│  │ GET  /api/messages   │ Fetch all messages                            │   │
│  │ POST /api/messages   │ Send message → semantic search → LLM answer   │   │
│  │ DELETE /api/messages │ Clear all messages                            │   │
│  │ GET  /api/messages/stream │ SSE connection for real-time updates     │   │
│  │ POST /api/embed      │ Trigger data ingestion into ChromaDB          │   │
│  └──────────────────────┴───────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICES CONTAINER                                  │
│                    (Dependency Injection Hub)                               │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ DatabaseConfig   │  │ ScrapeDatabaseCfg│  │ ChromaConfig             │   │
│  │ (SERVICE_DB)     │  │ (SCRAPE_DB)      │  │ (Vector DB)              │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ EmbeddingService │  │ OpenAIService    │  │ ChatService              │   │
│  │ (HuggingFace)    │  │ (gpt-5-nano)     │  │ (RAG pipeline)           │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ IngestionService │  │ CustomerRepo     │  │ MessagesRepository       │   │
│  │ (data pipeline)  │  │ StationRepo      │  │ (CRUD messages)          │   │
│  │                  │  │ TariffRepo       │  │                          │   │
│  │                  │  │ BusinessRuleRepo │  │                          │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌──────────────────────────────────────┐
│     User  "What are the tariffs      │
│        for client X?"                │
└──────┬───────────────────────────────┘
       │ POST /api/messages
       ▼
┌──────────────────────────────────────┐
│  Save user message to SERVICE_DB     │
│  Broadcast via SSE (type: 'message') │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│         EmbeddingService             │
│   text → vector[384]                 │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│           ChromaDB                   │
│   collection.query({                 │
│     queryEmbeddings: [vector],       │
│     nResults: 5                      │
│   })                                 │
│   → top 5 matching document chunks   │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│         OpenAI (gpt-5-nano)          │
│                                      │
│  System: "Answer using ONLY the      │
│  provided context. If no info,       │
│  say so."                            │
│                                      │
│  Context: [5 retrieved chunks]       │
│  User: original question             │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│  Save LLM answer to SERVICE_DB       │
│  Broadcast via SSE (type: 'answer')  │
└──────────────────────────────────────┘
```

---

## Key Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Fastify** | HTTP server + API routes | `fastify`, `@fastify/cors` |
| **SERVICE_DB** | Chat message storage | PostgreSQL (`pg`) |
| **SCRAPE_DB** | External domain data (read-only) | PostgreSQL (`pg`) |
| **ChromaDB** | Vector database for semantic search | `chromadb` |
| **EmbeddingService** | Text to 384-dim vector | `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2) |
| **OpenAIService** | LLM response generation | `openai` (gpt-5-nano) |
| **IngestionService** | Data pipeline: DB + JSON → chunks → embeddings | Custom |
| **ChatService** | RAG pipeline: query → search → LLM | Custom |
| **SSE** | Real-time message streaming to frontend | Native Fastify |

---

## Database Schemas

### SERVICE_DB - `messages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `uuid` | UUID | Unique identifier |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Update timestamp |
| `content` | JSONB | `{ message, source?, title?, url?, description? }` |
| `type` | ENUM | `message` (user) / `answer` (LLM) |

### SCRAPE_DB (external, read-only)

| Table | Key Columns |
|-------|-------------|
| `Customer` | uuid, clientNumber, name, type, chorusEnabled, fees |
| `Location` | id, customerId, name, city, country |
| `ChargingStation` | id, locationId, ocppId, vendor, model, isDeployed, firmwareVersion |
| `Tariff` | id, customerId, uuid, name, target |
| `BillingPolicy` | id, name, affiliatedSitePaymentWay, onSitePaymentWay, offSitePaymentWay, homeChargingPaymentWay |

### ChromaDB - `chatbot-collection`

| Field | Description |
|-------|-------------|
| `id` | Unique chunk identifier |
| `embedding` | 384-dimensional vector |
| `metadata` | type, domain, source, title |
| `document` | Natural language text chunk |

---

## Business Rules

The system includes **575 business rules** loaded from a JSON file, covering:

| Domain | Count | Examples |
|--------|-------|---------|
| Authorization | 58 | Badge validation, roaming, offline mode |
| Payment | 21 | Invoice generation, SEPA, billing mandates |
| Email notifications | 20+ | Password reset, session confirmation, invoices |
| Tariffs | 11 | Pricing rules, billing policy validation |
| Smart charging | 4 | Zero-amp orders, current thresholds |
| CSMS | 4 | Configuration sync, session zombie detection |
| Charging sessions | 3 | Billing periods, energy conversions |
| Alerts | 3 | Amount alerts, connectivity monitoring |
| OCPI | 2 | Operator registration, session refusals |
| Legal/compliance | 2 | Late payment penalties, billing mandate law |
| External integration | 3 | IRVE publication, naming conventions |

Each rule is validated with a Zod schema (`type`, `domain`, `source`, `title`, `content`) and transformed into a text chunk for embedding.

---
