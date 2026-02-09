#!/usr/bin/env node
// Interactive setup script for .env file
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setup() {
  console.log("🔧 HamShack Dashboard - Environment Setup\n");
  console.log("This will help you configure DX Cluster and RBN connections.\n");
  console.log("Press Enter to skip any option.\n");

  const envPath = join(__dirname, ".env");
  const examplePath = join(__dirname, ".env.example");
  
  let envContent = "";
  
  if (existsSync(examplePath)) {
    envContent = readFileSync(examplePath, "utf8");
  } else {
    envContent = `# DX Cluster Configuration
DXCLUSTER_HOST=
DXCLUSTER_PORT=
DXCLUSTER_CALLSIGN=

# RBN Configuration
RBN_HOST=
RBN_PORT=
RBN_CALLSIGN=
`;
  }

  // DX Cluster
  console.log("=== DX Cluster Configuration ===");
  const dxHost = await question("DX Cluster Host (e.g., dxcluster.net): ");
  const dxPort = await question("DX Cluster Port (e.g., 7300): ");
  const dxCall = await question("Your Callsign for DX Cluster: ");

  // RBN
  console.log("\n=== RBN Configuration ===");
  const rbnHost = await question("RBN Host (e.g., reversebeacon.net): ");
  const rbnPort = await question("RBN Port (e.g., 7000): ");
  const rbnCall = await question("Your Callsign for RBN: ");

  // Update env content
  let updated = envContent;
  
  if (dxHost) updated = updated.replace(/^DXCLUSTER_HOST=.*$/m, `DXCLUSTER_HOST=${dxHost}`);
  if (dxPort) updated = updated.replace(/^DXCLUSTER_PORT=.*$/m, `DXCLUSTER_PORT=${dxPort}`);
  if (dxCall) updated = updated.replace(/^DXCLUSTER_CALLSIGN=.*$/m, `DXCLUSTER_CALLSIGN=${dxCall}`);
  
  if (rbnHost) updated = updated.replace(/^RBN_HOST=.*$/m, `RBN_HOST=${rbnHost}`);
  if (rbnPort) updated = updated.replace(/^RBN_PORT=.*$/m, `RBN_PORT=${rbnPort}`);
  if (rbnCall) updated = updated.replace(/^RBN_CALLSIGN=.*$/m, `RBN_CALLSIGN=${rbnCall}`);

  writeFileSync(envPath, updated);
  console.log(`\n✅ Configuration saved to ${envPath}`);
  console.log("\nRestart the server for changes to take effect.\n");

  rl.close();
}

setup().catch(console.error);
