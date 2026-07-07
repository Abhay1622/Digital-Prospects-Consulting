# Real-Time Task Processing System

A production-grade, highly performant backend system for submitting, queueing, caching, retrying, and monitoring tasks in real time. 

Built using **Node.js**, **TypeScript**, **PostgreSQL** (via Prisma), **Redis**, **BullMQ**, and native **WebSockets**.

---

## Architecture Overview

The system follows **Clean Architecture** principles to separate core business entities, interfaces, implementation repositories, and the delivery mechanisms (HTTP/WebSockets).

```mermaid
flowchart TD
    Client[HTTP / WebSocket Client]
    
    subgraph Express Application
        API[Express Router]
        Ctrl[Task Controller]
        WS[WebSocket Broadcast Server]
    end
    
    subgraph Data & Queue Layers
        DB[(PostgreSQL Database)]
        Cache[(Redis Cache)]
        Queue[(BullMQ Redis Queue)]
    end
    
    subgraph Background Processing
        Worker[Queue Workers]
    end
    
    Client -->|1. POST /tasks| API
    API -->|2. Check Idempotency| Ctrl
    Ctrl -->|3. Read/Write| DB
    Ctrl -->|4. Push to Queue| Queue
    
    Queue -->|5. Dequeue| Worker
    Worker -->|6. Simulated Delay & Failure| Worker
    Worker -->|7. Update Status| DB
    Worker -->|8. Set Cache| Cache
    Worker -->|9. Trigger Broadcast| WS
    
    WS -->|10. Real-time Status Stream| Client
    Client -->|11. GET /tasks/:id| API
    API -->|12. Cache Check| Cache
    Cache -.->|If Expired| DB
```

### Key Components
1.  **Presentation Layer (`src/presentation`)**: Express APIs for creating, listing, and getting task details.
2.  **WebSocket Layer (`src/infrastructure/websocket`)**: Real-time server that broadcasts task state updates (`PROCESSING`, `COMPLETED`, `FAILED`) to clients subscribing to individual tasks or all notifications.
3.  **Queue System (`src/infrastructure/queue`)**: BullMQ backed by Redis for scheduling background processing tasks, handling retries, and managing backoffs.
4.  **Database Persistence (`src/infrastructure/database`)**: PostgreSQL database accessed through Prisma ORM for permanent storage of task entity states.
5.  **Caching Layer (`src/infrastructure/cache`)**: Redis status cache with a TTL of 45 seconds to intercept `GET /tasks/:id` hits and prevent unnecessary database queries.

---

## Key Features & Core Logic

### 1. Idempotency (No Duplicate Tasks)
*   To prevent duplicate processing of the same request, every task creation (`POST /tasks`) requires an `x-idempotency-key` in the request header.
*   Before processing, the database is scanned for an existing task with that key.
*   **Duplicate Request:** If found, the server bypasses the worker queue and returns the existing task object with a status code of `200 OK` and the response header `X-Idempotency-Duplicate: true`.
*   **Unique Request:** If not found, a new task is persisted as `PENDING`, added to the queue, and a `201 Created` status code is returned.

### 2. Background Processing & Retry Logic
*   Tasks are processed asynchronously by a BullMQ worker with a simulated processing duration of **2–5 seconds**.
*   **Simulated Instability:** Each run has a **30% random failure rate**.
*   **Automatic Retries:** If a task fails, BullMQ catches the thrown error and automatically schedules a retry with **exponential backoff** (base delay: 2000ms).
*   **Attempts Counter:** A task will run up to **3 times** total. If it fails on the 3rd attempt, its status is updated to `FAILED`, the final error log is saved in the task's `result` column, and the state transition is broadcasted.

### 3. Redis Caching Strategy
*   To fetch task statuses, `GET /tasks/:id` first queries the Redis cache (`task:status:<id>`).
*   **Cache Hit (`X-Cache: HIT`):** Resolves in < 5ms, retrieving values directly from Redis memory.
*   **Cache Miss (`X-Cache: MISS`):** Queries PostgreSQL, writes the result to Redis with a **45-second Time-To-Live (TTL)**, and returns.
*   **Cache Invalidation:** To keep cache consistency, any state transition (e.g. `PENDING` ➔ `PROCESSING` ➔ `COMPLETED`/`FAILED`) invalidates the Redis key, ensuring the client receives the updated task status.

---

## Setup & Running the Project

### Environment Variables (.env)
Create a `.env` file in the root directory. You can use your cloud PostgreSQL and Redis credentials:
```env
PORT=3000
DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"
REDIS_URL="redis://default:password@host:port"
```

### Option A: Local Host Machine
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Synchronize Database Schema**:
    ```bash
    npx prisma db push
    ```
3.  **Start Dev Server & Worker** (Combined process for easy local testing):
    ```bash
    npm run dev
    ```
4.  **Run Automated Client Simulator**:
    ```bash
    npm run simulate
    ```

---

### Option B: Docker Compose (Production Environment Setup)
The project is configured to run the web application server and the queue worker as two separate container services built from a lightweight alpine base image.

1.  **Build and start containers**:
    ```bash
    docker-compose up --build
    ```
    *   This spins up the `web` container on `localhost:3000` (handling REST and WS clients) and the independent `worker` container, which processes jobs pulled from the Redis.io cloud queue.
