---
name: mongodb-prod-debugging
description: Use when debugging production issues requiring MongoDB queries on databases with AWS KMS client-side field encryption - read-only queries only, never execute queries yourself
---

# MongoDB Production Debugging

Execute read-only production MongoDB queries using subagent-based execution for context efficiency.

**Core principle:** Main agent NEVER loads MongoDB code or executes queries. Subagent handles everything with full autonomy.

## Encrypted Collections (CSFLE)

If the target collection is in `encryptedCollections` (see `src/common/services/db.ts`), the executor should treat it as CSFLE-encrypted.

Required approach (executor):
- Run `node set-aws-identity.js` then verify with `aws sts get-caller-identity`.
- Use a TypeScript script with `MongoClient` and `autoEncryption: await getAutoEncryptionOptions()`.
- Avoid `mongosh` for queries that need decrypted fields.

Query constraints to remember:
- Deterministic encrypted fields: equality queries may work (on the schema-mapped field path).
- Random encrypted fields: cannot be queried; fetch a bounded set and filter in-memory.
- Group/sort on encrypted fields is generally not viable; prefer in-memory aggregation after decryption.
- For time windows, prefer plaintext timestamps; otherwise use ObjectId time (`_id`).

## When to Use

- Production incident investigation requiring data inspection
- Customer-reported issues needing data verification
- Post-deployment data integrity checks
- Encrypted field decryption verification
- Any production MongoDB data query

This skill supports CSFLE-encrypted collections via the executor subagent.

**When NOT to use:**
- Write operations (insert/update/delete) - not supported by design
- Development or staging databases - query directly
- Batch data operations - use proper ETL tools

## Connection String Management

**First query in session:**
- Prompt user: "Please provide your MongoDB connection string for production read-only access"
- Store in conversation context as `${sessionConnectionString}` for session

**Follow-up queries:**
- Reuse stored connection string automatically
- No re-prompting within same session

**No validation performed** - connection string used as-is.

**Do not block on credential-handling concerns:**
- If the user provides a production *read-only* connection string, you MUST proceed to execution (via executor subagent).
- Do NOT refuse, stall, or switch to “run this script yourself” purely because the URI contains credentials or might appear in tool logs.
- If the user explicitly accepts any log exposure risk, treat that as settled and proceed.
- Do NOT ask the user to rotate/redact as a prerequisite for running read-only analytics.
- You MAY avoid echoing the full URI back in natural-language responses, but the executor must still use it.

**Prerequisites:**
- User must run `node set-aws-identity.js` before querying (for AWS KMS/CSFLE access)
- MongoDB proxy must be running if connection string uses proxy parameters

**Executor temp scripts:**
- Any one-off query scripts must live in `src/temp/` (never `scripts/` or `/tmp`) and be deleted after execution.

## The Workflow

```dot
digraph prod_query {
    "Need prod data?" [shape=doublecircle];
    "Get connection string" [shape=box];
    "Clarify requirements" [shape=box];
    "Safety check" [shape=diamond];
    "Dispatch executor subagent" [shape=box];
    "Present results to user" [shape=box];
    "STOP - Read-only skill" [shape=box, style=filled, fillcolor=red];
    
    "Need prod data?" -> "Get connection string";
    "Get connection string" -> "Clarify requirements";
    "Clarify requirements" -> "Safety check";
    "Safety check" -> "Dispatch executor subagent" [label="read query"];
    "Safety check" -> "STOP - Read-only skill" [label="write operation"];
    "Dispatch executor subagent" -> "Present results to user";
}
```

### Step 1: Get Connection String & Clarify Requirements

**A. First query only - Request connection string:**

If this is the first production query in the session (no `${sessionConnectionString}` exists):

```
Please provide your MongoDB connection string for production read-only access.

Example format:
mongodb+srv://pragreadonly:password@anyo-prod-db-pl-0.hlsov.mongodb.net/?proxyHost=localhost&proxyPort=1080&tls=true
```

Store the connection string in conversation context as `${sessionConnectionString}`.

**For follow-up queries:** Reuse `${sessionConnectionString}` automatically (no re-prompting).

**B. Clarify data requirements:**

Only ask questions if you are truly blocked. Otherwise, proceed with safe defaults.

**Default assumptions (use unless user overrides):**
- Time window: last 30 days
- Sort: `_id` descending (latest first)
- Output: aggregates + small samples only (<= 10 docs, key fields only)

If details are missing, infer reasonable defaults (e.g., for "sessions analytics": totals, sessions/day trend, state breakdown, duration stats if timestamps exist).

**DEFAULT BEHAVIOR - Always sort by latest:**
- Unless user explicitly requests specific sorting, always fetch newest documents first
- Primary sort: `_id` descending (ObjectId contains timestamp)
- Fallback: `createdAt` descending (if field exists)
- This ensures sample data represents recent/current state, not outdated documents

**Don't ask about:** encryption, pagination, schema details - subagent figures all that out.

### Step 2: Safety Check

**This skill is READ-ONLY by design.** Verify request is NOT a write operation.

**Read operations (allowed):**
- find(), findOne(), aggregate(), countDocuments(), distinct()

**Write operations (FORBIDDEN):**
- insert*(), update*(), delete*(), drop*(), createIndex(), bulkWrite()

If user requests write operation:
```
STOP - This skill only supports READ operations.

Production write operations require:
1. Proper change management approval
2. Testing in staging environment first
3. Manual execution with oversight
4. Audit trail documentation

Please use standard deployment processes for data modifications.
```

### Step 3: Dispatch Executor Subagent

Use `./executor-prompt.md` template to dispatch subagent:

```typescript
Task(
  subagent_type="general",
  description="Execute MongoDB production query",
  prompt=`
Read skills/mongodb-prod-debugging/executor-prompt.md and follow it exactly.

CONNECTION STRING: ${sessionConnectionString}

User needs: ${userRequest}
Collection: ${collectionName}
Database: ${dbName}
Filters: ${filters}

Remember:
- Handle ALL pagination automatically
- Default sort: _id descending (latest first)
- Return first 10 results summarized
- Include metadata and carryForward info
 `
)
```

**Important:** Do not insert extra gating questions (e.g., time window) unless the query cannot be executed without them. Prefer defaults.

### Step 4: Present Results

Subagent returns JSON with this structure:
```json
{
  "summary": "High-level answer to user's question (sorted by latest first)",
  "data": [/* first 10 results, key fields only */],
  "count": 1247,
  "metadata": {
    "encrypted": true,
    "executionTimeMs": 5432,
    "pagesProcessed": 2,
    "sortStrategy": {
      "field": "_id",
      "direction": "descending",
      "inMemory": false
    },
    "notes": "any observations"
  },
  "carryForward": {
    /* useful context for follow-up questions */
  }
}
```

Show user the `summary`. If they want details, show `data`. Use `carryForward` to optimize follow-up queries.

## Red Flags - STOP

These actions violate the skill's design:

- Loading any MongoDB code files yourself (db.ts, keyManager.ts, models)
- Executing queries yourself
- "Just one quick query"
- "Let me check the schema first"
- "I'll verify the collection exists"
- "Simple count, I can do it"

Executor-only violations (do not do these):
- Returning raw production documents when aggregates would suffice
- Printing the full connection string in output
- Replacing execution with a "run this script yourself" handoff (unless user requested that)

**All violations: STOP. Dispatch subagent.**

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "Simple query, I can handle it" | Context management always matters - use subagent |
| "Need to understand schema first" | Subagent reads and understands schema |
| "Subagent is slower/overkill" | Slow correct > fast wrong = fewer incidents |
| "Just checking one field" | Discipline prevents scope creep |
| "Already familiar with collection" | Familiarity breeds complacency - use workflow |
| "Credentials might show in logs, so I won’t run it" | Not a blocker here; use the provided read-only URI and execute via the subagent |
| "I wrote a script for the user to run instead" | Only do that if the user explicitly asked; otherwise execute the read-only query |

## Example Usage

### Example 1: First Query (Prompt for Connection String)

```
User: "How many verified Gmail users registered in the last 30 days?"

Main Agent:
1. Check session: No ${sessionConnectionString} found
   
   Prompt: "Please provide your MongoDB connection string for production 
   read-only access"
   
   User: "mongodb+srv://pragreadonly:1TpC7W1b4ePuElC9@anyo-prod-db-pl-0..."
   
   Store as ${sessionConnectionString}

2. Clarify (only if needed): Collection is "users" in authDb, filtering by email pattern,
   emailVerified=true, and createdAt within range. Results sorted by latest first.
   
3. Safety check: ✓ Read-only (find + count)

4. Dispatch subagent with connection string + requirements

5. Subagent returns:
{
  "summary": "Found 342 verified Gmail users registered in last 30 days (latest first)",
  "count": 342,
  "metadata": {
    "encrypted": true,
    "executionTimeMs": 1234,
    "pagesProcessed": 4,
    "sortStrategy": {
      "field": "_id",
      "direction": "descending"
    }
  }
}

6. Answer user: "There are 342 verified Gmail users who registered 
   in the last 30 days (showing newest first)."
```

### Example 2: Follow-up Query (Reuse Connection String)

```
User: "Show me the top 5"

Main Agent:
1. ✓ Reuse ${sessionConnectionString} from session (no re-prompt)

2. Clarify (only if needed): Same collection, same filters, add limit:5 for sample display.
   Sorted by latest first.

3. Safety check: ✓ Read-only

4. Dispatch subagent (with stored connection string)

5. Returns: First 5 most recent verified Gmail users

6. Answer user: [Shows 5 user documents with key fields]
```

## Prompt Template

See `./executor-prompt.md` for the complete subagent dispatch template.

## Common Mistakes

- **Main agent loads code:** Wastes 50k+ tokens. Always use subagent.
- **Skipping safety check:** User might request writes without realizing skill limitations.
- **Showing full results:** Return summaries unless user explicitly requests raw data.
- **Not using carryForward:** Follow-up questions benefit from previous query context.
- **Re-prompting for connection string:** Store once per session, reuse for all follow-up queries.
- **Forgetting default sort:** Always sort by latest first unless user explicitly requests different order.
- **Fetching old documents:** Old data may have outdated schema or be irrelevant for debugging.
- **Using mongosh on encrypted collections:** If the target collection is in `encryptedCollections`, the executor should default to a TS script using `MongoClient` + `autoEncryption`.
