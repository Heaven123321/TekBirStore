import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      ".ngrok-free.app",
      ".ngrok-free.dev",
      ".trycloudflare.com",
    ],
    port: 5173,
  },
});
