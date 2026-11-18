/** Chamadas HTTP do navegador para as rotas do próprio app. */

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const NETWORK_MESSAGE = "Sem conexão com o servidor. Confira a internet e tente de novo.";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", NETWORK_MESSAGE);
  }
  if (!response.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await response.json();
    } catch {
      // resposta sem JSON
    }
    throw new ApiRequestError(
      response.status,
      body.error ?? "HTTP",
      body.message ?? "Algo deu errado. Tente de novo.",
    );
  }
  return (await response.json()) as T;
}

export const postJson = <T>(path: string, body: unknown, headers?: HeadersInit) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body), headers });

export const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });
