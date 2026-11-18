const points = new Intl.NumberFormat("pt-BR");

/** 2412 → "2.412" */
export const formatPoints = (value: number) => points.format(value);

/** 12 → "12º" */
export const ordinal = (value: number) => `${value}º`;
