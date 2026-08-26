"""_sanitizar_briefing.py — sanitizacao do conteudo gerado pelo LLM.

O LLM gera o briefing como HTML. Ele e a unica parte nao-deterministica da
cadeia: a formatacao visual final (cores, fontes, layout) e aplicada pelo
sistema no envio (enviar_briefing.py / resend.js). Este modulo garante que o
arquivo em disco (outputs/briefing_<data>.html) contenha apenas conteudo
estrutural, sem estilo, sem script, sem atributo perigoso e sem protocolo
inseguro. Fail-closed: qualquer coisa fora da allowlist e descartada ou
esvaziada de atributos, nunca propagada.

Allowlist de tags (o parser de envio consome h1/h2/p/li/b; ul/ol/br/a/strong
sao aceitos por comodidade do modelo, o parser os trata como transparentes):
    h2, p, li, ul, ol, b, strong, a, br

O <h1> e reservado ao cabecalho do e-mail (hero), montado pelo template. O
sanitizador NUNCA emite <h1>: um <h1> vindo do modelo e normalizado para
<h2>, preservando o texto e a hierarquia de secao sem permitir que o modelo
reproduza um segundo hero.

Regras (ordem de aplicacao):
1. Comentarios, doctype e prolog sao removidos.
2. <script> e <style> sao removidos JUNTO com o conteudo interno.
3. Tag fora da allowlist: a tag some, o texto interno permanece (o modelo
   costuma embrulhar trechos em <span>/<font>; jogar o texto fora perderia
   conteudo que as regras do validador precisam ver).
4. <h1> vira <h2> (nunca emite h1).
5. Em <a>, so o atributo href sobrevive, e apenas se comecar com http:// ou
   https:// (case-insensitive). Qualquer outro protocolo (javascript:, data:,
   file:, vbscript:) esvazia o href (o texto fica, o link nao).
6. Em qualquer outra tag, TODOS os atributos saem (style, class, id, on* e
   atributos desconhecidos).

Zero dependencia externa (stdlib only), mesmo principio do restante do
pipeline.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser

TAGS_ALLOWED = {"h2", "p", "li", "ul", "ol", "b", "strong", "a", "br"}
# Tags cujo conteudo inteiro (texto incluido) deve ser descartado.
TAGS_DESCARTE_TOTAL = {"script", "style"}

_HTTP_RE = re.compile(r"^https?://", re.IGNORECASE)


def _href_seguro(valor: str) -> str | None:
    """Devolve o href so se o protocolo for http/https. None caso contrario."""
    v = valor.strip()
    if not v:
        return None
    if not _HTTP_RE.match(v):
        return None
    return v


class _Sanitizador(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._out: list[str] = []
        # Pilha de contexto. Pode conter "descartar_tudo" (script/style,
        # texto interno tambem sai) e/ou "descartar_tag" (tag fora da
        # allowlist, texto interno permanece).
        self._pilha: list[str] = []

    def _em_descarte_total(self) -> bool:
        return "descartar_tudo" in self._pilha

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in TAGS_DESCARTE_TOTAL:
            self._pilha.append("descartar_tudo")
            return
        if tag == "h1":
            # h1 e do template. Normaliza para h2 (secao), nunca emite h1.
            tag = "h2"
        if tag in TAGS_ALLOWED:
            if self._em_descarte_total():
                # dentro de script/style nada escapa
                return
            if tag == "a":
                href = None
                for nome, valor in attrs:
                    if nome.lower() == "href" and valor is not None:
                        href = _href_seguro(valor)
                        break
                if href:
                    self._out.append(f'<a href="{href}">')
                else:
                    # Link sem href seguro: o texto permanece, o link nao.
                    self._out.append("<a>")
                return
            # h2/p/li/ul/ol/b/strong/br: sem atributos, sem excecao.
            self._out.append(f"<{tag}>")
            return
        # Tag fora da allowlist: descarta a tag, mantem o texto interno.
        self._pilha.append("descartar_tag")

    def handle_endtag(self, tag: str) -> None:
        if tag in TAGS_DESCARTE_TOTAL:
            if self._pilha:
                self._pilha.pop()
            return
        if tag == "h1":
            tag = "h2"
        if tag in TAGS_ALLOWED:
            if self._em_descarte_total():
                return
            self._out.append(f"</{tag}>")
            return
        # Tag fora da allowlist: apenas desempilha o marcador, sem emitir.
        if self._pilha:
            self._pilha.pop()

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # <br/> e afins: trata como start + end (sem emitir end para br).
        if tag in TAGS_ALLOWED and not self._em_descarte_total():
            if tag == "br":
                self._out.append("<br>")
                return
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)
            return
        if tag in TAGS_DESCARTE_TOTAL:
            return
        # Tag vazia fora da allowlist: nada a emitir.
        if not self._em_descarte_total():
            self._pilha.append("descartar_tag")
            self._pilha.pop()

    def handle_data(self, data: str) -> None:
        if self._em_descarte_total():
            return
        self._out.append(data)

    def handle_comment(self, data: str) -> None:
        return  # comentario nao sobrevive

    def handle_decl(self, decl: str) -> None:
        return  # doctype nao sobrevive

    def handle_pi(self, data: str) -> None:
        return  # prolog nao sobrevive

    def resultado(self) -> str:
        return "".join(self._out)


def sanitizar_conteudo(html: str) -> str:
    """Sanitiza o HTML do briefing. Devolve HTML minimo de conteudo.

    Idempotente: HTML ja sanitizado sai inalterado.
    """
    s = _Sanitizador()
    s.feed(html or "")
    s.close()
    out = s.resultado()
    # Compacta espacos em branco residuais da remocao de tags.
    out = re.sub(r"[ \t\r\f\v]+", " ", out)
    out = re.sub(r"\n\s*\n+", "\n", out)
    return out.strip()
