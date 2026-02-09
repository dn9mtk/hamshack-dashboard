#!/usr/bin/env node
// Simple script to start both backend and frontend
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

console.log("🚀 Starting HamShack Dashboard...\n");

// Start backend
console.log("📡 Starting backend server...");
const backend = spawn(npmCmd, ["start"], {
  cwd: join(__dirname, "server"),
  stdio: "inherit",
  shell: true
});

// Start frontend
console.log("💻 Starting frontend dev server...");
const frontend = spawn(npmCmd, ["run", "dev"], {
  cwd: join(__dirname, "client"),
  stdio: "inherit",
  shell: true
});

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down servers...");
  backend.kill();
  frontend.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  backend.kill();
  frontend.kill();
  process.exit(0);
});

// Handle errors
backend.on("error", (err) => {
  console.error("❌ Backend error:", err);
});

frontend.on("error", (err) => {
  console.error("❌ Frontend error:", err);
});

backend.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend exited with code ${code}`);
  }
});

frontend.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Frontend exited with code ${code}`);
  }
});
