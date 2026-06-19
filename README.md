# FinFlow — Forensic Bank Statement Analysis System
**Karnataka CID Economic Offences Wing (EOW) — Internal Tool**

A full-stack forensic analysis platform for detecting financial crimes (money laundering, structuring, pass-through mule networks) from bank statement CSVs. Powered by a 3-model ML ensemble, graph analytics, LLM second opinions, and an AI chat assistant.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Post-Setup Steps](#post-setup-steps-required-first-time-only)
5. [Uploading & Analysing Cases](#uploading--analysing-cases)
6. [Supported Banks](#supported-banks)
7. [Agent Instructions](#agent-instructions-read-if-you-are-an-ai-agent)
8. [Troubleshooting](#troubleshooting)
9. [Architecture Deep-Dive](#architecture-deep-dive)

---

## Architecture Overview

```
Browser (HTTPS :3000)
      │
   [Nginx]  ← TLS termination, 500MB upload limit, rate limiting
      ├── /api/*      → FastAPI Backend (port 8000)
      ├── /auth/*     → Auth router (rate-limited: 5 req/min)
      ├── /ws/*       → WebSocket (live analysis progress)
      └── /*          → React SPA (Vite)

FastAPI Backend
  ├── PostgreSQL     ← Transactions, verdicts, alerts, cases
  ├── Neo4j          ← Account graph (PageRank, Louvain, taint propagation)
  ├── Redis          ← Celery task broker + result backend
  └── Celery Worker  ← ML pipeline runs here (async, not in FastAPI)

ML Pipeline (per analysis run)
  ├── Isolation Forest  (pre-trained, 300 estimators)
  ├── LightGBM          (pre-trained, 500 estimators)
  ├── Local Outlier Factor (fit per-run, density-based)
  └── Ensemble fusion   (40% IF + 35% LGBM + 25% LOF)
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker Desktop | ≥ 4.x | Must be running |
| Docker Compose | V2 (bundled with Docker Desktop) | Use `docker compose` not `docker-compose` |
| Git | Any | For cloning |
| OpenSSL | Any | For generating TLS cert (Git Bash has it on Windows) |

**No Python, Node, or database installation required** — everything runs in Docker.

---

## Quick Start & One-Command Setup

FinFlow comes with a fully automated setup script that handles TLS certificate generation, Neo4j plugin downloads, database migrations, spaCy model installation, synthetic data generation, ML model training, dynamic hash registration, and admin user creation.

### Option A: Automated Setup (Recommended)

**On Linux/Mac or Git Bash (Windows):**
```bash
./setup.sh
```

**For a completely non-interactive/silent setup (e.g. for CI/CD or AI Agents):**
```bash
NON_INTERACTIVE=true ./setup.sh
```

**On Windows (PowerShell):**
1. Run the setup script to download plugins and generate certs:
   ```powershell
   .\setup.ps1
   ```
2. Start the Docker containers:
   ```powershell
   docker compose up --build -d
   ```
3. Run migrations, train models, seed watchlist, and create admin user:
   ```powershell
   # Wait for databases to start, then run:
   docker compose exec backend alembic upgrade head
   docker compose exec backend python -m spacy download en_core_web_sm
   docker compose exec backend python scripts/generate_training_data.py
   docker compose exec backend python scripts/train_models.py
   docker compose exec backend python scripts/compute_hashes.py
   docker compose exec backend python scripts/seed_watchlist.py
   docker compose exec backend python -c "
   import asyncio
   from database import AsyncSessionLocal
   from security.auth import create_user
   async def main():
       async with AsyncSessionLocal() as db:
           await create_user(db, 'admin', 'admin123', 'Administrator', 'ADMIN-001', 'ADMIN')
   asyncio.run(main())
   "
   docker compose restart backend worker
   ```

### Option B: Manual Setup Step-by-Step

If you prefer to configure every component manually, follow these steps:

1. **Create .env:** Copy `.env.example` to `.env` and set secure passwords and a 64-char `SECRET_KEY`.
2. **Generate TLS Certificates:** Save certificates to `nginx/certs/server.crt` and `nginx/certs/server.key`.
3. **Download Neo4j GDS Plugin:** Download `neo4j-graph-data-science-2.6.8.jar` and place it in the `plugins/` directory.
4. **Launch Containers:** Run `docker compose up --build -d`.
5. **Run Database Migrations:** Run `docker compose exec backend alembic upgrade head`.
6. **Download NLP Model:** Run `docker compose exec backend python -m spacy download en_core_web_sm`.
7. **Generate Training Data & Train ML Models:**
   ```bash
   docker compose exec backend python scripts/generate_training_data.py
   docker compose exec backend python scripts/train_models.py
   docker compose exec backend python scripts/compute_hashes.py
   ```
   *Note: Model hashes are written automatically to `models/hashes.json` inside the mounted volume.*
8. **Seed Watchlist:** Run `docker compose exec backend python scripts/seed_watchlist.py`.
9. **Create Admin User:** Run the custom script to create your administrative account.

### Accessing the Application

1. Open your browser: **https://localhost:3000**
2. Click **Advanced → Proceed to localhost** to bypass the self-signed TLS certificate warning.
3. Login using: Username `admin` and the password defined as `ADMIN_INITIAL_PASSWORD` in `.env` (defaults to `admin123`).

---


## Uploading & Analysing Cases

1. **Create a Case** → Cases → New Case → fill in title, FIR number, etc.
2. **Upload Statements** → Case → Upload tab → drag and drop CSV files
   - Supports multiple files per case (multiple suspects/accounts)
   - Max file size: **500 MB per file**
3. **Run Analysis** → Case → Overview tab → click **Analyze**
   - Watch real-time progress on the progress bar
   - Takes 30 seconds to 5 minutes depending on transaction count
4. **Review Results** in tabs:
   - **Executive Summary** — AI-generated narrative
   - **Verdicts** — Per-account risk scores with ML + LLM reasoning
   - **Graph** — Interactive Cytoscape.js network visualization
   - **Alerts** — Flagged transactions with evidence
   - **Transactions** — Full transaction table with filters
   - **Money Trail** — FIFO-traced fund flows
   - **Entities** — Extracted PANs, UPIs, phone numbers, IFSCs
   - **Hypothesis** — AI-driven hypothesis engine
   - **Ask AI** — Natural language query over case data
   - **Reports** — Generate PDF/Word officer briefs

---

## Supported Banks & Dynamic Generic Parsing

| Bank | Auto-detected | Parsing Method |
|------|--------------|----------------|
| SBI | ✅ Yes | Optimized Specific Parser |
| HDFC | ✅ Yes | Optimized Specific Parser |
| Axis | ✅ Yes | Optimized Specific Parser |
| Kotak | ✅ Yes | Optimized Specific Parser |
| ICICI | ✅ Yes | Dynamic Generic Pipeline |
| PNB | ✅ Yes | Dynamic Generic Pipeline |
| Canara | ✅ Yes | Dynamic Generic Pipeline |
| Union Bank | ✅ Yes | Dynamic Generic Pipeline |
| Yes Bank | ✅ Yes | Dynamic Generic Pipeline |
| **Any Other Bank** | ✅ Yes | Dynamic Generic Pipeline |

### The Dynamic Generic Statement Parser
For non-standard banks or files where specialized parsing fails, the system automatically falls back to our **Layout-Aware Generic Parser**.
1. **Dynamic Schema Inference**: Scans headers for keywords (e.g. date, particulars, debit, balance). If no header is found, it automatically analyzes cells in the first 100 rows to classify column roles (Date, Narration, Debit/Credit, Balance).
2. **Flexible Formats**: Works seamlessly on PDF, Excel (`.xlsx`, `.xls`), CSV, Docx, and images.
3. **Double-Entry Balance Verification**: Uses the running balance difference to correct transaction types (debit vs. credit) in case of ambiguous single-amount columns.

### OCR & Image Upload Fallback
*   **Scanned PDFs**: Automatically falls back to high-resolution Tesseract OCR.
*   **Direct Image Uploads**: Supports uploading `.png`, `.jpg`, `.jpeg`, `.tiff`, `.webp`, `.bmp` files directly.
*   **Layout-Aware Cell Grouping**: Rather than relying on simple line regexes, our OCR engine parses the Tesseract TSV output. It groups words into lines based on vertical overlap and merges adjacent text blocks into cells based on horizontal gaps, successfully reconstructing the tabular structure of the scanned document.

If auto-detection fails, use the **Bank Override** dropdown on upload.

**CSV / File Format Requirements:**
- Headers on row 1 (or detected automatically)
- Columns: Date, Narration/Description, Debit/Credit amounts, Balance
- Date formats: `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD` and other standard variations.

---

## Agent Instructions (Read if you are an AI agent)

> This section is for AI coding assistants helping a developer set up or debug FinFlow.

### Project layout
```
finflow/
├── backend/              # FastAPI app (Python 3.12)
│   ├── alembic/versions/ # DB migrations (001→004, run in order)
│   ├── celery_app.py     # Celery config (eager mode outside Docker)
│   ├── config.py         # Settings via pydantic-settings, reads ../.env
│   ├── database.py       # SQLAlchemy async engine (falls back to config.py)
│   ├── engine/           # Rule engine, FIFO, Benford, CUSUM, risk fusion
│   ├── graph/            # Neo4j populator + algorithms (SQL fallback exists)
│   ├── llm/              # Groq / template LLM clients
│   ├── ml/               # Isolation Forest, LOF, LightGBM ensemble
│   ├── parsers/banks/    # Per-bank CSV parsers
│   ├── routers/          # FastAPI routers (one per feature domain)
│   └── tasks/            # Celery analysis pipeline
├── frontend/src/
│   ├── components/       # React components (GraphView, VerdictsPanel, etc.)
│   └── pages/            # CaseDetailPage, CaseListPage, LoginPage, AdminPage
├── models/               # Trained .joblib files (mounted :ro into Docker)
├── nginx/nginx.conf      # 500MB upload limit, 600s proxy timeout
├── scripts/              # generate_training_data.py, train_models.py, etc.
├── worker/               # Celery worker Dockerfile
└── docker-compose.yml    # All services defined here
```

### Quick Setup for AI Agents (One-Command Setup)

If you are an AI agent tasked with setting up or verifying the repository, run:
```bash
NON_INTERACTIVE=true ./setup.sh
```
This single script will fully automate:
1. Copying `.env.example` to `.env` with safe, templated defaults (and generating a secure `SECRET_KEY`).
2. Creating self-signed TLS certificates in `nginx/certs/` (required for HTTPS reverse proxy).
3. Downloading the Neo4j GDS plugin JAR to the `plugins/` directory.
4. Building and starting all Docker containers.
5. Upgrading the PostgreSQL database schema to the latest Alembic migrations.
6. Installing the required spaCy `en_core_web_sm` English NLP model.
7. Generating synthetic data and training the ML models.
8. Automatically writing the fresh SHA-256 hashes to `models/hashes.json` (no code modification needed).
9. Seeding the watchlist with default values.
10. Creating the default `admin` user with the password from `.env`.
11. Executing a health check against the application gateway.

### Critical architectural facts

1. **Database URL resolution**: `config.py` uses `Path(__file__).parent.parent / ".env"` — resolves the `.env` from the project root regardless of working directory. `database.py` falls back to `config.get_settings().database_url` when the `DATABASE_URL` env var is not set (i.e., running on host outside Docker).

2. **Celery eager mode**: When running outside Docker (`/.dockerenv` absent), `celery_app.py` sets `task_always_eager=True` — tasks run synchronously in the same process. Inside Docker, Redis is used as broker.

3. **Graph SQL fallback**: `backend/graph/algorithms.py` → `get_cytoscape_data()` tries Neo4j first; if unavailable (DNS failure), falls back to SQL. The SQL fallback parses counterparty accounts from narrations using `entity/extractor.py` and determines edge direction from `txn_type` (DR = account→counterparty, CR = counterparty→account).

4. **Counterparty enrichment**: After `enrich_transactions_with_entities()` runs in the analysis pipeline, the enriched `counterparty_account` and `counterparty_name` fields are written back to the `transactions` table via UPDATE so the graph has real edges.

5. **ML model hashes**: `backend/ml/model_loader.py` verifies model file SHA-256 integrity against the `MODEL_HASHES` hardcoded dict OR `/app/models/hashes.json` generated automatically at training time. Training models automatically creates this JSON, bypassing any manual copy-paste requirements.

6. **Migration numbering**: Migrations are 001→004. If adding a new migration, it must be 005. Always use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` for safety.

7. **No cross-case module**: The cross-case entity hit system was intentionally skipped. The syndicate system covers this. Do not add `CrossCasePanel`, `cross_case.py`, or `/cross-case-hits` endpoint.

8. **LLM provider**: `LLM_PROVIDER=template` means no external API calls — responses are template-based. `LLM_PROVIDER=groq` requires `GROQ_API_KEY`.

### Common issues and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `relation "narration_clusters" does not exist` | Migration 004 not run | `docker compose exec backend alembic upgrade head` |
| `relation "hypothesis_nodes" does not exist` | Migration 004 not run | Same as above |
| Graph shows no nodes/edges | Neo4j unavailable AND counterparty_account is NULL | Re-run analysis after migration fix |
| `Model hash mismatch` error | Models retrained but hashes not updated | Run `docker compose exec backend python scripts/compute_hashes.py` to regenerate `hashes.json` |
| Login returns 500 | `DATABASE_URL` empty / DB not ready | Check `docker compose ps` — postgres must be healthy |
| File upload returns 413 | Nginx 500MB limit or backend 500MB limit | Already set to 500MB — ensure nginx is restarted |
| `No module named 'en_core_web_sm'` | spaCy model not downloaded | `docker compose exec backend python -m spacy download en_core_web_sm` |
| Analysis stuck at 0% | Celery worker not running | `docker compose logs worker` — check for errors |
| Analysis fails with `No parsed transactions` | Bank parser didn't detect format | Check `docker compose logs worker` for parser error; try uploading with bank_override query param |

### How the Parsing Pipeline Works (Agent Guide)

1. **Routing**: Files are received by `route_file` in `backend/parsers/router.py`.
2. **Detection**: It extracts the first page's text to detect the bank using keywords. If no bank is detected, it defaults to `"generic"`.
3. **Specific Attempt**: If the bank is one of the implemented banks (`sbi`, `hdfc`, `axis`, `kotak`), it runs the specialized parser. If that fails or yields 0 transactions, it falls back to the generic pipeline.
4. **Generic Pipeline**:
   - **PDF**: Extracts tables via `pdfplumber` / `camelot`. If no tables/rows are found, it automatically triggers Tesseract OCR (`parse_scanned_pdf`).

   - **Excel/CSV/Docx**: Loads cells and runs `parse_generic_table` which maps columns dynamically.
   - **Images**: Runs Tesseract OCR, reconstructs table columns using coordinate-based layout grouping, and runs `parse_generic_table`.
5. **Testing Parsing Manually**:
   ```bash
   docker compose exec backend python -c "
   import asyncio
   from parsers.router import route_file
   async def test():
       txns, meta = await route_file('/path/to/statement.pdf', 'case_id_here', 'stmt_id_here')
       print(f'Parsed {len(txns)} rows. Meta: {meta}')
   asyncio.run(test())
   "
   ```

### How to add a new API endpoint

1. Add route to the appropriate file in `backend/routers/`
2. Register router in `backend/main.py` with `app.include_router()`
3. Frontend calls go to `/api/<path>` (nginx strips `/api/` prefix before forwarding to backend)
4. Backend routes do NOT have `/api` prefix — they are mounted at `/`

### Rebuilding after code changes
```bash
# Rebuild and restart everything
docker compose up --build -d

# Rebuild only changed services (faster)
docker compose up --build -d backend worker

# View logs
docker compose logs -f backend
docker compose logs -f worker
```

---

## Troubleshooting

### Check container status
```bash
docker compose ps
```
All containers should show `running` or `healthy`.

### View logs
```bash
docker compose logs -f           # all services
docker compose logs -f backend   # API server only
docker compose logs -f worker    # ML pipeline only
docker compose logs -f nginx     # proxy (413 errors, etc.)
```

### Full reset (nuclear option)
```bash
docker compose down -v           # stops all + deletes volumes (DELETES ALL DATA)
docker compose up --build -d     # fresh start
# Then re-run all Post-Setup Steps
```

### Restart without losing data
```bash
docker compose restart backend worker
```

### Check if migrations are applied
```bash
docker compose exec backend alembic current
# Should show: 004_phase5_accuracy (head)
```

### Verify ML models are loaded
```bash
docker compose exec backend python -c "
from ml.model_loader import load_isolation_forest, load_lgbm_weak
print('IF:', load_isolation_forest())
print('LGBM:', load_lgbm_weak())
"
```

### Test the API directly
```bash
# Health check
curl -sk https://localhost:3000/api/health

# Login
curl -sk -X POST https://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}'
```

---

## Architecture Deep-Dive

### Analysis Pipeline (what happens when you click "Analyze")

```
1. File integrity check (SHA-256 hash verification)
2. Load transactions from DB
3. Balance validation (detect failed/reversed transactions)
4. Entity enrichment (parse counterparty accounts from narrations)
   └── Writes enriched counterparty_account back to transactions table
5. Watchlist check (flag known bad accounts)
6. Rule engine (structuring, round-trip, velocity spike, etc.)
7. FIFO money trail tracing
8. Graph population → Neo4j (or SQL if Neo4j unavailable)
9. Graph algorithms (PageRank, Louvain community detection)
10. Risk taint propagation (personalized PageRank from watchlist seeds)
11. Benford's Law chi-square test
12. Narration similarity clustering (detect coordinated transactions)
13. CUSUM change-point detection (detect behavioral regime changes)
14. ML ensemble scoring (IF + LOF + LightGBM per transaction)
15. Risk fusion (composite score per account)
16. LLM second opinion (top-risk accounts reviewed by AI)
17. Verdict fusion (algo verdict + LLM verdict → final tier)
18. Save results (verdicts, alerts, money trail, narration clusters)
19. Generate executive summary (LLM narrative)
```

### Fraud Typologies Detected

| Rule | Description |
|------|-------------|
| `STRUCTURING` | Amounts systematically just below ₹5L / ₹10L threshold |
| `RAPID_MOVEMENT` | Credits forwarded within hours |
| `CIRCULAR_FLOW` | Money returns to origin via intermediaries |
| `VELOCITY_SPIKE` | 10x normal transaction frequency in 72h |
| `DORMANT_ACTIVATION` | 8+ months quiet then sudden large transfers |
| `FAN_OUT` | One source → many destinations same day |
| `WATCHLIST_HIT` | Account/entity matches known bad actor list |
| `FAILED_TXN_ABUSE` | Repeated failed transactions (probing behaviour) |
| `ML_ANOMALY_IF` | Isolation Forest scores as outlier |
| `CUSUM_BREAK` | Statistical regime change detected |
| `OFF_HOURS_LARGE` | Large transfers at 2–4 AM |

### Ports (Docker)
| Service | Internal Port | Exposed |
|---------|--------------|---------|
| Nginx | 443, 80 | **3000 (HTTPS)**, 3080 (HTTP→redirect) |
| Backend | 8000 | Not exposed directly |
| Frontend | 3000 | Not exposed directly |
| PostgreSQL | 5432 | Not exposed |
| Neo4j | 7687 (bolt), 7474 (HTTP) | Not exposed |
| Redis | 6379 | Not exposed |

---

*Built for Karnataka CID EOW — Internal use only. Not for public distribution.*
