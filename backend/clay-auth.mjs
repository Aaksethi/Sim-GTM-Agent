// backend/clay-auth.mjs
// ---------------------------------------------------------------------------
// ONE-TIME Clay authorizer. Run it once to capture a long-lived refresh token
// so the backend can renew Clay access tokens by itself (no more hourly manual
// token grabbing).
//
//   node clay-auth.mjs
//
// It will:
//   1. Register a public OAuth client with Clay (no secret).
//   2. Open Clay's consent screen in your browser.
//   3. After you approve, capture the refresh token and save:
//        client_id + refresh_token  ->  clay-oauth.json
//
// Then copy those two values into Render as CLAY_CLIENT_ID and
// CLAY_REFRESH_TOKEN, and redeploy. clay-oauth.json is gitignored — keep it
// private, never commit it.
//
// Pure Node built-ins — no npm install needed.
// ---------------------------------------------------------------------------
import http from "node:http";
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { exec } from "node:child_process";

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const AUTHORIZE_URL = "https://app.clay.com/oauth/authorize";
const TOKEN_URL = "https://api.clay.com/oauth/token";
const REGISTER_URL = "https://api.clay.com/oauth/register";
// The MCP server the tokens must be scoped to (RFC 8707 resource indicator).
const MCP_RESOURCE = "https://api.clay.com/v3/mcp";

// PKCE: a random verifier + its SHA-256 challenge (required by Clay, S256).
const b64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const codeVerifier = b64url(crypto.randomBytes(32));
const codeChallenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());
const state = b64url(crypto.randomBytes(16));

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  // 1. Dynamic Client Registration — get a public client_id.
  console.log("1/3  Registering an OAuth client with Clay...");
  const regRes = await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Sim GTM Backend",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    }),
  });
  if (!regRes.ok) {
    console.error("   ✗ Registration failed:", regRes.status, (await regRes.text()).slice(0, 300));
    process.exit(1);
  }
  const { client_id } = await regRes.json();
  if (!client_id) {
    console.error("   ✗ No client_id returned from registration.");
    process.exit(1);
  }
  console.log("     client_id obtained.\n");

  // 2. Open the consent screen and wait for the redirect with the auth code.
  const authUrl =
    `${AUTHORIZE_URL}?` +
    new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: REDIRECT_URI,
      scope: "mcp",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      resource: MCP_RESOURCE,
    }).toString();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url.startsWith("/callback")) {
        res.writeHead(404);
        res.end();
        return;
      }
      const u = new URL(req.url, REDIRECT_URI);
      const err = u.searchParams.get("error");
      const returnedState = u.searchParams.get("state");
      const authCode = u.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html" });
      if (err) {
        res.end(`<h2>Authorization failed: ${err}</h2><p>You can close this tab.</p>`);
        server.close();
        return reject(new Error("Authorization error: " + err));
      }
      if (returnedState !== state) {
        res.end("<h2>State mismatch — aborting.</h2><p>You can close this tab.</p>");
        server.close();
        return reject(new Error("State mismatch (possible CSRF) — aborted."));
      }
      res.end("<h2>✅ Authorized.</h2><p>You can close this tab and return to the terminal.</p>");
      server.close();
      resolve(authCode);
    });
    server.listen(PORT, () => {
      console.log("2/3  Opening Clay's consent screen in your browser...");
      console.log("     If it doesn't open automatically, paste this URL into your browser:\n");
      console.log("     " + authUrl + "\n");
      openBrowser(authUrl);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out after 5 minutes waiting for authorization."));
    }, 300000);
  });

  // 3. Exchange the code for tokens (PKCE verifier proves it's the same client).
  console.log("3/3  Exchanging the code for a refresh token...");
  const tokRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id,
      code_verifier: codeVerifier,
      resource: MCP_RESOURCE,
    }).toString(),
  });
  if (!tokRes.ok) {
    console.error("   ✗ Token exchange failed:", tokRes.status, (await tokRes.text()).slice(0, 300));
    process.exit(1);
  }
  const tok = await tokRes.json();
  if (!tok.refresh_token) {
    console.error("   ✗ No refresh_token returned. Keys received:", Object.keys(tok).join(", "));
    process.exit(1);
  }

  writeFileSync(
    new URL("./clay-oauth.json", import.meta.url),
    JSON.stringify({ client_id, refresh_token: tok.refresh_token }, null, 2),
  );

  console.log("\n========================================================");
  console.log("✅ DONE — saved client_id + refresh_token to clay-oauth.json");
  console.log(`   (access token expires in ~${tok.expires_in}s; the backend auto-renews it)`);
  console.log("");
  console.log("   NEXT — open clay-oauth.json and put these two into Render:");
  console.log("     CLAY_CLIENT_ID      = <client_id from the file>");
  console.log("     CLAY_REFRESH_TOKEN  = <refresh_token from the file>");
  console.log("   Then redeploy. Keep clay-oauth.json private — never commit it.");
  console.log("========================================================");
}

main().catch((e) => {
  console.error("\n✗", e.message);
  process.exit(1);
});
