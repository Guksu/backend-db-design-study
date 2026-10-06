# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Owner (primary author)**: a frontend developer learning backend and database design. Designs every decision through one-question-at-a-time Q&A with Claude, then verifies it with experiments in the lab.
- **Interviewers and recruiters**: open a deployed live demo link to judge the owner's backend and DB design ability. They arrive cold, often for a few minutes, and must understand what each screen proves without the owner present.
- **Fellow developers studying the same topics**: open the live demo or clone the repo to learn from the cases. They want the reasoning and the evidence, not just the final schema.

## Product Purpose

A DB/backend design lab. Each practical case (Case 01: concert ticket booking) is designed one decision at a time, every decision is recorded with its reasoning (`cases/NN/stepNN-*.md`), and every core claim is verified by an experiment that runs against a real PostgreSQL and is shown visually. Success: a first-time visitor can tell what was decided, why, and what evidence proves it.

## Positioning

The evidence is live, not illustrative. The ERD is read from the running database catalog, constraint checks send real bad INSERTs and show the real SQLSTATE codes, the race simulator records real per-request traces, and the index experiment shows real EXPLAIN ANALYZE plans. Every decision links to the Q&A where it was made.

## Operating Context

- Lab UI: React + Vite (`web/`, per-case screens in `cases/NN/ui/`), experiment API: Hono (`server/`), PostgreSQL 17 + Redis 7 via docker compose.
- Experiments are also automated tests (`cases/NN/experiments/*.test.ts`).
- Will be deployed as a live demo on a free-tier server; simulations must stay bounded (capped virtual users, capped data sizes, one simulation at a time).

## Capabilities and Constraints

- Case 01 Step 1 (ERD) currently has: `venues`, `seats`, `concerts` tables; constraint verification; concurrent INSERT race simulator (trace waterfall playback, sensitivity sweep); `concerts.venue_id` index experiment (Q16).
- Steps 2–8 (점유와 만료, 동시성, 락 전략, Redis, 대기열, 결제 정합성, 다중 서버) are planned and unbuilt.
- DB design decisions are made only through Q&A with the owner; the UI must never present an undecided design as decided.
- Zero cost: no paid services.

## Brand Commitments

- UI language: Korean.
- Reference craft level: Datadog and the AWS console (pinned by the owner on 2026-10-06). Operational, console-grade, information-dense, trustworthy; not a marketing page.

## Evidence on Hand

- Study logs: `cases/01-ticket-booking/step01-erd.md` (Q1–Q16).
- Real measured results produced by the lab itself (race sweep, index experiment). No testimonials, users, or benchmarks beyond what the lab measures; never fabricate.

## Product Principles

1. Every screen answers three questions for a cold visitor: what is being tested, how to read it, and what the result means.
2. Evidence over claims: show the DB doing the thing, with real numbers and plans.
3. Decisions are traceable: every decision links back to its Q&A number.
4. Undecided means undrawn: planned tables and steps are clearly marked as planned.

## Accessibility & Inclusion

Status and results never rely on color alone (icon + label). Keyboard reachable controls, visible focus, reduced-motion respected for playback.
