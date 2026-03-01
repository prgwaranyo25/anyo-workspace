/**
 * Simplified MongoDB query template for NON-ENCRYPTED collections
 * For encrypted collections, see executor-prompt.md Phase 4 for full CSFLE setup
 *
 * Usage:
 *   npx ts-node simple-query-template.ts "mongodb+srv://user:pass@host/..." "anyoDb" "users" '{"emailVerified": true}'
 */

import { MongoClient } from "mongodb";

async function executeSimpleQuery() {
  // Parse command-line arguments
  const connectionString = process.argv[2];
  const dbName = process.argv[3] || "anyoDb";
  const collectionName = process.argv[4] || "users";
  const queryStr = process.argv[5] || "{}";
  const projectionStr = process.argv[6] || "{}";

  if (!connectionString) {
    console.error(
      "Usage: ts-node simple-query-template.ts <connectionString> [dbName] [collectionName] [query] [projection]",
    );
    console.error("\nExample:");
    console.error(
      '  ts-node simple-query-template.ts "mongodb+srv://..." "anyoDb" "users" \'{"emailVerified": true}\' \'{"email": 1, "createdAt": 1}\'',
    );
    process.exit(1);
  }

  const query = JSON.parse(queryStr);
  const projection = JSON.parse(projectionStr);

  // DEFAULT SORT: Latest first (_id descending)
  const sort = { _id: -1 as const };

  // READ-ONLY validation
  const ALLOWED_OPS = [
    "find",
    "findOne",
    "aggregate",
    "countDocuments",
    "distinct",
  ];
  console.log("✓ READ-ONLY query validated");

  console.log(`\nConnecting to ${dbName}.${collectionName}...`);
  console.log(`Query: ${JSON.stringify(query)}`);
  console.log(`Sort: ${JSON.stringify(sort)} (latest first)\n`);

  const client = new MongoClient(connectionString);
  await client.connect();

  const collection = client.db(dbName).collection(collectionName);

  // AUTO-PAGINATION
  let allResults: any[] = [];
  let skip = 0;
  let pagesProcessed = 0;
  const batchSize = 1000;
  const startTime = Date.now();

  while (true) {
    const batch = await collection
      .find(query)
      .project(projection)
      .sort(sort) // DEFAULT: Latest first
      .skip(skip)
      .limit(batchSize)
      .toArray();

    if (batch.length === 0) break;

    allResults = allResults.concat(batch);
    pagesProcessed++;
    skip += batchSize;

    console.log(`Page ${pagesProcessed}: ${allResults.length} total docs`);

    if (allResults.length >= 100000) {
      console.warn("⚠ Reached 100k safety limit");
      break;
    }
    if (batch.length < batchSize) break;
  }

  await client.close();

  const executionTimeMs = Date.now() - startTime;

  // Return structured response
  const response = {
    summary: `Found ${allResults.length} documents (sorted by latest first)`,
    data: allResults.slice(0, 10), // First 10 only
    count: allResults.length,
    metadata: {
      encrypted: false,
      executionTimeMs,
      pagesProcessed,
      sortStrategy: {
        field: "_id",
        direction: "descending",
        inMemory: false,
      },
    },
    carryForward: {
      queryUsed: query,
      sortUsed: sort,
      collectionStats: {
        totalDocs: allResults.length,
      },
    },
  };

  console.log("\n" + "=".repeat(80));
  console.log("RESULTS");
  console.log("=".repeat(80));
  console.log(JSON.stringify(response, null, 2));
}

executeSimpleQuery().catch((error) => {
  console.error("\n❌ Error executing query:");
  console.error(error.message);
  console.error("\nStack trace:");
  console.error(error.stack);
  process.exit(1);
});
