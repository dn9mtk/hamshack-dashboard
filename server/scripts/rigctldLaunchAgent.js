// Print (default) or write (--write, --force to overwrite) the rigctld LaunchAgent plist.
// Settings come from server/.env (RIGCTLD_*). Loading the agent is left to the operator:
// this script never runs launchctl.
// Usage: npm run rig:launchagent [-- --write [--force]]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "../loadEnv.js";
import { LAUNCH_AGENT_DEFAULTS, buildRigctldLaunchAgent } from "../rig/launchAgent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// stdout carries only the plist, so it can be redirected into a file
loadEnv(path.join(__dirname, "..", ".env"), { log: () => {} });

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => a !== "--write" && a !== "--force");
if (unknown.length > 0) {
  console.error(`Unknown option ${unknown.join(" ")}. Usage: npm run rig:launchagent [-- --write [--force]]`);
  process.exit(2);
}

const env = process.env;
const label = env.RIGCTLD_LAUNCHAGENT_LABEL || LAUNCH_AGENT_DEFAULTS.label;
let plist;
try {
  plist = buildRigctldLaunchAgent({
    bin: env.RIGCTLD_BIN || LAUNCH_AGENT_DEFAULTS.bin,
    model: env.RIGCTLD_MODEL || LAUNCH_AGENT_DEFAULTS.model,
    device: env.RIGCTLD_DEVICE,
    baud: env.RIGCTLD_BAUD || LAUNCH_AGENT_DEFAULTS.baud,
    stopBits: env.RIGCTLD_STOP_BITS || LAUNCH_AGENT_DEFAULTS.stopBits,
    port: env.RIGCTLD_PORT || LAUNCH_AGENT_DEFAULTS.port,
    label,
    logPath: path.join(os.homedir(), "Library", "Logs", "rigctld.log")
  });
} catch (err) {
  console.error(`Cannot build the rigctld LaunchAgent: ${err.message}`);
  process.exit(1);
}

if (!args.has("--write")) {
  process.stdout.write(plist);
  console.error("\nReview the plist above, then write it with: npm run rig:launchagent -- --write");
  process.exit(0);
}

const target = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
if (fs.existsSync(target) && !args.has("--force")) {
  console.error(`${target} already exists. Use --force to overwrite it.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, plist, "utf8");
console.log(`Written ${target}`);
console.log(`Load it with:   launchctl bootstrap gui/$(id -u) ${target}`);
console.log(`Unload it with: launchctl bootout gui/$(id -u)/${label}`);
