"""test_sanitizar_briefing.py — testes do sanitizador de conteudo do briefing.

Zero dependencia externa (unittest da stdlib), mesmo principio do pipeline.
Nao entra no npm test da raiz; roda em Python puro.

Uso:
    python -m unittest discover -s briefing-interno/tests -p "test_sanitizar*.py" -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from _sanitizar_briefing import sanitizar_conteudo


class SanitizarConteudoTest(unittest.TestCase):
    def _re(self, pat, texto):
        import re

        return re.search(pat, texto)

    def test_conteudo_limpo_inalterado(self):
        html = "<h2>RESUMO</h2><p>O IBOV fechou em alta.</p><li>Item</li>"
        self.assertEqual(sanitizar_conteudo(html), html)

    def test_h1_normalizado_para_h2_nunca_emite_h1(self):
        html = "<h1>RESUMO</h1><p>texto</p>"
        out = sanitizar_conteudo(html)
        self.assertNotIn("h1", out)
        self.assertIn("<h2>RESUMO</h2>", out)

    def test_style_class_id_on_removidos(self):
        html = '<p style="color:red" class="x" id="y" onclick="evil()">texto</p>'
        out = sanitizar_conteudo(html)
        self.assertNotIn("style=", out)
        self.assertNotIn("class=", out)
        self.assertNotIn('id="', out)
        self.assertNotIn("onclick", out)
        self.assertEqual(out, "<p>texto</p>")

    def test_href_http_https_permanece(self):
        html = '<h2>PONTO</h2><p>Fonte: <a href="https://g1.globo.com/x.ghtml">InfoMoney</a></p>'
        out = sanitizar_conteudo(html)
        self.assertIn('<a href="https://g1.globo.com/x.ghtml">', out)
        self.assertIn("InfoMoney", out)

    def test_href_http_puro_permanece(self):
        html = '<a href="http://example.com/a">link</a>'
        out = sanitizar_conteudo(html)
        self.assertIn('<a href="http://example.com/a">link</a>', out)

    def test_protocolo_inseguro_esvaziado_mas_texto_fica(self):
        html = '<a href="javascript:alert(1)">clique</a>'
        out = sanitizar_conteudo(html)
        self.assertNotIn("javascript:", out)
        # texto permanece, link sem href seguro vira <a> sem atributo
        self.assertIn("clique", out)
        self.assertIn("<a>clique</a>", out)

    def test_schemas_inseguros_variados(self):
        for scheme in ("data:", "file:", "vbscript:"):
            out = sanitizar_conteudo(f'<a href="{scheme}aaa">x</a>')
            self.assertNotIn(scheme, out)
            self.assertIn("x", out)

    def test_script_descartado_junto_com_o_texto(self):
        html = "<p>antes</p><script>alert('x')</script><p>depois</p>"
        out = sanitizar_conteudo(html)
        self.assertNotIn("script", out)
        self.assertNotIn("alert", out)
        self.assertIn("antes", out)
        self.assertIn("depois", out)

    def test_style_descartado_junto_com_o_texto(self):
        html = "<p>antes</p><style>body{color:red}</style><p>depois</p>"
        out = sanitizar_conteudo(html)
        self.assertNotIn("style", out)
        self.assertNotIn("body{color", out)
        self.assertIn("antes", out)
        self.assertIn("depois", out)

    def test_tag_fora_da_allowlist_some_mas_texto_fica(self):
        html = "<p>antes<span>meio</span>depois<font color=red>fonte</font></p>"
        out = sanitizar_conteudo(html)
        self.assertNotIn("span", out)
        self.assertFalse(self._re(r"<font|</font>", out))
        self.assertIn("meio", out)
        self.assertIn("fonte", out)
        self.assertIn("antes", out)
        self.assertEqual(out, "<p>antesmeiodepoisfonte</p>")

    def test_doctype_e_comentario_saem(self):
        html = "<!--comentario--><!DOCTYPE html><p>x</p>"
        out = sanitizar_conteudo(html)
        self.assertNotIn("comentario", out)
        self.assertNotIn("DOCTYPE", out)
        self.assertEqual(out, "<p>x</p>")

    def test_idempotente(self):
        html = (
            '<h2>RESUMO</h2><p>O IBOV fechou em alta. '
            '<a href="https://ex.com/a">InfoMoney</a></p>'
        )
        once = sanitizar_conteudo(html)
        twice = sanitizar_conteudo(once)
        self.assertEqual(once, twice)

    def test_html_vazio(self):
        self.assertEqual(sanitizar_conteudo(""), "")
        self.assertEqual(sanitizar_conteudo(None), "")


if __name__ == "__main__":
    unittest.main()
