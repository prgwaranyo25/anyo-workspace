# anyobackendapi API Latency Diagnosis Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a repo-specific skill that standardizes deep diagnosis of slow `anyobackendapi` HTTP routes and stops at ranked hypotheses.

**Architecture:** First capture baseline failure modes with pressure scenarios so the skill solves real shallow-investigation behavior. Then author a minimal skill under `.opencode/skills/`, verify it against the same scenarios, and finally wire `APH-4418` to reference the new skill as the preferred route-diagnosis workflow.

**Tech Stack:** Markdown, YAML, OpenCode skills, Sentry investigation workflow

---

### Task 1: Capture failing baseline scenarios

**Files:**
- Create: `docs/plans/2026-03-18-anyobackendapi-api-latency-diagnosis-skill-baseline.md`

**Step 1: Write three pressure scenarios**

- Scenario 1: route has bad p95 and one obvious slow trace, tempting shallow conclusions
- Scenario 2: traces are thin and instrumentation is incomplete
- Scenario 3: route has both DB and `http.client` spans, making premature fix ideas tempting

**Step 2: Run baseline investigations without the new skill**

Use fresh subagents and record:

- where the investigation stops too early
- where it over-relies on one trace
- where it jumps into fixes instead of hypotheses

**Step 3: Save exact failure patterns**

Expected: a baseline file exists with concrete shallow-behavior examples the skill must prevent.

### Task 2: Write the minimal skill

**Files:**
- Create: `.opencode/skills/anyobackendapi-api-latency-diagnosis/SKILL.md`

**Step 1: Add frontmatter and trigger description**

Use a name and description that make the skill discoverable for route latency analysis in `anyobackendapi`.

**Step 2: Write the minimum workflow that fixes baseline failures**

Cover:

- route scope confirmation
- `24h` and `7d` metrics
- multi-trace inspection
- span pattern review
- code-path inspection
- ranked hypotheses only
- explicit prohibition on fix planning inside the skill

**Step 3: Add a standardized output template**

The output should stop at:

- route and scope
- metrics
- trace observations
- span patterns
- code-path findings
- instrumentation gaps
- ranked hypotheses
- open questions / confidence

Expected: the skill exists and is intentionally narrower than fix-planning workflows.

### Task 3: Verify and harden the skill

**Files:**
- Modify: `.opencode/skills/anyobackendapi-api-latency-diagnosis/SKILL.md`
- Modify: `docs/plans/2026-03-18-anyobackendapi-api-latency-diagnosis-skill-baseline.md`

**Step 1: Re-run the same pressure scenarios with the skill present**

Check whether the investigation now:

- inspects more than one trace
- records metrics consistently
- distinguishes evidence from guesses
- stops at hypotheses instead of proposing fixes

**Step 2: Patch loopholes**

If the subagent still skips depth, add explicit counters to the skill.

**Step 3: Repeat until behavior is consistent**

Expected: the skill produces a repeatable diagnostic shape across all scenarios.

### Task 4: Wire the skill into APH-4418

**Files:**
- Modify: `aph-4418/AGENTS.md`
- Modify: `aph-4418/state.yml`

**Step 1: Reference the new skill as the preferred route-diagnosis workflow**

Keep the epic notes, but point route investigations to the new skill.

**Step 2: Preserve epic-specific rules that stay outside the skill**

Retain:

- app-first scope
- one-route-per-child delivery
- production-safety notes

Expected: `APH-4418` uses the skill without losing epic-local constraints.
