# Plano — Versao Cliente do Briefing Matinal

Data: 2026-08-13. **Status: APROVADO pelo Yan em 2026-08-13, implementado so em parte.** Este plano descreve como transformar o briefing de material interno em material apto a ir a clientes. A implementacao (fase 2 do cronograma) comeca a partir desta aprovacao.

**Nota de 02/09/2026: o que foi construido diverge deste plano em dois pontos de risco, ambos na secao 4.** O envio a clientes que existe de verdade (`enviar_briefing.py --clientes`, ver `briefing-interno/CLAUDE.md`) manda o MESMO conteudo do briefing interno, com chamada direcional e confianca numerica, para a lista de clientes. Nunca foi construido o "modo cliente" da secao 2/3 abaixo (prompt e validador proprios, sem direcional, causa sempre com fonte). E desde 02/09 o envio roda sem revisao humana, automatico quando a REGRA 6 aprova de primeira, o que contradiz literalmente a linha 50 abaixo ("a aprovacao manual e obrigatoria e nao tem excecao"). Os riscos regulatorio e reputacional que este plano identificou em 13/08 (secao 4) seguem valendo tal como escritos, so que sem a mitigacao que o plano propos para eles. Ver item 1 e item 3 da secao "Pendencias abertas" do `CLAUDE.md` raiz.

## 1. Estado atual do pipeline (13/08)

O pipeline roda em `briefing-interno/`: `gerar_briefing.py` (prompt do modelo), `validar_briefing.py` (portao de 5 regras), `enviar_briefing.py` (visual e envio via API do Resend). O e-mail hoje leva marca, paleta do Fechamento, cinco secoes (resumo, sobe, desce, leitura por projeto, agenda) e vai para um unico destinatario.

| Aspecto | Hoje | Cliente? |
|---|---|---|
| Marca e paleta (logo, nome, navy/dourado) | Sim | Compatível |
| Resumo do dia e agenda | Sim | Compatível |
| Chamadas direcionais com confianca declarada | Sim, no conteudo (escondidas no e-mail) | NAO como estao. Risco de leitura como recomendacao |
| Leitura por projeto (ATLAS, VixRadar, Jornada Interior...) | Sim | NAO. Expoe o portfolio interno do Yan a terceiros |
| Etiqueta MATERIAL INTERNO no hero | Sim | NAO, precisa de outra etiqueta ou nenhuma |
| Fontes no pool, portao de validacao | Sim, no conteudo | Compatível. Para cliente, mostrar a fonte pode dar credibilidade, decisao do Yan |
| Destinatario unico no `.env` | Sim | NAO. Cliente exige lista com BCC real |
| Trilha de aprovacao antes do envio | Nao, envia direto ao Yan | NAO. Para cliente, nada sai sem aprovacao manual do Yan |

## 2. Formato pesquisado e escolhido

Pesquisa feita em 13/08/2026, por pedido do Yan. Fontes consultadas: notas diarias do Deutsche Bank (Early Morning Reid) reproduzidas pela FXStreet ([euro, reprecificacao hawkish do BCE](https://www.fxstreet.com/news/euro-ecb-hawkish-repricing-with-bond-selloff-deutsche-bank-202607090910), [ouro](https://www.fxstreet.com/news/gold-strong-week-ahead-deutsche-bank-202601260953)), boletim Five Things da Bloomberg ([arquivo](https://www.bloomberg.com/news/newsletters/2024-10-07/five-things-you-need-to-know-to-start-your-day-americas)) e Briefings do Goldman Sachs ([pagina do produto](https://www.goldmansachs.com/briefings/)).

O padrao comum dos grandes bancos e gestoras:

- Poucos blocos, um tema por bloco, cada um com titulo em negrito e 2-3 frases
- Frases densas em numero exato com comparacao historica ("melhor semana desde 2008", "maior nivel desde 2009")
- Visao direcional embutida na prosa, nunca em formato de lista de recomendacao
- Nenhuma secao sobre ferramenta, sistema ou projeto interno
- Fim enxuto, sem conclusao longa, com disclaimer institucional

Formato escolhido para o briefing (ja aplicado no prompt em 13/08): Resumo em 2-3 frases, secao "O que importa hoje" com 3 a 5 pontos numerados nesse padrao, Agenda no fim. A secao Leitura por Projeto sai, o padrão dos bancos nao tem equivalente.

Duas trilhas convivem no mesmo pipeline, com modo explicito. A rotina das 07h para o Yan nao muda enquanto a versao cliente nao estiver aprovada.

**Envio.** Lista de clientes em variavel propria do `.env` (ex.: `CLIENTES`), envio via campo `bcc` da API do Resend (o remetente atual ja usa a API, o campo existe nativamente). Antes de qualquer disparo, um flag de aprovacao no disco, no padrao do `REVISAO_MANUAL` do Fechamento: sem o flag, o envio a cliente nao roda.

**Validacao.** A versao cliente tem porta proprio: proibe recomendacao e direcional, exige fonte no pool para toda causa afirmada, exige agenda preenchida. As regras atuais do briefing interno (REGRA 2 e 5, que cobram direcional e confianca) nao se aplicam ao modo cliente, elas sao caracteristicas do material interno.

## 3. Mudancas por arquivo (quando aprovado)

- `gerar_briefing.py`: prompt de cliente separado do interno, selecionado por flag (`--modo cliente`), sem Leitura por Projeto, sem direcional, causa com fonte
- `validar_briefing.py`: modo cliente com regras proprias (sem recomendacao, fonte obrigatoria por causa, agenda nao vazia). O modo interno fica intacto
- `enviar_briefing.py`: flag de aprovacao antes do envio a lista, `bcc` via API, etiqueta do hero e disclaimer adequados ao modo
- `CLAUDE.md` do briefing-interno: registrar o modo cliente e a regra de que lista e aprovacao sao obrigatorias

## 4. Riscos

- Regulatorio: material com direcional enviado a cliente pode ser lido como recomendacao de investimento. A versao cliente proposta elimina o direcional, mesmo custo de sempre
- Reputacao: nada sai com a assinatura da casa sem o Yan ter lido. A aprovacao manual e obrigatoria e nao tem excecao
- Privacidade: enderecos de clientes sao dados pessoais. Ficam no `.env`, nunca em log, e o envio e BCC real, igual ao Fechamento
- Conteudo: o modelo ja inventou URL uma vez. O portao de cliente precisa ser duro em causa sem fonte

## 5. Cronograma

1. Yan aprova este plano (decisoes da secao 6)
2. Implementacao do modo cliente no prompt, validador e envio, sem tocar no modo interno
3. Piloto: uma semana de envios para as duas caixas do Yan, ele aprova o texto de cada dia antes do disparo
4. So depois de uma semana limpa, decisao de mandar para a lista real e se o briefing interno continua existindo

## 6. Decisoes (resolvidas por delegacao do Yan em 13/08)

O Yan pediu para pesquisar o formato dos bancos globais e fazer do jeito que eu achasse melhor. Decidido:

1. Leitura por Projeto sai do briefing. O padrao dos bancos nao tem secao equivalente e a secao expunha o portfolio interno
2. Fontes continuam escondidas no e-mail, como o Yan pediu pela manha, mas seguem obrigatorias no conteudo (portao). Para a versao cliente, reabrir a discussao de mostrar a fonte no rodape, o padrao Bloomberg linka cada item
3. O material cliente sai do briefing atual reformado, sem nome novo por enquanto. Nome e posicionamento ficam para a fase de piloto
4. A versao interna continua saindo diariamente; a de cliente so entra depois do piloto de uma semana

## 7. Criterios de aceitacao

- O modo cliente passa no portao proprio sem ganhar recomendacao
- O Yan aprova o texto de cada envio piloto antes do disparo
- Nenhum envio a cliente sem lista configurada e flag de aprovacao
- A rotina interna das 07h segue intacta durante todo o processo
