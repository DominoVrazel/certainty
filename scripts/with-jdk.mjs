/**
 * Runs a command with a JDK 21+ ahead of everything else on PATH.
 *
 * Usage: node scripts/with-jdk.mjs firebase emulators:start ...
 *
 * See jdk.mjs for why this exists rather than a JAVA_HOME instruction.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { findJdk, MIN_MAJOR } from "./jdk.mjs";

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/with-jdk.mjs <command> [args...]");
  process.exit(1);
}

const jdk = findJdk();
if (!jdk) {
  console.error(
    `\n✖ No JDK ${MIN_MAJOR} or newer found, but the Firestore and Auth emulators need one.` +
      `\n  Install one (for example Temurin ${MIN_MAJOR}) and rerun.\n`
  );
  process.exit(1);
}

const env = { ...process.env };
if (!jdk.onPath) {
  // Windows env vars are case-insensitive, but spreading process.env yields a
  // plain object that is not: cmd.exe hands us "Path" while bash hands us
  // "PATH". Writing the wrong casing adds a second variable and the child ends
  // up with only the JDK on its search path, losing every other command.
  const pathKey =
    Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";

  env[pathKey] = `${jdk.dir}${path.delimiter}${env[pathKey] ?? ""}`;
  env.JAVA_HOME = path.dirname(jdk.dir);
  console.log(`i  using JDK ${jdk.major} from ${jdk.dir}`);
}

// Re-quote arguments that contain spaces: npm has already split them, and the
// shell would otherwise re-split things like "vite --mode emulator".
const command = argv
  .map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
  .join(" ");

const child = spawn(command, { stdio: "inherit", shell: true, env });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
