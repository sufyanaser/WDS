#!/usr/bin/env node
/**
 * WDS Multi-Origin Session Isolation Proxy Runner
 * Maps distinct loopback ports to Vite dev server (127.0.0.1:5173):
 *  - Port 5174: Android Preview Origin
 *  - Port 5175: iPhone Preview Origin
 */
import net from 'node:net';

export function createProxies(targetPort = 5173, mappings = [5174, 5175]) {
  const servers = [];
  for (const port of mappings) {
    const s = net.createServer((socket) => {
      const client = net.connect(targetPort, '127.0.0.1');
      socket.pipe(client);
      client.pipe(socket);
      socket.on('error', () => {});
      client.on('error', () => {});
    });

    s.listen(port, '127.0.0.1', () => {
      console.log(`[WDS Multi-Origin Proxy] Live on http://127.0.0.1:${port} -> :${targetPort}`);
    });

    s.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[WDS Multi-Origin Proxy] Port ${port} is already active.`);
      } else {
        console.error(`[WDS Multi-Origin Proxy] Port ${port} error:`, err);
      }
    });

    servers.push(s);
  }
  return servers;
}

if (process.argv[1] && process.argv[1].endsWith('wds-session-proxy.mjs')) {
  createProxies();
}
