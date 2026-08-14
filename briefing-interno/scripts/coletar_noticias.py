"""coletar_noticias.py — coleta noticias de fontes brasileiras e globais.

Fontes:
- InfoMoney RSS (economia e mercado brasileiro)
- G1 Economia RSS
- Poder360 RSS (politica e economia)
- Agencia Brasil RSS
- Finnhub (global, opcional — requer FINNHUB_TOKEN)
- GDELT DOC API (internacional, opcional — rate limit 1/5s)

Zero dependencia externa. So stdlib.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
FEEDS = [
    ("InfoMoney", "https://www.infomoney.com.br/feed/"),
    ("G1 Economia", "https://g1.globo.com/rss/g1/economia/"),
    ("Poder360", "https://www.poder360.com.br/feed/"),
    ("Agencia Brasil", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"),
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BRT = timezone(timedelta(hours=-3))
MAX_PER_FEED = 25
MAX_TOTAL = 60


def _load_env() -> dict[str, str]:
    env_path = ROOT / ".env"
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for raw in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _get(url: str, timeout: int = 30) -> str | None:
    """GET com User-Agent. Retorna None em qualquer erro (nao derruba o coletor)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def _parse_rss(xml_text: str, source: str) -> list[dict]:
    """Parse RSS 2.0. Devolve lista de {title, url, source, published}."""
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items

    for item in root.iter("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        date_el = item.find("pubDate")

        title = title_el.text.strip() if title_el is not None and title_el.text else ""
        url = link_el.text.strip() if link_el is not None and link_el.text else ""
        if not title or not url:
            continue

        published = ""
        if date_el is not None and date_el.text:
            published = date_el.text.strip()

        items.append({
            "title": title,
            "url": url,
            "source": source,
            "published": published,
        })

    return items[:MAX_PER_FEED]


def _collect_rss() -> list[dict]:
    """Coleta de todos os feeds RSS configurados."""
    all_items: list[dict] = []
    for name, url in FEEDS:
        print(f"  RSS {name}...", end=" ")
        xml_text = _get(url, timeout=20)
        if xml_text is None:
            print("FALHOU (sem resposta)")
            continue
        items = _parse_rss(xml_text, name)
        print(f"{len(items)} itens")
        all_items.extend(items)
    return all_items


def _collect_finnhub(env: dict[str, str]) -> list[dict]:
    """Finnhub news — global, principalmente Reuters/CNBC."""
    token = env.get("FINNHUB_TOKEN", "").strip()
    if not token:
        print("  Finnhub: token ausente, pulando")
        return []

    items: list[dict] = []
    categories = ["general", "forex", "merger"]
    for cat in categories:
        url = f"https://finnhub.io/api/v1/news?category={cat}&token={token}"
        print(f"  Finnhub/{cat}...", end=" ")
        raw = _get(url, timeout=15)
        if raw is None:
            print("FALHOU")
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print("JSON invalido")
            continue
        if not isinstance(data, list):
            print(f"inesperado: {type(data).__name__}")
            continue
        for entry in data:
            items.append({
                "title": str(entry.get("headline", entry.get("title", ""))),
                "url": str(entry.get("url", "")),
                "source": str(entry.get("source", "Finnhub")),
                "published": str(entry.get("datetime", "")),
            })
        print(f"{len(data)} itens")
        time.sleep(0.25)
    return items


# O02 (14/08/2026): a API GDELT exige que termos combinados com OR fiquem
# entre parenteses ("Queries containing OR'd terms must be surrounded by
# ()"). Sem os parenteses a fonte contribuia zero noticias desde a quebra.
GDELT_QUERIES = [
    "(ibovespa OR bovespa OR \"bolsa brasileira\")",
    "(petrobras OR vale OR \"banco do brasil\")",
]


def _get_gdelt(url: str, timeout: int = 20) -> str | None:
    """GET GDELT distinguindo rate limit (429) dos demais erros no log."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            print("rate-limit (429)")
        else:
            print(f"HTTP {exc.code}")
        return None
    except Exception:
        return None


def _collect_gdelt() -> list[dict]:
    """GDELT DOC API — busca por Ibovespa e mercado brasileiro.

    Rate limit documentado: 1 req / 5 segundos. Respeitamos com sleep.
    """
    items: list[dict] = []
    for q in GDELT_QUERIES:
        url = (
            "https://api.gdeltproject.org/api/v2/doc/doc"
            f"?query={urllib.request.quote(q)}"
            "&mode=artlist&maxrecords=15&format=json"
            "&timespan=3d"
        )
        print(f"  GDELT: {q[:60]}...", end=" ")
        raw = _get_gdelt(url, timeout=20)
        if raw is None:
            print(" FALHOU")
            time.sleep(5)
            continue

        # GDELT devolve rate-limit como HTTP 200 com texto, nao JSON.
        # O02: distinguir erro de sintaxe da query de rate-limit, para a
        # causa real aparecer no log em vez de "provavel rate-limit".
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            if "surrounded by" in raw.lower() or "or'd terms" in raw.lower():
                print(f"erro de sintaxe da query: {raw[:100]}")
            else:
                print(f"nao-JSON (provavel rate-limit): {raw[:100]}")
            time.sleep(5)
            continue

        articles = data.get("articles", [])
        for a in articles:
            items.append({
                "title": str(a.get("title", "")),
                "url": str(a.get("url", "")),
                "source": str(a.get("domain", a.get("source", "GDELT"))),
                "published": str(a.get("seendate", "")),
            })
        print(f"{len(articles)} itens")
        time.sleep(6)  # Margem acima do rate limit de 5s
    return items


def _dedupe(items: list[dict]) -> list[dict]:
    """Remove duplicatas por URL, mantendo primeira ocorrencia."""
    seen: set[str] = set()
    out: list[dict] = []
    for item in items:
        url = item["url"]
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(item)
    return out


def _is_recent(item: dict, max_days: int = 3) -> bool:
    """Filtro grosseiro por idade maxima (evita noticia de semanas atras)."""
    pub = item.get("published", "")
    if not pub:
        return True  # sem data, mantem
    cutoff = datetime.now(tz=BRT) - timedelta(days=max_days)
    # Tenta varios formatos comuns de data
    for fmt in [
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        "%Y%m%d%H%M%S",
    ]:
        try:
            dt = datetime.strptime(pub, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=BRT)
            return dt >= cutoff
        except (ValueError, OverflowError):
            continue
    return True  # formato desconhecido, mantem


def main() -> int:
    today = date.today()
    date_tag = today.strftime("%Y%m%d")

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    env = _load_env()

    print(f"=== Coletando noticias para {date_tag} ===")

    all_items: list[dict] = []

    print("\n[RSS brasileiro]")
    all_items.extend(_collect_rss())

    print("\n[Finnhub global]")
    all_items.extend(_collect_finnhub(env))

    print("\n[GDELT]")
    all_items.extend(_collect_gdelt())

    # Pos-processamento
    all_items = _dedupe(all_items)
    all_items = [i for i in all_items if i["url"] and i["title"]]
    all_items = [i for i in all_items if _is_recent(i)]
    all_items = all_items[:MAX_TOTAL]

    # Salvar
    out_path = LOG_DIR / f"noticias_{date_tag}.json"
    payload = {
        "coletado_em": datetime.now(tz=BRT).isoformat(),
        "data": date_tag,
        "n_itens": len(all_items),
        "itens": all_items,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    tem_br = any(
        i["source"] in {"InfoMoney", "G1 Economia", "Poder360", "Agencia Brasil"}
        for i in all_items
    )
    print(f"\nTotal: {len(all_items)} noticias ({'com' if tem_br else 'SEM'} fonte BR)")
    print(f"Salvo em: {out_path}")

    if not all_items:
        print("AVISO: zero noticias coletadas. O briefing pode sair vazio.", file=sys.stderr)
        return 1
    if not tem_br:
        print("AVISO: nenhuma noticia brasileira no pool. Verifique os feeds RSS.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
