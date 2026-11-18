import "server-only";

/** Só o servidor publica nos canais. */
export interface Publisher {
  publish(topic: string, event: string, payload: unknown): Promise<void>;
}

/**
 * Publica pelo endpoint REST de Broadcast do Supabase Realtime: uma chamada HTTP
 * por mensagem, sem manter WebSocket aberto (funções da Vercel não seguram conexão).
 */
export class SupabaseBroadcastPublisher implements Publisher {
  private readonly endpoint: string;

  constructor(
    supabaseUrl: string,
    private readonly serviceRoleKey: string,
  ) {
    this.endpoint = new URL("/realtime/v1/api/broadcast", supabaseUrl).toString();
  }

  async publish(topic: string, event: string, payload: unknown): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      throw new Error(`Broadcast falhou (${response.status}): ${await response.text()}`);
    }
  }
}

/** Sem tempo real (modo memória): os navegadores se atualizam pelo polling. */
export class NoopPublisher implements Publisher {
  async publish(): Promise<void> {}
}

/** Guarda as mensagens publicadas; usado nos testes. */
export class RecordingPublisher implements Publisher {
  readonly messages: { topic: string; event: string; payload: unknown }[] = [];

  async publish(topic: string, event: string, payload: unknown): Promise<void> {
    this.messages.push({ topic, event, payload });
  }
}
