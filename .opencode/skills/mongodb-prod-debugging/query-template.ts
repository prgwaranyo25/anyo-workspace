/**
 * MongoDB Production Query Template
 *
 * This is a working template for querying production MongoDB with CSFLE support.
 * Subagents can adapt this template for specific queries.
 *
 * SAFETY: This template enforces READ-ONLY operations.
 */

import { MongoClient } from "mongodb";
import { CredentialManager } from "../common/aws-services/CredentialManager";
import { getAutoEncryptionOptions } from "../common/csfle/keyManager";
import {
  getAWSSecret,
  AWSSecretManagerKeys,
  MongoCreds,
} from "../common/aws-services/awsSecretManagerService";
import {
  Collections,
  ANYO_DB,
  AUTH_DB,
  META_DB,
  NOTIFICATIONS_DB,
  AGENDA_JOB_DB,
} from "../common/services/db";

// ============================================================================
// CONFIGURATION - Modify these for your specific query
// ============================================================================

const QUERY_CONFIG = {
  // Database and collection
  database: ANYO_DB, // Change to: AUTH_DB, META_DB, NOTIFICATIONS_DB, or AGENDA_JOB_DB
  collection: Collections.USERS, // Change to your target collection

  // Query filter
  filter: {
    // Example: { emailVerified: true, createdAt: { $gte: new Date('2026-01-01') } }
  },

  // Projection (fields to return)
  projection: {
    // Example: { _id: 1, email: 1, emailVerified: 1, createdAt: 1 }
  },

  // Sort (IMPORTANT: cannot sort on encrypted fields!)
  sort: {
    // Example: { createdAt: -1 }
  },

  // Pagination
  batchSize: 1000,
  maxDocuments: 100000, // Safety limit
};

// ============================================================================
// ENCRYPTED COLLECTIONS LIST - From db.ts:313-342
// ============================================================================

const ENCRYPTED_COLLECTIONS: string[] = [
  Collections.SESSION_FEEDBACK,
  Collections.USER_FORM,
  Collections.THERAPY_PLAN_SUBSCRIPTIONS,
  Collections.APP_EVENTS_LOG,
  Collections.EXPERT_ONBOARDING_REQUEST,
  Collections.OTP,
  Collections.SESSION_FEEDBACK_ANALYSIS,
  Collections.MS_TEAMS_MEMBERS,
  Collections.ANYO_LAB_REPORTS,
  Collections.ANYO_LAB_REPORTS_META,
  Collections.MEAL_TRACKER_LOGS,
  Collections.USER_WATER_LOGS,
  Collections.USER_MOOD_LOGS,
  Collections.USER_RHYTHM_CONFIG,
  Collections.RHYTHM_FLOW_CYCLES,
  Collections.RHYTHM_FLOW_PROFILE,
  Collections.RHYTHM_FLOW_SYMPTOM_LOGS,
  Collections.RHYTHM_FLOW_SYMPTOM_DEFINITIONS,
  Collections.USERS,
  Collections.EMAIL_JOBS,
  Collections.RHYTHM_FLOW_INSIGHTS_HISTORY,
  Collections.LLM_LOGS,
];

// ============================================================================
// READ-ONLY ENFORCEMENT
// ============================================================================

function validateReadOnly(operation: string): void {
  const ALLOWED_OPERATIONS = [
    "find",
    "findOne",
    "aggregate",
    "countDocuments",
    "distinct",
  ];

  if (!ALLOWED_OPERATIONS.includes(operation)) {
    throw new Error(
      `❌ FORBIDDEN OPERATION: ${operation}\n\n` +
        `This script enforces READ-ONLY access to production.\n` +
        `Allowed operations: ${ALLOWED_OPERATIONS.join(", ")}\n\n` +
        `For write operations, use proper change management processes.`,
    );
  }
}

// ============================================================================
// MAIN QUERY EXECUTION
// ============================================================================

async function executeProductionQuery() {
  const startTime = Date.now();
  console.log("🔍 MongoDB Production Query Executor");
  console.log("=====================================\n");

  try {
    // Phase 1: Verify AWS credentials
    console.log("Phase 1: Verifying AWS credentials...");
    const credentials = await CredentialManager.getCredentials();
    if (!credentials) {
      throw new Error(
        "AWS credentials not available. Run: aws sts get-caller-identity",
      );
    }
    console.log("✓ AWS credentials verified\n");

    // Phase 2: Get MongoDB credentials from Secrets Manager
    console.log("Phase 2: Fetching MongoDB credentials...");
    const mongoCreds = await getAWSSecret<MongoCreds>(
      AWSSecretManagerKeys.PROD_MONGO_CREDS,
    );
    if (!mongoCreds) {
      throw new Error(
        "MongoDB credentials not found in AWS Secrets Manager (PROD_MONGO_CREDS)",
      );
    }
    console.log("✓ MongoDB credentials retrieved\n");

    // Phase 3: Check if collection is encrypted
    const isEncrypted = ENCRYPTED_COLLECTIONS.includes(QUERY_CONFIG.collection);
    console.log(
      `Phase 3: Collection ${QUERY_CONFIG.collection} is ${isEncrypted ? "ENCRYPTED" : "NOT ENCRYPTED"}`,
    );

    // Phase 4: Configure MongoDB client
    console.log("Phase 4: Configuring MongoDB client...");
    const connectionString =
      "mongodb+srv://anyo-prod-db-pl-0.hlsov.mongodb.net";

    const clientOptions: any = {
      authSource: "admin",
      auth: {
        username: mongoCreds.MONGO_USERNAME,
        password: mongoCreds.MONGO_PASSWORD,
      },
      tls: true,
      retryWrites: true,
    };

    // Add CSFLE if collection is encrypted
    if (isEncrypted) {
      console.log(
        "   → Configuring Client-Side Field Level Encryption (CSFLE)",
      );
      clientOptions.autoEncryption = await getAutoEncryptionOptions();
    }

    const client = new MongoClient(connectionString, clientOptions);
    await client.connect();
    console.log("✓ Connected to production MongoDB\n");

    // Phase 5: Validate READ-ONLY operation
    validateReadOnly("find"); // Change if using different operation

    // Phase 6: Execute query with automatic pagination
    console.log("Phase 5: Executing query with automatic pagination...");
    console.log(`   Database: ${QUERY_CONFIG.database}`);
    console.log(`   Collection: ${QUERY_CONFIG.collection}`);
    console.log(`   Filter: ${JSON.stringify(QUERY_CONFIG.filter)}`);
    console.log("");

    const collection = client
      .db(QUERY_CONFIG.database)
      .collection(QUERY_CONFIG.collection);

    let allResults: any[] = [];
    let skip = 0;
    let pagesProcessed = 0;

    // AUTOMATIC PAGINATION LOOP
    while (true) {
      const batch = await collection
        .find(QUERY_CONFIG.filter)
        .project(QUERY_CONFIG.projection)
        .sort(QUERY_CONFIG.sort)
        .skip(skip)
        .limit(QUERY_CONFIG.batchSize)
        .toArray();

      if (batch.length === 0) break;

      allResults = allResults.concat(batch);
      pagesProcessed++;
      skip += QUERY_CONFIG.batchSize;

      console.log(
        `   Page ${pagesProcessed}: +${batch.length} docs (total: ${allResults.length})`,
      );

      // Safety limit
      if (allResults.length >= QUERY_CONFIG.maxDocuments) {
        console.warn(
          `\n⚠️  WARNING: Reached safety limit of ${QUERY_CONFIG.maxDocuments} documents`,
        );
        console.warn(
          "   Stopping pagination to prevent excessive data fetch.\n",
        );
        break;
      }

      // Last page detection
      if (batch.length < QUERY_CONFIG.batchSize) break;
    }

    const executionTime = Date.now() - startTime;

    await client.close();
    console.log("\n✓ Query execution completed");

    // Phase 7: Prepare response
    console.log("\nPhase 6: Preparing response...");

    // Summarize first 10 results (key fields only)
    const summarizedData = allResults.slice(0, 10).map((doc) => {
      // Extract only key fields - modify based on collection
      const { _id, createdAt, updatedAt, ...rest } = doc;
      return {
        _id,
        createdAt,
        updatedAt,
        // Add other important fields specific to your query
        ...Object.fromEntries(
          Object.entries(rest).slice(0, 3), // First 3 additional fields
        ),
      };
    });

    const response = {
      summary: `Found ${allResults.length} documents in ${QUERY_CONFIG.collection}`,
      data: summarizedData,
      count: allResults.length,
      metadata: {
        encrypted: isEncrypted,
        executionTimeMs: executionTime,
        pagesProcessed: pagesProcessed,
        notes: isEncrypted
          ? "Collection uses CSFLE - encrypted fields were automatically decrypted"
          : "Collection is not encrypted",
      },
      carryForward: {
        queryUsed: QUERY_CONFIG.filter,
        collectionStats: {
          totalDocuments: allResults.length,
          paginationBatchSize: QUERY_CONFIG.batchSize,
        },
      },
    };

    // Phase 8: Output JSON result
    console.log("\n=====================================");
    console.log("📊 QUERY RESULT (JSON)");
    console.log("=====================================\n");
    console.log(JSON.stringify(response, null, 2));

    return response;
  } catch (error: any) {
    // Error handling
    const executionTime = Date.now() - startTime;

    console.error("\n❌ QUERY FAILED");
    console.error("=====================================\n");

    const errorResponse = {
      error: error.message,
      phase: "Query Execution",
      details: error.stack,
      suggestions: getSuggestions(error),
      metadata: {
        executionTimeMs: executionTime,
      },
    };

    console.error(JSON.stringify(errorResponse, null, 2));

    process.exit(1);
  }
}

// ============================================================================
// ERROR SUGGESTIONS
// ============================================================================

function getSuggestions(error: any): string {
  const message = error.message.toLowerCase();

  if (message.includes("credentials")) {
    return "Verify AWS credentials: aws sts get-caller-identity";
  }

  if (message.includes("kms")) {
    return "Check KMS key access: aws kms describe-key --key-id <ARN>";
  }

  if (message.includes("authentication failed")) {
    return "MongoDB credentials may be incorrect or expired in Secrets Manager";
  }

  if (message.includes("network") || message.includes("connection")) {
    return "Check network connectivity to production MongoDB cluster";
  }

  if (message.includes("forbidden")) {
    return "This script only allows READ operations. Use change management for writes.";
  }

  return "Review error details above and consult MongoDB/AWS documentation";
}

// ============================================================================
// EXECUTE
// ============================================================================

executeProductionQuery()
  .then(() => {
    console.log("\n✓ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error.message);
    process.exit(1);
  });
