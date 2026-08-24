import { useState, useEffect, useCallback } from "react";
import type {
  MorningCallResponse,
  MorningCallPayload,
  MorningCallReport,
  TradeCard,
  Scenario,
} from "../types/morningCall";
import { MorningCallPdfButton, MorningCallPdfSheet } from "../components/MorningCallPdf";

/* ------------------------------------------------------------------ */
/* Labels & helpers                                                    */
/* ------------------------------------------------------------------ */

const REGIME_LABEL: Record<string, string> = {
  goldilocks: "Goldilocks",
  reflacionario: "Reflacionario",
  estagflacionario: "Estagflacionario",
  desinflacionario: "Desinflacionario",
  recessivo: "Recessivo",
  risk_on_especulativo: "Risk-on Especulativo",
  risk_off_sistemico: "Risk-off Sistemico",
  transicao: "Transicao",
};

const VIES_LABEL: Record<string, string> = {
  comprador: "Comprador",
  vendedor: "Vendedor",
  neutro: "Neutro",
  long_vol: "Long Vol",
  short_vol: "Short Vol",
};

const REGIME_COLOR: Record<string, string> = {
  goldilocks: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  reflacionario: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  estagflacionario: "bg-red-500/20 text-red-400 border-red-500/30",
  desinflacionario: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  recessivo: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  risk_on_especulativo: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  risk_off_sistemico: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  transicao: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

const CENARIO_LABEL: Record<string, string> = {
  base: "Base",
  bull: "Bull",
  bear: "Bear",
  cisne_cinza: "Cisne Cinza",
};

const CENARIO_BORDER: Record<string, string> = {
  base: "border-slate-500/40",
  bull: "border-emerald-500/40",
  bear: "border-red-500/40",
  cisne_cinza: "border-amber-500/40",
};

const DIRECAO_LABEL: Record<string, string> = {
  comprar: "COMPRA",
  vender: "VENDA",
};

function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function fmtPct(v: number): string {
  const s = (v * 100).toFixed(1);
  return v > 0 ? `+${s}%` : `${s}%`;
}

function pctColor(v: number): string {
  if (v > 0) return "text-accent-green";
  if (v < 0) return "text-accent-red";
  return "text-text-muted dark:text-dark-text-muted";
}

function regimeColor(r: string): string {
  return REGIME_COLOR[r] ?? "bg-slate-500/20 text-slate-400 border-slate-500/30";
}

function viesColor(v: string): string {
  if (v === "comprador" || v === "long_vol") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (v === "vendedor" || v === "short_vol") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-slate-500/20 text-slate-400 border-slate-500/30";
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} />;
}

function MorningCallSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Skeleton className="h-6 sm:h-7 w-36 sm:w-44" />
        <Skeleton className="h-4 sm:h-5 w-16 sm:w-20 rounded-full" />
        <Skeleton className="h-4 sm:h-5 w-16 sm:w-20 rounded-full" />
        <Skeleton className="h-3 sm:h-4 w-28 sm:w-32" />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-5 space-y-2 sm:space-y-3">
        <Skeleton className="h-4 sm:h-5 w-40 sm:w-48" />
        <Skeleton className="h-3 sm:h-4 w-full" />
        <Skeleton className="h-3 sm:h-4 w-3/4" />
        <Skeleton className="h-3 sm:h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2 sm:space-y-3">
            <Skeleton className="h-4 sm:h-5 w-36 sm:w-40" />
            <Skeleton className="h-3 sm:h-4 w-full" />
            <Skeleton className="h-3 sm:h-4 w-2/3" />
            <Skeleton className="h-10 sm:h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ConvictionBar({ value }: { value: number }) {
  const pct = Math.round((value / 10) * 100);
  const color =
    value >= 8 ? "bg-emerald-500" : value >= 6 ? "bg-amber-500" : value >= 4 ? "bg-slate-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
        Conviccao
      </span>
      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden max-w-[120px]">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-text-primary dark:text-dark-text-primary">
        {value}/10
      </span>
    </div>
  );
}

function ExecutiveSummaryCard({ report }: { report: MorningCallReport }) {
  const a = report.abertura;
  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold tracking-wide border ${regimeColor(a.regime)}`}>
          {REGIME_LABEL[a.regime] ?? a.regime}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold tracking-wide border ${viesColor(a.vies)}`}>
          {VIES_LABEL[a.vies] ?? a.vies}
        </span>
        <ConvictionBar value={a.conviccao} />
      </div>

      <div>
        <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-1 sm:mb-1.5">
          Tensao Macro Dominante
        </h2>
        <p className="text-xs sm:text-sm text-text-primary dark:text-dark-text-primary leading-relaxed">
          {a.tensao_macro_dominante}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="text-[9px] sm:text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-1">
            Premissa que sustenta os precos
          </h3>
          <p className="text-[11px] sm:text-xs text-text-primary dark:text-dark-text-primary leading-relaxed">
            {a.premissa_que_sustenta_precos}
          </p>
        </div>
        <div>
          <h3 className="text-[9px] sm:text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-1">
            Fato que quebraria
          </h3>
          <p className="text-[11px] sm:text-xs text-text-primary dark:text-dark-text-primary leading-relaxed">
            {a.fato_que_quebraria}
          </p>
        </div>
      </div>
    </section>
  );
}

function TradeCardView({ trade, rank }: { trade: TradeCard; rank: number }) {
  const d = trade.draft;
  const rr = trade.risco_retorno;
  const entryVal = d.entrada.nivel.value;
  const entryUnit = d.entrada.nivel.unit;
  const alvo1 = d.alvo_1;
  const inv = d.invalidacao;
  const direcaoLabel = DIRECAO_LABEL[d.direcao] ?? d.direcao.toUpperCase();
  const direcaoColor = d.direcao === "comprar" ? "text-accent-green" : "text-accent-red";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2.5 sm:space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="text-[9px] sm:text-[10px] font-semibold text-text-muted dark:text-dark-text-muted bg-slate-100 dark:bg-slate-700 px-1 sm:px-1.5 py-0.5 rounded">
              #{rank}
            </span>
            <span className={`text-[9px] sm:text-[10px] font-bold tracking-wide ${direcaoColor}`}>
              {direcaoLabel}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-text-primary dark:text-dark-text-primary truncate">
              {d.nome}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
            <span className="text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">{d.classe}</span>
            <span className="text-[9px] sm:text-[10px] text-text-dim dark:text-dark-text-dim">|</span>
            <span className="text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">{d.categoria}</span>
            <span className="text-[9px] sm:text-[10px] text-text-dim dark:text-dark-text-dim">|</span>
            <span className="text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">{d.horizonte}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-base sm:text-lg font-mono font-bold ${pctColor(rr.value)}`}>
            {fmtPct(rr.value)}
          </div>
          <div className="text-[8px] sm:text-[9px] text-text-muted dark:text-dark-text-muted">risco-retorno</div>
        </div>
      </div>

      {/* Niveis */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2 sm:p-3">
        <div className="text-center">
          <div className="text-[8px] sm:text-[9px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-0.5">
            Entrada
          </div>
          <div className="text-[10px] sm:text-xs font-mono font-semibold text-text-primary dark:text-dark-text-primary">
            {fmtNum(entryVal)} {entryUnit}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] sm:text-[9px] font-semibold text-accent-green/80 uppercase tracking-widest mb-0.5">
            Alvo{d.alvo_2 ? " 1" : ""}
          </div>
          <div className="text-[10px] sm:text-xs font-mono font-semibold text-accent-green">
            {fmtNum(alvo1.value)} {alvo1.unit}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] sm:text-[9px] font-semibold text-accent-red/80 uppercase tracking-widest mb-0.5">
            Invalidação
          </div>
          <div className="text-[10px] sm:text-xs font-mono font-semibold text-accent-red">
            {inv.nivel ? `${fmtNum(inv.nivel.value)} ${inv.nivel.unit}` : "Evento"}
          </div>
        </div>
      </div>

      {d.alvo_2 && (
        <div className="text-center -mt-2">
          <span className="text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">
            Alvo 2: <span className="font-mono text-accent-green">{fmtNum(d.alvo_2.value)} {d.alvo_2.unit}</span>
          </span>
        </div>
      )}

      {/* Tese */}
      <div>
        <h4 className="text-[9px] sm:text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-1">
          Tese
        </h4>
        <p className="text-[11px] sm:text-xs text-text-primary dark:text-dark-text-primary leading-relaxed">{d.tese}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px]">
        <div>
          <span className="font-semibold text-text-muted dark:text-dark-text-muted">Erro de precificacao: </span>
          <span className="text-text-primary dark:text-dark-text-primary">{d.erro_precificacao}</span>
        </div>
        <div>
          <span className="font-semibold text-text-muted dark:text-dark-text-muted">Catalisador: </span>
          <span className="text-text-primary dark:text-dark-text-primary">{d.catalisador}</span>
        </div>
      </div>

      {/* Detalhes expandiveis — simplificado como texto inline */}
      <details className="text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">
        <summary className="cursor-pointer font-semibold tracking-wide uppercase">Analise completa</summary>
        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
          <p><strong>Por que agora:</strong> {d.por_que_agora}</p>
          <p><strong>Nao consensual porque:</strong> {d.por_que_nao_consensual}</p>
          <p><strong>Riscos ocultos:</strong> {d.riscos_ocultos}</p>
          <p><strong>Plano de saida:</strong> {d.plano_saida}</p>
          {d.estrutura_alternativa && <p><strong>Alternativa:</strong> {d.estrutura_alternativa}</p>}
          <p><strong>Correlacao com outras:</strong> {d.correlacao_com_outras}</p>
          <p><strong>Sizing:</strong> {fmtNum(d.sizing_pct_orcamento_risco * 100, 1)}% do orcamento de risco</p>
          <div>
            <strong>Fontes:</strong>
            <span className="ml-1">{d.fontes?.join(", ") || "N/D"}</span>
          </div>
        </div>
      </details>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border-l-4 ${CENARIO_BORDER[scenario.nome]} border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2.5 sm:space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold text-text-primary dark:text-dark-text-primary">
          {CENARIO_LABEL[scenario.nome]}
        </h3>
        <span className="text-base sm:text-lg font-mono font-bold text-text-primary dark:text-dark-text-primary">
          {scenario.probabilidade_pct}%
        </span>
      </div>

      <div>
        <h4 className="text-[8px] sm:text-[9px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-1">
          Gatilhos observaveis
        </h4>
        <ul className="text-[10px] sm:text-[11px] text-text-primary dark:text-dark-text-primary space-y-0.5">
          {scenario.gatilhos_observaveis.map((g, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-text-dim shrink-0">•</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div>
          <h4 className="text-[8px] sm:text-[9px] font-semibold text-accent-green/80 uppercase tracking-widest mb-1">Vencedores</h4>
          <ul className="text-[9px] sm:text-[10px] text-text-primary dark:text-dark-text-primary space-y-0.5">
            {scenario.vencedores.map((v, i) => (
              <li key={i} className="flex gap-1">
                <span className="text-accent-green shrink-0">+</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-[8px] sm:text-[9px] font-semibold text-accent-red/80 uppercase tracking-widest mb-1">Perdedores</h4>
          <ul className="text-[9px] sm:text-[10px] text-text-primary dark:text-dark-text-primary space-y-0.5">
            {scenario.perdedores.map((p, i) => (
              <li key={i} className="flex gap-1">
                <span className="text-accent-red shrink-0">-</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
        <p className="text-[9px] sm:text-[10px]">
          <span className="font-semibold text-text-muted dark:text-dark-text-muted">Operacao: </span>
          <span className="text-text-primary dark:text-dark-text-primary">{scenario.operacao_preferida}</span>
        </p>
        <p className="text-[9px] sm:text-[10px]">
          <span className="font-semibold text-text-muted dark:text-dark-text-muted">Hedge: </span>
          <span className="text-text-primary dark:text-dark-text-primary">{scenario.hedge}</span>
        </p>
        <p className="text-[9px] sm:text-[10px]">
          <span className="font-semibold text-accent-green/80">Confirma: </span>
          <span className="text-text-primary dark:text-dark-text-primary">{scenario.sinal_confirmacao}</span>
        </p>
        <p className="text-[9px] sm:text-[10px]">
          <span className="font-semibold text-accent-red/80">Invalida: </span>
          <span className="text-text-primary dark:text-dark-text-primary">{scenario.sinal_invalidacao}</span>
        </p>
      </div>
    </div>
  );
}

function TraceabilitySection({ report }: { report: MorningCallReport }) {
  const t = report.rastreabilidade;
  const sections = [
    { label: "Fatos Verificados", items: t.fatos_verificados, color: "border-emerald-500/40", dot: "bg-emerald-500" },
    { label: "Interpretacoes", items: t.interpretacoes, color: "border-sky-500/40", dot: "bg-sky-500" },
    { label: "Hipoteses", items: t.hipoteses, color: "border-amber-500/40", dot: "bg-amber-500" },
    { label: "Dados Incompletos", items: t.dados_incompletos, color: "border-red-500/40", dot: "bg-red-500" },
  ];

  return (
    <section className="space-y-2 sm:space-y-3">
      <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
        Rastreabilidade
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {sections.map(({ label, items, color, dot }) =>
          items.length > 0 ? (
            <div key={label} className={`bg-white dark:bg-slate-800 rounded-xl border-l-4 ${color} border border-slate-200 dark:border-slate-700 p-2.5 sm:p-3`}>
              <h3 className="text-[9px] sm:text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-1.5 sm:mb-2">
                {label} ({items.length})
              </h3>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px] sm:text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0 mt-1.5`} />
                    <span className="text-text-primary dark:text-dark-text-primary">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function ProvenanceFooter({ report }: { report: MorningCallReport }) {
  const p = report.provenance;
  return (
    <footer className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-1 text-[9px] sm:text-[10px] text-text-muted dark:text-dark-text-muted">
        <span>Run: <span className="font-mono text-text-dim dark:text-dark-text-dim">{p.run_id.slice(0, 8)}</span></span>
        <span>Model: {p.model}</span>
        <span>Prompt: {p.prompt_version}</span>
        <span>Gerado: {new Date(report.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
      </div>
      <p className="text-[8px] sm:text-[9px] text-text-dim dark:text-dark-text-dim italic leading-relaxed">
        {report.disclaimer}
      </p>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

/** URL base do worker morning-call. Em dev, usa proxy do Vite; em prod, env var. */
const MC_API_URL = import.meta.env.VITE_MORNING_CALL_API_URL ?? "/mc-api";

interface McState {
  data: MorningCallResponse | null;
  loading: boolean;
  error: string | null;
}

function useMorningCall(): McState & { reload: () => void } {
  const [state, setState] = useState<McState>({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const url = `${MC_API_URL}/api/report/latest`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MorningCallResponse = await res.json();
      setState({ data, loading: false, error: null });
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

export function MorningCall() {
  const { data, loading, error } = useMorningCall();

  if (loading) return <MorningCallSkeleton />;

  if (error) {
    return (
      <div className="text-accent-red text-xs sm:text-sm p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
        Erro ao carregar Morning Call: {error}
      </div>
    );
  }

  // O payload em D1 e { morningCall, validation, gateReasons, agenda }. O fallback
  // para o proprio `report` cobre resposta que ja venha como MorningCallReport puro.
  const payload = (data?.ok && data.report ? data.report : null) as MorningCallPayload | null;
  const mcReport: MorningCallReport | null =
    payload?.morningCall ?? (payload as MorningCallReport | null);
  const agenda = payload?.agenda ?? null;

  if (!mcReport) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-text-primary dark:text-dark-text-primary">Morning Call</h1>
          <p className="text-[10px] sm:text-xs text-text-muted dark:text-dark-text-muted mt-1">
            Relatorio macro diario e operacoes.
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 sm:p-5 text-center">
          <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 font-semibold">
            Nenhum relatorio disponivel
          </p>
          <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 mt-1">
            {data?.error ?? "O Morning Call ainda nao foi gerado para o pregao de hoje. O sistema roda as 06:30 BRT em dias uteis."}
          </p>
        </div>
      </div>
    );
  }

  const report: MorningCallReport = mcReport;
  const rankedTrades = (report.ranking ?? [])
    .map((i: number) => report.trades[i])
    .filter(Boolean);

  const hasTrades = rankedTrades.length > 0;
  const hasCenarios = report.cenarios && report.cenarios.length === 4;
  const hasTraceability =
    report.rastreabilidade &&
    (report.rastreabilidade.fatos_verificados.length > 0 ||
      report.rastreabilidade.interpretacoes.length > 0 ||
      report.rastreabilidade.hipoteses.length > 0 ||
      report.rastreabilidade.dados_incompletos.length > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cabecalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-text-primary dark:text-dark-text-primary">
            Morning Call
          </h1>
          <p className="text-[10px] sm:text-xs text-text-muted dark:text-dark-text-muted mt-0.5">
            {report.trade_date} · {data?.n_trades ?? 0} trade{(data?.n_trades ?? 0) !== 1 ? "s" : ""} · {data?.aprovado ? "Aprovado" : "Parcial"}
          </p>
        </div>
        <MorningCallPdfButton tradeDate={report.trade_date} />
      </div>

      {/* Folha A4 do briefing. Fica escondida na tela e so aparece na impressao. */}
      <MorningCallPdfSheet report={report} agenda={agenda} trades={rankedTrades} />

      {/* 1. Abertura Executiva */}
      <ExecutiveSummaryCard report={report} />

      {/* 2. Trades — ou "NAO OPERAR" */}
      <section className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
            Operacoes ({rankedTrades.length})
          </h2>
          {!hasTrades && (
            <span className="text-[9px] sm:text-[10px] font-bold text-text-muted dark:text-dark-text-muted bg-slate-100 dark:bg-slate-700 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full whitespace-nowrap">
              NAO OPERAR E A MELHOR OPERACAO
            </span>
          )}
        </div>

        {hasTrades ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {rankedTrades.map((trade: TradeCard, i: number) => (
              <TradeCardView key={trade.id} trade={trade} rank={i + 1} />
            ))}
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 sm:p-6 text-center">
            <p className="text-xs sm:text-sm text-text-muted dark:text-dark-text-muted font-medium">
              Nao ha operacoes com assimetria positiva hoje.
            </p>
            <p className="text-[10px] sm:text-xs text-text-dim dark:text-dark-text-dim mt-1">
              Nao operar tambem e posicao. O capital preservado e municao para o dia em que o mercado oferecer assimetria.
            </p>
          </div>
        )}
      </section>

      {/* 3. Cenarios Probabilisticos */}
      {hasCenarios && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
            Cenarios Probabilisticos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {report.cenarios.map((s: Scenario) => (
              <ScenarioCard key={s.nome} scenario={s} />
            ))}
          </div>
        </section>
      )}

      {/* 4. Rastreabilidade */}
      {hasTraceability && <TraceabilitySection report={report} />}

      {/* 5. Footer */}
      <ProvenanceFooter report={report} />
    </div>
  );
}
