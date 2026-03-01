---
name: lyfis-local-excel-compiler
description: Use when compiling a LYFIS Excel scorecard from docs/lyfis/final_compilations_sheet into anyoDb.anyoLyfisCompiledArtifacts without running the backend server, using mongosh + ephemeral node+xlsx, and iterating with a Ralph loop until validation passes or the sheet must be rejected.
---

## What I do
- Compile ONE Excel scorecard from `docs/lyfis/final_compilations_sheet/` into a compiled artifact (config JSON + engineCode) and persist it to Mongo.
- Infer `diseaseId` from the filename using `Masterdata` (category `LyfisDiseases`).
- Fetch factKey/markerKey context directly from Mongo, matching the behavior of `getDiseaseFactMarkerKeys`.
- Validate the generated `engineCode` locally (Node vm) before writing to Mongo.
- Use a Ralph Wiggum loop: compile -> validate -> retry (max N) using the latest failure as input.

## Non-negotiables
- Do NOT start or depend on the backend server.
- Do NOT add prebuilt scripts to the repo (no new `scripts/*.ts`).
- Use only:
  - `mongosh` for DB reads/writes
  - ephemeral `node` snippets (heredocs/one-liners) for local Excel parsing and JS validation
- If filename -> disease is ambiguous: STOP with `AMBIGUOUS_DISEASE_FROM_FILENAME`.

## Constants (from repo)
- DB: `anyoDb`
- Masterdata collection: `Masterdata`
- Questions collection: `anyoLyfisQuestions`
- Compiled artifacts collection: `anyoLyfisCompiledArtifacts`
- Compile logs collection: `anyoLyfisCompileLogs`
- Masterdata categories: `LyfisDiseases`, `RuleEngineFacts`, `LyfisLabMarkers`

## Preconditions
- `mongosh` is available and can connect to the target DB.
- Node dependencies are installed so `require("xlsx")` works. If not, run `pnpm install` once (still serverless).

## Workflow (serverless)

### Step 0: Pick the Excel file
Pick latest `.xlsx`:

```bash
FILE_PATH=$(node <<'NODE'
const fs = require('fs');
const path = require('path');

const dir = path.resolve('docs/lyfis/final_compilations_sheet');
const files = fs.readdirSync(dir)
  .filter(f => /\.xlsx$/i.test(f))
  .map(f => ({
    name: f,
    p: path.join(dir, f),
    t: fs.statSync(path.join(dir, f)).mtimeMs,
  }))
  .sort((a, b) => b.t - a.t);

if (!files.length) {
  throw new Error('No .xlsx files found in ' + dir);
}

process.stdout.write(files[0].p);
NODE
)

echo "$FILE_PATH"
```

Create an ephemeral working folder (gitignored):

```bash
mkdir -p src/temp/lyfis_compiler
```

### Step 1: Compute IDs (rulesVersionId, scorecardId)
Use sha256 of the excel bytes (deterministic):

```bash
IDS_JSON=$(FILE_PATH="$FILE_PATH" node <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const filePath = process.env.FILE_PATH;
const buf = fs.readFileSync(filePath);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

const out = {
  filePath,
  fileName: path.basename(filePath),
  sha256,
  rulesVersionId: sha256,
  scorecardId: sha256,
};

process.stdout.write(JSON.stringify(out));
NODE
)

echo "$IDS_JSON" > src/temp/lyfis_compiler/ids.json
```

### Step 2: Infer diseaseId from filename (strict)
This must be deterministic and must STOP on ambiguity.

```bash
DISEASE_JSON=$(FILE_PATH="$FILE_PATH" mongosh anyoDb --quiet --eval '
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(lyfis|final|compilation|sheet|version|v)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(s) {
    const t = norm(s).split(" ").filter(Boolean);
    const set = {};
    for (const x of t) set[x] = true;
    return Object.keys(set);
  }

  function scoreByTokens(fileToks, diseaseToks) {
    let hit = 0;
    const diseaseSet = {};
    for (const t of diseaseToks) diseaseSet[t] = true;
    for (const t of fileToks) if (diseaseSet[t]) hit++;
    return hit;
  }

  const path = require("path");
  const filePath = process.env.FILE_PATH;
  const base = path.basename(filePath);
  const fileNorm = norm(base);
  const fileToks = tokens(base);

  // Common abbreviation support (keep tiny + deterministic)
  const hasPd = fileToks.includes("pd");

  const md = db.Masterdata.findOne({ category: "LyfisDiseases" }, { projection: { masterData: 1 } });
  const diseases = (md && md.masterData) ? md.masterData : [];

  const scored = diseases
    .map((d) => {
      const name = String(d.data || "");
      const code = String(d.code || "");
      const dn = norm(name);
      const cn = norm(code);
      const diseaseToks = tokens(name + " " + code);

      let s = scoreByTokens(fileToks, diseaseToks);
      if (dn && fileNorm.includes(dn)) s += 100; // strong substring match
      if (cn && fileNorm.includes(cn)) s += 50;
      if (hasPd && dn.includes("prediabetes")) s += 20;

      return { diseaseId: String(d.m_id), diseaseName: name, score: s };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const bestScore = best ? best.score : 0;
  const tied = scored.filter((x) => x.score === bestScore);

  if (!best || bestScore <= 0) {
    print(JSON.stringify({
      code: "DISEASE_NOT_FOUND_FROM_FILENAME",
      details: "No disease match found from filename.",
      fileName: base,
      topCandidates: scored.slice(0, 10),
    }));
    quit(2);
  }

  if (tied.length > 1) {
    print(JSON.stringify({
      code: "AMBIGUOUS_DISEASE_FROM_FILENAME",
      details: "Multiple diseases match the filename; rename file to be unambiguous.",
      fileName: base,
      candidates: tied,
    }));
    quit(3);
  }

  print(JSON.stringify({ diseaseId: best.diseaseId, diseaseName: best.diseaseName, fileName: base }));
' )

echo "$DISEASE_JSON" > src/temp/lyfis_compiler/disease.json
```

### Step 3: Fetch mapping context (factKeys/markerKeys)
Mimics `getDiseaseFactMarkerKeys` by querying Mongo directly.

```bash
MAPPING_JSON=$(DISEASE_ID=$(node -p 'JSON.parse(require("fs").readFileSync("src/temp/lyfis_compiler/disease.json","utf8")).diseaseId') \
mongosh anyoDb --quiet --eval '
  const diseaseId = process.env.DISEASE_ID;

  // Questions -> factIds
  const questions = db.anyoLyfisQuestions
    .find({ diseaseIds: { $in: [diseaseId] }, active: true }, { projection: { factId: 1 } })
    .toArray();
  const factIdsSet = {};
  for (const q of questions) {
    if (q && q.factId) factIdsSet[String(q.factId)] = true;
  }
  const factIds = Object.keys(factIdsSet);

  // Masterdata facts
  const factsDoc = db.Masterdata.findOne({ category: "RuleEngineFacts" }, { projection: { masterData: 1 } });
  const allFacts = (factsDoc && factsDoc.masterData) ? factsDoc.masterData : [];

  const factKeys = [];
  const factKeyToDescription = {};
  const factKeyToDataType = {};
  const factKeyToOptions = {};

  function pushFact(f) {
    if (!f || !f.factKey) return;
    const fk = String(f.factKey);
    factKeys.push(fk);
    factKeyToDescription[fk] = String(f.description || f.data || "");
    factKeyToDataType[fk] = f.dataType;
    if (Array.isArray(f.availableOptions) && f.availableOptions.length) {
      factKeyToOptions[fk] = f.availableOptions.map((o) => ({ key: o.key, label: o.label }));
    }
  }

  for (const fid of factIds) {
    const f = allFacts.find((x) => String(x.m_id) === String(fid));
    if (f && f.factKey && f.active !== false) pushFact(f);
  }

  // Derived facts (matches current repo behavior: include all other active facts)
  for (const f of allFacts) {
    if (f && f.active !== false && f.factKey) {
      const fk = String(f.factKey);
      if (!factKeys.includes(fk)) pushFact(f);
    }
  }

  // Disease -> labBioMarkers
  const diseasesDoc = db.Masterdata.findOne({ category: "LyfisDiseases" }, { projection: { masterData: 1 } });
  const diseases = (diseasesDoc && diseasesDoc.masterData) ? diseasesDoc.masterData : [];
  const disease = diseases.find((d) => String(d.m_id) === String(diseaseId));
  const labBioMarkerIds = disease && Array.isArray(disease.labBioMarkers)
    ? disease.labBioMarkers
    : (disease && disease.labBioMarkers ? [disease.labBioMarkers] : []);

  // Masterdata markers
  const markersDoc = db.Masterdata.findOne({ category: "LyfisLabMarkers" }, { projection: { masterData: 1 } });
  const allMarkers = (markersDoc && markersDoc.masterData) ? markersDoc.masterData : [];
  const markerKeys = [];
  const markerKeyToDescription = {};
  for (const mid of labBioMarkerIds) {
    const m = allMarkers.find((x) => String(x.m_id) === String(mid));
    if (m && m.markerKey && m.active !== false) {
      const mk = String(m.markerKey);
      markerKeys.push(mk);
      markerKeyToDescription[mk] = String(m.data || mk);
    }
  }

  // Uniq
  function uniq(arr) {
    const set = {};
    for (const x of arr) set[String(x)] = true;
    return Object.keys(set).sort();
  }

  print(JSON.stringify({
    diseaseId,
    factKeys: uniq(factKeys),
    markerKeys: uniq(markerKeys),
    factKeyToDescription,
    factKeyToDataType,
    factKeyToOptions,
    markerKeyToDescription,
  }));
' )

echo "$MAPPING_JSON" > src/temp/lyfis_compiler/mapping.json
```

### Step 4: Parse Excel locally (xlsx)
This produces the same shape as `read_scorecard_sheets` (sheets -> rows with `values` + `rawText`).

```bash
node <<'NODE'
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ids = JSON.parse(fs.readFileSync('src/temp/lyfis_compiler/ids.json', 'utf8'));
const filePath = ids.filePath;

const fileBuffer = fs.readFileSync(filePath);
const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

const sheets = [];
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = [];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  jsonData.forEach((row, rowIndex) => {
    const rowValues = Array.isArray(row) ? row : [];
    const isEmptyRow = rowValues.every((cell) => cell === null || cell === undefined || cell === "");
    if (isEmptyRow) return;

    const rawTextParts = [];
    rowValues.forEach((cellValue, colIndex) => {
      if (cellValue === null || cellValue === undefined) {
        rawTextParts.push('');
        return;
      }
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[cellAddress];
      if (cell && cell.w) rawTextParts.push(cell.w);
      else if (cellValue instanceof Date) rawTextParts.push(cellValue.toISOString());
      else rawTextParts.push(String(cellValue));
    });

    rows.push({
      rowIndex: rowIndex + 1,
      values: rowValues,
      rawText: rawTextParts.join(' | '),
    });
  });

  sheets.push({ sheetName, rows });
}

fs.writeFileSync('src/temp/lyfis_compiler/workbook.json', JSON.stringify({ sheets }, null, 2));
console.log('Wrote src/temp/lyfis_compiler/workbook.json');
NODE
```

### Step 5: Compile (LLM)
Use the EXACT system prompt from:
- `src/core/service/agents/LyfisExcelCompilerAgent.ts` (`getSystemMessage()`)

Inputs to compilation:
- `src/temp/lyfis_compiler/workbook.json`
- `src/temp/lyfis_compiler/mapping.json`
- `src/temp/lyfis_compiler/ids.json`
- `src/temp/lyfis_compiler/disease.json`

Output (must be one JSON object):
- Save it to `src/temp/lyfis_compiler/compiled.json`
- Valid shapes:
  - ok: `{ status:"ok", diseaseId, rulesVersionId, requiredQuestionnaireFacts, requiredLabMarkers, config, engineCode }`
  - rejected: `{ status:"rejected", diseaseId, rulesVersionId, errors:[...] }`

### Step 6: Validate engineCode locally
Fail fast on syntax errors or wrong output shape.

```bash
node <<'NODE'
const fs = require('fs');
const vm = require('vm');

const compiled = JSON.parse(fs.readFileSync('src/temp/lyfis_compiler/compiled.json', 'utf8'));
if (!compiled || typeof compiled !== 'object') throw new Error('compiled.json is not an object');
if (compiled.status !== 'ok') {
  console.log(JSON.stringify({ ok: false, reason: 'status_not_ok', status: compiled.status }, null, 2));
  process.exit(2);
}

const engineCode = String(compiled.engineCode || '');
const config = compiled.config || {};

const ctx = {
  module: { exports: {} },
  exports: {},
  console,
};
ctx.exports = ctx.module.exports;

const script = new vm.Script(engineCode, { filename: 'engineCode.js' });
script.runInNewContext(ctx, { timeout: 1500 });

const scoreDisease =
  (typeof ctx.scoreDisease === 'function' && ctx.scoreDisease) ||
  (typeof ctx.module.exports === 'function' && ctx.module.exports) ||
  (ctx.module.exports && typeof ctx.module.exports.scoreDisease === 'function' && ctx.module.exports.scoreDisease);

if (typeof scoreDisease !== 'function') {
  throw new Error('Engine did not expose scoreDisease function');
}

const input = {
  questionnaireFacts: {},
  labMarkers: {},
};

const out = scoreDisease(input, config);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

const errors = [];
for (const k of ['questionnaireScore', 'labScore', 'drsScore', 'wQ', 'wL']) {
  if (!isNum(out && out[k])) errors.push('missing_or_invalid_' + k);
}
if (!out || typeof out !== 'object') errors.push('output_not_object');
if (!out.trace || typeof out.trace !== 'object') errors.push('missing_trace');

if (errors.length) {
  console.log(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(3);
}

console.log(JSON.stringify({ ok: true }, null, 2));
NODE
```

### Step 7: Persist to Mongo (only if ok)
Upsert compiled artifact and insert compile log.

```bash
DISEASE_ID=$(node -p 'JSON.parse(require("fs").readFileSync("src/temp/lyfis_compiler/disease.json","utf8")).diseaseId')
RULES_VERSION_ID=$(node -p 'JSON.parse(require("fs").readFileSync("src/temp/lyfis_compiler/ids.json","utf8")).rulesVersionId')
SCORECARD_ID=$(node -p 'JSON.parse(require("fs").readFileSync("src/temp/lyfis_compiler/ids.json","utf8")).scorecardId')
FILE_NAME=$(node -p 'JSON.parse(require("fs").readFileSync("src/temp/lyfis_compiler/ids.json","utf8")).fileName')

mongosh anyoDb --quiet --eval '
  const fs = require("fs");
  const diseaseId = process.env.DISEASE_ID;
  const rulesVersionId = process.env.RULES_VERSION_ID;
  const scorecardId = process.env.SCORECARD_ID;
  const fileName = process.env.FILE_NAME;

  const compiled = JSON.parse(fs.readFileSync("src/temp/lyfis_compiler/compiled.json", "utf8"));
  if (!compiled || compiled.status !== "ok") throw new Error("compiled.json is not ok");

  const doc = {
    diseaseId,
    rulesVersionId,
    scorecardId,
    config: compiled.config,
    engineCode: compiled.engineCode,
    requiredQuestionnaireFacts: compiled.requiredQuestionnaireFacts || [],
    requiredLabMarkers: compiled.requiredLabMarkers || [],
    fileName,
    filePath: String(JSON.parse(fs.readFileSync("src/temp/lyfis_compiler/ids.json","utf8")).filePath),
  };

  db.anyoLyfisCompiledArtifacts.updateOne(
    { diseaseId, rulesVersionId, scorecardId },
    {
      $set: { ...doc, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );

  db.anyoLyfisCompileLogs.insertOne({
    diseaseId,
    rulesVersionId,
    scorecardId,
    status: "ok",
    timestamp: new Date(),
  });

  print(JSON.stringify({ stored: true, diseaseId, rulesVersionId, scorecardId }));
' 
```

## Ralph loop (max iterations)
If Step 6 fails (validation):
- Retry ONLY Step 5 (compile) + Step 6 (validate).
- Append the validation JSON (stdout) into the next compile prompt.
- Max iterations: 5.
- If still failing after max: STOP and report the last validation error + what changed each iteration.

## Common failure modes
- `AMBIGUOUS_DISEASE_FROM_FILENAME`: rename Excel file to include a unique disease name.
- Mongo `Masterdata` missing categories: you are pointing at wrong DB.
- `Engine did not expose scoreDisease`: engineCode wrapper/export mismatch.
- Missing `trace` in output: engine implementation bug; must be fixed in compile step.
