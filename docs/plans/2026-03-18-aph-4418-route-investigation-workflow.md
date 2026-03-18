# APH-4418 Route Investigation Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add epic-local instructions that force deep, evidence-driven, one-route-per-child latency investigations for `APH-4418`.

**Architecture:** Keep the durable epic policy in `aph-4418/state.yml`, add a session-facing `aph-4418/AGENTS.md` for route investigations, and point the epic README at those files so future sessions load the workflow before touching route tickets.

**Tech Stack:** Markdown, YAML

---

### Task 1: Add epic-local investigation rules

**Files:**
- Create: `aph-4418/AGENTS.md`

**Step 1: Write the route investigation workflow**

- Define one-route-per-child delivery
- Require multi-trace Sentry analysis
- Require span and code-path inspection
- Require brainstorming before proposing fixes

**Step 2: Save the instruction file**

Expected: `aph-4418/AGENTS.md` exists and is readable in future sessions.

### Task 2: Point the epic to the local workflow

**Files:**
- Modify: `aph-4418/README.md`
- Modify: `aph-4418/state.yml`

**Step 1: Add references to the local instruction file**

- Mention `aph-4418/AGENTS.md` in the README
- Capture the deep-analysis requirement in `state.yml`

**Step 2: Save the policy updates**

Expected: the epic documents both the durable policy and the session instruction source.

### Task 3: Preserve the workflow as a reusable plan

**Files:**
- Create: `docs/plans/2026-03-18-aph-4418-route-investigation-workflow.md`

**Step 1: Write a short plan document**

- Describe the goal, files, and workflow additions

**Step 2: Save the plan**

Expected: a reusable plan exists for future reference.
