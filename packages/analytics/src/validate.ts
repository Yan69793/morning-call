// dashboard/shared/validate.ts
// Validação do contrato do scan radar — portada de ingest.js do legado.
// Sem dependências externas; roda tanto em Node.js (testes) quanto em Workers.

const SEMVER = /^\d+\.\d+\.\d+$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isNumOrNull(v: unknown): boolean {
  return v === null || typeof v === "number";
}

function validateNewsArray(arr: unknown, tag: string, errors: string[]): void {
  if (!Array.isArray(arr)) {
    errors.push(`${tag} deve ser array`);
    return;
  }
  arr.forEach((n, i) => {
    if (typeof n !== "object" || n === null) {
      errors.push(`${tag}[${i}] inválido`);
      return;
    }
    const item = n as Record<string, unknown>;
    if (typeof item.title !== "string" || !item.title) errors.push(`${tag}[${i}].title inválido`);
    if (typeof item.url !== "string" || !item.url) errors.push(`${tag}[${i}].url inválido`);
  });
}

export function validateRadar(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof obj !== "object" || obj === null) {
    return { ok: false, errors: ["payload não é um objeto JSON"] };
  }

  const radar = obj as Record<string, unknown>;

  if (!isStr(radar.scanId)) errors.push("scanId ausente ou inválido");
  for (const f of ["schemaVersion", "methodologyVersion", "universeVersion"]) {
    const v = radar[f];
    if (!isStr(v) || !SEMVER.test(v)) errors.push(`${f} ausente ou fora de semver`);
  }
  if (!isStr(radar.generatedAt)) errors.push("generatedAt ausente");
  if (!isStr(radar.marketDate) || !/^\d{4}-\d{2}-\d{2}$/.test(radar.marketDate)) {
    errors.push("marketDate inválido");
  }
  if (!isStr(radar.timezone)) errors.push("timezone ausente");
  if (!Array.isArray(radar.warnings)) errors.push("warnings deve ser array");
  if (!Array.isArray(radar.items) || radar.items.length === 0) {
    errors.push("items ausente ou vazio");
    return { ok: errors.length === 0, errors };
  }

  (radar.items as unknown[]).forEach((it, i) => {
    const tag = `items[${i}]`;
    if (typeof it !== "object" || it === null) {
      errors.push(`${tag} inválido`);
      return;
    }
    const item = it as Record<string, unknown>;
    if (!isStr(item.symbol)) errors.push(`${tag}.symbol inválido`);
    if (!isStr(item.name)) errors.push(`${tag}.name inválido`);
    if (item.type !== "macro" && item.type !== "acao") errors.push(`${tag}.type inválido`);
    if (!isNumOrNull(item.last)) errors.push(`${tag}.last inválido`);
    if (typeof item.metrics !== "object" || item.metrics === null)
      errors.push(`${tag}.metrics ausente`);
    if (!(item.score === null || typeof item.score === "number"))
      errors.push(`${tag}.score inválido`);
    if (typeof item.bias !== "object" || item.bias === null) errors.push(`${tag}.bias ausente`);
    if (!isStr(item.regime)) errors.push(`${tag}.regime ausente`);
    if (!isBool(item.alert)) errors.push(`${tag}.alert inválido`);
    if (typeof item.quality !== "object" || item.quality === null)
      errors.push(`${tag}.quality ausente`);
    if (item.news !== undefined) validateNewsArray(item.news, `${tag}.news`, errors);
  });

  // news top-level (opcional)
  if (radar.news !== undefined) {
    if (typeof radar.news !== "object" || radar.news === null) {
      errors.push("news deve ser objeto");
    } else {
      const news = radar.news as Record<string, unknown>;
      if (news.macro !== undefined) {
        validateNewsArray(news.macro, "news.macro", errors);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
