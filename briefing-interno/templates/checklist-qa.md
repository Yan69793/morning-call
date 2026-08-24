# Checklist de QA do briefing

Criado em 24/08/2026, quando o Morning Call passou a sair para lista de clientes.
Enquanto o único leitor era o Yan, isto não fazia sentido. Com audiência externa faz.

O portão `validar_briefing.py` reprova sozinho e aborta o envio. Este checklist é o que
ele **não** consegue decidir. Não repete as regras 1 a 6, e não substitui nenhuma delas.

## O que a máquina reprova sozinha

Não conferir à mão, já está coberto e o envio nem acontece se falhar.

| Regra | O que trava |
|---|---|
| 1 | URL citada que não está no pool de notícias do dia |
| 2 | Chamada direcional sem confiança declarada |
| 3 | Projeto citado fora do mapa de exposição |
| 4 | Neutralizada em 13/08, a seção Radar Quant saiu do briefing |
| 5 | Briefing sem nenhuma chamada direcional |
| 6 | Nível de mercado citado que não bate com a cotação real do pregão |

Se o e-mail chegou, essas seis passaram.

## O que o revisor decide

### 1. A tese se sustenta

O número está certo, a REGRA 6 garantiu. A pergunta aqui é outra, o raciocínio que liga
o fato à conclusão faz sentido. Um briefing pode citar o Ibovespa correto e mesmo assim
dizer uma bobagem sobre o porquê.

Perguntar de cada chamada direcional, se eu tivesse que defender isso na frente do
cliente amanhã, eu defenderia. Se a resposta for não, cortar a chamada, não amaciar.

### 2. A fonte aguenta o peso da afirmação

A REGRA 1 só garante que a URL existe no pool. Não garante que a matéria diz o que o
briefing afirma que ela diz, nem que a fonte é adequada para aquela afirmação.

Abrir pelo menos a fonte da chamada mais forte do dia e confirmar que ela sustenta o que
está escrito. Notícia de portal serve para relatar fato, não para fundamentar projeção
de preço.

### 3. Direção bate com a tese macro

Checar se as chamadas do dia não se contradizem entre si, e se não contradizem o que o
briefing vinha dizendo na semana. Virar de altista para baixista em 24h é legítimo,
virar sem explicar o que mudou não é.

### 4. Cenário contra realizado

Olhar a chamada de ontem contra o que o mercado fez hoje. Não para punir erro, chamada
direcional erra por definição. É para pegar o caso em que o briefing errou e seguiu
falando como se tivesse acertado.

Quando `visao/` tiver série suficiente isto vira relatório. Até lá é leitura manual.

### 5. Confiança atribuída a terceiro

Caso real do briefing de 20/08. O texto diz que o JPMorgan alerta que as eleições podem
levar o dólar a R$ 5,50, e anexa `(confianca: 0.7)`. Fica ambíguo de quem é a confiança,
do JPMorgan ou nossa. Se a previsão é de terceiro, ou a confiança sai, ou o texto deixa
explícito que a confiança é nossa sobre a tese, não sobre o número deles.

A REGRA 6 ignora esses números de propósito, previsão não é cotação. Então esse caso
chega intacto no revisor.

### 6. Instrumentação interna vazando para o cliente

O marcador `(confianca: 0.6)` aparece no corpo renderizado que o cliente lê. Ele existe
porque a REGRA 2 exige, é controle interno. Decidir uma vez e valer para sempre, ou fica
com rótulo legível, ou sai do render e permanece no HTML só para o validador enxergar.

Enquanto não estiver decidido, conferir a cada envio se o formato está aceitável para
quem não sabe o que aquilo significa.

### 7. Ativo citado sem cotação

A REGRA 6 confere o que está na tabela de preços. Ativo fora dela passa sem conferência,
e hoje a tabela tem 15 nomes. Se o briefing falar de algum ativo fora dessa lista, o
número não foi checado por ninguém. Conferir à mão ou cortar.

## Conferência manual de cotação

Fontes que não entram no portão automático porque não funcionam em job desatendido das
07h, mas servem para o revisor bater o olho no número grande do dia.

- TradingView, exige Claude Desktop de pé com CDP na 9222
- Bloomberg e Reuters, sem acesso programático gratuito
- Investing.com, anti-bot instável

InfoMoney não serve para conferir. É o pool de notícias que o próprio modelo lê, então
bater o número contra ela prova que o modelo copiou direito, não que o número está certo.

## Antes de liberar para clientes

O envio a clientes é falha fechada, sem o flag do dia nada sai. Criar o flag é ato
deliberado, não rotina.

1. O portão passou, o briefing chegou na caixa interna.
2. Os sete itens acima foram lidos, não presumidos.
3. O flag `logs/aprovacao_clientes_<data>.flag` é criado por último, nunca antes da leitura.
