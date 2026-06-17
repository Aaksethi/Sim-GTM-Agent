// backend/test-clay-key.mjs
// ---------------------------------------------------------------------------
// One-off check: does your Clay key authenticate against Clay's MCP endpoint?
//
// The backend uses Clay's MCP server (https://api.clay.com/v3/mcp). A static
// API key only helps us if THAT endpoint accepts it as a Bearer token. This
// script asks the endpoint directly and tells you yes/no — no Render redeploy,
// no Anthropic call, no npm install needed.
//
// HOW TO RUN (from the backend folder):
//   1. Put your key in backend/.env as:   CLAY_MCP_TOKEN=your_key_here
//   2. node test-clay-key.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";

// Read the key: prefer an already-set env var, else parse backend/.env by hand
// (so we don't depend on the `dotenv` package being installed locally).
function readKey() {
  if (process.env.CLAY_MCP_TOKEN) return process.env.CLAY_MCP_TOKEN.trim();
  try {
    const env = readFileSync(new URL("./.env", import.meta.url), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*CLAY_MCP_TOKEN\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* no .env file — fall through */
  }
  return null;
}

const key = readKey();
if (!key) {
  console.error("✗ No CLAY_MCP_TOKEN found. Put your key in backend/.env first:");
  console.error("    CLAY_MCP_TOKEN=your_key_here");
  process.exit(1);
}
console.log(`Testing key ending in ...${key.slice(-4)} against Clay MCP\n`);

// A minimal MCP "initialize" handshake. We only care whether the auth layer
// accepts the key — i.e. is the status 401/403 (rejected) or anything else?
const body = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "clay-key-test", version: "1.0.0" },
  },
};

try {
  const res = await fetch("https://api.clay.com/v3/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  console.log("HTTP status:", res.status);
  console.log("Response (first 300 chars):\n" + text.slice(0, 300) + "\n");

  if (res.status === 401 || res.status === 403) {
    console.log("RESULT: ❌ REJECTED — Clay's MCP endpoint refused this key.");
    console.log("  This key is most likely for Clay's REST API, not MCP.");
    console.log("  Tell Claude the result and we'll switch to plan B.");
  } else {
    console.log("RESULT: ✅ ACCEPTED — Clay's MCP endpoint authenticated this key.");
    console.log("  It should work as a permanent token. Put the SAME value into");
    console.log("  Render's CLAY_MCP_TOKEN and redeploy — no more hourly expiry.");
  }
} catch (err) {
  console.log("⚠️  Could not reach Clay MCP:", err?.message || err);
  console.log("  (Network/DNS issue — try again, or check your connection.)");
}
