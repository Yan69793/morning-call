// holidays.js — decisao de dia util B3, porta da logica do run_briefing.ps1
// PASSO 0 + feriados-b3.json.
//
// F08: cobertura vencida -> alerta + trata como dia util (melhor rodar em
// feriado do que nao rodar em dia util).

import feriadosB3 from "./assets/feriados-b3.json" with { type: "json" };

export function diaUtilInfo(dateTag) {
  // dateTag = YYYYMMDD. Retorna { util: boolean, motivo: string }.
  const iso = `${dateTag.slice(0, 4)}-${dateTag.slice(4, 6)}-${dateTag.slice(6, 8)}`;
  const d = new Date(`${iso}T00:00:00Z`);
  const jsDay = d.getUTCDay(); // 0=domingo
  if (jsDay === 0 || jsDay === 6) {
    return { util: false, motivo: "Fim de semana" };
  }
  const coberturaAte = feriadosB3.cobertura_ate;
  if (coberturaAte && coberturaAte < dateTag) {
    // F08: cobertura expirada. Trata como dia util, com aviso.
    return { util: true, motivo: `Cobertura de feriados expirou em ${coberturaAte} (F08)` };
  }
  const feriado = feriadosB3.feriados.find((f) => f.data === iso);
  if (feriado) {
    return { util: false, motivo: `Feriado B3: ${feriado.nome}` };
  }
  return { util: true, motivo: "Dia util" };
}

export { feriadosB3 };
