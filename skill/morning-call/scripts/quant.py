#!/usr/bin/env python3
"""Motor quantitativo de referência — funções PURAS e testadas.

Espelha o que roda em src/quant (TypeScript) no Worker. Objetivo: nenhum número do Morning Call
vem de LLM; tudo aqui é determinístico e verificável. Rode `python3 quant.py` para os testes.

Regras: preços em ordem cronológica crescente; base 252 (dias úteis) para anualização;
correlação sobre retornos alinhados; nunca preencher buracos silenciosamente.
"""
from __future__ import annotations
import math
from typing import Sequence

TRADING_DAYS = 252


def simple_return(p0: float, p1: float) -> float:
    """Retorno simples de p0 para p1."""
    if p0 == 0:
        raise ValueError("preço inicial zero")
    return p1 / p0 - 1.0


def period_return(prices: Sequence[float]) -> float:
    """Retorno simples do período (primeiro -> último)."""
    if len(prices) < 2:
        raise ValueError("mínimo 2 preços")
    return simple_return(prices[0], prices[-1])


def log_returns(prices: Sequence[float]) -> list[float]:
    if len(prices) < 2:
        return []
    return [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]


def realized_vol(prices: Sequence[float], annualize: bool = True) -> float:
    """Vol realizada (desvio-padrão amostral dos log-retornos), anualizada por padrão."""
    lr = log_returns(prices)
    if len(lr) < 2:
        return 0.0
    mean = sum(lr) / len(lr)
    var = sum((x - mean) ** 2 for x in lr) / (len(lr) - 1)  # amostral (n-1)
    vol = math.sqrt(var)
    return vol * math.sqrt(TRADING_DAYS) if annualize else vol


def max_drawdown(prices: Sequence[float]) -> float:
    """Drawdown máximo (número negativo ou zero)."""
    peak = prices[0]
    mdd = 0.0
    for p in prices:
        peak = max(peak, p)
        mdd = min(mdd, p / peak - 1.0)
    return mdd


def momentum(prices: Sequence[float], window: int) -> float:
    """Retorno acumulado nos últimos `window` passos."""
    if window < 1 or len(prices) < window + 1:
        raise ValueError("janela maior que a série")
    return simple_return(prices[-window - 1], prices[-1])


def zscore(series: Sequence[float], value: float | None = None) -> float:
    """Z-score de `value` (ou do último ponto) vs. a distribuição da série."""
    if len(series) < 2:
        return 0.0
    x = series[-1] if value is None else value
    mean = sum(series) / len(series)
    var = sum((s - mean) ** 2 for s in series) / (len(series) - 1)
    sd = math.sqrt(var)
    return 0.0 if sd == 0 else (x - mean) / sd


def correlation(a: Sequence[float], b: Sequence[float]) -> float:
    """Pearson sobre duas séries de MESMO tamanho (alinhar por data antes)."""
    if len(a) != len(b) or len(a) < 2:
        raise ValueError("séries de mesmo tamanho, >=2")
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    denom = math.sqrt(va * vb)
    return 0.0 if denom == 0 else cov / denom


def curve_slope(y_short: float, y_long: float) -> float:
    """Inclinação em bps (long - short), entradas em % (ex.: 14.25)."""
    return (y_long - y_short) * 100.0


def curve_butterfly(y_short: float, y_mid: float, y_long: float) -> float:
    """Curvatura em bps: 2*meio - curto - longo."""
    return (2 * y_mid - y_short - y_long) * 100.0


def breakeven_inflation(pre: float, real: float) -> float:
    """Inflação implícita a partir de pré e juro real (frações, ex.: 0.14 e 0.07)."""
    return (1 + pre) / (1 + real) - 1


def risk_reward(entry: float, target: float, invalidation: float) -> float:
    """Assimetria |alvo-entrada| / |entrada-invalidação|."""
    risk = abs(entry - invalidation)
    if risk == 0:
        raise ValueError("invalidação igual à entrada")
    return abs(target - entry) / risk


def _tests() -> None:
    assert abs(simple_return(100, 110) - 0.10) < 1e-12
    assert abs(period_return([100, 105, 110]) - 0.10) < 1e-12
    assert max_drawdown([100, 120, 60, 80]) == (60 / 120 - 1)  # -0.5
    assert abs(momentum([10, 11, 12, 13], 2) - (13 / 11 - 1)) < 1e-12
    # correlação perfeita positiva/negativa
    assert abs(correlation([1, 2, 3, 4], [2, 4, 6, 8]) - 1.0) < 1e-9
    assert abs(correlation([1, 2, 3, 4], [8, 6, 4, 2]) + 1.0) < 1e-9
    # z-score de série simétrica: último ponto
    assert abs(zscore([1, 2, 3, 4, 5], 3) - 0.0) < 1e-9
    # curva
    assert abs(curve_slope(14.25, 15.25) - 100.0) < 1e-9
    assert abs(curve_butterfly(14.0, 15.0, 14.0) - 200.0) < 1e-9
    # breakeven ~ (1.14/1.07 - 1)
    assert abs(breakeven_inflation(0.14, 0.07) - (1.14 / 1.07 - 1)) < 1e-12
    # risco-retorno 3:1
    assert abs(risk_reward(100, 130, 90) - 3.0) < 1e-12
    # vol: série constante => 0
    assert realized_vol([100, 100, 100]) == 0.0
    print("OK: todos os testes do motor quant passaram.")


if __name__ == "__main__":
    _tests()
