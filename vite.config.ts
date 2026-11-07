import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import net from "node:net";

const host = process.env.TAURI_DEV_HOST;

/**
 * WDS Multi-Origin Session Isolation Proxy Plugin.
 * Binds proxy listeners on ports 5174 and 5175, forwarding all TCP/HTTP/WebSocket
 * traffic to the active Vite dev server on port 5173.
 *
 * This provides genuine origin isolation (different scheme://host:port) across:
 *  - 127.0.0.1:5173 -> Desktop Preview (Windows)
 *  - 127.0.0.1:5174 -> Android Preview (Mobile Partition)
 *  - 127.0.0.1:5175 -> iPhone Preview (iOS Partition)
 *
 * Web browsers and WebViews enforce separate localStorage, sessionStorage,
 * indexedDB, and cookie jars for each distinct port origin.
 */
function multiOriginProxyPlugin() {
  const proxyServers: net.Server[] = [];

  return {
    name: "wds-multi-origin-proxy",
    configureServer() {
      const portMappings = [
        { listenPort: 5174, targetPort: 5173, label: "Android Partition" },
        { listenPort: 5175, targetPort: 5173, label: "iPhone Partition" },
      ];

      portMappings.forEach(({ listenPort, targetPort, label }) => {
        const server = net.createServer((socket) => {
          const client = net.connect(targetPort, "127.0.0.1");

          socket.pipe(client);
          client.pipe(socket);

          socket.on("error", () => {});
          client.on("error", () => {});
        });

        server.listen(listenPort, "127.0.0.1", () => {
          console.log(`[WDS Proxy] ${label} live at http://127.0.0.1:${listenPort} -> :${targetPort}`);
        });

        server.on("error", (err: any) => {
          if (err.code === "EADDRINUSE") {
            console.log(`[WDS Proxy] Port ${listenPort} already in use (assuming external or Tauri proxy active)`);
          } else {
            console.error(`[WDS Proxy] Error on port ${listenPort}:`, err);
          }
        });

        proxyServers.push(server);
      });
    },
    closeBundle() {
      proxyServers.forEach((s) => {
        try {
          s.close();
        } catch {
          // ignore cleanup errors
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), multiOriginProxyPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
