import Image from "next/image";
import styles from "./brand.module.css";

/**
 * Logo da ObraPrima (arquivos originais do repositório OP, em public/brand).
 * "light": "obra" em cinza, para fundo branco.
 * "dark": "obra" em branco, para fundo preto.
 * O cubo e o "prima" são amarelo/laranja e somem sobre o amarelo da marca:
 * em fundo amarelo use o BrandBadge.
 */
const LOGOS = {
  light: { src: "/brand/obraprima-logo.png", width: 274, height: 64 },
  dark: { src: "/brand/obraprima-logo-negativo.png", width: 628, height: 183 },
} as const;

export function BrandLogo({
  surface,
  width,
  className,
  priority = false,
}: {
  surface: "light" | "dark";
  /** Largura exibida em px; a altura segue a proporção do arquivo. */
  width: number;
  className?: string;
  priority?: boolean;
}) {
  const logo = LOGOS[surface];
  return (
    <Image
      src={logo.src}
      alt="ObraPrima"
      width={width}
      height={Math.round((width * logo.height) / logo.width)}
      className={className}
      priority={priority}
    />
  );
}

/** Selo preto com o logo, para telas de fundo amarelo. */
export function BrandBadge({
  width,
  className,
  priority = false,
}: {
  width: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={[styles.badge, className].filter(Boolean).join(" ")}>
      <BrandLogo surface="dark" width={width} priority={priority} />
    </span>
  );
}
