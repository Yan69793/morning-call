/**
 * Chaves canônicas do snapshot. LLM e cross-check só citam estas strings.
 * Ampliar aqui — nunca no prompt solto.
 */
export const SNAPSHOT_KEYS = {
  USDBRL: "USDBRL",
  SELIC_META: "SELIC_META",
  SELIC_DIARIA: "SELIC_DIARIA",
  CDI_DIARIA: "CDI_DIARIA",
  IPCA_12M: "IPCA_12M",
  FOCUS_IPCA_ANO: "FOCUS_IPCA_ANO",
  FOCUS_SELIC_ANO: "FOCUS_SELIC_ANO",
  FOCUS_CAMBIO_ANO: "FOCUS_CAMBIO_ANO",
  UST_2Y: "UST_2Y",
  UST_10Y: "UST_10Y",
  UST_30Y: "UST_30Y",
  VIX: "VIX",
  DXY_PROXY: "DXY_PROXY",
  BRENT: "BRENT",
  WTI: "WTI",
} as const;

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[keyof typeof SNAPSHOT_KEYS];

/** Códigos SGS BCB usados no Portão 1 (confirmar catálogo antes de confiar em produção). */
export const SGS_CODES = {
  /** USD/BRL PTAX venda diária */
  USDBRL: 1,
  SELIC_DIARIA: 11,
  CDI_DIARIA: 12,
  SELIC_META: 432,
  IPCA_MENSAL: 433,
  IPCA_12M: 13522,
} as const;
