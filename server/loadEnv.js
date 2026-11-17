// Load environment variables from a .env file; values already set in the environment win
import fs from "fs";

export function loadEnv(envPath, { log = console.log } = {}) {
  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const [rawKey, ...valueParts] = trimmed.split("=");
        const key = rawKey?.trim();
        if (!key || valueParts.length === 0) continue;

        const value = valueParts
          .join("=")
          .trim()
          .replace(/^[\"']|[\"']$/g, ""); // remove surrounding quotes

        if (process.env[key] == null || process.env[key] === "") {
          process.env[key] = value;
        }
      }
      log(`✓ Loaded .env from ${envPath}`);
    }
  } catch (err) {
    console.warn("Warning: Could not load .env file:", err?.message || err);
  }
}
