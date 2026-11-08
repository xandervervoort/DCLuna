import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function findProjectRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (existsSync(resolve(directory, "package.json"))) {
      return directory;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error("Could not locate the project root (package.json).");
    }
    directory = parent;
  }
}

export function loadProjectEnvironment(): void {
  dotenv.config({ path: resolve(findProjectRoot(), ".env") });
}

export function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
