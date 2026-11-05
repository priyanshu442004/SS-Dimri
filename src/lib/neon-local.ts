import { neonConfig } from "@neondatabase/serverless";

/**
 * Testing against a throw-away local Postgres (docs/testing-strategy.md) goes through Neon's
 * WebSocket proxy. Set NEON_WS_PROXY only for that; production never sets it.
 */
export function applyLocalNeonProxy() {
  const proxy = process.env.NEON_WS_PROXY;
  if (!proxy) return;
  neonConfig.wsProxy = () => proxy;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineConnect = false;
  neonConfig.pipelineTLS = false;
}
