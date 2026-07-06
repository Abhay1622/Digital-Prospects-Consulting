import http from 'http';
import app from './app';
import { config } from './config/env';
import { initWebSocketServer } from './infrastructure/websocket/websocket-server';

// Conditionally import the worker so we can run everything in one process for development,
// but scale them separately in production by setting RUN_WORKER=false
if (process.env.RUN_WORKER !== 'false') {
  require('./infrastructure/queue/task-worker');
  console.log('[Server] Background task worker started in-process.');
}

const server = http.createServer(app);

// Initialize WebSockets on the HTTP server
initWebSocketServer(server);

server.listen(config.port, () => {
  console.log(`[Server] Web Server running on http://localhost:${config.port}`);
  console.log(`[Server] WebSocket Server running on ws://localhost:${config.port}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down server...');
  server.close(() => {
    console.log('[Server] HTTP and WS server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received. Shutting down server...');
  server.close(() => {
    console.log('[Server] HTTP and WS server closed.');
    process.exit(0);
  });
});
