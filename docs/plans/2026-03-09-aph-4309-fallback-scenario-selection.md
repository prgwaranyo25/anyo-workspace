# APH-4309 Fallback Scenario Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the LYFIS compiler prompt so generated scoring engines exclude fallback scenarios whenever any specific scenario matches, while still selecting the maximum lab weight among the remaining candidates.

**Architecture:** The change stays inside `LyfisExcelCompilerAgent` and its compiler instructions. The prompt will teach the LLM to emit fallback-aware scenario metadata in compiled config and to generate runtime selection logic that partitions matched scenarios into specific vs fallback before applying the existing max-`wL` tie-break flow. Existing trace requirements and the no-labs questionnaire-only override remain intact.

**Tech Stack:** TypeScript, LangChain agent prompt generation, LYFIS compiled JavaScript scoring engine

---

### Task 1: Capture the ticket context

**Files:**
- Modify: `aph-4309/state.yml`

**Step 1:** Confirm `aph-4309/state.yml` reflects the approved problem statement and repo scope.

**Step 2:** Keep task `C1` completed and leave backend tasks pending until code changes start.

### Task 2: Update prompt guidance for fallback scenario classification

**Files:**
- Modify: `anyobackendapi/src/core/service/agents/LyfisExcelCompilerAgent.ts`

**Step 1:** Find the compiler system message section that explains scenario interpretation and selection.

**Step 2:** Add explicit guidance that fallback detection must be contextual, not keyword-driven.

**Step 3:** Instruct the compiler to emit scenario metadata such as `isFallback` when a scenario is residual/default in intent or effectively unconstrained compared with specific scenarios.

**Step 4:** Clarify that fallback scenarios stay valid as true fallbacks when no specific scenario matches.

### Task 3: Update the generated scenario-selection template

**Files:**
- Modify: `anyobackendapi/src/core/service/agents/LyfisExcelCompilerAgent.ts`

**Step 1:** Replace the current template text that selects the highest `wL` from all matched scenarios.

**Step 2:** Describe the new runtime algorithm in the prompt:
- evaluate all scenarios
- collect all matched scenarios
- partition them into `specific` and `fallback`
- if any matched specific scenario exists, discard matched fallback scenarios
- choose the highest `wL` from the remaining candidates
- preserve current tie-breaks after candidate filtering

**Step 3:** Keep the special “all labs available” handling only if it still fits the filtered-candidate model; otherwise align it with the same specific-vs-fallback rules.

### Task 4: Preserve trace expectations and no-labs override

**Files:**
- Modify: `anyobackendapi/src/core/service/agents/LyfisExcelCompilerAgent.ts`

**Step 1:** Ensure required `scenarioTrace` fields remain unchanged for sandbox compatibility.

**Step 2:** Optionally add non-breaking guidance for extra trace metadata, such as whether fallback matches were excluded.

**Step 3:** Preserve the existing hard override where `totals.maxLabPoints === 0` forces questionnaire-only weights.

### Task 5: Verify the prompt text is coherent and internally consistent

**Files:**
- Modify: `anyobackendapi/src/core/service/agents/LyfisExcelCompilerAgent.ts`

**Step 1:** Re-read all scenario-related prompt sections to remove contradictions like `first-match-wins` or `max-wL across all matched`.

**Step 2:** Confirm the prompt now consistently describes:
- contextual fallback classification
- candidate filtering before max-`wL` selection
- preserved no-labs override

**Step 3:** Update `aph-4309/state.yml` progress and touched task statuses after the code change is ready.

### Task 6: Manual verification

**Files:**
- Modify: `aph-4309/state.yml`

**Step 1:** Use the existing local compiler workflow to validate a representative scorecard where:
- one specific scenario with lower `wL` matches
- one fallback scenario with higher `wL` also matches

**Step 2:** Confirm the compiled engine logic keeps max-`wL` selection only among non-fallback candidates.

**Step 3:** Confirm fallback still works when no specific scenario matches.

**Step 4:** Record verification notes in `aph-4309/state.yml`.
