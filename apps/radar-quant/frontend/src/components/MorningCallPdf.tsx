/**
 * Briefing de 1 pagina do Morning Call, no tema-papel da casa.
 *
 * Gera PDF pelo dialogo de impressao do navegador em vez de uma biblioteca
 * cliente. Motivo: o layout depende de Prata, Public Sans e JetBrains Mono, e
 * as bibliotecas de PDF em JS ou nao embutem webfont ou exigem carregar o
 * arquivo da fonte e registrar no documento. O caminho de impressao ja usa as
 * fontes que a pagina carregou, respeita `@page A4` e nao adiciona dependencia
 * nova ao bundle.
 *
 * A folha vive num portal irmao de #root porque o app roda em container de
 * altura fixa com overflow escondido. Reaproveitar essa arvore na impressao
 * exigiria desfazer o layout inteiro em `@media print`; trocar qual dos dois
 * elementos aparece e mais simples e nao mexe na interface.
 */
import { createPortal } from "react-dom";
import type { EconomicAgenda, EconomicCalendarEvent } from "../types/agenda";
import type { MorningCallReport, Scenario, TradeCard } from "../types/morningCall";
import "../styles/morning-call-pdf.css";

/* ------------------------------------------------------------------ */
/* Limites de conteudo                                                 */
/* ------------------------------------------------------------------ */

/**
 * A folha tem altura fixa de 297mm com `overflow: hidden`. Sem teto por
 * secao, um dia de agenda cheia empurraria o rodape para fora e o corte
 * apareceria no PDF. Os limites abaixo mantem o pior caso dentro da pagina;
 * quando algo e cortado, o cabecalho da secao diz quantos itens ficaram de
 * fora, para o documento nunca dar a entender que aquilo era tudo.
 */
const MAX_EVENTOS = 6;
const MAX_GATILHOS = 2;
const MAX_LADO = 3;
const MAX_PLANO = 3;
const MAX_TRADES = 3;

/* ------------------------------------------------------------------ */
/* Labels                                                              */
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

const CENARIO_LABEL: Record<string, string> = {
  base: "Base",
  bull: "Bull",
  bear: "Bear",
  cisne_cinza: "Cisne Cinza",
};

const ALERTA_LABEL: Record<string, string> = {
  baixo: "Baixo",
  moderado: "Moderado",
  elevado: "Elevado",
  critico: "Critico",
  indisponivel: "Indisponivel",
};

const PAIS_LABEL: Record<string, string> = {
  BR: "Brasil",
  EUA: "EUA",
  CN: "China",
  JP: "Japao",
  EZ: "Zona do Euro",
  UK: "Reino Unido",
  GLOBAL: "Global",
};

const IMPORTANCIA_ORDEM: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function fmtDataLonga(tradeDate: string): string {
  // trade_date e YYYY-MM-DD. Interpretar como data local evita o recuo de um
  // dia que `new Date("YYYY-MM-DD")` produz ao assumir UTC.
  const [ano, mes, dia] = tradeDate.split("-").map(Number);
  if (!ano || !mes || !dia) return tradeDate;
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtGeradoEm(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Eventos mais consequentes primeiro, mas exibidos na ordem do relogio. */
function selecionarEventos(eventos: EconomicCalendarEvent[]): EconomicCalendarEvent[] {
  return [...eventos]
    .sort((a, b) => {
      const ia = IMPORTANCIA_ORDEM[a.importancia] ?? 9;
      const ib = IMPORTANCIA_ORDEM[b.importancia] ?? 9;
      return ia !== ib ? ia - ib : a.hora_brt.localeCompare(b.hora_brt);
    })
    .slice(0, MAX_EVENTOS)
    .sort((a, b) => a.hora_brt.localeCompare(b.hora_brt));
}

/* ------------------------------------------------------------------ */
/* Botao                                                               */
/* ------------------------------------------------------------------ */

export function MorningCallPdfButton({ tradeDate }: { tradeDate: string }) {
  function handlePrint() {
    // O navegador usa document.title como nome sugerido do arquivo salvo.
    const tituloOriginal = document.title;
    document.title = `morning-call-${tradeDate}`;
    const restaurar = () => {
      document.title = tituloOriginal;
      window.removeEventListener("afterprint", restaurar);
    };
    window.addEventListener("afterprint", restaurar);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      title="Abre o dialogo de impressao. Escolha 'Salvar como PDF' para baixar o briefing."
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] sm:text-[11px] font-semibold tracking-wide border border-slate-300 dark:border-slate-600 text-text-primary dark:text-dark-text-primary hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
      Gerar PDF
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Folha                                                               */
/* ------------------------------------------------------------------ */

interface SheetProps {
  report: MorningCallReport;
  agenda: EconomicAgenda | null;
  trades: TradeCard[];
}

export function MorningCallPdfSheet({ report, agenda, trades }: SheetProps) {
  const a = report.abertura;
  const eventos = agenda ? selecionarEventos(agenda.eventos) : [];
  const eventosOcultos = agenda ? agenda.eventos.length - eventos.length : 0;
  const cenarios = report.cenarios ?? [];
  const tradesVisiveis = trades.slice(0, MAX_TRADES);
  const plano = agenda?.plano_pregao;

  const sheet = (
    <div className="sz-pdf-root">
      <article className="sz-pdf-sheet">
        <header className="sz-pdf-header">
          <div>
            <p className="sz-pdf-eyebrow">Szuchmacher Consultoria</p>
            <h1 className="sz-pdf-title">Briefing do Pregao</h1>
          </div>
          <div className="sz-pdf-header-meta">
            <span className="sz-pdf-date">{fmtDataLonga(report.trade_date)}</span>
            <p className="sz-pdf-label">
              {agenda ? `Alerta ${ALERTA_LABEL[agenda.nivel_alerta] ?? agenda.nivel_alerta}` : "Agenda indisponivel"}
            </p>
          </div>
        </header>

        <div className="sz-pdf-strip">
          <div>
            <p className="sz-pdf-label">Regime</p>
            <span className="sz-pdf-strip-value">{REGIME_LABEL[a.regime] ?? a.regime}</span>
          </div>
          <div>
            <p className="sz-pdf-label">Vies</p>
            <span className="sz-pdf-strip-value">{VIES_LABEL[a.vies] ?? a.vies}</span>
          </div>
          <div>
            <p className="sz-pdf-label">Conviccao</p>
            <span className="sz-pdf-strip-value">{a.conviccao}/10</span>
          </div>
          <div>
            <p className="sz-pdf-label">Operacoes</p>
            <span className="sz-pdf-strip-value">{trades.length}</span>
          </div>
        </div>

        <section className="sz-pdf-section">
          <div className="sz-pdf-section-head">
            <p className="sz-pdf-eyebrow">Tensao macro dominante</p>
          </div>
          <p className="sz-pdf-lead">{a.tensao_macro_dominante}</p>
          <div className="sz-pdf-duo">
            <div>
              <p className="sz-pdf-label">O que sustenta os precos hoje</p>
              <p>{a.premissa_que_sustenta_precos}</p>
            </div>
            <div>
              <p className="sz-pdf-label">O que quebraria essa premissa</p>
              <p>{a.fato_que_quebraria}</p>
            </div>
          </div>
        </section>

        <section className="sz-pdf-section">
          <div className="sz-pdf-section-head">
            <p className="sz-pdf-eyebrow">O que esta marcado para hoje</p>
            <p className="sz-pdf-label">
              {agenda
                ? `${agenda.eventos.length} evento${agenda.eventos.length === 1 ? "" : "s"}${
                    eventosOcultos > 0 ? `, ${eventosOcultos} fora desta folha` : ""
                  }`
                : "sem calendario"}
            </p>
          </div>

          {eventos.length > 0 ? (
            <table className="sz-pdf-table">
              <colgroup>
                <col style={{ width: "13mm" }} />
                <col style={{ width: "50mm" }} />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Evento</th>
                  <th>Se vier melhor</th>
                  <th>Se vier pior</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e, i) => (
                  <tr key={`${e.hora_brt}-${e.evento}-${i}`}>
                    <td className="sz-pdf-hora">{e.hora_brt}</td>
                    <td>
                      <span className="sz-pdf-evento">
                        <span className={`sz-pdf-flag sz-pdf-flag-${e.importancia}`} />
                        {e.evento}
                      </span>
                      <span className="sz-pdf-label">
                        {PAIS_LABEL[e.pais] ?? e.pais}
                        {e.consenso ? ` · consenso ${fmtNum(e.consenso.value)} ${e.consenso.unit}` : ""}
                        {e.anterior ? ` · anterior ${fmtNum(e.anterior.value)} ${e.anterior.unit}` : ""}
                      </span>
                    </td>
                    <td className="sz-pdf-benigno">
                      <span className="sz-pdf-clamp-2">{e.cenario_benigno}</span>
                    </td>
                    <td className="sz-pdf-adverso">
                      <span className="sz-pdf-clamp-2">{e.cenario_adverso}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="sz-pdf-vazio">
              <p className="sz-pdf-muted">
                {agenda
                  ? "Nenhum evento economico programado. O dia tende a ser tecnico, movido por fluxo e posicionamento."
                  : "O calendario economico nao foi gerado para este pregao. Os cenarios abaixo seguem validos, sem gatilho de agenda mapeado."}
              </p>
            </div>
          )}
        </section>

        {cenarios.length > 0 && (
          <section className="sz-pdf-section">
            <div className="sz-pdf-section-head">
              <p className="sz-pdf-eyebrow">Como o dia pode terminar</p>
              <p className="sz-pdf-label">probabilidade e gatilho observavel</p>
            </div>
            <div className="sz-pdf-cenarios">
              {cenarios.map((c: Scenario) => (
                <div key={c.nome} className="sz-pdf-cenario">
                  <div className="sz-pdf-cenario-head">
                    <span className="sz-pdf-cenario-nome">{CENARIO_LABEL[c.nome] ?? c.nome}</span>
                    <span className="sz-pdf-cenario-prob">{c.probabilidade_pct}%</span>
                  </div>
                  <ul className="sz-pdf-list">
                    {c.gatilhos_observaveis.slice(0, MAX_GATILHOS).map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                  <p className="sz-pdf-side">
                    <b>Ganha:</b> {c.vencedores.slice(0, MAX_LADO).join(", ") || "n/d"}
                    <br />
                    <b>Perde:</b> {c.perdedores.slice(0, MAX_LADO).join(", ") || "n/d"}
                  </p>
                  <p className="sz-pdf-side sz-pdf-clamp-2">
                    <b>Operacao:</b> {c.operacao_preferida}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {plano &&
          (plano.antes_abertura.length > 0 ||
            plano.durante_pregao.length > 0 ||
            plano.proximo_fechamento.length > 0) && (
            <section className="sz-pdf-section">
              <div className="sz-pdf-section-head">
                <p className="sz-pdf-eyebrow">Plano do pregao</p>
              </div>
              <div className="sz-pdf-trio">
                {[
                  { label: "Antes da abertura", items: plano.antes_abertura },
                  { label: "Durante o pregao", items: plano.durante_pregao },
                  { label: "Proximo ao fechamento", items: plano.proximo_fechamento },
                ].map(({ label, items }) => (
                  <div key={label}>
                    <p className="sz-pdf-label">{label}</p>
                    {items.length > 0 ? (
                      <ul className="sz-pdf-list">
                        {items.slice(0, MAX_PLANO).map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="sz-pdf-muted">Sem acao especifica.</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

        <section className="sz-pdf-section">
          <div className="sz-pdf-section-head">
            <p className="sz-pdf-eyebrow">Operacoes</p>
            <p className="sz-pdf-label">
              {trades.length > tradesVisiveis.length
                ? `${tradesVisiveis.length} de ${trades.length} nesta folha`
                : `${trades.length} aprovada${trades.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {tradesVisiveis.length > 0 ? (
            <div>
              {tradesVisiveis.map((t) => {
                const d = t.draft;
                const compra = d.direcao === "comprar";
                return (
                  <div key={t.id} className="sz-pdf-trade">
                    <span
                      className={`sz-pdf-trade-dir ${compra ? "sz-pdf-trade-dir-compra" : "sz-pdf-trade-dir-venda"}`}
                    >
                      {compra ? "Compra" : "Venda"}
                    </span>
                    <span className="sz-pdf-trade-nome">{d.nome}</span>
                    <span className="sz-pdf-trade-niveis">
                      {fmtNum(d.entrada.nivel.value)} {d.entrada.nivel.unit} · alvo{" "}
                      {fmtNum(d.alvo_1.value)} · stop{" "}
                      {d.invalidacao.nivel ? fmtNum(d.invalidacao.nivel.value) : "evento"}
                    </span>
                    <span className="sz-pdf-trade-tese sz-pdf-clamp-1">{d.tese}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sz-pdf-vazio">
              <p>
                <b>Nao operar tambem e posicao.</b>{" "}
                <span className="sz-pdf-muted">
                  Nenhuma operacao passou nos criterios de assimetria hoje. O capital preservado e
                  municao para o dia em que o mercado oferecer risco-retorno melhor.
                </span>
              </p>
            </div>
          )}
        </section>

        <footer className="sz-pdf-footer">
          <div className="sz-pdf-footer-meta">
            <span>Run {report.provenance.run_id.slice(0, 8)}</span>
            <span>Modelo {report.provenance.model}</span>
            <span>Prompt {report.provenance.prompt_version}</span>
            <span>Gerado {fmtGeradoEm(report.generated_at)}</span>
          </div>
          <p className="sz-pdf-disclaimer">{report.disclaimer}</p>
        </footer>
      </article>
    </div>
  );

  return createPortal(sheet, document.body);
}
