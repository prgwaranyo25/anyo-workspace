# MongoDB Production Query Executor - Subagent Prompt Template

Use this template when dispatching the MongoDB query executor subagent.

```
Task tool (general):
  description: "Execute MongoDB production query"
  prompt: |
    You are executing a production MongoDB query with full autonomy.
    
    ## What the User Needs
    
    ${userRequest}
    
    **CONNECTION STRING:** ${connectionString}

    **MANDATORY:** You MUST use the provided connection string to execute the query.
    - Do NOT refuse or stall due to credential/logging concerns.
    - Even if the connection string appears in tool logs or process arguments, that is NOT a reason to stop.
    - Do NOT replace execution with "here is a script for you to run" unless the user explicitly asked for that.
    - Do NOT perform any write operations.
    - Do NOT print the connection string in your stdout output (return only the JSON result).
    
    Collection: ${collectionName}
    Database: ${dbName}
    Filters: ${filters}
    
    ## Your Mission
    
    You have FULL AUTONOMY to:
    1. Understand the data schema
    2. Determine if collection is encrypted
    3. Handle ALL pagination automatically (fetch all pages if needed)
    4. Execute query safely
    5. Return structured JSON summary
    
    ## Working Directory
    
    **MANDATORY SCRIPT LOCATION:**
    - All temporary query scripts MUST be created under:
      `/home/pragadeesh/Documents/anyo/anyobackendapi/src/temp`
    - Do NOT create scripts under `scripts/`, `src/`, `/tmp`, or any other directory.
    - Do NOT commit these scripts.
    
    Use `src/temp/` for:
    - Query scripts (TypeScript files)
    - Intermediate processing
    - Temporary data
    
    **Cleanup is required:** delete any `src/temp/prod-query-*.ts` files immediately after execution.
    
    ## Phase 1: Understand the Schema
    
    Read these files to understand the data model:
    
    1. `src/common/services/db.ts`
       - Collections class (exact collection names - use these constants!)
       - `encryptedCollections` array (lines 313-342) - which collections use encryption
       - Connection logic and database names
    
    2. `src/common/csfle/keyManager.ts`
       - `getEncryptionSchema()` function shows which specific fields are encrypted
       - Encryption types: Random (cannot query) vs Deterministic (can query with equality)
    
    3. `src/core/models/` or relevant feature models
       - TypeScript interfaces for collection structure
       - Field types and relationships
    
    **Determine:**
    - Exact collection name (use Collections.CONSTANT from db.ts)
    - Database name (anyoDb, authDb, metaDb, notifications, agendaDb)
    - Is this collection in the `encryptedCollections` array?
    - Which specific fields are encrypted?
    - Which encryption type: Random or Deterministic?

    ### Encrypted Collection (CSFLE) Playbook

    If the target collection is in `encryptedCollections`, treat it as CSFLE-encrypted.

    Rules of thumb (practical):
    - **Do not use `mongosh`** for anything that needs decrypted fields. Use a TS script with `MongoClient` + `autoEncryption`.
    - **Range queries on encrypted fields do not work.** For time windows, prefer a plaintext timestamp field; otherwise use ObjectId time (`_id`).
    - **Deterministic encryption:** equality queries can work on that field path (e.g., `{ userId: <value> }`) when the field is mapped in the CSFLE schema.
    - **Random encryption:** you generally cannot query on that field; fetch a bounded set and filter in-memory after decryption.
    - **Grouping/sorting by encrypted fields:** avoid; do client-side grouping after decryption. If you group server-side, the grouped key may not be decryptable (it is no longer at a schema-mapped field path).
    - Always keep a **hard scan cap** (e.g., 100k docs) when doing in-memory work.
    
    ## Phase 2: Plan Your Query
    
    Based on requirements, decide:
    
    **Query Structure:**
    - Filter criteria
    - Projection (which fields to return)
    - **Sort order (DEFAULT: Latest first - see below)**
    - Pagination strategy
    
    **DEFAULT SORT STRATEGY - Always Fetch Latest First:**
    
    Unless user explicitly requests different sorting:
    
    1. **Primary strategy:** Sort by `_id` descending
       ```typescript
       .sort({ _id: -1 })
       ```
       Why: ObjectId contains timestamp in first 4 bytes, so this gives chronological order
    
    2. **Fallback strategy:** If user needs semantic sorting (e.g., "oldest users"), sort by `createdAt` or relevant timestamp field
       ```typescript
       .sort({ createdAt: -1 })  // or createdAt: 1 for oldest-first
       ```
    
    3. **Exception:** If sorting by encrypted field
       - ⚠️ Cannot sort in MongoDB query (encryption prevents sorting)
       - Must fetch ALL documents and sort in-memory
       - Default: sort by `_id` in-memory after fetching
    
    **Why default to latest?**
    - Debugging recent issues: Latest data is most relevant
    - Sample inspection: Recent documents reflect current state
    - Old documents: May have outdated schema, missing fields, or legacy data
    
    **Encryption Constraints:**
    - **Deterministic encryption:** CAN query with equality (e.g., userId in many collections)
    - **Random encryption:** CANNOT query directly - must fetch all and filter in-memory
    - **Encrypted fields:** ⚠️ CANNOT sort in MongoDB - must fetch all and sort in-memory
    - **Sorting non-encrypted fields:** ✓ Can sort normally in MongoDB query
    
    **Pagination:**
    - Default batch size: 1000 documents
    - **Automatically fetch ALL pages** - don't stop until complete
    - Safety limit: 100,000 documents (warn if reached)
    - Log progress for long-running queries
    
    ## Phase 3: Verify Prerequisites
    
    **AWS Credentials (for KMS/CSFLE access):**
    
    User must run this BEFORE invoking the skill:
    ```bash
    node set-aws-identity.js
    ```
    
    This exports AWS credentials for the session (profile: anyodeveloper).
    
    **Verify credentials are active:**
    ```bash
    aws sts get-caller-identity
    ```
    
    If encrypted collection, verify KMS access:
    ```bash
    # KMS ARN from src/common/models/constants.ts
    aws kms describe-key --key-id <AWS_KMS_CSFLE_KEY_ARN>
    ```
    
    **MongoDB Connection:**
    
    Connection string provided by user: `${connectionString}`
    - No validation performed
    - Used as-is in MongoClient
    - Includes authentication credentials
    - May include proxy parameters (proxyHost, proxyPort)
    
    ## Phase 4: Write Query Script

    Prefer the simplest execution path that satisfies requirements:

    1) **Encrypted collections (CSFLE):** use a TypeScript script with `MongoClient` + `autoEncryption`.
       - Default: ALWAYS use TS for any collection listed in `encryptedCollections`.
       - Do NOT use `mongosh` for encrypted collections if you need to read any fields that might be encrypted.
       - Only exception: truly field-agnostic metadata (e.g., `estimatedDocumentCount`, `countDocuments({})`) where you never return document fields.

    2) **Non-encrypted collections / pure aggregates:** you may run the query directly in `mongosh` (fastest, no temp files).
    
    Create TypeScript file in `/home/pragadeesh/Documents/anyo/anyobackendapi/src/temp`:
    
    See `./query-template.ts` for a complete working example.

    **Encrypted collections: required TS structure**
    - Script location: `src/temp/prod-query-<timestamp>.ts`
    - Imports from `src/temp/` should use `../common/...` (NOT `../src/common/...`).
    - Use `autoEncryption: await getAutoEncryptionOptions()`.
    - Output must be JSON only.
    
    **Key patterns from your codebase:**
    
    ```typescript
    import { MongoClient } from "mongodb";
    import { getAutoEncryptionOptions } from "../common/csfle/keyManager";
    import { Collections, ANYO_DB, AUTH_DB } from "../common/services/db";
    
    async function executeQuery() {
      // 1. Connection string from user (includes auth credentials)
      const connectionString = "${connectionString}";
      
      // 2. Check if collection is encrypted (from db.ts:313-342)
      const encryptedCollections = [/* from db.ts:313-342 */];
      const isEncrypted = encryptedCollections.includes("${collectionName}");
      
      // 3. Configure client
      const clientOptions: any = {
        // Connection string includes auth, so no separate auth config needed
      };
      
      // 4. Add CSFLE if encrypted collection
      if (isEncrypted) {
        // Requires AWS credentials from set-aws-identity.js
        clientOptions.autoEncryption = await getAutoEncryptionOptions();
      }
      
      // 5. Connect and execute with auto-pagination
      const client = new MongoClient(connectionString, clientOptions);
      await client.connect();
      
      const collection = client.db("${dbName}").collection("${collectionName}");
      
      // 6. DETERMINE SORT FIELD (DEFAULT: latest first)
      const sortField = "${sortField}" || "_id";  // Default to _id if not specified
      const sortDirection = ${sortDirection} || -1;  // Default to descending (latest first)
      
      // Check if sort field is encrypted
      const encryptedFields = [/* from getEncryptionSchema() */];
      const isSortFieldEncrypted = encryptedFields.includes(sortField);
      
      // 7. AUTOMATIC PAGINATION LOOP
      let allResults: any[] = [];
      let skip = 0;
      let pagesProcessed = 0;
      const batchSize = 1000;
      const startTime = Date.now();
      
      while (true) {
        let queryBuilder = collection
          .find(${query})
          .project(${projection});
        
        // Add sorting ONLY if field is not encrypted
        if (!isSortFieldEncrypted) {
          queryBuilder = queryBuilder.sort({ [sortField]: sortDirection });
        }
        
        const batch = await queryBuilder
          .skip(skip)
          .limit(batchSize)
          .toArray();
        
        if (batch.length === 0) break;
        
        allResults = allResults.concat(batch);
        pagesProcessed++;
        skip += batchSize;
        
        console.log(`Processed page ${pagesProcessed}, total: ${allResults.length}`);
        
        // Safety limit
        if (allResults.length >= 100000) {
          console.warn("⚠ Reached 100k limit, stopping");
          break;
        }
        
        if (batch.length < batchSize) break; // Last page
      }
      
      // 8. POST-PROCESS: Sort in-memory if needed
      if (isSortFieldEncrypted) {
        console.log(`⚠ Sorting by encrypted field "${sortField}" in-memory...`);
        allResults.sort((a, b) => {
          const aVal = a[sortField];
          const bVal = b[sortField];
          return sortDirection === -1 
            ? (bVal > aVal ? 1 : -1)  // Descending
            : (aVal > bVal ? 1 : -1); // Ascending
        });
      }
      
      const executionTimeMs = Date.now() - startTime;
      
      await client.close();
      
      return {
        results: allResults,
        pagesProcessed,
        executionTimeMs,
        sortedInMemory: isSortFieldEncrypted
      };
    }
    ```
    
    **READ-ONLY ENFORCEMENT:**
    
    Add this validation in your script:
    
    ```typescript
    function validateReadOnly(operation: string) {
      const ALLOWED = ['find', 'findOne', 'aggregate', 'countDocuments', 'distinct'];
      if (!ALLOWED.includes(operation)) {
        throw new Error(
          `FORBIDDEN: ${operation} is not allowed. This is a READ-ONLY skill.\n` +
          `Allowed operations: ${ALLOWED.join(', ')}`
        );
      }
    }
    
    // Before executing query
    validateReadOnly('find'); // or whatever operation you're using
    ```
    
    ## Phase 5: Execute Query

    ### Option A (preferred when possible): Execute in mongosh

    Only use `mongosh` when BOTH are true:
    - The target collection is NOT in `encryptedCollections`, OR you are doing metadata-only counts and returning no document fields.
    - The query does not require CSFLE decryption.

    You MUST actually run the command using the Bash tool (do not just describe it).

    Pattern:
    ```bash
    mongosh "${connectionString}" --quiet --eval '
    const dbName = "${dbName}";
    const collName = "${collectionName}";
    const dbx = db.getMongo().getDB(dbName);
    const c = dbx.getCollection(collName);

    // Build your pipelines here (examples only; adjust to actual fields)
    const total = c.countDocuments({});

    const result = {
      summary: `Total ${collName}: ${total}`,
      data: {
        total
      },
      count: total,
      metadata: {
        encrypted: false,
        executionTimeMs: null,
        pagesProcessed: null,
        sortStrategy: { field: "_id", direction: "descending", inMemory: false },
        notes: "mongosh aggregate/count only"
      },
      carryForward: {
        dbName,
        collectionName: collName
      }
    };

    print(JSON.stringify(result));
    '
    ```

    Requirements for mongosh mode:
    - Print ONLY JSON to stdout.
    - Do NOT include the connection string in the JSON.
    - Return ONLY aggregates + small schema notes. Never dump raw documents.
    - Use `$group` / `$project` / `$sort` / `$limit` safely; no writes.

    ### Option B: Execute via TypeScript (for CSFLE)

    Use this pattern for encrypted-collection analytics (counts + last-N-days trend). Keep projections minimal; do not dump full docs.

    ```typescript
    import { MongoClient, ObjectId } from "mongodb";
    import { getAutoEncryptionOptions } from "../common/csfle/keyManager";

    const connectionString = "${connectionString}";
    const dbName = "${dbName}";
    const collectionName = "${collectionName}";
    const windowDays = 30;

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const windowStartId = ObjectId.createFromTime(Math.floor(windowStart.getTime() / 1000));

    const safeIso = (d: unknown) => (d instanceof Date ? d.toISOString() : null);

    async function main() {
      const startedAt = Date.now();

      const client = new MongoClient(connectionString, {
        autoEncryption: await getAutoEncryptionOptions(),
      });

      await client.connect();
      try {
        const coll = client.db(dbName).collection(collectionName);

        const [estimatedAllTime, exactAllTime] = await Promise.all([
          coll.estimatedDocumentCount(),
          coll.countDocuments({}),
        ]);

        // Time field: prefer createdAt if present, else fall back to ObjectId time.
        // We intentionally avoid range queries on potentially encrypted timestamp fields.
        const createdPerDay = await coll
          .aggregate([
            {
              $addFields: {
                __t: {
                  $cond: [
                    { $eq: [{ $type: "$createdAt" }, "date"] },
                    "$createdAt",
                    { $toDate: "$_id" },
                  ],
                },
              },
            },
            { $match: { _id: { $gte: windowStartId }, __t: { $gte: windowStart, $lt: now } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$__t" } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();

        const executionTimeMs = Date.now() - startedAt;
        return {
          summary: `${collectionName}: allTimeExact=${exactAllTime}, allTimeEstimated=${estimatedAllTime}`,
          data: {
            totals: { allTimeEstimated: estimatedAllTime, allTimeExact: exactAllTime },
            window: { days: windowDays, start: safeIso(windowStart), end: safeIso(now) },
            createdPerDay: createdPerDay.map((x) => ({ day: x._id, count: x.count })),
          },
          count: exactAllTime,
          metadata: {
            encrypted: true,
            executionTimeMs,
            pagesProcessed: 1,
            sortStrategy: { field: "_id", direction: "descending", inMemory: false },
            notes: "CSFLE client enabled; no raw docs returned",
          },
          carryForward: { dbName, collectionName, timeFieldUsed: "createdAt||_id" },
        };
      } finally {
        await client.close();
      }
    }

    main()
      .then((out) => {
        // Print ONLY JSON
        process.stdout.write(JSON.stringify(out));
      })
      .catch((e) => {
        process.stdout.write(
          JSON.stringify({
            error: String(e?.message || e),
            phase: "Phase 5: Execute Query",
            suggestions: "Re-run node set-aws-identity.js; verify aws sts get-caller-identity; ensure proxy is running if proxy params are present",
          }),
        );
        process.exitCode = 1;
      });
    ```
    
    ```bash
    cd /home/pragadeesh/Documents/anyo/anyobackendapi
    npx ts-node src/temp/prod-query-<timestamp>.ts
    ```
    
    ## Phase 6: Return JSON Response
    
    **REQUIRED STRUCTURE:**
    
    ```json
    {
      "summary": "Found 342 verified Gmail users (sorted by latest first)",
      "data": [
        {"_id": "...", "email": "...", "emailVerified": true, "createdAt": "2026-02-28T..."},
        // First 10 results with key fields only
      ],
      "count": 342,
      "metadata": {
        "encrypted": true,
        "executionTimeMs": 1234,
        "pagesProcessed": 4,
        "sortStrategy": {
          "field": "_id",
          "direction": "descending",
          "inMemory": false
        },
        "notes": "Email field uses deterministic encryption, can query directly. Sorted by _id descending (latest documents first)"
      },
      "carryForward": {
        "queryUsed": {"email": {"$regex": "@gmail.com$"}, "emailVerified": true},
        "sortUsed": {"_id": -1},
        "collectionStats": {"totalDocs": 50000, "avgDocSize": "2KB"}
      }
    }
    ```
    
    **summary:** High-level answer to user's question (1-2 sentences, mention sort order)
    **data:** First 10 results max, key fields only (not full documents)
    **count:** Total number of results found
    **metadata.encrypted:** Was CSFLE client used?
    **metadata.executionTimeMs:** Query execution time
    **metadata.pagesProcessed:** How many pagination rounds?
    **metadata.sortStrategy.field:** Which field was used for sorting
    **metadata.sortStrategy.direction:** "ascending" or "descending"
    **metadata.sortStrategy.inMemory:** Was sorting done in-memory (encrypted field)?
    **metadata.notes:** Any important observations, warnings, constraints
    **carryForward:** Useful context for follow-up queries (include sortUsed)
    
    **If query fails:**
    
    ```json
    {
      "error": "Descriptive error message",
      "phase": "Phase 4: Write Query Script",
      "details": "AWS credentials expired - run 'aws sso login'",
      "suggestions": "Verify AWS credentials: aws sts get-caller-identity"
    }
    ```
    
    ## Phase 7: Cleanup
    
    ```bash
    # Delete temp query script immediately
    rm /home/pragadeesh/Documents/anyo/anyobackendapi/src/temp/prod-query-*.ts
    ```
    
    ## Decision Matrix
    
    | Scenario | Your Decision |
    |----------|---------------|
    | No sort specified by user | Sort by `_id: -1` (latest first, DEFAULT) |
    | User requests "oldest first" | Sort by `createdAt: 1` or `_id: 1` |
    | User-provided connection string | Use directly, no Secrets Manager needed |
    | Encrypted collection with user string | Add autoEncryption to clientOptions, requires AWS creds |
    | Collection in encryptedCollections | Use CSFLE client (autoEncryption option) |
    | Large result set (1000+ docs) | Auto-paginate with sort, fetch ALL pages |
    | Sort by encrypted field | Fetch all → sort in-memory → return sorted |
    | Sort by non-encrypted field | Add `.sort()` directly to MongoDB query |
    | Query Random encrypted field | Fetch all → filter in-memory |
    | Query Deterministic encrypted field | CAN query directly (equality only) |
    | Multiple collections needed | Execute separate queries, join in-memory |
    | Complex aggregation | Use aggregation pipeline if no encrypted sorting |
    
    ## Encrypted Collections Reference
    
    From `db.ts:313-342`, these collections use CSFLE:
    
    - Collections.SESSION_FEEDBACK (anyoDb) - feedback.* fields encrypted
    - Collections.USER_FORM (anyoDb) - formDetails encrypted
    - Collections.THERAPY_PLAN_SUBSCRIPTIONS (anyoDb) - planSummary encrypted
    - Collections.APP_EVENTS_LOG (anyoDb) - ip, deviceFingerPrint encrypted
    - Collections.EXPERT_ONBOARDING_REQUEST (anyoDb) - bankDetails encrypted
    - Collections.OTP (notifications) - otp encrypted
    - Collections.SESSION_FEEDBACK_ANALYSIS (anyoDb) - review, suggestions encrypted
    - Collections.MS_TEAMS_MEMBERS (anyoDb) - name, email, etc. encrypted
    - Collections.ANYO_LAB_REPORTS (anyoDb) - patientName, labName, etc. encrypted
    - Collections.MEAL_TRACKER_LOGS (anyoDb) - userId, fileName encrypted
    - Collections.USER_WATER_LOGS (anyoDb) - userId encrypted
    - Collections.USER_MOOD_LOGS (anyoDb) - userId encrypted
    - Collections.USER_RHYTHM_CONFIG (anyoDb) - health metrics encrypted
    - Collections.RHYTHM_FLOW_* (anyoDb) - various health data encrypted
    - Collections.USERS (authDb) - keyDerivationSalt, keyDerivationIterations encrypted
    - Collections.EMAIL_JOBS (agendaDb) - emailData encrypted
    - Collections.LLM_LOGS (anyoDb) - prompt, response encrypted
    - Collections.RHYTHM_FLOW_INSIGHTS_HISTORY (anyoDb) - health insights encrypted
    
    ## Safety Rules
    
    **NEVER:**
    - Execute write operations (code enforces this)
    - Return full production documents (summarize key fields only)
    - Stop pagination early (fetch ALL pages automatically)
    - Query without understanding encryption
    - Leave temp files behind
    - Use server-side `$group` / `$sort` on encrypted fields as the default approach; if you need those breakdowns, decrypt client-side and aggregate in-memory (with a hard cap)
    
    **ALWAYS:**
    - Use CredentialManager for AWS credentials
    - Get MongoDB creds from Secrets Manager (PROD_MONGO_CREDS)
    - Use CSFLE client for encrypted collections
    - Include execution time and pages processed in metadata
    - Clean up temp files immediately
    - Return first 10 results max in data field
    - Log progress for multi-page queries
    
    ## Before You Begin
    
    **Prerequisites Check:**
    1. AWS credentials active? (user ran `node set-aws-identity.js`)
    2. Connection string provided by user
    3. Proxy running on localhost:1080? (if connection string uses proxy)
    
    If you have questions about:
    - Which collection to query
    - What fields exist
    - What the user really needs
    - Ambiguous requirements
    
    **Ask them now.** Clarify before starting work.
    
    ## Your Authority
    
    You have FULL technical authority to decide:
    - Query structure and optimization
    - Pagination strategy (but always fetch ALL)
    - How to handle encryption constraints
    - In-memory processing approach
    - How to summarize results
    - What metadata to include in carryForward
    
    Main agent trusts your technical expertise completely.
```
