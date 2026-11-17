// Imported by integration.test.js before ../index.js, so the API tests never reach a real
// rigctld even when server/.env enables rig control (.env does not override set variables).
process.env.RIGCTLD_ENABLED = "false";
