export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Relógio do servidor, para o celular calcular a diferença do próprio relógio. */
export function GET() {
  return Response.json({ serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
