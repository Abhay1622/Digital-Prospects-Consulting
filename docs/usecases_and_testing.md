# Project Use Cases and Testing Guide

This document outlines the core use cases of the **Real-Time Task Processing System** and provides step-by-step instructions on how to test them.

---

## Use Cases

### 1. Task Creation & Queueing (POST `/tasks`)
*   **Goal:** Allow users/clients to submit tasks for asynchronous background processing.
*   **Workflow:**
    1. Client sends a `POST` request to `/tasks` with a payload specifying the `type` of task (e.g., `EMAIL_SEND`, `IMAGE_RESIZE`, `DATA_EXPORT`) and optional inputs.
    2. The request **must** contain an `x-idempotency-key` header containing a unique identifier (like a UUID).
    3. The server checks the PostgreSQL database for an existing task with the same `idempotencyKey`:
        *   **If found (Duplicate):** Returns the existing task status immediately without creating a new task or queueing it.
        *   **If not found:** A new task record is saved in PostgreSQL with status `PENDING`, and it is pushed onto the Redis-backed **BullMQ** queue.
    4. The server returns `201 Created` with the newly created Task object.

### 2. Real-Time Status Subscriptions (WebSockets)
*   **Goal:** Inform clients about state transitions (`PENDING` ➔ `PROCESSING` ➔ `COMPLETED` or `FAILED`) immediately without polling.
*   **Workflow:**
    1. A client opens a WebSocket connection to `ws://localhost:3000`.
    2. Once connected, the client can subscribe to updates:
        *   By sending a JSON subscription payload: `{"action": "subscribe", "taskId": "TASK_UUID"}` (to watch a single task).
        *   Or by sending: `{"action": "subscribe", "taskId": "all"}` (to watch all tasks).
    3. As the task progresses, the background worker broadcasts status updates via the WebSocket connection to all subscribed clients.

### 3. Background Processing & Random Failure Simulation
*   **Goal:** Simulates realistic long-running workloads, failure rates, and auto-retry logic.
*   **Workflow:**
    1. A BullMQ worker pulls the task from the queue.
    2. The task status transitions to `PROCESSING` in the database, and this transition is broadcasted.
    3. The worker pauses for a random delay between 2 and 5 seconds to simulate processing time.
    4. To simulate network/service instability, the worker has a **30% random failure rate**.
    5. **If it fails:** It throws an error. BullMQ catches this and executes the retry policy (up to 3 times total). The system logs the failure and increments the `attempts` count.
    6. **If it succeeds:** The task transitions to `COMPLETED`, the result payload is saved to PostgreSQL, and the cache is updated.
    7. **If all 3 retries fail:** The task transitions to `FAILED` with the final error message stored in the database.

### 4. Cached Task Status Retrieval (GET `/tasks/:id`)
*   **Goal:** Retrieve the status of a specific task quickly without putting unnecessary load on the PostgreSQL database.
*   **Workflow:**
    1. The client sends a `GET` request to `/tasks/:id`.
    2. The server checks Redis under the key `task:status:<id>`:
        *   **Cache Hit:** If found, the server immediately returns the cached status response (very low latency).
        *   **Cache Miss:** If not found, the server queries the PostgreSQL database. If found in the database, it saves the status to Redis with a TTL of 30–60 seconds, then returns the response.
    3. *Cache Invalidation:* When the task status transitions (e.g. to `COMPLETED` or `FAILED`), the database updates, and the cached version in Redis is automatically invalidated or updated to maintain data consistency.

### 5. Listing Tasks (GET `/tasks`)
*   **Goal:** Provide an administrative view of all tasks in the system.
*   **Workflow:**
    1. Client sends a `GET` request to `/tasks`.
    2. The server queries PostgreSQL for the latest tasks, sorted by creation date, and returns the list.

---

## Testing Procedures

### 1. Pre-requisites
Ensure you have Node.js (v18+) installed. You will use the hosted Neon PostgreSQL and Redis.io instances provided.
Configure your `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"
REDIS_URL="redis://default:password@host:port"
```

### 2. Manual Testing with Postman
A Postman collection `postman_collection.json` is provided in the project root.
1. **Submit a Task:**
   * Method: `POST`
   * URL: `http://localhost:3000/tasks`
   * Headers:
     * `Content-Type: application/json`
     * `x-idempotency-key: test-key-123`
   * Body: `{"type": "EMAIL_SEND"}`
   * *Verify:* The first call returns `201 Created`. Sending the request a second time with the *same* header returns `200 OK` and the exact same task without creating a duplicate.
2. **Get Task Status:**
   * Method: `GET`
   * URL: `http://localhost:3000/tasks/<id>`
   * *Verify:* The first request fetches from PostgreSQL (Cache Miss). Subsequent requests fetch from Redis (Cache Hit) until the TTL expires.
3. **List Tasks:**
   * Method: `GET`
   * URL: `http://localhost:3000/tasks`
   * *Verify:* Returns a JSON array of all submitted tasks.

### 3. Automated Simulation Testing
We will include a built-in simulation script `src/test-client.ts` to test everything concurrently:
1. Run the server: `npm run dev`
2. Run the simulation script: `npm run simulate`
This script will:
* Connect to the WebSockets server and subscribe to all events.
* Send 5 concurrent task requests.
* Log all real-time events (`pending` -> `processing` -> `completed/failed` with retry count changes).
* Demonstrate how duplicates are caught by the idempotency layer.
