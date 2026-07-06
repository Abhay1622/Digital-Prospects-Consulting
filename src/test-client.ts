import WebSocket from 'ws';

const PORT = process.env.PORT || 3000;
const API_URL = `http://localhost:${PORT}/tasks`;
const WS_URL = `ws://localhost:${PORT}`;

const pendingTaskIds = new Set<string>();

async function main() {
  console.log('=== STARTING CONCURRENT TASK SIMULATION CLIENT ===');
  
  // 1. Establish WebSocket Connection
  const ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('[Test Client] Connected to WebSocket Server');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.event === 'task_update') {
        const { id, status, attempts, result } = message.data;
        console.log(`\n[WS Broadcast] Task Update received:`);
        console.log(`  ID:       ${id}`);
        console.log(`  Status:   ${status}`);
        console.log(`  Attempt:  ${attempts}`);
        console.log(`  Result:   ${result ? JSON.stringify(result) : 'None'}`);

        if (status === 'COMPLETED' || status === 'FAILED') {
          pendingTaskIds.delete(id);
          console.log(`[Test Client] Task ${id} finished with status ${status}. Remaining tasks monitored: ${pendingTaskIds.size}`);
          
          if (pendingTaskIds.size === 0) {
            console.log('\n=== ALL SIMULATED TASKS RESOLVED. SHUTTING DOWN TEST CLIENT ===');
            ws.close();
            process.exit(0);
          }
        }
      } else {
        console.log(`[WS System] ${JSON.stringify(message)}`);
      }
    } catch (err) {
      console.error('[Test Client] Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Test Client] WebSocket connection closed.');
  });

  // Wait 1.5 seconds for WebSocket to be fully established
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Generate unique idempotency keys for this test run so we don't collide with previous test runs
  const runId = Math.floor(Math.random() * 10000);
  const tasksToCreate = [
    { type: 'EMAIL_SEND', key: `key-email-${runId}` },
    { type: 'IMAGE_RESIZE', key: `key-image-${runId}` },
    { type: 'DATA_EXPORT', key: `key-export-${runId}` },
    { type: 'PDF_REPORT', key: `key-pdf-${runId}` },
    // Duplicate test tasks (same key)
    { type: 'DUPLICATE_TASK', key: `key-dup-${runId}` },
    { type: 'DUPLICATE_TASK', key: `key-dup-${runId}` }
  ];

  console.log(`\n[Test Client] Submitting ${tasksToCreate.length} tasks (including 1 duplicate to test idempotency)...`);

  for (const task of tasksToCreate) {
    try {
      console.log(`[Test Client] Sending POST /tasks with key: ${task.key}`);
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': task.key
        },
        body: JSON.stringify({ type: task.type })
      });

      const data = (await response.json()) as any;
      const isDuplicate = response.headers.get('X-Idempotency-Duplicate') === 'true';

      if (isDuplicate) {
        console.log(`[Test Client] API Response (Duplicate Catch): Task already exists in state: ${data.task.status}`);
      } else {
        const taskId = data.task.id;
        pendingTaskIds.add(taskId);
        console.log(`[Test Client] API Response (Created): Task ID: ${taskId}, Initial Status: ${data.task.status}`);
      }
    } catch (error) {
      console.error('[Test Client] Request failed:', error);
    }
  }

  console.log(`\n[Test Client] Monitoring status updates for ${pendingTaskIds.size} queued tasks...\n`);
}

main().catch(console.error);
