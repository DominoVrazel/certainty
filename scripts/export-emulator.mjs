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

const hub = process.env.FIREBASE_EMULATOR_HUB;
if (!hub) {
  console.error(
    "\n✖ FIREBASE_EMULATOR_HUB is not set.\n" +
      "  Run this inside `firebase emulators:exec`, not against a stack you\n" +
      "  started separately — otherwise there is no hub to ask for an export.\n"
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
