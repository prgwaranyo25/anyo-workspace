# MongoDB Production Debugging Skill

Read-only MongoDB production query skill using subagent-based execution.

## Files

- **SKILL.md** - Main skill definition (loaded by OpenCode agents)
- **executor-prompt.md** - Subagent dispatch template
- **query-template.ts** - Working TypeScript template for production queries

## How It Works

1. **Main agent** identifies need for production data
2. **Main agent** verifies request is read-only
3. **Main agent** dispatches subagent using `executor-prompt.md`
4. **Subagent** handles everything:
   - Reads schema from codebase (db.ts, keyManager.ts)
   - Detects encrypted collections automatically
   - Configures CSFLE if needed
   - Handles all pagination automatically
   - Returns summarized JSON response
5. **Main agent** presents results to user

## Key Features

- ✅ **Read-only enforced** - Code-level validation prevents writes
- ✅ **Auto-pagination** - Subagent fetches all pages automatically
- ✅ **Encryption detection** - Automatically uses CSFLE for encrypted collections
- ✅ **Context efficient** - Main agent never loads MongoDB code (~96% token savings)
- ✅ **Autonomous subagent** - Full technical authority to plan and execute

## Safety

**READ-ONLY ONLY:** This skill enforces read-only access by design. Write operations (insert, update, delete) are blocked at the code level.

**Allowed operations:**
- find(), findOne(), aggregate(), countDocuments(), distinct()

**Forbidden operations:**
- insert*(), update*(), delete*(), drop*(), createIndex(), bulkWrite()

## Usage Example

```typescript
// Main agent invokes skill when user asks for production data
skill({ name: "mongodb-prod-debugging" })

// Main agent dispatches subagent with requirements
Task(
  subagent_type="general",
  description="Execute MongoDB production query",
  prompt=`Read skills/mongodb-prod-debugging/executor-prompt.md...`
)

// Subagent returns JSON:
{
  "summary": "Found 342 verified users",
  "data": [/* first 10 results */],
  "count": 342,
  "metadata": {
    "encrypted": true,
    "executionTimeMs": 1234,
    "pagesProcessed": 4
  }
}
```

## Prerequisites

- AWS credentials configured (CredentialManager compatible)
- Access to production MongoDB cluster
- KMS key access for encrypted collections
- MongoDB credentials in AWS Secrets Manager (PROD_MONGO_CREDS)

## Encrypted Collections

The skill automatically detects and handles these encrypted collections:

- SESSION_FEEDBACK, USER_FORM, OTP
- THERAPY_PLAN_SUBSCRIPTIONS, APP_EVENTS_LOG
- MS_TEAMS_MEMBERS, ANYO_LAB_REPORTS
- MEAL_TRACKER_LOGS, USER_WATER_LOGS, USER_MOOD_LOGS
- RHYTHM_FLOW_*, USERS, EMAIL_JOBS
- LLM_LOGS, and more...

See `query-template.ts` for the complete list.

## Token Efficiency

**Without skill:**
- Main agent loads db.ts: ~30k tokens
- Main agent loads keyManager.ts: ~20k tokens
- Main agent loads models: ~10k tokens
- Query results in context: ~20k tokens
- **Total: ~80k tokens per query**

**With skill:**
- Main agent: ~2k tokens (orchestration only)
- Subagent handles everything (isolated context)
- Main agent receives JSON summary: ~1k tokens
- **Total: ~3k tokens per query**

**Savings: ~96% reduction** ✨

## Development

To test the query template directly:

```bash
cd /home/pragadeesh/Documents/anyo/anyobackendapi

# Modify QUERY_CONFIG in query-template.ts, then:
npx ts-node skills/mongodb-prod-debugging/query-template.ts
```

## Contributing

When modifying this skill:

1. Update encrypted collections list if new collections added
2. Test with both encrypted and non-encrypted collections
3. Verify read-only enforcement still works
4. Update examples if query patterns change
