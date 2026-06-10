import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Load VITE_* from repo root .env (same file as Flask backend)
  envDir: path.resolve(__dirname, ".."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
        // 読み取り・添削は設問ごとに分けたが、1設問あたり数十秒かかることがある
        timeout: 900_000,
        proxyTimeout: 900_000,
      },
    },
  },
});
