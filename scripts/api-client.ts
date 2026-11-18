/**
 * Cliente HTTP mínimo da API do quiz, usado pelos scripts de simulação e de carga.
 */
import type {
  GameState,
  HostStateResponse,
  JoinResponse,
  PlayerStateResponse,
} from "../lib/game/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`${status} ${code}: ${message}`);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = JSON.parse(text);
    } catch {
      // resposta sem JSON
    }
    throw new ApiError(response.status, body.error ?? "HTTP", body.message ?? text.slice(0, 200));
  }
  return (response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text) as T;
}

export class HostClient {
  private cookie = "";

  constructor(private readonly baseUrl: string) {}

  async login(password: string) {
    const response = await fetch(`${this.baseUrl}/api/host/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw new ApiError(response.status, "LOGIN", await response.text());
    this.cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  }

  private call<T>(path: string, body?: unknown) {
    return request<T>(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  createSession() {
    return this.call<{ sessionId: string; pin: string }>("/api/host/sessions", {});
  }

  state(sessionId: string) {
    return this.call<HostStateResponse>(`/api/host/sessions/${sessionId}`);
  }

  advance(sessionId: string, expectedVersion: number) {
    return this.call<GameState>(`/api/host/sessions/${sessionId}/advance`, { expectedVersion });
  }

  closeQuestion(sessionId: string, expectedVersion: number, reason: "manual" | "timeout") {
    return this.call<GameState>(`/api/host/sessions/${sessionId}/close-question`, {
      expectedVersion,
      reason,
    });
  }

  exportCsv(sessionId: string) {
    return this.call<string>(`/api/host/sessions/${sessionId}/export.csv`);
  }
}

export class PlayerClient {
  token = "";
  playerId = "";

  constructor(
    private readonly baseUrl: string,
    readonly nickname: string,
  ) {}

  async join(pin: string) {
    const joined = await request<JoinResponse>(`${this.baseUrl}/api/join`, {
      method: "POST",
      body: JSON.stringify({ pin, nickname: this.nickname }),
    });
    this.token = joined.token;
    this.playerId = joined.playerId;
    return joined;
  }

  state() {
    return request<PlayerStateResponse>(`${this.baseUrl}/api/state`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  answer(questionId: string, optionId: string) {
    return request<{ received: true }>(`${this.baseUrl}/api/answer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ questionId, optionId }),
    });
  }
}
