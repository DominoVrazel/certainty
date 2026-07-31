/**
 * Fails fast with an actionable message instead of letting the Firebase CLI
 * error out cryptically half a minute into startup.
 *
 * The JDK requirement is handled by with-jdk.mjs, which fixes it rather than
 * just reporting it. This only checks what the developer has to do themselves.
 *
 * Usage: node scripts/preflight.mjs
 */
import { existsSync } from "node:fs";
import path from "node:path";

if (!existsSync(path.resolve("./.emulator-data"))) {
  console.error(
    "\n✖ No local emulator data found (./.emulator-data is missing)." +
      "\n  Create it once from the production snapshot:" +
      "\n      npm run db:pull    # read production into ./.firebase-seed" +
      "\n      npm run db:seed    # load that snapshot into the emulators\n"
  );
  process.exit(1);
}
