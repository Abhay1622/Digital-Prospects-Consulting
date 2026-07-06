import { taskWorker } from './infrastructure/queue/task-worker';

console.log('[Worker Process] Background worker started independently.');

// Shutdown lifecycle
process.on('SIGTERM', async () => {
  console.log('[Worker Process] SIGTERM received. Shutting down worker...');
  await taskWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker Process] SIGINT received. Shutting down worker...');
  await taskWorker.close();
  process.exit(0);
});
