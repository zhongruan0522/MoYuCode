import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@animate-ui/components-buttons-theme-toggler": path.resolve(
        __dirname,
        "./src/components/animate-ui/components/buttons/theme-toggler",
      ),
      "@animate-ui/components-base-files": path.resolve(
        __dirname,
        "./src/components/animate-ui/components/radix/files",
      ),
    },
  },
})
