"""Paridade de formatacao entre Python e JS via fixture compartilhada.

Le o MESMO fmt_vectors.json que remote/tests/fmt.equiv.test.mjs usa e exige
saida identica do formatador local (_fmt_num_br/_fmt_nivel) contra cada
vetor. A fonte da verdade dos esperados e o f-string do Python
(f"{v:,.{d}f}"); os casos-limite sao de arredondamento (1.005, 2.675),
negativos e valor grande. Um delta entre os dois lados quebra aqui e no JS.
"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from _comum import ATIVOS_META
from gerar_briefing import _bloco_precos, _fmt_nivel, _fmt_num_br

FIXTURE = ROOT / "remote" / "tests" / "fixtures" / "fmt_vectors.json"


def _precos_minimo() -> dict:
    """Precos minimo so para exercitar o bloco: close unico, sem erros."""
    ativos = {
        ticker: {"close": 1000.0, "trade_date": "2026-08-26", "fonte": "teste"}
        for ticker in ATIVOS_META
    }
    return {"ativos": ativos}


class TestFmtPrecos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vetores = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_fmt_num_br_vetores_compartilhados(self):
        for v in self.vetores["decimais"]:
            with self.subTest(valor=v["valor"], decimais=v["decimais"]):
                self.assertEqual(_fmt_num_br(v["valor"], v["decimais"]), v["esperado"])

    def test_fmt_nivel_vetores_compartilhados(self):
        for v in self.vetores["niveis"]:
            with self.subTest(ticker=v["ticker"]):
                self.assertEqual(_fmt_nivel(v["ticker"], v["valor"]), v["esperado"])

    def test_bloco_nunca_produz_virgula_de_milhar(self):
        # A formatacao troca virgula (f-string BR) por ponto no milhar. Se uma
        # virgula de milhar escapar ("174,577"), o _parse_num_br do validador
        # le 174.577, 1000x menor, e um briefing perfeito reprova. As casas
        # exibidas sao 0, 2 ou 4, entao "3 digitos apos virgula" numa linha de
        # ativo so aparece na aberracao. A instrucao do bloco cita "174,577"
        # como exemplo do que NAO fazer, por isso a varredura olha so as
        # linhas de ativo, nao o texto de instrucao.
        bloco = _bloco_precos(_precos_minimo())
        linhas_ativo = [
            l for l in bloco.splitlines()
            if l.startswith("  ") and "pregao" in l
        ]
        self.assertTrue(linhas_ativo, "bloco sem linhas de ativo")
        for linha in linhas_ativo:
            self.assertNotRegex(linha, r",\d{3}\b", linha)

        # O caso que motivou a formatacao: 174577.0 vira "174.577", nunca
        # "174,577", na linha do ativo que o modelo le (a instrucao do bloco
        # cita "174,577" como contraexemplo, entao o assert e na linha).
        ativos = dict(_precos_minimo()["ativos"])
        ativos["IBOV"]["close"] = 174577.0
        bloco_ibov = _bloco_precos({"ativos": ativos})
        linha_ibov = next(l for l in bloco_ibov.splitlines() if l.startswith("  IBOV"))
        self.assertEqual(linha_ibov, "  IBOV: 174.577 pontos (pregao 2026-08-26) [teste]")
        self.assertNotIn("174,577", linha_ibov)


if __name__ == "__main__":
    unittest.main()
