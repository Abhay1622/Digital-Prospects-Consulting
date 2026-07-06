import { Queue } from 'bullmq';
import { config } from '../../config/env';

export const taskQueue = new Queue('task-queue', {
  connection: config.redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s base delay backoff
    },
    removeOnComplete: true, // Keep DB as source of truth, remove from Redis on completion
    removeOnFail: false,   // Keep fails in redis for analysis
  },
});

export async function enqueueTask(taskId: string, type: string) {
  // Use taskId as jobId to enforce unique job processing
  await taskQueue.add('process-task', { taskId, type }, { jobId: taskId });
}
