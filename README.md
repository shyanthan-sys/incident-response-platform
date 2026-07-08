# Incident Response Platform

A monorepo for building an incident response platform that helps teams detect, triage, and resolve production incidents. The stack includes a FastAPI backend, a chaos engineering service for controlled failure injection, a Next.js frontend, and supporting infrastructure (PostgreSQL, Redis) orchestrated via Docker Compose.

## Structure

| Directory        | Description                          |
|------------------|--------------------------------------|
| `backend/`       | Main FastAPI API and business logic    |
| `chaos-service/` | FastAPI service for chaos experiments |
| `frontend/`      | Next.js + TypeScript + Tailwind UI   |

## Getting Started

1. Copy `.env.example` to `.env` and fill in values.
2. Start infrastructure: `docker compose up -d postgres redis`
3. See each service's README for local development instructions.
