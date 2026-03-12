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
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
