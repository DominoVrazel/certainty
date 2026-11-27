/**
 * Writes the running emulator's state out to ./.emulator-data.
 *
 * `db:seed` persists what it writes, but `db:migrate` did not: it wrote into
 * the live emulator and nothing exported it, so every restart of the stack
 * came back with the legacy collections and no migrated `trainings` — and the
 * monthly-report test, which reads migrated history, failed with zero rows.
 *
 * Same Windows caveat as seed-emulator.mjs: the emulator renames a scratch
 * directory onto the target, and that rename fails with EPERM while the Java
 * process still holds the handles. The data is complete by then, so the
 * scratch directory is left for finalize-export.mjs to move once the
 * emulators have shut down.
 */
import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * The hub is named by `emulators:exec`, but a stack started with `npm run dev`
 * has one too, on its default port. Falling back to it means the data can be
 * saved without taking the running stack down — which is the only reason
 * anybody was taking it down, and it kept killing the app the developer was
 * working in.
 */
const DEFAULT_HUB = "127.0.0.1:4400";
let hub = process.env.FIREBASE_EMULATOR_HUB;

if (!hub) {
  try {
    const probe = await fetch(`http://${DEFAULT_HUB}/emulators`, {
      signal: AbortSignal.timeout(2000),
    });
    if (probe.ok) hub = DEFAULT_HUB;
  } catch {
    // Nothing listening there either; the message below says what to do.
  }
}

if (!hub) {
  console.error(
    "\n✖ No emulator hub found.\n" +
      "  Start the stack with `npm run dev`, or run this inside\n" +
      "  `firebase emulators:exec` — otherwise there is nothing to ask for\n" +
      "  an export.\n"
  );
  process.exit(1);
}

const target = path.resolve("./.emulator-data");
await rm(target, { recursive: true, force: true });

const res = await fetch(`http://${hub}/_admin/export`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: target, initiatedBy: "export-emulator.mjs" }),
});

if (res.ok) {
  console.log(`\n▸ State exported to ${target}`);
  process.exit(0);
}

const body = await res.text();
if (body.includes("EPERM")) {
  console.log("\n▸ State written (rename deferred — see finalize-export.mjs)");
  process.exit(0);
}

console.error(`\n✖ Export failed (${res.status}): ${body}\n`);
process.exit(1);
