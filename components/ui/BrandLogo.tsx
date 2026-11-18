import Image from "next/image";

/**
 * Símbolo da ObraPrima (só o cubo, sem o texto), recortado do logo original
 * do repositório OP. Fica legível direto sobre o amarelo da marca, sem selo.
 */
const SYMBOL = { src: "/brand/obraprima-simbolo.png", width: 130, height: 135 } as const;

export function BrandSymbol({
  height,
  className,
  priority = false,
}: {
  /** Altura exibida em px; a largura segue a proporção do arquivo. */
  height: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={SYMBOL.src}
      alt="ObraPrima"
      width={Math.round((height * SYMBOL.width) / SYMBOL.height)}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
