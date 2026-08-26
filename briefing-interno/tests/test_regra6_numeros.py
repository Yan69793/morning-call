"""test_regra6_numeros.py — regressao do portao numerico (REGRA 6).

Motivo, medido em 24/08/2026: o briefing_20260820.html passou as regras 1 a 5
afirmando "Ibovespa ... subindo 0,87% para 118.753,48 pontos" quando o
fechamento real de 19/08 foi 167.830. Erro de 29% num numero que ia para
cliente. Nenhuma das 5 regras olhava valor.

Estes casos sao offline, com fixture. A prova contra dado real esta no
teste de aceite documentado no plano:

    python scripts/coletar_precos.py
    python scripts/validar_briefing.py outputs/briefing_20260820.html
    -> REGRA 6 reprova IBOV, aprova USDBRL

Uso:
    python tests/test_regra6_numeros.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from validar_briefing import _check_numeros_mercado, _parse_num_br  # noqa: E402


def precos(**ativos) -> dict:
    """Monta um arquivo de precos minimo, so com o que a REGRA 6 le."""
    padrao = {
        "IBOV": {"classe": "indice", "unidade": "pct", "tolerancia": 0.5},
        "USDBRL": {"classe": "cambio", "unidade": "pct", "tolerancia": 1.0},
        "SELIC": {"classe": "juro", "unidade": "bp", "tolerancia": 5.0},
        "WTI": {"classe": "commodity", "unidade": "pct", "tolerancia": 0.5},
    }
    out = {}
    for ticker, dado in ativos.items():
        base = dict(padrao.get(ticker, {"unidade": "pct", "tolerancia": 1.0}))
        base.update(
            {
                "trade_date": "2026-08-19",
                "quorum": "fonte_unica",
                "fonte": "fixture",
            }
        )
        base.update(dado)
        out[ticker] = base
    return {"data_coleta": "20260820", "ativos": out}


class TestParseNumeroBR(unittest.TestCase):
    def test_formatos(self):
        casos = [
            ("118.753,48", 118753.48),
            ("5,17", 5.17),
            ("171.032", 171032.0),
            ("14,00", 14.0),
            ("1.5", 1.5),
        ]
        for bruto, esperado in casos:
            with self.subTest(bruto=bruto):
                self.assertAlmostEqual(_parse_num_br(bruto), esperado, places=4)

    def test_lixo_devolve_none(self):
        for bruto in ("", "  ", "abc", "-"):
            self.assertIsNone(_parse_num_br(bruto))


class TestRegra6(unittest.TestCase):
    def test_fabricacao_de_nivel_reprova(self):
        """O caso real de 20/08: nivel citado que nao existe."""
        html = (
            "<p>O Ibovespa interrompeu a sequencia de quedas, subindo 0,87% "
            "para 118.753,48 pontos.</p>"
        )
        problemas, oks, _ = _check_numeros_mercado(html, precos(IBOV={"close": 167830.0}))
        self.assertEqual(len(problemas), 1, problemas)
        self.assertIn("IBOV", problemas[0])
        self.assertIn("167830", problemas[0])
        self.assertFalse(oks)

    def test_nivel_correto_aprova(self):
        html = (
            "<p>O Ibovespa subiu 0,87% para 167.830 pontos no fechamento "
            "de ontem.</p>"
        )
        problemas, oks, _ = _check_numeros_mercado(html, precos(IBOV={"close": 167830.0}))
        self.assertFalse(problemas, problemas)
        self.assertEqual(len(oks), 1)

    def test_variacao_percentual_nao_vira_nivel(self):
        """0,87% nao pode ser comparado com 167830 e reprovar o briefing."""
        html = "<p>O Ibovespa subiu 0,87% no pregao de ontem.</p>"
        problemas, oks, _ = _check_numeros_mercado(html, precos(IBOV={"close": 167830.0}))
        self.assertFalse(problemas, problemas)
        self.assertFalse(oks)  # nenhum nivel citado, nada a conferir

    def test_numero_sem_marcador_nao_vira_nivel(self):
        """Frases reais do briefing de 20/08 que nao sao cotacao."""
        html = (
            "<p>O Ibovespa interrompeu uma sequencia de 11 quedas. A expectativa "
            "do mercado e de 235 mil pedidos de seguro-desemprego.</p>"
        )
        problemas, _, _ = _check_numeros_mercado(html, precos(IBOV={"close": 167830.0}))
        self.assertFalse(problemas, problemas)

    def test_projecao_de_terceiro_nao_reprova(self):
        """Caso real: fechamento certo em R$ 5,17 e projecao do JPMorgan em R$ 5,50."""
        html = (
            "<p>O dolar registrou queda de 0,54%, fechando a R$ 5,17.</p>"
            "<p>O JPMorgan alerta que as eleicoes podem levar o dolar a R$ 5,50 "
            "em um cenario negativo.</p>"
        )
        problemas, oks, _ = _check_numeros_mercado(html, precos(USDBRL={"close": 5.1714}))
        self.assertFalse(problemas, problemas)
        self.assertEqual(len(oks), 1)

    def test_janela_nao_vaza_entre_ativos(self):
        """Ibovespa errado seguido de dolar certo: um reprova, o outro passa."""
        html = (
            "<p>O Ibovespa subiu para 118.753,48 pontos. O dolar caiu, "
            "fechando a R$ 5,17.</p>"
        )
        problemas, oks, _ = _check_numeros_mercado(
            html, precos(IBOV={"close": 167830.0}, USDBRL={"close": 5.1714})
        )
        self.assertEqual(len(problemas), 1, problemas)
        self.assertIn("IBOV", problemas[0])
        self.assertEqual(len(oks), 1)
        self.assertIn("USDBRL", oks[0])

    def test_numero_do_vizinho_nao_e_herdado(self):
        """Caso real do briefing_20260818.html.

        "o dolar subindo para R$ 5,22 e o Ibovespa ... caindo 1,14%". O
        Ibovespa nao afirma nivel nenhum, so variacao. O R$ 5,22 esta entre as
        duas mencoes e a versao anterior o atribuia ao Ibovespa, reprovando um
        briefing que estava certo nesse ponto.
        """
        html = (
            "<p>Os mercados fecharam em territorio negativo com o dolar subindo "
            "para R$ 5,22 e o Ibovespa registrando a segunda pior performance em "
            "agosto, caindo 1,14%.</p>"
        )
        problemas, oks, _ = _check_numeros_mercado(
            html, precos(IBOV={"close": 166784.0}, USDBRL={"close": 5.2213})
        )
        self.assertFalse(problemas, problemas)
        self.assertEqual(len(oks), 1)
        self.assertIn("USDBRL", oks[0])

    def test_variacao_em_pontos_nao_vira_nivel(self):
        """"caiu 1.200 pontos" e delta, nao cotacao."""
        html = "<p>O Ibovespa caiu 1.200 pontos no pregao de ontem.</p>"
        problemas, oks, _ = _check_numeros_mercado(html, precos(IBOV={"close": 167830.0}))
        self.assertFalse(problemas, problemas)
        self.assertFalse(oks)

    def test_nivel_sem_marcador_confere_camada_1(self):
        """O defeito de 26/08: "IBOV +1.55% a 174577.0", numero cru colado do
        Yahoo sem unidade. A REGRA 6 antiga registrava "nada a conferir". A
        camada 1 (todo numero que bate confere, mesmo sem marcador) pega o cru
        e o formato novo "a 174.577".
        """
        for frase in (
            "O Ibovespa subiu 0,41% a 174577.0 no fechamento de ontem.",
            "O Ibovespa subiu 0,41% a 174.577 no fechamento de ontem.",
        ):
            with self.subTest(frase=frase):
                problemas, oks, _ = _check_numeros_mercado(
                    f"<p>{frase}</p>", precos(IBOV={"close": 174577.0})
                )
                self.assertFalse(problemas, problemas)
                self.assertEqual(len(oks), 1, frase)
                self.assertIn("174577", oks[0])

    def test_indice_fora_da_banda_reprova_camada_3(self):
        """Fabricacao de nivel de indice sem marcador ("a 118.753"): a camada
        3 reprova. O numero cai em [0.5*close, 1.5*close] e nao bate."""
        html = "<p>O Ibovespa avancou para 118.753 no fechamento de ontem.</p>"
        problemas, oks, _ = _check_numeros_mercado(html, precos(IBOV={"close": 174577.0}))
        self.assertEqual(len(problemas), 1, problemas)
        self.assertIn("IBOV", problemas[0])
        self.assertFalse(oks)

    def test_ano_nao_cai_na_banda_e_nao_gera_claim(self):
        """Sem excecao de ano: com SPX ~7.677 a banda e [3.838, 11.515] e o
        "2026" nao cai nela. Nao existe caso real que justifique a excecao."""
        html = "<p>O S&P 500 subiu 12% desde 2026 com o novo ciclo.</p>"
        problemas, oks, _ = _check_numeros_mercado(
            html, precos(SPX={"classe": "indice", "close": 7677.28})
        )
        self.assertFalse(problemas, problemas)
        self.assertFalse(oks)

    def test_cambio_sem_marcador_fora_da_tolerancia_fica_silencioso(self):
        """Limite aceito e documentado: "dolar a 5,00" fabricado sem unidade
        passa. Cambio nao tem camada 3 (a prosa legitima poe numero
        incidental perto do close) e a camada 2 exige marcador."""
        html = "<p>O dolar abriu a 5,00 depois da abertura dos mercados.</p>"
        problemas, oks, _ = _check_numeros_mercado(html, precos(USDBRL={"close": 5.1714}))
        self.assertFalse(problemas, problemas)
        self.assertFalse(oks)

    def test_nivel_com_preposicao_ainda_conta(self):
        """A exigencia de preposicao nao pode matar o caso legitimo."""
        for frase in (
            "O Ibovespa fechou em 167.830 pontos.",
            "O Ibovespa avancou para 167.830 pontos.",
            "O indice terminou aos 167.830 pontos, disse o Ibovespa report.",
        ):
            with self.subTest(frase=frase):
                problemas, oks, _ = _check_numeros_mercado(
                    f"<p>{frase}</p>", precos(IBOV={"close": 167830.0})
                )
                self.assertFalse(problemas, problemas)
                self.assertEqual(len(oks), 1, frase)

    def test_delta_em_reais_nao_vira_nivel(self):
        html = "<p>O dolar caiu R$ 0,05 no pregao.</p>"
        problemas, oks, _ = _check_numeros_mercado(html, precos(USDBRL={"close": 5.1714}))
        self.assertFalse(problemas, problemas)
        self.assertFalse(oks)

    def test_divergencia_entre_fontes_reprova(self):
        """Sem cotacao confiavel nao ha como conferir, entao trava."""
        html = "<p>O dolar fechou a R$ 5,17.</p>"
        problemas, _, _ = _check_numeros_mercado(
            html,
            precos(USDBRL={"close": 5.1714, "quorum": "divergencia", "divergencia_pct": 4.2}),
        )
        self.assertEqual(len(problemas), 1, problemas)
        self.assertIn("divergencia", problemas[0])

    def test_ativo_sem_trade_date_reprova(self):
        html = "<p>O dolar fechou a R$ 5,17.</p>"
        problemas, _, _ = _check_numeros_mercado(
            html, precos(USDBRL={"close": 5.1714, "trade_date": None})
        )
        self.assertEqual(len(problemas), 1, problemas)
        self.assertIn("trade_date", problemas[0])

    def test_ativo_nao_citado_nao_gera_nada(self):
        """Ativo no arquivo de precos e ausente do texto e ignorado."""
        html = "<p>Briefing sem mencao a mercado.</p>"
        problemas, oks, _ = _check_numeros_mercado(
            html, precos(IBOV={"close": 167830.0}, USDBRL={"close": 5.1714})
        )
        self.assertFalse(problemas)
        self.assertFalse(oks)

    def test_juro_compara_em_bp_e_reprova_fora(self):
        """14,25% a.a. contra meta de 14,00% sao 25 bp, acima da tolerancia de 5."""
        html = "<p>A Selic segue em 14,25% ao ano apos o Copom.</p>"
        problemas, _, _ = _check_numeros_mercado(html, precos(SELIC={"close": 14.0}))
        self.assertEqual(len(problemas), 1, problemas)
        self.assertIn("SELIC", problemas[0])

    def test_juro_correto_aprova(self):
        html = "<p>A Selic segue em 14,00% ao ano apos o Copom.</p>"
        problemas, oks, _ = _check_numeros_mercado(html, precos(SELIC={"close": 14.0}))
        self.assertFalse(problemas, problemas)
        self.assertEqual(len(oks), 1)

    def test_tolerancia_e_por_ativo(self):
        """0,8% de erro passa no cambio (tol 1%) e reprova no indice (tol 0,5%)."""
        html_cambio = "<p>O dolar fechou a R$ 5,2128.</p>"  # +0,8% sobre 5,1714
        problemas, _, _ = _check_numeros_mercado(html_cambio, precos(USDBRL={"close": 5.1714}))
        self.assertFalse(problemas, problemas)

        html_indice = "<p>O Ibovespa fechou em 169.173 pontos.</p>"  # +0,8% sobre 167.830
        problemas, _, _ = _check_numeros_mercado(html_indice, precos(IBOV={"close": 167830.0}))
        self.assertEqual(len(problemas), 1, problemas)


if __name__ == "__main__":
    unittest.main(verbosity=2)
