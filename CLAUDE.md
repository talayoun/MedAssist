# MedAssist Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-28

## Active Technologies

- TypeScript 5.x (all packages) | Node.js 20 LTS (API) (001-patient-visit-companion)

## Project Structure

```text
apps/
├── api/               — Node.js + TypeScript REST API (Express)
├── patient-pwa/       — React + Vite PWA (mobile-first, Hebrew RTL)
└── staff-backoffice/  — React + Vite desktop app
packages/
└── shared-types/      — Zod schemas + TypeScript DTOs
```

## Commands

```bash
pnpm install           # install all workspace dependencies
pnpm dev               # run all apps in parallel (Turborepo)
pnpm test              # run all tests
pnpm build             # production build

pnpm --filter api db:migrate   # run DB migrations
pnpm --filter api db:seed      # seed dev data
pnpm --filter api worker       # run BullMQ notification worker (separate process in prod)
```

## Code Style

- TypeScript strict mode across all packages
- Zod for runtime validation and shared DTO types (defined in `packages/shared-types`)
- Feature-module organization in API (`src/modules/<feature>/`)
- Hebrew RTL in patient PWA: `dir="rtl"` at `<html>`, min 16pt font, min 44×44px tap targets
- No medical data in Magic Link URLs — token only

## Recent Changes

- 001-patient-visit-companion: Added TypeScript 5.x (all packages) | Node.js 20 LTS (API)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
