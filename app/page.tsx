import { JoinForm } from "@/components/player/JoinForm";

/** Entrada do participante. O QR code do telão abre `/?pin=123456` já com o PIN. */
export default async function JoinPage({ searchParams }: PageProps<"/">) {
  const { pin } = await searchParams;
  return <JoinForm initialPin={typeof pin === "string" ? pin : ""} />;
}
