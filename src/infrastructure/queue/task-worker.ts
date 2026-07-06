import { Worker, Job } from 'bullmq';
import { config } from '../../config/env';
import { PrismaTaskRepository } from '../database/prisma-task-repository';
import { RedisCache } from '../cache/redis-cache';
import { broadcastTaskUpdate } from '../websocket/websocket-server';

const repository = new PrismaTaskRepository();

// Background Queue Worker uses Redis URL string directly for connection

export const taskWorker = new Worker(
  'task-queue',
  async (job: Job) => {
    const { taskId, type } = job.data;
    const attempt = job.attemptsMade + 1; // Current attempt number (1-indexed)

    console.log(`[Worker] Processing job ${job.id} (Attempt ${attempt}/3) of type ${type}`);

    // 1. Update task to PROCESSING in the database
    const task = await repository.update(taskId, {
      status: 'PROCESSING',
      attempts: attempt,
    });

    // 2. Invalidate cache to ensure GET status is accurate
    await RedisCache.invalidate(taskId);

    // 3. Broadcast status to WebSocket clients
    broadcastTaskUpdate(taskId, 'PROCESSING', attempt, null);

    // 4. Simulate a background delay of 2–5 seconds
    const delayMs = Math.floor(Math.random() * 3000) + 2000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // 5. Simulate a random failure of 30%
    if (Math.random() < 0.3) {
      console.warn(`[Worker] Job ${job.id} failed simulation on attempt ${attempt}`);
      throw new Error(`Random processing failure simulated (Attempt ${attempt})`);
    }

    // 6. On success: Update database, Cache the completed state, and Broadcast
    const result = {
      message: `Task completed successfully`,
      durationMs: delayMs,
      completedAt: new Date().toISOString(),
    };

    const updatedTask = await repository.update(taskId, {
      status: 'COMPLETED',
      result,
    });

    // Cache the status with TTL 45 seconds
    await RedisCache.set(taskId, updatedTask);

    broadcastTaskUpdate(taskId, 'COMPLETED', attempt, result);
    console.log(`[Worker] Job ${job.id} successfully completed`);
    return result;
  },
  {
    connection: config.redisConnection,
    concurrency: 5, // Handle concurrent requests safely
  }
);

// Listen to failed job events (both intermediate and final)
taskWorker.on('failed', async (job: Job | undefined, err: Error) => {
  if (!job) return;

  const { taskId } = job.data;
  const attemptsMade = job.attemptsMade; // Incremented by BullMQ after the failure
  const maxAttempts = job.opts.attempts || 3;

  console.error(`[Worker] Job ${job.id} failed: ${err.message}. Attempts made: ${attemptsMade}/${maxAttempts}`);

  if (attemptsMade >= maxAttempts) {
    // This was the final failure (no more retries left)
    const result = {
      error: err.message,
      failedAt: new Date().toISOString(),
    };

    const updatedTask = await repository.update(taskId, {
      status: 'FAILED',
      result,
    });

    // Cache the final FAILED state
    await RedisCache.set(taskId, updatedTask);

    broadcastTaskUpdate(taskId, 'FAILED', attemptsMade, result);
    console.log(`[Worker] Job ${job.id} permanently failed after ${attemptsMade} attempts`);
  } else {
    // Intermediate failure, retry will be scheduled
    const result = {
      error: err.message,
      nextAttemptInMs: Math.pow(2, attemptsMade) * 2000, // Exponential backoff math
    };

    await repository.update(taskId, {
      result,
    });

    await RedisCache.invalidate(taskId);
    
    // Broadcast that it failed this attempt but is still processing/retrying
    broadcastTaskUpdate(taskId, 'PROCESSING', attemptsMade, result);
  }
});

taskWorker.on('error', (err) => {
  console.error('[Worker] Global worker error:', err);
});
