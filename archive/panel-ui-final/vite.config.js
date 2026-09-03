const path = require("path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "panel-ui"),
  base: "/panel/",
  build: {
    outDir: path.resolve(__dirname, "public", "panel"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return null;
          if (
            id.includes("react-router-dom") ||
            id.includes("react-router") ||
            id.includes("@remix-run") ||
            id.includes("react-dom") ||
            id.includes(`${path.sep}react${path.sep}`)
          ) {
            return "react-vendor";
          }
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("recharts")) return "charts";
          return null;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
