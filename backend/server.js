// backend/server.js
// ---------------------------------------------------------------------------
// A small Express server with two jobs:
//   1. GET  /health  -> quick "is it alive?" check
//   2. POST /enrich  -> takes { domain }, asks the Anthropic API to enrich it
//                       using Clay's MCP server, and returns clean JSON.
//
// The "intelligence" lives in the Anthropic API call. We attach Clay as an MCP
// server, and Claude runs Clay's tool loop server-side, inside that one call.
// We are NOT using the Anthropic SDK here — just Node's built-in fetch.
// ---------------------------------------------------------------------------

import express from "express";
import cors from "cors";
import "dotenv/config"; // loads variables from .env into process.env

const app = express();

// cors() lets a browser frontend on a different port/origin call this server.
// FRONTEND_ORIGIN (e.g. your Netlify URL) restricts which site may call this
// backend. Default "*" keeps local dev and an open public link working.
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: ALLOWED_ORIGIN }));
// express.json() parses an incoming JSON request body into req.body.
app.use(express.json());

// Use the PORT from .env, or fall back to 3000.
const PORT = process.env.PORT || 3000;

// Brand + voice context for Sim. Used so that, for a good-fit account (ICP score
// >= 70), the model also drafts an on-brand cold outreach email. This is a
// compact version of the OS's positioning-icp + SOUL voice rules.
const SIM_SYSTEM =
  `You are a GTM analyst and copywriter for Sim (sim.ai) — an open-source AI ` +
  `workspace where engineering teams build, deploy, and manage AI agents. Sim is ` +
  `self-hostable (data stays on the customer's own infra), open source (auditable), ` +
  `and SOC2-ready with SSO/SCIM. Best-fit buyers are compliance-driven healthcare ` +
  `and fintech companies, ~200-5000 employees, US.\n\n` +
  `SCORING RUBRIC — score each category with these exact point bands (max in parens). ` +
  `For each category, give "points" (within its max) and a one-line "why" citing the ` +
  `real signal you found:\n` +
  `1. industry (max 20): healthcare/health-tech 20; fintech/financial services/insurtech 20; adjacent regulated 10; off-ICP (consumer/retail/media) 0.\n` +
  `2. size (max 10): 200-5,000 employees 10; slightly outside (100-200 or 5K-7K) 5; far outside (<100 or >10K) 0.\n` +
  `3. compliance (max 20): HIPAA or HITRUST 20; SOC2 Type II 15; SOC2 Type I 8; trust platform only (Vanta/Drata/SafeBase) 5; none 0.\n` +
  `4. idp_sso (max 10): Okta or Azure AD/Entra 10; other IdP (OneLogin/Ping/JumpCloud) 5; none 0.\n` +
  `5. ai_footprint (max 15): active AI hiring AND AI tooling/blog 15; one signal only 8; none 0.\n` +
  `6. displacement (max 15): n8n/Zapier/Make in stack 15; LangChain/LangGraph only 10; none 0.\n` +
  `7. compliance_hiring (max 10): active GRC/Security/AI-Governance hire 10; recently closed (<90d) 5; none 0.\n\n` +
  `WHEN YOU WRITE THE OUTREACH EMAIL, follow these rules exactly:\n` +
  `- Choose ONE angle: "self-host" (they handle regulated/PHI data), "displacement" ` +
  `(they use n8n/Zapier/LangChain/Airflow), or "ai-governance" (hiring AI risk/GRC).\n` +
  `- Subject: 5 words or fewer. No questions. No emojis.\n` +
  `- Body: 4-6 sentences, exactly one ask. Line 1 must reference something specific ` +
  `and real about THIS company. Mention compliance in at most one plain sentence.\n` +
  `- Write peer-to-peer, engineer to engineer — not salesy.\n` +
  `- Never use: leverage, empower, unlock, seamless, robust, cutting-edge, ` +
  `"I hope this finds you well", "I wanted to reach out".`;

// Category keys -> max points. Must match the rubric above AND the frontend's
// CATEGORIES list. The 7 maxes sum to 100.
const CATEGORY_MAX = {
  industry: 20,
  size: 10,
  compliance: 20,
  idp_sso: 10,
  ai_footprint: 15,
  displacement: 15,
  compliance_hiring: 10,
};

// Turn the model's raw output into an authoritative result:
//  - clamp each category's points to [0, max]; fill missing categories with 0
//  - icpScore = the literal SUM of the categories (so the total always matches
//    the visible matrix — this is the "show how we got the number" guarantee)
//  - derive the tier from the OS thresholds
//  - keep the drafted email only when the total qualifies (>= 70)
function normalizeResult(parsed) {
  const rawScores = (parsed && parsed.scores) || {};
  const scores = {};
  let total = 0;

  for (const [key, max] of Object.entries(CATEGORY_MAX)) {
    const entry = rawScores[key] || {};
    let points = Number(entry.points);
    if (!Number.isFinite(points)) points = 0;
    points = Math.max(0, Math.min(max, Math.round(points)));
    scores[key] = {
      points,
      max,
      why: typeof entry.why === "string" ? entry.why : "",
    };
    total += points;
  }

  const tier =
    total >= 85 ? "A" : total >= 70 ? "B" : total >= 50 ? "C" : "Disqualify";

  const email =
    total >= 70 && parsed && parsed.email && parsed.email.subject
      ? parsed.email
      : null;

  return { company: (parsed && parsed.company) || "", scores, icpScore: total, tier, email };
}

// Pull a JSON object out of the model's text, even when it narrates first or
// wraps the JSON in a ```json fence. Tries, in order: a fenced block, then the
// first "{" to the last "}", then the whole string.
function extractJson(text) {
  const candidates = [];
  const fence =
    text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text);
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim());
    } catch {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// Clay OAuth: keep a valid access token without manual hourly refreshes.
//
// Clay's MCP server uses OAuth with short-lived (~1h) access tokens. Instead of
// pasting a new token every hour, we seed the backend ONCE with a long-lived
// refresh token + client_id (captured by clay-auth.mjs, stored as env vars) and
// exchange them for a fresh access token on demand — cached until shortly before
// it expires. Rotation-aware: if Clay returns a new refresh token, we adopt it
// for the life of this process.
// ---------------------------------------------------------------------------
let clayRefreshToken = process.env.CLAY_REFRESH_TOKEN || null;
const clayClientId = process.env.CLAY_CLIENT_ID || null;
let clayAccessToken = null;
let clayAccessExpiry = 0; // epoch ms when the cached access token expires

async function getClayAccessToken() {
  // Legacy/manual fallback: if refresh creds aren't set but a raw token is, use
  // it as-is (the old "paste a token every hour" mode still works).
  const haveRefreshCreds = clayRefreshToken && clayClientId;
  if (!haveRefreshCreds) {
    if (process.env.CLAY_MCP_TOKEN) return process.env.CLAY_MCP_TOKEN;
    throw new Error(
      "Clay auth not configured. Set CLAY_REFRESH_TOKEN + CLAY_CLIENT_ID (run clay-auth.mjs), or CLAY_MCP_TOKEN.",
    );
  }

  // Reuse the cached access token until ~2 minutes before it expires.
  if (clayAccessToken && Date.now() < clayAccessExpiry - 120000) {
    return clayAccessToken;
  }

  const res = await fetch("https://api.clay.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: clayRefreshToken,
      client_id: clayClientId,
      resource: "https://api.clay.com/v3/mcp",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    // 400 invalid_grant => the refresh token is dead (revoked/expired/rotated
    // away). Tell the operator exactly how to recover.
    throw new Error(
      `Clay token refresh failed (HTTP ${res.status}): ${body.slice(0, 200)}` +
        (res.status === 400
          ? " — the refresh token is no longer valid. Re-run clay-auth.mjs and update CLAY_REFRESH_TOKEN in Render."
          : ""),
    );
  }

  const tok = await res.json();
  if (!tok.access_token) throw new Error("Clay token refresh returned no access_token.");

  clayAccessToken = tok.access_token;
  clayAccessExpiry = Date.now() + (Number(tok.expires_in) || 3600) * 1000;

  // Rotation: if Clay handed back a new refresh token, adopt it — and log the
  // new value loudly so the operator can paste it into Render's
  // CLAY_REFRESH_TOKEN env var. That keeps the env var fresh, so the NEXT
  // restart boots cleanly instead of dying with invalid_grant — no browser
  // re-auth needed. (Render logs are private to your dashboard; treat as secret.)
  if (tok.refresh_token && tok.refresh_token !== clayRefreshToken) {
    clayRefreshToken = tok.refresh_token;
    console.log(
      "\n================ CLAY REFRESH TOKEN ROTATED ================\n" +
        "  To survive the next restart, update this in Render -> Environment:\n" +
        "  CLAY_REFRESH_TOKEN=" + tok.refresh_token + "\n" +
        "  (keep it secret - do not commit or share)\n" +
        "===========================================================\n",
    );
  }
  console.log(
    `Clay access token refreshed (valid ~${Math.round((clayAccessExpiry - Date.now()) / 60000)} min).`,
  );
  return clayAccessToken;
}

// ---------------------------------------------------------------------------
// Route 1: health check. Handy to confirm the server is up.
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Helper: read an Anthropic streaming (SSE) response and accumulate the text.
//
// We STREAM because a single enrichment can run for minutes while Claude works
// through Clay's MCP tool loop — and Node's built-in fetch aborts a NON-stream
// request that takes longer than ~5 minutes ("fetch failed"). Streaming makes
// the response headers arrive immediately and keeps bytes flowing, so that
// timeout never trips. Returns the joined text of every text delta; throws if
// the stream carries an error event.
// ---------------------------------------------------------------------------
async function readAnthropicStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let streamError = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are newline-delimited; process whole lines, keep the remainder.
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        text += evt.delta.text;
      } else if (evt.type === "error") {
        streamError = evt.error || evt;
      }
    }
  }

  if (streamError) {
    const e = new Error(
      typeof streamError === "string"
        ? streamError
        : streamError.message || JSON.stringify(streamError),
    );
    e.anthropic = streamError;
    throw e;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Helper: call the Anthropic API with STREAMING + automatic retries.
// Retries 429 (rate_limit) and 529 (overloaded), honoring "retry-after", and
// retries thrown network errors with exponential backoff. Returns either
// { text } (the accumulated model text) or { error } (a non-retryable API
// error object). Throws only if a thrown error survives all retries.
// ---------------------------------------------------------------------------
async function callAnthropicWithRetry(requestBody, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "mcp-client-2025-11-20",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...requestBody, stream: true }),
      });

      // Retry rate-limit / overloaded statuses.
      if (apiResponse.status === 429 || apiResponse.status === 529) {
        if (attempt === maxRetries) {
          const errText = await apiResponse.text().catch(() => "");
          return { error: { type: "rate_limit_error", message: errText.slice(0, 300) } };
        }
        const retryAfter = Number(apiResponse.headers.get("retry-after"));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30000)
            : Math.min(2000 * 2 ** attempt, 30000);
        console.warn(
          `Rate limited (HTTP ${apiResponse.status}). Waiting ${waitMs}ms, then retry ${attempt + 1}/${maxRetries}...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      // Any other non-OK status is not retryable — surface the error body.
      if (!apiResponse.ok) {
        const errData = await apiResponse.json().catch(() => null);
        return { error: errData?.error || { message: `Anthropic HTTP ${apiResponse.status}` } };
      }

      // 200 OK — stream the SSE body and accumulate the model's text.
      const text = await readAnthropicStream(apiResponse);
      return { text };
    } catch (err) {
      // A THROWN error (network blip, socket reset, mid-stream failure). Retry.
      if (attempt === maxRetries) throw err;
      const waitMs = Math.min(2000 * 2 ** attempt, 30000);
      console.warn(
        `Network error calling Anthropic (${err?.message || err}). Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Route 2: enrich a company domain.
// ---------------------------------------------------------------------------
app.post("/enrich", async (req, res) => {
  // Pull "domain" out of the JSON body, e.g. { "domain": "stripe.com" }.
  const { domain } = req.body || {};

  // If the caller didn't send a domain, that's a bad request.
  if (!domain) {
    return res.status(400).json({ error: "Missing 'domain' in request body." });
  }

  // The instruction we send to Claude. We explicitly ask for ONLY a JSON
  // object so the response is easy to parse on the way back.
  const userMessage =
    `Use the Clay tools to enrich the company at the domain "${domain}". ` +
    `Then score it against the ICP using the 7-category rubric in your instructions. ` +
    `If the total (sum of the 7 categories) is 70 or higher, ALSO write a short cold outreach email. ` +
    `Reply with ONLY a JSON object in exactly this shape and nothing else:\n` +
    `{\n` +
    `  "company": string,\n` +
    `  "scores": {\n` +
    `    "industry":          { "points": number, "why": string },\n` +
    `    "size":              { "points": number, "why": string },\n` +
    `    "compliance":        { "points": number, "why": string },\n` +
    `    "idp_sso":           { "points": number, "why": string },\n` +
    `    "ai_footprint":      { "points": number, "why": string },\n` +
    `    "displacement":      { "points": number, "why": string },\n` +
    `    "compliance_hiring": { "points": number, "why": string }\n` +
    `  },\n` +
    `  "email": { "subject": string, "body": string, "angle": "self-host" | "displacement" | "ai-governance" }  // OR null if total < 70\n` +
    `}`;

  // Get a valid Clay access token (auto-refreshed and cached between calls).
  let clayToken;
  try {
    clayToken = await getClayAccessToken();
  } catch (authErr) {
    console.error("Clay auth error:", authErr.message);
    // Detect the "connection expired / not set up" family and hand the frontend
    // a clean, human message + a flag, instead of the raw invalid_grant blob.
    const needsReauth = /invalid_grant|no longer valid|not configured/i.test(authErr.message);
    return res.status(502).json({
      error: needsReauth
        ? "Clay needs re-authorization — the connection expired. Re-run clay-auth.mjs and update Render, then retry. Existing scores are unaffected."
        : authErr.message,
      clayReauth: needsReauth,
    });
  }

  // The request body for the Anthropic Messages API.
  const requestBody = {
    model: "claude-sonnet-4-6",
    max_tokens: 3500, // headroom for the 7-category breakdown + drafted email
    system: SIM_SYSTEM,
    messages: [{ role: "user", content: userMessage }],

    // Declare the Clay MCP server Claude should connect to.
    mcp_servers: [
      {
        type: "url",
        url: "https://api.clay.com/v3/mcp",
        name: "clay",
        authorization_token: clayToken,
      },
    ],

    // Enable Clay's tools. IMPORTANT: with the CURRENT MCP connector, tool
    // configuration lives here in the separate "tools" array as an
    // mcp_toolset object — NOT inside mcp_servers. (The old
    // "tool_configuration" inside mcp_servers is deprecated.)
    tools: [{ type: "mcp_toolset", mcp_server_name: "clay" }],
  };

  try {
    // Call the Anthropic API (streaming; retries automatically on 429/529 and
    // network errors). Returns { text } on success or { error } on an API error.
    const result = await callAnthropicWithRetry(requestBody);

    // The API can report an error object (bad key, bad request, rate limit, etc.).
    if (result.error) {
      console.error("Anthropic API returned an error:", result.error);
      return res.status(502).json({ error: result.error });
    }

    const textOutput = result.text || "";

    // The model usually narrates during the MCP tool loop and wraps the final
    // JSON in a ```json fence, so we EXTRACT the JSON object rather than trying
    // to parse the whole blob. Then normalize (clamp + sum + tier).
    const parsed = extractJson(textOutput);
    if (parsed) {
      return res.json(normalizeResult(parsed));
    }

    // Couldn't find JSON anywhere — hand back the raw text so you can debug it.
    console.error("Could not parse model output as JSON. First 500 chars:", textOutput.slice(0, 500));
    return res.status(200).json({ raw: textOutput });
  } catch (networkError) {
    // The streamed request threw and exhausted retries — network down, etc.
    console.error("Network error calling the Anthropic API:", networkError);
    return res.status(500).json({ error: "Failed to reach the Anthropic API after retries." });
  }
});

// ---------------------------------------------------------------------------
// Start listening.
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  const mode =
    process.env.CLAY_REFRESH_TOKEN && process.env.CLAY_CLIENT_ID
      ? "auto-refresh (CLAY_REFRESH_TOKEN + CLAY_CLIENT_ID)"
      : process.env.CLAY_MCP_TOKEN
        ? "manual token (CLAY_MCP_TOKEN)"
        : "NOT CONFIGURED — set CLAY_REFRESH_TOKEN + CLAY_CLIENT_ID";
  console.log("Clay auth mode:", mode);
});
