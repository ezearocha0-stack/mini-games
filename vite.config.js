import { defineConfig } from 'vite';
import { attachRoomWebSocketServer } from './server/wsRooms.js';
import { handleApiRequest } from './server/api.js';
import { getDb } from './server/db.js';

function crossplayRoomsPlugin() {
  return {
    name: 'crossplay-ws-rooms',
    configureServer(server) {
      getDb();
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          const handled = await handleApiRequest(req, res);
          if (handled !== false) return;
        }
        next();
      });
      if (server.httpServer) {
        attachRoomWebSocketServer(server.httpServer);
      }
    }
  };
}

export default defineConfig({
  plugins: [crossplayRoomsPlugin()],
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'net-vendor': ['peerjs', 'qrcode']
        }
      }
    }
  }
});
