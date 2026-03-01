---
name: mongo-access
description: Access and query the local MongoDB instance (anyoDb, authDb, etc.) using mongosh
license: MIT
compatibility: opencode
---

## What I do
- Inspect, query, and modify data in the local MongoDB instance.
- Troubleshoot database-related issues by checking actual state.
- Use `mongosh` via the bash tool to execute JavaScript-based MongoDB queries.

## When to use me
- Use this when the user asks to "check the database", "find a user", "debug DB data", or specific collection queries.
- When you need to verify if data was correctly written after an API call.

## How to use
Execute commands using the bash tool. Always specify the database (default is usually `anyoDb`).

Examples:
- List databases: `mongosh --eval "db.adminCommand('listDatabases')"`
- Find a user: `mongosh anyoDb --eval "db.users.findOne({email: 'test@example.com'})"`
- Count records: `mongosh anyoDb --eval "db.sessions.countDocuments({})"`
