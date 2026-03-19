# APH-4430 Expert Sessions Grid Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce latency for `POST /admin/experts/sessions/grid` without changing the route contract.

**Architecture:** Keep the fix inside the shared session-grid backend flow. Remove full-collection reads, batch repeated enrichment work by unique keys, and avoid generating filter metadata for the expert route when it is not used.

**Tech Stack:** TypeScript, Express, MongoDB native driver, pnpm

---

### Task 1: Add expert-route response options

**Files:**
- Modify: `anyobackendapi/src/core/handlers/therapist-portal-handler.ts`
- Modify: `anyobackendapi/src/core/service/gridService/sesionGridService.ts`

**Steps:**

1. Add a small request option so `processSessionGridRequest` can skip `filterOptions` generation for the expert route.
2. Update `therapistPortalSessionsGridPostHandler` to pass the expert-route option.
3. Keep the admin and app callers on existing behavior by default.

### Task 2: Scope subscription reads to current page data

**Files:**
- Modify: `anyobackendapi/src/core/service/gridService/sesionGridService.ts`

**Steps:**

1. Collect unique `planSubscriptionId` and `packSubscriptionId` values from the current page of session documents.
2. Replace `find({}).toArray()` for plan subscriptions with `_id: { $in: ... }`.
3. Replace `find({}).toArray()` for pack subscriptions with `_id: { $in: ... }`.
4. Preserve current response mapping behavior when a subscription is absent.

### Task 3: Batch partner enrichment for the current page

**Files:**
- Modify: `anyobackendapi/src/core/service/gridService/sesionGridService.ts`

**Steps:**

1. Collect unique `partnerId` values from the users on the current page.
2. Resolve partner details once per unique `partnerId`.
3. Reuse the resolved partner map while building each session response row.

### Task 4: Verify the backend change

**Files:**
- Verify: `anyobackendapi/src/core/handlers/therapist-portal-handler.ts`
- Verify: `anyobackendapi/src/core/service/gridService/sesionGridService.ts`

**Steps:**

1. Run `pnpm lint:check:file src/core/service/gridService/sesionGridService.ts`.
2. Run `pnpm lint:check:file src/core/handlers/therapist-portal-handler.ts` if touched.
3. Run `pnpm exec tsc --noEmit` if the local environment is ready.
4. Capture any limitations if full typecheck cannot run locally.
