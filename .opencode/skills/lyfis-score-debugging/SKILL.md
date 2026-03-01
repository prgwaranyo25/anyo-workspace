---
name: lyfis-score-debugging
description: Use when an admin needs to explain how a LYFIS disease score was computed by fetching a fixed set of Mongo documents and interpreting the stored trace/provenance (DB-only; no scripts/handlers).
---

## What I do
- Explain "why this score" using the persisted `trace` on `anyoDb.anyoLyfisDiseaseScores` (questionnaire + labs + scenario weights).
- Fetch the minimum required evidence from Mongo with a repeatable query sequence (no "freestyle" DB exploration).
- Optionally join questionnaire responses referenced by `questionnaireResponseIdsUsed` for a human-readable narrative.

## When to use me
Use this when someone asks:
- "Why did this user get DRS=91 for disease X?"
- "Which questionnaire answers / lab markers contributed the most?"
- "Is this score using the latest Excel rules?"

## Non-negotiables
- Do NOT write new code (no scripts, no handlers, no ad-hoc debug utilities).
- Do NOT execute the scoring engine; do NOT attempt to recompute scores.
- Do NOT modify Mongo data.
- Only use DB reads (via `mongosh`) + code reading to interpret fields.

## Preconditions
- The disease -> compiled artifact mapping comes from `anyoDb.anyoLyfisPartnerProfiles.diseaseArtifacts[]` ("final" artifact lookup).

## Workflow (evidence-first)
1) Identify the disease score document to explain
- Preferred: start from `anyoDb.anyoLyfisDiseaseScores` `_id`.
- Fallback: pick the latest for `(userId, diseaseId)`.

2) Load the score snapshot (inputs context)
- Fetch `anyoDb.userLyfisScores` by `snapshotId` from the disease score.
- Only use this to explain context (trigger, partnerProfileId, stored engineInput). Do not recompute.

3) Resolve the "final" compiled artifact mapping
- Fetch `anyoDb.anyoLyfisPartnerProfiles` by `partnerProfileId` from the snapshot.
- Find `diseaseArtifacts[]` entry for the `diseaseId`.
- Compare mapped `compiledArtifactId` vs the disease score's `compilerArtifactId` (they should match for "final").

4) Explain from trace
- Use `trace.questionnaireBreakdown` and `trace.labBreakdown` to list which rules fired and points awarded.
- Use `trace.scenarioTrace` (and `weightsApplied`) to explain why weights were selected.
- Use `trace.totals` to explain normalization/denominators (max points based on available inputs).

## Commands

### Fetch one disease score by id (recommended)
```bash
mongosh anyoDb --quiet --eval '
  const ds = db.anyoLyfisDiseaseScores.findOne(
    { _id: new ObjectId("<diseaseScoreId>") },
    { projection: {
        snapshotId: 1, diseaseId: 1, drsScore: 1, pdhScore: 1, band: 1,
        questionnaireScore: 1, labMarkersScore: 1, weightsApplied: 1,
        rulesVersionId: 1, compilerArtifactId: 1,
        questionnaireFactsUsed: 1, labMetaIdsUsed: 1, questionnaireResponseIdsUsed: 1,
        status: 1, trace: 1, createdAt: 1
      } }
  );
  printjson(ds);
'
```

### Fetch the latest disease score for a user + disease
```bash
mongosh anyoDb --quiet --eval '
  const userId = new ObjectId("<userId>");
  const diseaseId = "<diseaseId>";
  const ds = db.anyoLyfisDiseaseScores
    .find({ userId, diseaseId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  printjson(ds[0] || null);
'
```

### Fetch the snapshot referenced by the disease score
```bash
mongosh anyoDb --quiet --eval '
  const snapshotId = new ObjectId("<snapshotId>");
  const snap = db.userLyfisScores.findOne(
    { _id: snapshotId },
    { projection: { userId: 1, assessmentId: 1, trigger: 1, triggerId: 1, partnerProfileId: 1, engineInput: 1, createdAt: 1 } }
  );
  printjson(snap);
'
```

### Resolve the final compiled artifact for this disease (partner profile mapping)
```bash
mongosh anyoDb --quiet --eval '
  const partnerProfileId = new ObjectId("<partnerProfileId>");
  const diseaseId = "<diseaseId>";
  const pp = db.anyoLyfisPartnerProfiles.findOne(
    { _id: partnerProfileId },
    { projection: { diseaseArtifacts: 1 } }
  );
  const mapping = (pp?.diseaseArtifacts || []).find((x) => x?.diseaseId === diseaseId) || null;
  printjson({ partnerProfileId, diseaseId, mapping });
'
```

### (Optional) Fetch questionnaire responses used (for narrative)
```bash
mongosh anyoDb --quiet --eval '
  const ids = [/* paste diseaseScore.questionnaireResponseIdsUsed here */];
  const asObjectIds = ids.flatMap((id) => {
    try { return [new ObjectId(id)]; } catch { return []; }
  });

  // Try both patterns because some collections store _id as stringified ObjectId.
  const byString = db.anyoLyfisQuestionnaireResponses.find({ _id: { $in: ids } }).toArray();
  const byObjectId = asObjectIds.length
    ? db.anyoLyfisQuestionnaireResponses.find({ _id: { $in: asObjectIds } }).toArray()
    : [];

  printjson({ countByString: byString.length, countByObjectId: byObjectId.length });
  printjson(byString.length ? byString : byObjectId);
'
```

## Common failure modes
- `trace missing`: older/backfilled scores may not have full trace; you can only explain from stored aggregate fields.
- `snapshotId missing`: cannot link to the score snapshot for context.
- `partnerProfileId missing`: cannot validate "final artifact" mapping.
- `questionnaireResponseIdsUsed empty`: narrative is limited to `questionnaireFactsUsed` + trace.
test