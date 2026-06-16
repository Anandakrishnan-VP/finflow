#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -U finflow -q; do
    echo "  postgres not ready, retrying in 3s..."
    sleep 3
done
echo "PostgreSQL ready."

echo "Waiting for Neo4j..."
until (echo > /dev/tcp/neo4j/7687) >/dev/null 2>&1; do
    echo "  Neo4j not ready, retrying in 5s..."
    sleep 5
done
echo "Neo4j ready."

echo "Waiting for Redis..."
until redis-cli -h redis ping > /dev/null 2>&1; do
    echo "  Redis not ready, retrying in 2s..."
    sleep 2
done
echo "Redis ready."

# ClamAV graceful update — fails gracefully in air-gapped mode
echo "Updating ClamAV definitions..."
freshclam --quiet 2>/dev/null \
    && echo "ClamAV definitions updated." \
    || echo "WARNING: ClamAV update failed. Continuing with existing definitions."

echo "All services ready. Starting FinFlow backend."
exec "$@"
