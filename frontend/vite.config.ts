import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": {
        target: "https://zoi8injnld.execute-api.us-west-2.amazonaws.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/prod/api"),
      },
    },
  },
});
