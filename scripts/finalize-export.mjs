/**
 * Moves the emulator export scratch directory into ./.emulator-data.
 *
 * Runs after `firebase emulators:exec` has exited, because on Windows the
 * emulator's own rename fails while its Java process still holds file handles.
 * See exportState() in seed-emulator.mjs.
 */
import { cp, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const TARGET = path.resolve("./.emulator-data");

const scratch = (await readdir(".")).filter((e) =>
  e.startsWith("firebase-export-")
);

if (scratch.length === 0) {
  if (existsSync(TARGET)) {
    console.log("✔ Emulator data already in place.");
    process.exit(0);
  }
  console.error(
    "\n✖ The emulator produced no export directory — ./.emulator-data was not created.\n"
  );
  process.exit(1);
}

// Newest wins, in case an earlier crash left one behind.
scratch.sort();
const source = scratch.pop();

await rm(TARGET, { recursive: true, force: true });

try {
  await rename(source, TARGET);
} catch (err) {
  // Windows refuses to rename the directory the emulator just wrote, even after
  // the emulator process is gone. Copying works, so fall back to copy + delete.
  if (err.code !== "EPERM") throw err;
  await cp(source, TARGET, { recursive: true });
  await rm(source, { recursive: true, force: true });
}

for (const stale of scratch) {
  await rm(stale, { recursive: true, force: true });
}

console.log(`✔ Emulator data ready in ${TARGET}`);
console.log("  Start the app with: npm run dev");
