"""test_validar_briefing.py — regressao dos padroes direcionais do portao.

Cobre o drift de 14/08/2026: o prompt de gerar_briefing.py documenta
"deve pressionar" e "revisao para baixo/cima" como chamada direcional
valida, e o validador reprovava briefing com esse vocabulario (REGRA 5).

Uso:
    python tests/test_validar_briefing.py
ou
    python -m unittest discover -s tests
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from validar_briefing import _find_directional_paragraphs  # noqa: E402


class TestDirectionalPatterns(unittest.TestCase):
    """Frases reais ou realistas de briefing contra os DIRECTIONAL_PATTERNS."""

    def test_padroes_historicos(self):
        casos = [
            "O Ibovespa tende a subir com o fluxo externo (confianca: 0.7).",
            "O dolar deve cair se o Copom acelerar o ciclo (confianca: 0.6).",
            "O ativo vai valorizar com o resultado trimestral (confianca: 0.8).",
            "Ha pressao de alta no preco do petroleo (confianca: 0.5).",
            "A acao tem potencial de baixa no curto prazo (confianca: 0.4).",
            "O vies altista segue para commodities (confianca: 0.6).",
        ]
        for frase in casos:
            with self.subTest(frase=frase):
                self.assertTrue(
                    _find_directional_paragraphs(frase),
                    f"nao detectou: {frase}",
                )

    def test_drift_14_08_pressionar(self):
        html = (
            "<p>A intensificacao desta disputa comercial tende a pressionar "
            "o real frente ao dolar (confianca: 0.7).</p>"
        )
        self.assertTrue(_find_directional_paragraphs(html))

    def test_drift_14_08_revisao_para_baixo(self):
        html = (
            "<p>A empresa deve enfrentar dificuldades, o que pode levar a uma "
            "revisao para baixo das suas acoes (confianca: 0.8).</p>"
        )
        self.assertTrue(_find_directional_paragraphs(html))

    def test_briefing_20260814_real(self):
        """O HTML que reprovou com REGRA 5 em 14/08 agora tem 2 direcionais."""
        html_path = ROOT / "outputs" / "briefing_20260814.html"
        if not html_path.exists():
            self.skipTest("briefing_20260814.html nao existe neste checkout")
        trechos = _find_directional_paragraphs(
            html_path.read_text(encoding="utf-8")
        )
        self.assertEqual(len(trechos), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
