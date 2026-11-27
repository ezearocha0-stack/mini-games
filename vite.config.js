import { defineConfig } from 'vite';
import { attachRoomWebSocketServer } from './server/wsRooms.js';

function crossplayRoomsPlugin() {
  return {
    name: 'crossplay-ws-rooms',
    configureServer(server) {
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
    sourcemap: false
  }
});
