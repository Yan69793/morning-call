import { useState, useEffect, useCallback } from "react";
import type { MorningCallResponse } from "../types/morningCall";
import type { EconomicAgenda, EconomicCalendarEvent, PlanoPregao } from "../types/agenda";

/* ------------------------------------------------------------------ */
/* Labels & helpers                                                    */
/* ------------------------------------------------------------------ */

const PAIS_LABEL: Record<string, string> = {
  BR: "Brasil",
  EUA: "EUA",
  CN: "China",
  JP: "Japao",
  EZ: "Zona do Euro",
  UK: "Reino Unido",
  GLOBAL: "Global",
};

const ALERTA_COLOR: Record<string, string> = {
  baixo: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  moderado: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  elevado: "bg-red-500/20 text-red-400 border-red-500/30",
  critico: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  indisponivel: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const ALERTA_LABEL: Record<string, string> = {
  baixo: "Baixo",
  moderado: "Moderado",
  elevado: "Elevado",
  critico: "Critico",
  indisponivel: "Indisponivel",
};

const IMPORTANCIA_COLOR: Record<string, string> = {
  alta: "bg-red-500 text-white",
  media: "bg-amber-500 text-white",
  baixa: "bg-emerald-500 text-white",
};

const IMPORTANCIA_BORDER: Record<string, string> = {
  alta: "border-l-red-500",
  media: "border-l-amber-500",
  baixa: "border-l-emerald-500",
};

function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} />;
}

function AgendaSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <Skeleton className="h-6 sm:h-7 w-24 sm:w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function EventCard({ event }: { event: EconomicCalendarEvent }) {
  const borderColor = IMPORTANCIA_BORDER[event.importancia] ?? "border-l-slate-400";

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border-l-4 ${borderColor} border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2.5`}>
      {/* Header: importancia + horario */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold tracking-wide ${IMPORTANCIA_COLOR[event.importancia] ?? "bg-slate-500 text-white"}`}>
          {event.importancia.toUpperCase()}
        </span>
        <span className="text-[10px] sm:text-xs font-mono text-text-muted dark:text-dark-text-muted">
          {event.hora_brt} BRT
        </span>
      </div>

      {/* Nome do evento + pais */}
      <div>
        <h3 className="text-xs sm:text-sm font-semibold text-text-primary dark:text-dark-text-primary leading-snug">
          {event.evento}
        </h3>
        <p className="text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted mt-0.5">
          {PAIS_LABEL[event.pais] ?? event.pais}
        </p>
      </div>

      {/* Consenso vs Anterior */}
      {(event.consenso || event.anterior) && (
        <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2">
          {event.consenso && (
            <div className="text-center">
              <div className="text-[8px] sm:text-[9px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-0.5">
                Consenso
              </div>
              <div className="text-[10px] sm:text-xs font-mono font-semibold text-text-primary dark:text-dark-text-primary">
                {fmtNum(event.consenso.value)} {event.consenso.unit}
              </div>
            </div>
          )}
          {event.anterior && (
            <div className="text-center">
              <div className="text-[8px] sm:text-[9px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-0.5">
                Anterior
              </div>
              <div className="text-[10px] sm:text-xs font-mono font-semibold text-text-muted dark:text-dark-text-muted">
                {fmtNum(event.anterior.value)} {event.anterior.unit}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sensibilidade */}
      <p className="text-[9px] sm:text-[10px] text-text-primary dark:text-dark-text-primary leading-relaxed">
        {event.sensibilidade}
      </p>

      {/* Cenarios */}
      <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700">
        <p className="text-[9px] sm:text-[10px]">
          <span className="font-semibold text-accent-green/80">Benigno: </span>
          <span className="text-text-muted dark:text-dark-text-muted">{event.cenario_benigno}</span>
        </p>
        <p className="text-[9px] sm:text-[10px]">
          <span className="font-semibold text-accent-red/80">Adverso: </span>
          <span className="text-text-muted dark:text-dark-text-muted">{event.cenario_adverso}</span>
        </p>
      </div>

      {/* Ativos expostos */}
      <div className="flex flex-wrap gap-1.5">
        {event.ativos_expostos.map((ativo) => (
          <span
            key={ativo}
            className="text-[8px] sm:text-[9px] bg-accent-blue/10 dark:bg-accent-blue/20 text-accent-blue dark:text-blue-400 rounded px-1.5 py-0.5 font-medium"
          >
            {ativo}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlanoPregaoSection({ plano }: { plano: PlanoPregao }) {
  const blocos = [
    { label: "Antes da Abertura", items: plano.antes_abertura, color: "border-l-sky-500" },
    { label: "Durante o Pregao", items: plano.durante_pregao, color: "border-l-amber-500" },
    { label: "Proximo ao Fechamento", items: plano.proximo_fechamento, color: "border-l-violet-500" },
  ];

  return (
    <section className="space-y-2 sm:space-y-3">
      <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
        Plano do Pregao
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {blocos.map(({ label, items, color }) => (
          <div
            key={label}
            className={`bg-white dark:bg-slate-800 rounded-xl border-l-4 ${color} border border-slate-200 dark:border-slate-700 p-3 sm:p-4`}
          >
            <h3 className="text-[9px] sm:text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-2">
              {label}
            </h3>
            {items.length > 0 ? (
              <ul className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px] sm:text-[11px]">
                    <span className="text-text-dim dark:text-dark-text-dim shrink-0 mt-0.5">•</span>
                    <span className="text-text-primary dark:text-dark-text-primary leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-text-dim dark:text-dark-text-dim italic">
                Nenhuma acao especifica
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Data hook                                                           */
/* ------------------------------------------------------------------ */

/** URL base do worker morning-call. Em dev, usa proxy do Vite; em prod, env var. */
const MC_API_URL = import.meta.env.VITE_MORNING_CALL_API_URL ?? "/mc-api";

interface AgendaState {
  agenda: EconomicAgenda | null;
  loading: boolean;
  error: string | null;
}

function useAgenda(): AgendaState & { reload: () => void } {
  const [state, setState] = useState<AgendaState>({ agenda: null, loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const url = `${MC_API_URL}/api/report/latest`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MorningCallResponse = await res.json();
      const payload = data?.ok && data.report ? (data.report as any) : null;
      const agenda = payload?.agenda ?? null;
      setState({ agenda, loading: false, error: null });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Erro desconhecido",
      }));
    }
  }, []);

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));
    void load();
  }, [load]);

  return { ...state, reload: load };
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export function Agenda() {
  const { agenda, loading, error } = useAgenda();

  if (loading) return <AgendaSkeleton />;

  if (error) {
    return (
      <div className="text-accent-red text-xs sm:text-sm p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
        Erro ao carregar Agenda: {error}
      </div>
    );
  }

  if (!agenda) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-text-primary dark:text-dark-text-primary">Agenda</h1>
          <p className="text-[10px] sm:text-xs text-text-muted dark:text-dark-text-muted mt-1">
            Eventos economicos, indicadores e gatilhos do dia.
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 sm:p-5 text-center">
          <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 font-semibold">
            Agenda indisponivel
          </p>
          <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 mt-1">
            O calendario economico ainda nao foi gerado para hoje. O sistema roda as 06:30 BRT em dias uteis.
          </p>
        </div>
      </div>
    );
  }

  // Agrupar eventos por periodo do dia
  const antesAbertura = agenda.eventos.filter((e) => {
    const h = parseInt(e.hora_brt.split(":")[0], 10);
    return h < 10;
  });
  const durantePregao = agenda.eventos.filter((e) => {
    const h = parseInt(e.hora_brt.split(":")[0], 10);
    return h >= 10 && h < 16;
  });
  const proximoFechamento = agenda.eventos.filter((e) => {
    const h = parseInt(e.hora_brt.split(":")[0], 10);
    return h >= 16 || e.hora_brt === "—";
  });

  const hasEventos = agenda.eventos.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="text-base sm:text-lg font-semibold text-text-primary dark:text-dark-text-primary">
          Agenda
        </h1>
        <span className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold tracking-wide border ${ALERTA_COLOR[agenda.nivel_alerta] ?? ALERTA_COLOR.indisponivel}`}>
          {ALERTA_LABEL[agenda.nivel_alerta] ?? agenda.nivel_alerta}
        </span>
        <span className="text-[10px] sm:text-xs text-text-muted dark:text-dark-text-muted">
          {agenda.trade_date} · {agenda.eventos.length} evento{agenda.eventos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Resumo */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
        <p className="text-xs sm:text-sm text-text-primary dark:text-dark-text-primary leading-relaxed">
          {agenda.resumo}
        </p>
      </div>

      {/* Eventos */}
      {hasEventos ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Bloco: Antes da Abertura */}
          {antesAbertura.length > 0 && (
            <section className="space-y-2 sm:space-y-3">
              <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
                Antes da Abertura (06:00–10:00)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {antesAbertura.map((event, i) => (
                  <EventCard key={`antes-${i}`} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Bloco: Durante o Pregao */}
          {durantePregao.length > 0 && (
            <section className="space-y-2 sm:space-y-3">
              <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
                Durante o Pregao (10:00–16:00)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {durantePregao.map((event, i) => (
                  <EventCard key={`durante-${i}`} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Bloco: Proximo ao Fechamento */}
          {proximoFechamento.length > 0 && (
            <section className="space-y-2 sm:space-y-3">
              <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
                Proximo ao Fechamento (16:00–18:00)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {proximoFechamento.map((event, i) => (
                  <EventCard key={`fim-${i}`} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 sm:p-6 text-center">
          <p className="text-xs sm:text-sm text-text-muted dark:text-dark-text-muted font-medium">
            Nenhum evento economico programado para hoje.
          </p>
          <p className="text-[10px] sm:text-xs text-text-dim dark:text-dark-text-dim mt-1">
            Dias sem eventos sao raros — verifique feriados ou fim de semana.
          </p>
        </div>
      )}

      {/* Plano do Pregao */}
      {agenda.plano_pregao &&
        (agenda.plano_pregao.antes_abertura.length > 0 ||
          agenda.plano_pregao.durante_pregao.length > 0 ||
          agenda.plano_pregao.proximo_fechamento.length > 0) && (
          <PlanoPregaoSection plano={agenda.plano_pregao} />
        )}

      {/* Provenance footer */}
      <footer className="pt-3 sm:pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-1 text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">
          <span>Run: <span className="font-mono text-text-dim dark:text-dark-text-dim">{agenda.provenance.run_id.slice(0, 8)}</span></span>
          <span>Model: {agenda.provenance.model}</span>
          <span>Gerado: {new Date(agenda.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
        </div>
      </footer>
    </div>
  );
}
