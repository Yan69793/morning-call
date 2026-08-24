"""test_pipeline_robustez.py — regressao dos fixes do bloco 1 (14/08/2026).

Cobre T01 (JSON nao-JSON do OpenRouter cai no cascade), T02 (Resend sem
id nao e envio), T03 (dias_atraso None), T05 (VixRadar sem status) e O02
(GDELT com parenteses).

Uso:
    python tests/test_pipeline_robustez.py
ou
    python -m unittest discover -s tests
"""

from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import coletar_estado  # noqa: E402
import coletar_noticias  # noqa: E402
import enviar_briefing  # noqa: E402
import gerar_briefing  # noqa: E402


class TestOpenRouterJson(unittest.TestCase):
    """T01: corpo nao-JSON vira RuntimeError, o cascade avanca."""

    def test_corpo_nao_json(self):
        with self.assertRaises(RuntimeError):
            gerar_briefing._json_or_runtime(b"<html>erro do proxy</html>", "OpenRouter")

    def test_corpo_vazio(self):
        with self.assertRaises(RuntimeError):
            gerar_briefing._json_or_runtime(b"", "OpenRouter")

    def test_shape_lista(self):
        with self.assertRaises(RuntimeError):
            gerar_briefing._json_or_runtime(b'[{"a": 1}]', "OpenRouter")

    def test_dict_valido(self):
        self.assertEqual(gerar_briefing._json_or_runtime(b'{"ok": true}', "OpenRouter"), {"ok": True})


class TestResendResponse(unittest.TestCase):
    """T02: sem id na resposta, nao e envio."""

    def test_corpo_nao_json(self):
        self.assertIsNone(enviar_briefing._parse_resend_response(b"<html></html>"))

    def test_shape_lista(self):
        self.assertIsNone(enviar_briefing._parse_resend_response(b"[1, 2]"))

    def test_dict_sem_id_e_dict(self):
        self.assertEqual(enviar_briefing._parse_resend_response(b'{"id": "x-123"}'), {"id": "x-123"})
        self.assertEqual(enviar_briefing._parse_resend_response(b"{}"), {})


class TestStalenessContract(unittest.TestCase):
    """T03: dias_atraso pode ser None, e o consumidor precisa tolerar."""

    def test_market_date_ausente(self):
        s = coletar_estado._calc_staleness(None, date(2026, 8, 14))
        self.assertTrue(s["stale"])
        self.assertIsNone(s["dias_atraso"])
        # A expressao do main precisa sobreviver a None:
        self.assertFalse((s.get("dias_atraso") or 0) >= 2)

    def test_market_date_invalido(self):
        s = coletar_estado._calc_staleness("nao-e-data", date(2026, 8, 14))
        self.assertTrue(s["stale"])
        self.assertIsNone(s["dias_atraso"])


class TestVixradarStatus(unittest.TestCase):
    """T05: so dict com status string conta como OK."""

    def test_dict_com_status(self):
        ok, status = coletar_estado._vixradar_status({"status": "operacional"})
        self.assertTrue(ok)
        self.assertEqual(status, "operacional")

    def test_dict_sem_status(self):
        self.assertEqual(coletar_estado._vixradar_status({"ok": True}), (False, None))

    def test_lista_e_none(self):
        self.assertEqual(coletar_estado._vixradar_status(["x"]), (False, None))
        self.assertEqual(coletar_estado._vixradar_status(None), (False, None))


class TestGdeltQueries(unittest.TestCase):
    """O02: termos com OR precisam de parenteses."""

    def test_todas_com_parenteses(self):
        for q in coletar_noticias.GDELT_QUERIES:
            with self.subTest(q=q):
                self.assertTrue(q.lstrip().startswith("("), q)
                self.assertTrue(q.rstrip().endswith(")"), q)


class TestBriefingContentParser(unittest.TestCase):
    """T06 (17/08/2026): <b> dentro de <li> nao pode vazar pro paragrafo
    "bare" e virar item fantasma, e o nome da fonte num <a> inline nao
    pode ser descartado. Regressao de P1-001/P1-002 em
    diagnosticos/DIAGNOSTICO-2026-08-17.md, causado pelo e-mail real de
    17/08 (google/gemma-3-27b-it:online citou a fonte como link na
    frase em vez de [url] entre colchetes)."""

    def _parse(self, html_fragment):
        html_doc = f"<html><body><h2>O QUE IMPORTA HOJE</h2><ol>{html_fragment}</ol></body></html>"
        parser = enviar_briefing._BriefingContent()
        parser.feed(html_doc)
        parser.finish()
        return parser.sections

    def test_titulo_em_negrito_nao_vaza_para_item_fantasma(self):
        li = "<li><b>Titulo do ponto.</b> Corpo da frase com o resto do texto.</li>"
        _, itens = self._parse(li)[0]
        # Um unico item, nao um item real mais um item fantasma so-titulo.
        self.assertEqual(len(itens), 1)
        tipo, dados = itens[0]
        self.assertEqual(tipo, "li")
        texto = "".join(t for t, _ in dados)
        self.assertIn("Titulo do ponto.", texto)
        self.assertIn("Corpo da frase", texto)

    def test_nome_da_fonte_em_link_inline_sobrevive(self):
        li = (
            '<li><b>Titulo.</b> Corpo conforme reportado pela '
            '<a href="https://exemplo.com/x">InfoMoney</a>.</li>'
        )
        _, itens = self._parse(li)[0]
        texto = "".join(t for t, _ in itens[0][1])
        self.assertIn("conforme reportado pela InfoMoney.", texto)
        self.assertNotIn("pela .", texto)


class TestExtraRecipients(unittest.TestCase):
    """T07 (17/08/2026): TO_EMAIL_EXTRA vira lista de bcc, ignorando vazio
    e espaco sobrando (ex.: virgula no fim quebraria o payload do Resend
    com um endereco vazio)."""

    def test_lista_simples(self):
        self.assertEqual(
            enviar_briefing._parse_extra_recipients("a@x.com, b@y.com"),
            ["a@x.com", "b@y.com"],
        )

    def test_vazio_e_virgula_sobrando(self):
        self.assertEqual(enviar_briefing._parse_extra_recipients(""), [])
        self.assertEqual(enviar_briefing._parse_extra_recipients("a@x.com,,"), ["a@x.com"])


class TestBriefingSemCabecalho(unittest.TestCase):
    """T08 (24/08/2026): briefing sem <h1>/<h2> nao pode virar e-mail vazio.

    Em 21/08 o modelo marcou as secoes so com <b> e a agenda com hifen,
    sem um unico <h1> no documento. _BriefingContent so abre secao ao ver
    <h1>/<h2> e handle_data descarta texto sem secao aberta, entao o
    e-mail saiu com hero e rodape e nada mais, apesar de o arquivo em
    disco estar correto e aprovado no portao. O validador roda sobre o
    HTML cru e por desenho nao enxerga o render."""

    # Forma exata de outputs/briefing_20260821.html, o dia que quebrou.
    BRIEFING_21_08 = (
        "<b>RESUMO</b>\n"
        "O Ibovespa subiu mais de 2% ontem (confianca: 0.8) e o dolar caiu.\n"
        "\n"
        "<b>O QUE IMPORTA HOJE</b>\n"
        "1. <b>Conselho da Petrobras</b> discute dois temas, o que pode "
        'influenciar (confianca: 0.7) o setor. <a href="https://infomoney.com.br/x">'
        "Fonte: InfoMoney</a>\n"
        "2. <b>Greve dos Bancarios</b> fecha agencias, o que pode afetar "
        '(confianca: 0.6) a liquidez. <a href="https://g1.globo.com/y">'
        "Fonte: G1</a>\n"
        "\n"
        "<b>AGENDA DO DIA</b>\n"
        "- 05:00 (EU): Zona do Euro PMI Industrial [S&P Global]\n"
        "- 10:45 (US): EUA PMI Servicos [S&P Global US]\n"
    )

    def test_conteudo_sobrevive_sem_cabecalho(self):
        email = enviar_briefing.build_styled_email(self.BRIEFING_21_08, "21 de agosto de 2026")
        visivel = enviar_briefing._texto_visivel(email)
        self.assertIn("Ibovespa subiu mais de 2%", visivel)
        self.assertIn("Conselho da Petrobras", visivel)
        self.assertIn("Greve dos Bancarios", visivel)
        self.assertIn("Zona do Euro PMI Industrial", visivel)

    def test_secoes_viram_cabecalho(self):
        normalizado = enviar_briefing._normalizar_estrutura(self.BRIEFING_21_08)
        self.assertIn("<h1>RESUMO</h1>", normalizado)
        self.assertIn("<h1>O QUE IMPORTA HOJE</h1>", normalizado)
        self.assertIn("<h1>AGENDA DO DIA</h1>", normalizado)
        # Ponto numerado nao e linha so-negrito, continua sendo conteudo.
        self.assertNotIn("<h1>Conselho da Petrobras</h1>", normalizado)

    def test_agenda_em_hifen_vira_item(self):
        normalizado = enviar_briefing._normalizar_estrutura(self.BRIEFING_21_08)
        self.assertIn("<li>05:00 (EU): Zona do Euro PMI Industrial [S&P Global]</li>", normalizado)

    def test_ponto_numerado_perde_o_numero_do_modelo(self):
        # _numbered_row numera no e-mail. Manter o "1. " do modelo produzia
        # "1. 1." e um item fantasma so com o numero solto.
        normalizado = enviar_briefing._normalizar_estrutura(self.BRIEFING_21_08)
        self.assertIn("<li><b>Conselho da Petrobras</b>", normalizado)
        self.assertNotIn("<li>1. ", normalizado)

    def test_email_nao_tem_numeracao_dobrada(self):
        email = enviar_briefing.build_styled_email(self.BRIEFING_21_08, "21 de agosto de 2026")
        visivel = enviar_briefing._texto_visivel(email)
        self.assertNotIn("1. 1.", visivel)
        self.assertNotIn("2. 2.", visivel)
        # Cada ponto aparece uma vez so, com o numero gerado pelo e-mail.
        self.assertIn("1. Conselho da Petrobras", visivel)
        self.assertIn("2. Greve dos Bancarios", visivel)

    def test_fonte_sai_do_email_mesmo_sem_cabecalho(self):
        # Ordem do Yan em 19/08: sem rotulo de veiculo no O QUE IMPORTA HOJE.
        # A remocao procura <h1>O QUE IMPORTA HOJE</h1>, entao so funciona
        # depois da normalizacao.
        email = enviar_briefing.build_styled_email(self.BRIEFING_21_08, "21 de agosto de 2026")
        self.assertNotIn("Fonte: InfoMoney", email)
        self.assertNotIn("infomoney.com.br", email)

    def test_normalizacao_e_idempotente(self):
        canonico = (
            "<h1>RESUMO</h1>\n<p>Texto do resumo.</p>\n"
            "<h1>AGENDA DO DIA</h1>\n<ul><li>05:00 evento</li></ul>\n"
        )
        self.assertEqual(enviar_briefing._normalizar_estrutura(canonico), canonico)


class TestTravaEmailVazio(unittest.TestCase):
    """T09 (24/08/2026): rede de seguranca independente do parser. Mesmo que
    o render quebre de outro jeito no futuro, nada e enviado vazio."""

    def test_email_sem_corpo_reprova(self):
        # Secao que o e-mail descarta por decisao de 13/08: nada sobra no corpo.
        bruto = "<h1>RADAR QUANT</h1>\n<p>Conteudo que o e-mail descarta de proposito.</p>"
        ok, motivo = enviar_briefing._corpo_suficiente(bruto)
        self.assertFalse(ok)
        self.assertIn("sem corpo", motivo)

    def test_email_com_corpo_aprova(self):
        bruto = "<h1>RESUMO</h1>\n<p>Conteudo real e razoavelmente longo do briefing do dia.</p>"
        ok, motivo = enviar_briefing._corpo_suficiente(bruto)
        self.assertTrue(ok, motivo)

    def test_briefing_sem_cabecalho_passa_na_trava(self):
        # O formato de 21/08 reprovava a trava antes da normalizacao.
        ok, motivo = enviar_briefing._corpo_suficiente(
            TestBriefingSemCabecalho.BRIEFING_21_08
        )
        self.assertTrue(ok, motivo)

    def test_perda_parcial_grande_reprova(self):
        # Metade do texto cru fica numa secao descartada: o corpo sai com
        # menos da metade do conteudo e a trava fecha.
        bruto = (
            "<h1>RESUMO</h1>\n<p>Sobrou so isso.</p>\n"
            "<h1>MORNING CALL</h1>\n<p>" + ("Conteudo extenso do briefing. " * 40) + "</p>"
        )
        ok, motivo = enviar_briefing._corpo_suficiente(bruto)
        self.assertFalse(ok)
        self.assertIn("perdeu conteudo", motivo)


if __name__ == "__main__":
    unittest.main(verbosity=2)
