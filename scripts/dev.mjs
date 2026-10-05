/**
 * Runs the local frontend plus the local mail inbox.
 *
 * Started by `npm run dev` from inside `firebase emulators:exec`, so the
 * emulators are already up by the time this runs. Vite owns the lifetime: when
 * it exits, MailDev is shut down with it.
 *
 * Ports must match LOCAL_SMTP_PORT and the URLs in functions/.env.local.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const SMTP_PORT = 1026;
const WEB_PORT = 1080;

// Certainty keeps its own port so it never collides with another Vite project
// on the default 5173. Must match the URLs in functions/.env.local.
const APP_PORT = 5174;

const binary = (name) =>
  path.resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name
  );

const children = [];

function start(name, command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: true });
  child.on("error", (err) =>
    console.warn(`!  ${name} failed to start: ${err.message}`)
  );
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

const maildevBin = binary("maildev");
if (existsSync(maildevBin)) {
  console.log(`i  local inbox at http://localhost:${WEB_PORT}`);
  start("maildev", `"${maildevBin}"`, [
    "--smtp",
    String(SMTP_PORT),
    "--web",
    String(WEB_PORT),
    "--silent",
  ]);
} else {
  console.warn(
    "!  maildev is not installed — emails will fail to send locally.\n" +
      "   Run: npm install"
  );
}

const vite = start("vite", binary("vite"), [
  "--mode",
  "emulator",
  "--port",
  String(APP_PORT),
  "--strictPort",
]);

vite.on("exit", (code, signal) => {
  shutdown();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown();
    process.exit(0);
  });
}
