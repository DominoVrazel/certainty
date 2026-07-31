/**
 * Locates a JDK the Firebase emulators can actually use.
 *
 * firebase-tools requires JDK 21+ and resolves `java` from PATH — it ignores
 * JAVA_HOME. On a machine where an older JDK sits in the *machine* PATH that is
 * not fixable from the user PATH, so instead of asking the developer to edit
 * system settings we find a suitable JDK and put it first for the child process.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const MIN_MAJOR = 21;

/** Reads the major version of a java binary, or null if it will not run. */
export function javaMajor(javaBin) {
  // `java -version` prints to stderr on every JDK, so both streams are needed.
  const res = spawnSync(javaBin, ["-version"], { encoding: "utf8" });
  if (res.error) return null;

  const banner = `${res.stderr ?? ""}${res.stdout ?? ""}`;
  const match = banner.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
}

function candidateRoots() {
  if (process.platform !== "win32") return [];

  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const localAppData = process.env.LOCALAPPDATA ?? "";

  return [
    path.join(programFiles, "Java"),
    path.join(programFiles, "Eclipse Adoptium"),
    path.join(programFiles, "Microsoft"),
    path.join(programFiles, "Amazon Corretto"),
    path.join(programFiles, "Zulu"),
    localAppData && path.join(localAppData, "Programs", "Eclipse Adoptium"),
  ].filter(Boolean);
}

function installedJdks() {
  const found = [];

  for (const root of candidateRoots()) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const bin = path.join(root, entry.name, "bin", "java.exe");
      if (existsSync(bin)) found.push(bin);
    }
  }
  return found;
}

/**
 * Returns { bin, dir, major, onPath } for a usable JDK, or null.
 * `onPath: true` means the default `java` is already good enough.
 */
export function findJdk() {
  const pathMajor = javaMajor("java");
  if (pathMajor !== null && pathMajor >= MIN_MAJOR) {
    return { bin: "java", dir: null, major: pathMajor, onPath: true };
  }

  if (process.env.JAVA_HOME) {
    const bin = path.join(process.env.JAVA_HOME, "bin", "java");
    const major = javaMajor(bin);
    if (major !== null && major >= MIN_MAJOR) {
      return {
        bin,
        dir: path.join(process.env.JAVA_HOME, "bin"),
        major,
        onPath: false,
      };
    }
  }

  const usable = installedJdks()
    .map((bin) => ({ bin, dir: path.dirname(bin), major: javaMajor(bin) }))
    .filter((jdk) => jdk.major !== null && jdk.major >= MIN_MAJOR)
    .sort((a, b) => b.major - a.major);

  return usable.length ? { ...usable[0], onPath: false } : null;
}
