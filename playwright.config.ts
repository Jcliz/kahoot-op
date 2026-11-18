import { defineConfig } from "@playwright/test";

const PORT = 3210;

/**
 * Ponta a ponta com o backend em memória (sem Supabase): o tempo real fica
 * desligado e os navegadores usam o polling de reserva, o mesmo caminho que
 * salva o jogo quando o WebSocket cai.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/time`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATA_BACKEND: "memory",
      HOST_PASSWORD: "senha-e2e",
      HOST_SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      STREAK_BONUS: "false",
    },
  },
});
