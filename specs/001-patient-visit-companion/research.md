# Research: MedAssist — Patient Visit Companion System

**Phase**: 0 | **Branch**: `001-patient-visit-companion` | **Date**: 2026-03-28

All NEEDS CLARIFICATION items from the Technical Context are resolved below.

---

## Decision 1: Hebrew RTL PDF Generation

**Decision**: Puppeteer (`puppeteer-core` + pinned Chromium)

**Rationale**: Puppeteer delegates all text rendering to Chrome's layout engine, which implements the Unicode Bidirectional Algorithm correctly. Forms are authored as HTML templates with `dir="rtl"` and standard CSS; the resulting PDFs faithfully mirror the browser render — including mixed Hebrew/Latin text, correct glyph ordering, and embedded digital signature images.

PDFKit has an unresolved RTL issue (#219, open since 2014) and requires manual font embedding and bidirectional shaping — fragile for mixed-direction forms. jsPDF and pdf-lib have the same gap.

**Alternatives considered**: PDFKit + pdfmake-rtl fork (fragile for mixed RTL/LTR), jsPDF (no native RTL), pdf-lib (layout engine absent).

**Trade-offs**:
- Puppeteer runs a full Chromium process (high resource cost); mitigated by keeping one browser instance alive (browser pool) or using a managed service (Browserless).
- Startup latency 1–3 s cold; acceptable for on-demand export (not on the hot path).
- Template authoring is standard HTML/CSS, familiar to all web developers.

---

## Decision 2: Monorepo Structure

**Decision**: Turborepo + pnpm workspaces

**Rationale**: The project has three JavaScript/TypeScript packages (API, patient PWA, staff back-office) that share types and potentially UI primitives. Turborepo adds content-hash-based build caching on top of pnpm workspaces with minimal configuration (one `turbo.json`). A single `git clone` + `pnpm install` onboards any developer to all three packages.

**Alternatives considered**: npm/yarn workspaces alone (no build caching), Nx (more powerful but heavier configuration, better suited for larger teams), separate repositories (breaks shared-types single source of truth, requires publish-and-bump cycle).

**Package layout**:
```
apps/
  api/              — Node.js + TypeScript REST API
  patient-pwa/      — React + Vite PWA (mobile-first)
  staff-backoffice/ — React + Vite desktop app
packages/
  shared-types/     — DTOs, Zod schemas, shared TypeScript types
```

---

## Decision 3: Touch Digital Signature Capture

**Decision**: `react-signature-canvas` (wraps `signature_pad` by Szimek)

**Rationale**: `react-signature-canvas` is the de-facto standard React wrapper (~540k weekly npm downloads). It exposes `signature_pad`'s pressure-sensitive, Bezier-interpolated stroke rendering as a typed React component. Provides PNG, JPEG, SVG, and raw point data export out of the box.

**Alternatives considered**: Raw `signature_pad` (requires manual React wiring), `react-signature-pad-wrapper` (low adoption, no advantage), custom Canvas implementation (re-implements Bezier interpolation unnecessarily).

**Production note**: Set `touch-action: none` on the canvas element to prevent page scroll from interfering with drawing. Handle canvas resize on orientation change via the `clear()` + re-read pattern.

---

## Decision 4: Service Worker Caching Strategy

**Decision**: `vite-plugin-pwa` with `strategies: "injectManifest"`

**Rationale**: `injectManifest` injects the precache manifest into a developer-authored `sw.ts` file, giving full access to Workbox building blocks (`NetworkFirst`, `CacheFirst`, `BackgroundSyncPlugin`). `generateSW` auto-generates the entire service worker and is zero-config for read-only precaching, but cannot be extended with Background Sync — a required future capability called out in the spec. Choosing `injectManifest` from the start avoids a full rewrite when the offline write-back queue is implemented.

**Caching strategy per data type**:
- App shell + static assets: `precacheAndRoute(self.__WB_MANIFEST)` (auto-injected)
- Navigation steps + checklist data: `NetworkFirst` with named runtime cache, `CacheFirst` fallback, TTL a few hours
- Future write-back queue: `BackgroundSyncPlugin` from `workbox-background-sync` on form `POST`/`PUT` routes

**Alternatives considered**: `generateSW` (cannot add Background Sync without full rewrite), custom Service Worker without plugin (no Vite HMR integration, manual precache manifest).

---

## Decision 5: Testing Stack

**Decision**:
- Backend (`apps/api`): **Vitest** (runs faster than Jest in a monorepo; native TypeScript; compatible with pnpm workspaces) + **Supertest** for HTTP integration tests
- Frontend (both React apps): **Vitest** + **React Testing Library** + **happy-dom** (or jsdom)
- E2E (optional, not MVP blocker): **Playwright**

**Rationale**: Unified test runner across all three packages reduces configuration overhead. Vitest is the natural choice for a Vite-based monorepo. Supertest for API route testing avoids spinning up a real server per test.

---

## Decision 6: Staff Authentication

**Decision**: **JWT (JSON Web Tokens)** stored in `httpOnly` cookies, with server-side session invalidation via a token revocation table (Redis SET with TTL matching the 60-minute session timeout)

**Rationale**: Stateless JWT works well with a REST API serving two separate frontends. `httpOnly` cookies prevent XSS token theft. The revocation table in Redis (the same Redis instance used for BullMQ) handles session invalidation on logout and forced expiry after 60 minutes of inactivity — necessary for the constitution's security requirement. Account lockout state is stored in the `StaffUsers.locked_until` column.

**Alternatives considered**: Express sessions with PostgreSQL store (heavier, requires sticky sessions for horizontal scale), pure stateless JWT without revocation (cannot implement 60-minute inactivity timeout).

---

## Resolved Summary

| Unknown | Resolved Decision |
|---|---|
| Hebrew RTL PDF | Puppeteer (HTML → PDF via Chrome) |
| Monorepo structure | Turborepo + pnpm workspaces |
| Signature capture | react-signature-canvas |
| Service Worker | vite-plugin-pwa injectManifest |
| Testing stack | Vitest + Supertest + React Testing Library |
| Staff auth | JWT in httpOnly cookies + Redis revocation table |
