#!/bin/bash
set -e

echo "=== FinFlow Setup ==="

command -v docker >/dev/null 2>&1 || { echo "Docker is required."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose V2 is required."; exit 1; }

# Step 1: .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. EDIT IT NOW before continuing:"
  echo "  - POSTGRES_PASSWORD, NEO4J_PASSWORD, SECRET_KEY (openssl rand -hex 32)"
  echo "  - GROQ_API_KEY (get one free at https://console.groq.com)"
  echo "  - ADMIN_INITIAL_PASSWORD"
  read -p "Press Enter once .env is configured..."
fi

# Step 2: TLS cert (RULE 12: HTTPS only, no plain HTTP)
mkdir -p nginx/certs
if [ ! -f nginx/certs/server.crt ]; then
  echo "Generating self-signed TLS certificate..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/certs/server.key -out nginx/certs/server.crt \
    -subj "/C=IN/ST=Karnataka/L=Bengaluru/O=FinFlow/CN=localhost"
fi

# Step 3: Neo4j GDS plugin (RULE 4: volume-mounted, never NEO4J_PLUGINS env var)
mkdir -p plugins
GDS_VERSION="2.6.8"
if [ ! -f "plugins/neo4j-graph-data-science-${GDS_VERSION}.jar" ]; then
  echo "Downloading Neo4j GDS plugin v${GDS_VERSION}..."
  curl -L -o "plugins/neo4j-graph-data-science-${GDS_VERSION}.jar" \
    "https://graphdatascience.ninja/neo4j-graph-data-science-${GDS_VERSION}.jar"
fi

# Step 4: Build
echo "Building Docker images (a few minutes)..."
docker compose build

# Step 5: Infra first
echo "Starting PostgreSQL, Neo4j, Redis..."
docker compose up -d postgres neo4j redis
echo "Waiting for databases to become healthy..."
sleep 30

# Step 6: Migrations
echo "Running database migrations..."
docker compose run --rm backend alembic upgrade head

# Step 7: Everything else
echo "Starting backend, worker, frontend, nginx..."
docker compose up -d

# Step 8: Train ML models
echo "Training Isolation Forest model..."
docker compose exec backend python scripts/train_models.py

# Step 9: Model hashes — ACTION REQUIRED
echo ""
echo "=== ACTION REQUIRED ==="
echo "Paste the following into backend/ml/model_loader.py MODEL_HASHES, then continue:"
docker compose exec backend python scripts/compute_hashes.py
echo ""
read -p "Press Enter once you've pasted the hash and saved the file..."
docker compose restart backend worker
sleep 10

# [O1 FIX] No Ollama model pull step exists here. Groq is cloud-hosted — nothing to pull.

# Step 10: Seed watchlist
echo "Seeding watchlist with default entries..."
docker compose exec backend python scripts/seed_watchlist.py

# Step 11: Admin user
ADMIN_PASS=$(grep ADMIN_INITIAL_PASSWORD .env | cut -d= -f2)
if [ -z "$ADMIN_PASS" ]; then
  echo "ADMIN_INITIAL_PASSWORD not set in .env. Set it and re-run, or create a user manually."
else
  echo "Creating admin user..."
  docker compose exec backend python -c "
import asyncio
from database import AsyncSessionLocal
from security.auth import create_user
async def main():
    async with AsyncSessionLocal() as db:
        await create_user(db, 'admin', '${ADMIN_PASS}', 'Administrator', 'ADMIN-001', 'ADMIN')
async def run_main():
    try:
        await main()
    except Exception as e:
        print('User may already exist:', e)
asyncio.run(run_main())
"
fi

# Step 12: Final health check
echo ""
echo "=== Final Health Check ==="
curl -sk https://localhost:3000/health/full | python3 -m json.tool

echo ""
echo "=== Setup Complete ==="
echo "Access FinFlow at: https://localhost:3000"
echo "(Self-signed cert — your browser will warn once. Click 'Advanced > Proceed'.)"
echo "Login with: admin / <your ADMIN_INITIAL_PASSWORD>"
echo ""
echo "If GROQ is unreachable at the venue: set LLM_PROVIDER=template in .env, then"
echo "  docker compose restart backend worker"
