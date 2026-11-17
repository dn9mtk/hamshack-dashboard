import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend port: same PORT variable as the server (default 8788)
const apiPort = process.env.PORT || 8788;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // frontend calls /api -> backend localhost:<PORT>
      "/api": `http://localhost:${apiPort}`
    }
  }
});
