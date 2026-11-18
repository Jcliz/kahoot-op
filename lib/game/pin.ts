/** Funções de PIN que rodam tanto no servidor quanto no navegador. */

export const PIN_LENGTH = 6;

/** PIN numérico de 6 dígitos que nunca começa com zero. */
export function isValidPin(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}

/** "482913" → "482 913", como no telão. */
export function formatPin(pin: string): string {
  return pin.length === PIN_LENGTH ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

/** Aceita o que o participante digitar ("482 913", "482-913") e devolve só os dígitos. */
export function normalizePinInput(input: string): string {
  return input.replace(/\D/g, "").slice(0, PIN_LENGTH);
}
