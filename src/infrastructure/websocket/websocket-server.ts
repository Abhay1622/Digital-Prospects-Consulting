import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface ClientSubscription {
  ws: WebSocket;
  subscribeTo: 'all' | string;
}

const clients = new Set<ClientSubscription>();

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');
    
    // Default subscription: client must explicitly subscribe or default to 'all'
    const subscription: ClientSubscription = { ws, subscribeTo: 'all' };
    clients.add(subscription);

    ws.send(JSON.stringify({ event: 'info', message: 'Connected to Task Processing WebSocket server. Subscribed to all updates by default.' }));

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message);
        if (payload.action === 'subscribe') {
          subscription.subscribeTo = payload.taskId || 'all';
          ws.send(JSON.stringify({ event: 'subscription_success', subscribeTo: subscription.subscribeTo }));
          console.log(`[WebSocket] Client subscribed to: ${subscription.subscribeTo}`);
        }
      } catch (err) {
        ws.send(JSON.stringify({ event: 'error', message: 'Invalid WebSocket message format. Expected: { "action": "subscribe", "taskId": "TASK_ID" | "all" }' }));
      }
    });

    ws.on('close', () => {
      clients.delete(subscription);
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Socket error:', error);
      clients.delete(subscription);
    });
  });
}

export function broadcastTaskUpdate(taskId: string, status: string, attempts: number, result: any) {
  const payload = JSON.stringify({
    event: 'task_update',
    data: { id: taskId, status, attempts, result, updatedAt: new Date() },
  });

  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (client.subscribeTo === 'all' || client.subscribeTo === taskId) {
        client.ws.send(payload);
      }
    }
  }
}
