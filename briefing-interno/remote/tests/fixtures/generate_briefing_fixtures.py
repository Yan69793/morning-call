"""generate_briefing_fixtures.py — fixtures de equivalencia dos ports do briefing.

Captura feeds RSS reais e gera, com as funcoes Python originais (importadas,
sem editar nada), os outputs esperados que os testes node comparam byte a byte:
  - prompt: _build_user_prompt sobre os JSONs reais de 18/08 + agenda real
  - styled email: build_styled_email sobre os HTMLs reais (17/08 exercita o
    parser com <a> transparente e <b> dentro de <li>)
  - rss: _parse_rss sobre feeds capturados agora

Uso: python tests/fixtures/generate_briefing_fixtures.py
"""

import json
import sys
import urllib.request
from pathlib import Path

BRIEFING = Path(r"E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno")
FIXTURE_DIR = Path(__file__).resolve().parent

sys.path.insert(0, str(BRIEFING / "scripts"))

import coletar_noticias  # noqa: E402
import gerar_briefing  # noqa: E402
import enviar_briefing  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def capturar_feed(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main() -> int:
    # 1) RSS: captura + parse esperado
    feeds = []
    for name, url in coletar_noticias.FEEDS:
        try:
            xml_text = capturar_feed(name, url)
        except Exception as exc:
            print(f"feed {name} falhou na captura: {exc}")
            continue
        items = coletar_noticias._parse_rss(xml_text, name)
        feeds.append({"name": name, "url": url, "xml": xml_text, "items": items})
        print(f"RSS {name}: {len(items)} itens parseados")
    (FIXTURE_DIR / "rss_feeds.json").write_text(
        json.dumps(feeds, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 2) Prompt: _build_user_prompt sobre os JSONs reais de 18/08
    noticias = load_json(BRIEFING / "logs" / "noticias_20260818.json")
    estado = load_json(BRIEFING / "logs" / "estado_20260818.json")
    exposicao = load_json(BRIEFING / "projetos-exposicao.json")
    prompt = gerar_briefing._build_user_prompt(noticias, estado, exposicao, "20260818")
    # write_bytes: write_text no Windows traduziria \n para \r\n (universal
    # newlines), quebrando a comparacao byte a byte com o port em node.
    (FIXTURE_DIR / "prompt_esperado.txt").write_bytes(prompt.encode("utf-8"))
    print(f"Prompt esperado: {len(prompt)} chars")

    # 3) Styled email: build_styled_email sobre os HTMLs reais
    for data_tag, nome in [("20260817", "styled_esperado_20260817.html"),
                           ("20260818", "styled_esperado_20260818.html")]:
        html_path = BRIEFING / "outputs" / f"briefing_{data_tag}.html"
        if not html_path.exists():
            print(f"{html_path} nao existe, pulando")
            continue
        html_content = html_path.read_text(encoding="utf-8")
        data_fmt = enviar_briefing.datetime.strptime(data_tag, "%Y%m%d").date()
        meses = [
            "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ]
        data_fmt_str = f"{data_fmt.day:02d} de {meses[data_fmt.month - 1]} de {data_fmt.year}"
        styled = enviar_briefing.build_styled_email(html_content, data_fmt_str)
        (FIXTURE_DIR / nome).write_bytes(styled.encode("utf-8"))
        print(f"{nome}: {len(styled)} chars")

    return 0


if __name__ == "__main__":
    sys.exit(main())
