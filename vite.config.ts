import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Dev-only: forward AI endpoints to the production backend so the full
    // buyer flow works locally (server-to-server, bypasses backend CORS).
    proxy: {
      "/api": {
        target: "https://api-production-ca75.up.railway.app",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    // 平台的使用者都在台灣:日期 / 月份一律用本地時區算(例如本月 GMV 算在確認收貨的「台灣」月份)。
    // CI 跑在 UTC,本地時區 = UTC 時「本地 vs UTC」的差別驗不出來,所以測試固定用台灣時區。
    env: { TZ: "Asia/Taipei" },
    // landing/ 是形象站:測試是 node:test 格式的 *.test.cjs,在 landing/ 裡用 npm test 跑,不歸 vitest 管。
    exclude: [...configDefaults.exclude, "landing/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
