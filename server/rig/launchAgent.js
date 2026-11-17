// macOS LaunchAgent plist for rigctld. rigctld listens on 127.0.0.1 only (its default is
// every interface), holds the CAT port without asserting RTS/DTR and never powers the rig on or off.
export const LAUNCH_AGENT_DEFAULTS = {
  bin: "/opt/homebrew/bin/rigctld",
  model: 1035,
  baud: 9600,
  stopBits: 2,
  port: 4532,
  label: "de.dn9mtk.rigctld"
};

const FT991A_BAUD_RATES = [4800, 9600, 19200, 38400];
// The FT-991A answers CAT only with 2 stop bits (hamlib model 1035 defaults to 8N2)
const STOP_BITS = [1, 2];

const serialSettings = (stopBits) => [
  "serial_handshake=None",
  `stop_bits=${stopBits}`,
  "data_bits=8",
  "serial_parity=None",
  "rts_state=OFF",
  "dtr_state=OFF",
  "auto_power_on=0",
  "auto_power_off=0",
  "multicast_data_addr=0.0.0.0",
  "multicast_cmd_addr=0.0.0.0"
].join(",");

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${name} must be a whole number`);
  return n;
}

/** Validate the generator settings; throws with a readable message. */
export function validateLaunchAgentOptions({ bin, model, device, baud, stopBits = LAUNCH_AGENT_DEFAULTS.stopBits, port, label, logPath }) {
  if (!bin || !bin.startsWith("/")) throw new Error("RIGCTLD_BIN must be an absolute path to rigctld");
  if (!device) throw new Error("RIGCTLD_DEVICE is not set (e.g. /dev/cu.usbserial-XXXXXXXX0)");
  if (!/^\/dev\/cu\.[A-Za-z0-9._-]+$/.test(device)) {
    throw new Error("RIGCTLD_DEVICE must be a /dev/cu.* serial device (not /dev/tty.*)");
  }
  if (/\/cu\.usbserial-[0-9A-Fa-f]+1$/.test(device)) {
    throw new Error("RIGCTLD_DEVICE ends in 1: that is the CP2105 Standard port – use the Enhanced port (…0) for CAT");
  }
  const modelNumber = toInt(model, "RIGCTLD_MODEL");
  if (modelNumber < 1) throw new Error("RIGCTLD_MODEL must be a positive hamlib model number");
  const baudRate = toInt(baud, "RIGCTLD_BAUD");
  if (!FT991A_BAUD_RATES.includes(baudRate)) throw new Error(`RIGCTLD_BAUD must be one of ${FT991A_BAUD_RATES.join(", ")}`);
  const stopBitCount = toInt(stopBits, "RIGCTLD_STOP_BITS");
  if (!STOP_BITS.includes(stopBitCount)) throw new Error(`RIGCTLD_STOP_BITS must be one of ${STOP_BITS.join(", ")}`);
  const tcpPort = toInt(port, "RIGCTLD_PORT");
  if (tcpPort < 1024 || tcpPort > 65535) throw new Error("RIGCTLD_PORT must be between 1024 and 65535");
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(label || "")) {
    throw new Error("RIGCTLD_LAUNCHAGENT_LABEL must be a reverse-DNS name like de.example.rigctld");
  }
  if (!logPath || !logPath.startsWith("/")) throw new Error("The log path must be absolute");
  return { bin, model: modelNumber, device, baud: baudRate, stopBits: stopBitCount, port: tcpPort, label, logPath };
}

export function rigctldArguments({ bin, model, device, baud, stopBits, port }) {
  return [bin, "-m", String(model), "-r", device, "-s", String(baud), "-T", "127.0.0.1", "-t", String(port), "-C", serialSettings(stopBits)];
}

/** Build the plist XML. Pure: does not touch the file system or launchctl. */
export function buildRigctldLaunchAgent(options) {
  const settings = validateLaunchAgentOptions(options);
  const args = rigctldArguments(settings).map((a) => `    <string>${xmlEscape(a)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(settings.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>PathState</key>
    <dict>
      <key>${xmlEscape(settings.device)}</key>
      <true/>
    </dict>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(settings.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(settings.logPath)}</string>
</dict>
</plist>
`;
}
