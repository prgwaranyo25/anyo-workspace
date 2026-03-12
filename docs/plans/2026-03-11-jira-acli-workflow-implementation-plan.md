# Jira ACLI Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make standard Jira work use Atlassian CLI first, with direct REST reserved for uncommon fallback cases.

**Architecture:** Add a workspace-local ACLI skill for common Jira operations and tighten the existing REST skill so it explicitly defers to ACLI for normal ticket operations. Keep the REST skill as a fallback reference for unsupported commands or when ACLI is unavailable.

**Tech Stack:** Markdown, workspace skills, Atlassian CLI docs

---

### Task 1: Add ACLI-first guidance

**Files:**
- Add: `.opencode/skills/jira-acli/SKILL.md`

**Step 1:** Create a concise skill describing when to use ACLI for standard Jira operations.

**Step 2:** Link to Atlassian ACLI install and command reference docs.

**Step 3:** Document the preferred workflow: ACLI first, REST only for unsupported cases.

### Task 2: Narrow the REST fallback skill

**Files:**
- Modify: `/home/pragadeesh/.config/opencode/skills/jira-confluence-rest/SKILL.md`

**Step 1:** Remove embedded token material.

**Step 2:** Update the overview and tooling rules so standard Jira operations defer to ACLI first.

**Step 3:** Keep the REST guidance focused on fallback-only usage.

### Task 3: Verify the new workflow docs

**Files:**
- Verify: `.opencode/skills/jira-acli/SKILL.md`
- Verify: `/home/pragadeesh/.config/opencode/skills/jira-confluence-rest/SKILL.md`

**Step 1:** Re-read both skill files.

**Step 2:** Confirm the preferred order is clear: MCP/integration, then ACLI, then direct REST.

**Step 3:** Confirm no secret values remain in the edited skill text.
