/**
 * Boot smoke test for CI.
 *
 * Starts the real server process, polls /health until it answers, then shuts it
 * down. Catches import-time crashes and broken route wiring that unit tests on
 * individual modules would miss. Runs without a database: connectDB logs and
 * continues, so the HTTP layer still comes up.
 */
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = process.env.SMOKE_PORT ?? "4123";
const TIMEOUT_MS = 30_000;
const POLL_MS = 400;

const child = spawn(process.execPath, ["server.js"], {
  cwd: ROOT,
  env: { ...process.env, PORT, NODE_ENV: "test" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
child.stdout.on("data", (chunk) => (serverLog += chunk));
child.stderr.on("data", (chunk) => (serverLog += chunk));

let exited = null;
child.on("exit", (code) => (exited = code));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\nSmoke test failed: ${message}`);
  if (serverLog.trim()) console.error(`\n--- server output ---\n${serverLog.trim()}\n`);
  child.kill("SIGTERM");
  process.exit(1);
}

async function check(pathname, validate) {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
  const body = await res.json();
  validate(res, body);
  console.log(`  ok  ${pathname} -> ${res.status}`);
}

const deadline = Date.now() + TIMEOUT_MS;
let ready = false;

while (Date.now() < deadline && !ready) {
  if (exited !== null) fail(`server exited early with code ${exited}`);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    if (res.ok) ready = true;
    else await sleep(POLL_MS);
  } catch {
    await sleep(POLL_MS);
  }
}

if (!ready) fail(`server did not answer /health within ${TIMEOUT_MS}ms`);

try {
  await check("/health", (res, body) => {
    if (!body.success) throw new Error("health did not report success");
  });

  // Confirms the AI router is mounted and reachable.
  await check("/api/ai/health", (res, body) => {
    if (res.status !== 200 || body.success !== true) {
      throw new Error(`unexpected AI health response: ${JSON.stringify(body)}`);
    }
  });

  // Seller-only route must reject anonymous callers.
  await check("/api/ai/forecast", (res, body) => {
    if (res.status < 400 || body.success === true) {
      throw new Error("forecast endpoint is not protected");
    }
  });

  // Missing query must be a 400, not a 500.
  await check("/api/ai/search", (res) => {
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  });

  console.log("\nSmoke test passed.");
  child.kill("SIGTERM");
  process.exit(0);
} catch (error) {
  fail(error.message);
}
