import { app } from "./app";
import { config } from "./lib/config";
import { sql } from "./db/client";
import { closeRateLimitStore } from "./lib/rateLimit";
import { startEmailWorker, stopEmailWorker } from "./lib/email";
import { startMediaCleanupWorker, stopMediaCleanupWorker } from "./lib/mediaCleanup";
import {
  attachRealtimePublisher,
  closeRealtimeSockets,
  handleRealtimeUpgrade,
  realtimeWebsocketHandler,
  type RealtimeSocketData,
} from "./lib/realtime";

const server = Bun.serve<RealtimeSocketData>({
  port: config.PORT,
  async fetch(request, bunServer) {
    const realtime = await handleRealtimeUpgrade(request, bunServer);
    if (realtime !== null) return realtime;
    return app.fetch(request);
  },
  websocket: realtimeWebsocketHandler,
});
attachRealtimePublisher(server);
startEmailWorker();
startMediaCleanupWorker();
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
  const force = setTimeout(() => {
    server.stop(true);
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    closeRealtimeSockets();
    await server.stop(false);
    attachRealtimePublisher(null);
    stopEmailWorker();
    stopMediaCleanupWorker();
    await closeRateLimitStore();
    await sql.end({ timeout: 5 });
    clearTimeout(force);
    console.info(JSON.stringify({ level: "info", event: "shutdown_complete" }));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
console.info(
  JSON.stringify({
    level: "info",
    event: "api_started",
    port: server.port,
    environment: config.NODE_ENV,
  }),
);
