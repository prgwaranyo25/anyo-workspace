# Epic-Aware Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update workspace documentation and skills so ticket folders can be either standalone or nested under an optional epic parent folder.

**Architecture:** Keep the existing ticket template for standalone tickets and epic child tickets, and add a separate epic template for epic-level state. Update discovery skills to scan both root ticket folders and nested epic child folders while preserving the current workflow for tickets with no epic.

**Tech Stack:** Markdown, YAML, workspace skill docs

---

### Task 1: Document the new folder model

**Files:**
- Modify: `AGENT.MD`
- Modify: `CLAUDE.md`

**Step 1:** Describe both supported layouts: standalone ticket and epic with child tickets.

**Step 2:** Add concrete folder examples showing one `state.yml` per work item.

**Step 3:** Update the startup rules so session orientation and ticket creation account for optional epic membership.

### Task 2: Separate epic scaffolding from ticket scaffolding

**Files:**
- Modify: `_template/README.md`
- Add: `_epic_template/README.md`
- Add: `_epic_template/state.yml`

**Step 1:** Clarify that `_template/` is for a ticket folder, whether standalone or nested under an epic.

**Step 2:** Add an epic template with epic-level metadata, child ticket tracking, and progress fields.

### Task 3: Update session discovery behavior

**Files:**
- Modify: `.opencode/skills/session-start/SKILL.md`

**Step 1:** Update the skill description to mention standalone tickets, epic folders, and nested child tickets.

**Step 2:** Rewrite the scan flow so it can list standalone tickets and epics with child tickets in a hierarchical view.

**Step 3:** Specify that loading a child ticket should also include a brief parent epic summary.

### Task 4: Update ticket creation guidance

**Files:**
- Modify: `.opencode/skills/new-ticket/SKILL.md`

**Step 1:** Add a decision point for standalone versus epic-child ticket creation.

**Step 2:** Document how to scaffold a new epic parent when needed and how to place a child ticket inside it.

**Step 3:** Make the final report include both the Jira key and the created folder path.

### Task 5: Verify the edited docs

**Files:**
- Verify: `AGENT.MD`
- Verify: `CLAUDE.md`
- Verify: `.opencode/skills/session-start/SKILL.md`
- Verify: `.opencode/skills/new-ticket/SKILL.md`
- Verify: `_template/README.md`
- Verify: `_epic_template/state.yml`

**Step 1:** Re-read the edited files for consistency.

**Step 2:** Confirm the examples agree on the folder layout and `state.yml` ownership.

**Step 3:** Summarize the resulting workflow and any follow-up migration work for existing folders.
