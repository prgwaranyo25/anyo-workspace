# anyobackendapi API Latency Diagnosis Skill Baseline

Date: 2026-03-18

## Goal

Capture how a skill-less route latency investigation tends to fail under pressure so the new `anyobackendapi` diagnosis skill can close real loopholes instead of hypothetical ones.

## Baseline Method

- Used `APH-4418` and `APH-4419` route-investigation context only as reference.
- Did not create or use the new skill.
- Used the three scenarios as explicit baseline probes for likely skill-less investigation behavior; because no dedicated subagent runner was available in this session, the notes below combine direct observations from the existing route-investigation context with simulated pressure-case behavior.
- Recorded where the baseline investigation stopped early, over-weighted one trace, or jumped from evidence straight to fixes.

## Scenario 1 - Bad p95 plus one obvious slow trace

### Pressure setup

- Route shows clearly bad `p95` / `p99` in a stable window.
- One slow trace contains an obvious dominant span, so it looks like the route is already explained.
- The investigator is under pressure to produce a quick answer.

### Baseline failure pattern from the probe

- The investigation anchors on the route-level `p95` and the single worst trace almost immediately.
- The dominant span in that trace gets treated as the root cause instead of one sample.
- The pass does not insist on comparing multiple slow traces to see whether the same pattern repeats.
- Code-path inspection either does not happen or stops at the first matching dependency.
- The write-up starts drifting toward solution language like "optimize this query" or "cache this downstream call" before hypotheses are ranked.

### Failure shape captured for the baseline

- Stops too early: once one slow span explains one ugly trace, the baseline pass treats diagnosis as done.
- Over-relies on one trace: it uses the most dramatic trace as if it were representative of the route tail.
- Jumps into fixes: it recommends a likely optimization before checking whether the latency is broad or outlier-driven.

## Scenario 2 - Thin traces and incomplete instrumentation

### Pressure setup

- Route metrics are bad enough to demand explanation.
- Available traces are thin, with missing internal spans and incomplete downstream detail.
- The investigator still needs to produce a confident-sounding answer.

### Baseline failure pattern from the probe

- The investigation falls back to top-level metrics and whatever thin trace metadata exists.
- Missing spans are treated as an inconvenience instead of a hard limit on confidence.
- The baseline pass speculates about app logic, middleware, or DB work without proving which layer is slow.
- Because the traces are weak, the investigation often skips deeper code-path review and fills the gap with plausible guesses.
- The output mixes evidence and inference, then moves toward fix ideas such as "add indexes," "parallelize work," or "instrument the route and optimize later."

### Failure shape captured for the baseline

- Stops too early: it accepts incomplete observability as good enough to name a likely culprit.
- Over-relies on one trace: even a thin trace becomes the main story because there is little else to point at.
- Jumps into fixes: it proposes remediation while the actual problem is still "instrumentation gap plus low confidence."

## Scenario 3 - Both `db` and `http.client` spans are present

### Pressure setup

- Route has poor tail latency.
- Traces include both `db` and `http.client` spans, each large enough to tempt a quick diagnosis.
- The investigator is tempted to choose one dominant theme and move on.

### Baseline failure pattern from the probe

- The investigation looks at one or two traces and chooses whichever span category appears most emotionally convincing.
- If a trace shows a large DB span, the pass starts talking about indexes or query reduction.
- If a trace shows a large `http.client` span, the pass pivots to retries, batching, or network caching.
- It does not consistently compare traces to determine whether DB and external-call latency co-occur, alternate, or reflect different outlier modes.
- It also does not force a route-to-handler-to-service dependency walkthrough before recommending where to intervene.

### Failure shape captured for the baseline

- Stops too early: it accepts one plausible latency bucket instead of mapping the route's mixed dependency profile.
- Over-relies on one trace: it lets one trace decide whether the route is a DB problem or an external-call problem.
- Jumps into fixes: it starts fix ideation as soon as one span family looks expensive.

## Cross-Scenario Baseline Failure Patterns

### 1. First plausible story wins

The baseline investigation does not naturally keep digging after it finds one plausible explanation. A dramatic span or one ugly trace is enough to collapse the investigation into a single-cause narrative.

### 2. Worst-trace bias

The baseline pass treats the most visible slow trace as representative behavior. It does not reliably ask whether that trace matches other slow requests or whether the route tail is made of several different failure modes.

### 3. Fix-first framing

The investigation drifts from evidence to remedies too quickly. Instead of ending at ranked hypotheses with confidence levels, it starts proposing optimizations, caching, query work, batching, or retry changes.

### 4. Weak handling of missing instrumentation

When traces are thin, the baseline behavior does not stop cleanly at "unknown." It fills instrumentation gaps with guesses and speaks more confidently than the evidence allows.

### 5. Inconsistent code-path inspection

The baseline behavior does not reliably walk the route through middleware, handler, services, and downstream dependencies before making claims. Code inspection becomes optional instead of required.

### 6. Evidence and inference get mixed together

The baseline write-up tends to blur what was directly seen in traces versus what was inferred from route shape, naming, or prior expectations. That makes it easy to overstate confidence.

## What The Future Skill Should Guard Against

- It should usually require `24h` and `7d` route metrics.
- It should push the investigation to inspect more than one useful slow trace.
- It should make instrumentation gaps explicit instead of letting guesses fill them.
- It should push for route-to-dependency code-path inspection before conclusions are stated with confidence.
- It should end at ranked hypotheses, confidence, and open questions.
- It should discourage drifting into fix planning before the diagnostic pass is complete.

## 2026-03-18 Verification Against The Skill

Checked `.opencode/skills/anyobackendapi-api-latency-diagnosis/SKILL.md` against the same three pressure scenarios after the initial baseline write-up.

### Confirmed closed or mostly closed

- The skill already required multiple slow traces, with a preference for at least three, so the worst-trace bias from all three scenarios was substantially closed.
- The skill already forced route-to-handler-to-dependency code-path review before conclusions, which closed the earlier tendency to stop at the first plausible dependency match.
- The skill already ended at ranked hypotheses and explicitly forbade fix recommendations, so the earlier drift into optimization plans, indexing, caching, batching, or retry advice was closed.
- The skill already called out missing instrumentation and required confidence reduction when traces were thin, which materially improved the Scenario 2 behavior.

### Loopholes found during verification

- Metrics consistency was still soft because the workflow and output template did not force the same full metric set across `24h` and `7d`; `avg` could be skipped while `p95` and `p99` were recorded.
- Evidence separation was still a little soft because the template used one `Evidence vs inference` line item, which still left room for blended write-ups under pressure.
- Trace depth was mostly closed but not fully explicit in the template because it did not require recording the actual number of traces reviewed or why fewer than three were used.

### Skill adjustments made from this verification

- Tightened the skill to require the same route metrics set in both windows: request count, avg, p95, p99.
- Added an explicit guardrail to keep direct observations, code-informed inferences, and hypotheses visibly separate.
- Required recording the number of traces reviewed and explaining when fewer than three useful traces were available.
- Split the output shape into `Evidence` and `Inference discipline` sections so weak observability now lands in open questions instead of confident guesses.

### Verification conclusion

- `inspects more than one trace`: yes, now explicit and harder to bypass.
- `records metrics consistently`: yes after the verification patch; before the patch this was only partially enforced.
- `distinguishes evidence from guesses`: yes after the verification patch; before the patch this was directionally correct but still compressible.
- `stops at hypotheses instead of proposing fixes`: yes, already strongly enforced before the patch and still diagnostic-only after it.

### Post-patch re-run of the same pressure scenarios

- Scenario 1 second pass: the skill-guided write-up now records `24h` and `7d` count/avg/p95/p99 first, then reviews multiple slow traces instead of letting one obvious trace close the investigation, and ends at ranked hypotheses without fix language.
- Scenario 2 second pass: when traces stay thin, the skill-guided write-up now records the trace count reviewed, calls out instrumentation gaps directly, separates observed evidence from inference, and leaves unresolved layers as open questions instead of guessed causes.
- Scenario 3 second pass: the skill-guided write-up now compares `db` and `http.client` behavior across multiple traces, ties that comparison back to the route-to-dependency code path, and stops at mixed-mode hypotheses rather than choosing one latency bucket and proposing intervention.

This second pass confirms the repeat verification loop: baseline failure patterns were checked again after the patch, and the three scenarios now produce the same disciplined behavior on trace depth, metric consistency, evidence labeling, and diagnostic-only output.
