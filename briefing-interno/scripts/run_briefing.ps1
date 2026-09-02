# run_briefing.ps1: orquestrador do Briefing Matinal
#
# Chamado pelo launcher_briefing.ps1 via Task Scheduler.
# ASCII puro com BOM, roda no pwsh.exe (PowerShell 7).
# $ErrorActionPreference = 'Continue', regra global do Yan.
#
# Fluxo: decide dia util -> coleta noticias -> coleta estado ->
#        gera briefing -> valida -> envia (se aprovado).

$ErrorActionPreference = 'Continue'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$DateTag = Get-Date -Format 'yyyyMMdd'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir "briefing_${DateTag}_py.log"
$SentinelPath = Join-Path $LogDir "sent_${DateTag}.flag"

# Garantir diretorio de log
New-Item -ItemType Directory -Force -Path $LogDir -ErrorAction SilentlyContinue | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Run-Python($script, $extraArgs = @()) {
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) { $py = (Get-Command python3 -ErrorAction SilentlyContinue).Source }
    if (-not $py) {
        Log "ERRO: python nao encontrado no PATH"
        return 99
    }

    # O parametro nao pode se chamar $args: $args e a variavel automatica do
    # PowerShell para argumentos posicionais nao vinculados, e o segundo
    # argumento da chamada nunca chegava aqui. Em 13/08 o validador rodou sem
    # o caminho do HTML e o portao reprovou o envio por isso.
    if (-not $extraArgs) { $extraArgs = @() }

    $cmdArgs = @($script) + $extraArgs
    # Caminhos com espaco ("Morning Call") quebram na juncao de array do
    # Start-Process -ArgumentList: o caminho vira dois argumentos e o python
    # recebe um path truncado. Cada argumento vai entre aspas duplas.
    $argString = ($cmdArgs | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $proc = Start-Process -FilePath $py -ArgumentList $argString `
        -Wait -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $LogDir "stdout_${DateTag}.tmp") `
        -RedirectStandardError (Join-Path $LogDir "stderr_${DateTag}.tmp")

    # Juntar saidas ao log
    $tmpOut = Join-Path $LogDir "stdout_${DateTag}.tmp"
    $tmpErr = Join-Path $LogDir "stderr_${DateTag}.tmp"
    if (Test-Path $tmpOut) {
        Get-Content $tmpOut | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding UTF8 }
    }
    if (Test-Path $tmpErr) {
        Get-Content $tmpErr | ForEach-Object { Add-Content -Path $LogFile -Value "STDERR: $_" -Encoding UTF8 }
    }

    return $proc.ExitCode
}

# ============================================================
# PASSO 0: decidir se e dia util
# ============================================================
$feriadosPath = Join-Path $ProjectRoot 'feriados-b3.json'
if (-not (Test-Path $feriadosPath)) {
    Log "ERRO: feriados-b3.json nao encontrado. Abortando."
    exit 5
}

$feriados = Get-Content $feriadosPath -Raw -Encoding UTF8 | ConvertFrom-Json
$coberturaAte = $feriados.cobertura_ate
if ($coberturaAte -and $coberturaAte -lt $DateTag) {
    Log "ALERTA: cobertura de feriados expirou em $coberturaAte. Tratando como dia util (F08)."
}

$hoje = Get-Date
$diaSemana = $hoje.DayOfWeek.value__  # 0=Sunday
# Dia sem briefing tambem entra no historico de visao, com motivo. Serie que
# so registra os dias em que o pipeline rodou nao distingue "acertei 6 de 10"
# de "rodei em 10 dos 18 dias uteis". Isso e vies de selecao e nao tem como
# limpar depois, por isso o registro do buraco e feito na hora.
function Registrar-SemBriefing($motivo) {
    try {
        $null = Run-Python (Join-Path $ScriptRoot 'gravar_visao.py') @('--sem-briefing', $DateTag, $motivo)
    } catch {
        Log "AVISO: gravar_visao.py --sem-briefing falhou e foi ignorado. $($_.Exception.Message)"
    }
}

if ($diaSemana -eq 0 -or $diaSemana -eq 6) {
    Log "Fim de semana. Nada a fazer."
    Registrar-SemBriefing 'fim de semana'
    exit 0
}

$hojeISO = $hoje.ToString('yyyy-MM-dd')
$feriadoHoje = $feriados.feriados | Where-Object { $_.data -eq $hojeISO }
if ($feriadoHoje) {
    Log "Feriado B3: $($feriadoHoje.nome). Nada a fazer."
    Registrar-SemBriefing "feriado B3: $($feriadoHoje.nome)"
    exit 0
}

Log "RUN: dia util confirmado ($hojeISO). Iniciando pipeline..."

# ============================================================
# PASSO 1: coletar noticias
# ============================================================
Log "PASSO 1: coletar_noticias.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'coletar_noticias.py')
Log "coletar_noticias.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "AVISO: coletar_noticias.py falhou (exit $exitCode). Continuando com o que tiver."
}

# ============================================================
# PASSO 2: coletar estado
# ============================================================
Log "PASSO 2: coletar_estado.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'coletar_estado.py')
Log "coletar_estado.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "AVISO: coletar_estado.py falhou (exit $exitCode). O briefing pode ficar incompleto."
}

# ============================================================
# PASSO 2.2: coletar cotacoes (portao numerico)
# ============================================================
# Roda antes do gerar_briefing.py porque o preco entra no prompt. Sem este
# passo o modelo escreve nivel de mercado de memoria: em 20/08/2026 o briefing
# saiu com Ibovespa em 118.753,48 quando o fechamento de 19/08 foi 167.830.
#
# Falha aqui nao aborta o pipeline. O gerar_briefing.py detecta a ausencia e
# instrui o modelo a nao citar nivel nenhum, e a REGRA 6 do validar_briefing.py
# reprova se ele citar mesmo assim. Abortar aqui trocaria "briefing sem numero"
# por "briefing nenhum", que e pior.
Log "PASSO 2.2: coletar_precos.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'coletar_precos.py')
Log "coletar_precos.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "AVISO: coletar_precos.py falhou (exit $exitCode). O briefing sai sem cotacao e a REGRA 6 reprova qualquer nivel citado."
}

# ============================================================
# PASSO 2.5: claim no estado remoto (best-effort)
# ============================================================
# O Worker remoto (sz-briefing-remote) e o fallback do dia em que o PC esta
# desligado. O claim atomico no Durable Object garante UMA entrega por dia,
# vinda de quem chegar primeiro. Sem worker/chave, o Local segue como sempre.
$claimExit = Run-Python (Join-Path $ScriptRoot 'claim_remote.py') @('--claim', $DateTag)
Log "claim_remote.py exit $claimExit"
$claimFile = Join-Path $LogDir "claim_remote_${DateTag}.json"
$claimStatus = 'inacessivel'
if (Test-Path $claimFile) {
    try {
        $claimStatus = (Get-Content $claimFile -Raw -Encoding UTF8 | ConvertFrom-Json).status
    } catch {
        $claimStatus = 'inacessivel'
    }
}
if ($claimStatus -eq 'ja_enviado') {
    # O Remote ja enviou: espelhar sentinela local e encerrar sem reenviar.
    Log "JA ENVIADO (remoto): briefing $DateTag enviado pela execucao remota. Nada reenviado."
    New-Item -ItemType Directory -Force -Path $LogDir -ErrorAction SilentlyContinue | Out-Null
    Set-Content -Path $SentinelPath -Value (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz') -Encoding UTF8
    Log "ENVIADO OK: briefing matinal enviado com sucesso (remoto)."
    exit 0
}
if ($claimStatus -eq 'ja_reservado') {
    Log "REMOTO EM ANDAMENTO: outra execucao reivindicou o dia. Local nao envia."
    exit 0
}
if ($claimStatus -eq 'bloqueado') {
    Log "AVISO: claim remoto bloqueado (motivo no claim_remote_${DateTag}.json). Seguindo local."
}
if ($claimStatus -eq 'inacessivel') {
    Log "AVISO: estado remoto inacessivel. Seguindo local, sentinela local governa."
}

# ============================================================
# PASSO 3: gerar briefing
# ============================================================
# PASSOS 3 e 4 rodam juntos num laco de tentativas (18/08/2026).
#
# Motivo: o validador exige vocabulario literal (REGRA 2 formato da confianca,
# REGRA 5 vocabulario direcional) e o modelo parafraseia livremente. Uma geracao
# de tiro unico transforma essa variacao de redacao em briefing nao entregue.
# Medido em 18/08 com 4 geracoes seguidas: 3 aprovadas, 1 reprovada na REGRA 5.
# Nos logs de 13, 14 e 17/08 o Yan fazia exatamente este retry a mao, corrigindo
# e reenviando depois do horario. O laco automatiza o que ja era o procedimento.
#
# O portao continua fechado: se as tentativas acabarem sem aprovacao, nada e
# enviado e o exit code do validador e propagado igual a antes.
#
# MODELVAR1 (2026-08-21): a partir da tentativa 2 a cadeia de modelos inverte
# (fallback primeiro). As 3 tentativas de 20/08 foram o mesmo gemma-3-27b com
# o mesmo prompt, reprovadas as 3 pelo portao, e trocar so a amostragem nao
# quebra essa correlacao. A config de qual modelo e fallback vive no .env.
$briefingPath = Join-Path $ProjectRoot "outputs" "briefing_${DateTag}.html"
$maxTentativas = 3
$aprovado = $false
$exitCode = 1

for ($tentativa = 1; $tentativa -le $maxTentativas; $tentativa++) {
    Log "PASSO 3: gerar_briefing.py (tentativa $tentativa de $maxTentativas)"
    if ($tentativa -ge 2) {
        Log "PASSO 3: tentativa $tentativa com a cadeia invertida (fallback primeiro)"
    }
    $exitCode = Run-Python (Join-Path $ScriptRoot 'gerar_briefing.py') @('--tentativa', "$tentativa")
    Log "gerar_briefing.py exit $exitCode"
    if ($exitCode -ne 0) {
        Log "ERRO FATAL: gerar_briefing.py falhou (exit $exitCode). Abortando."
        exit $exitCode
    }

    if (-not (Test-Path $briefingPath)) {
        Log "ERRO FATAL: briefing nao encontrado: $briefingPath"
        exit 6
    }

    Log "PASSO 4: validar_briefing.py (tentativa $tentativa de $maxTentativas)"
    $exitCode = Run-Python (Join-Path $ScriptRoot 'validar_briefing.py') @($briefingPath)
    Log "validar_briefing.py exit $exitCode"

    if ($exitCode -eq 0) {
        $aprovado = $true
        Log "APROVADO na tentativa $tentativa de $maxTentativas."
        break
    }

    if ($tentativa -lt $maxTentativas) {
        Log "REPROVADO na tentativa $tentativa. Regerando."
    }
}

if (-not $aprovado) {
    Log "REPROVADO: briefing nao passou no portao em $maxTentativas tentativas. Envio abortado."
    exit $exitCode
}

# ============================================================
# PASSO 5: enviar briefing
# ============================================================
Log "PASSO 5: enviar_briefing.py"

# enviar_briefing.py devolve exit 0 tanto quando envia agora quanto quando pula
# por causa da sentinela de idempotencia. Escrever "ENVIADO OK" nos dois casos
# produzia log que afirma envio numa execucao que nao enviou nada. O projeto
# irmao (relatorio-diario) ja teve esse mesmo falso "ENVIADO OK" e corrigiu.
# A sentinela e lida ANTES da chamada para separar os dois casos.
$jaEnviadoAntes = Test-Path $SentinelPath

$exitCode = Run-Python (Join-Path $ScriptRoot 'enviar_briefing.py') @($briefingPath)
Log "enviar_briefing.py exit $exitCode"
if ($exitCode -eq 0) {
    if ($jaEnviadoAntes) {
        # Nao usar a string ENVIADO OK aqui: o watchdog procura por ela como
        # prova de envio, e nesta execucao nada foi enviado. A sentinela ja
        # cobre o caso, o watchdog a checa primeiro.
        Log "JA ENVIADO: briefing $DateTag tinha sentinela previa. Nada reenviado nesta execucao."
    } else {
        Log "ENVIADO OK: briefing matinal enviado com sucesso."
        # PASSO 5.5: registrar o envio no estado remoto (best-effort), para o
        # cron remoto das 07:05 ver "sent" e pular, em vez de gerar de novo.
        $completeExit = Run-Python (Join-Path $ScriptRoot 'claim_remote.py') @('--complete', $DateTag)
        Log "claim_remote.py --complete exit $completeExit"
    }
} else {
    Log "ERRO: envio falhou (exit $exitCode)."
}

# ============================================================
# PASSO 5.8: envio automatico a clientes (lista do Fechamento)
# ============================================================
# Reativado em 02/09/2026 a pedido do Yan. Substitui os dois desenhos
# anteriores: a aprovacao manual em chat + tarefa avulsa das 10h
# (Szuchmacher-EnvioClientes, ver run_envio_clientes.ps1, superseded) do
# teste de 13/08, e a decisao de 14/08 de cancelar o envio a clientes.
#
# logs/aprovacao_clientes_<data>.flag deixa de ser criado a mao e passa a
# ser criado aqui, automaticamente, SO quando $tentativa -eq 1: a REGRA 6
# aprovou de primeira nesta execucao, sem reprovacao nem correcao. Aprovar
# na tentativa 2 ou 3 nao cria o flag, e sem flag o enviar_briefing.py
# --clientes recusa o envio (fail-closed, logica inalterada desde 13/08).
# A REGRA 6 tem ponto cego documentado (cambio, juro, commodity, vol e acao
# sem unidade nao sao conferidos, ver status/ESTADO.md de 26/08); exigir
# tentativa 1 limpa e a salvaguarda que fica no lugar da revisao humana que
# existia antes.
#
# So roda quando o proprio pipeline local gerou e validou o briefing desta
# execucao ($aprovado -eq $true): no dia em que o Worker remoto reivindica a
# corrida (JA ENVIADO remoto, acima) este passo nunca e alcancado e nenhum
# e-mail de cliente sai, porque o remote nao tem a REGRA 6 portada (item 2 da
# secao "Pendencias abertas" do CLAUDE.md raiz). Continua assim ate essa
# pendencia fechar.
#
# Trava de horario, licao da excecao de 24/08/2026 (ver briefing-interno/
# CLAUDE.md): a Szuchmacher-BriefingMatinal tem WakeToRun/StartWhenAvailable
# ligados, entao se o PC estiver desligado as 07h00 o pipeline inteiro roda
# atrasado quando o PC ligar de novo, gerando um briefing "matinal" a tarde.
# Isso ja era tolerado para o envio padrao (o Yan aceitou esse atraso para
# si), mas o desenho de 24/08 registrou explicitamente que "briefing matinal
# entregue a cliente as 15h00 e pior que nao entregue" e por isso omitiu
# StartWhenAvailable da tarefa de clientes daquele dia. Aqui nao ha tarefa
# separada para omitir a flag, entao o horario e checado na hora do envio:
# passado das 09h, o flag de aprovacao ainda e criado (o portao tecnico foi
# cumprido) mas o envio a clientes fica pulado, so o Yan recebe o atrasado.
if ($aprovado -and $tentativa -eq 1) {
    $flagClientes = Join-Path $LogDir "aprovacao_clientes_${DateTag}.flag"
    $motivoFlag = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') auto: tentativa 1 de $maxTentativas, REGRA 6 sem reprovacao"
    Set-Content -Path $flagClientes -Value $motivoFlag -Encoding UTF8
    Log "PASSO 5.8: aprovacao automatica a clientes concedida (tentativa 1 limpa)."

    if ((Get-Date).Hour -lt 9) {
        $exitClientes = Run-Python (Join-Path $ScriptRoot 'enviar_briefing.py') @($briefingPath, '--clientes')
        Log "enviar_briefing.py --clientes exit $exitClientes"
        if ($exitClientes -eq 0) {
            Log "CLIENTES OK: envio automatico a lista do Fechamento concluido (ou ja feito hoje)."
        } else {
            Log "ERRO: envio automatico a clientes falhou (exit $exitClientes)."
        }
    } else {
        Log "PASSO 5.8: aprovado, mas passou das 09h (execucao atrasada, provavel WakeToRun). Envio a clientes pulado por horario, so o Yan recebe."
    }
} else {
    Log "PASSO 5.8: sem aprovacao automatica a clientes (tentativa $tentativa de $maxTentativas, aprovado=$aprovado). Nada enviado a lista hoje."
}

# ============================================================
# PASSO 6: registrar a visao do dia (track record)
# ============================================================
# Roda DEPOIS do envio e nao pode derrubar nada. Chamada direcional nao tem
# backfill honesto, entao vale a pena registrar todo dia, mas nao vale o risco
# de um passo de contabilidade matar o e-mail das 07h.
#
# Tres protecoes: roda por ultimo, o try/catch engole qualquer excecao, e o
# $exitCode do envio e salvo antes e restaurado depois. O exit do script
# continua sendo o do envio, que e o que o Task Scheduler e o watchdog leem.
$exitEnvio = $exitCode
try {
    $visaoExit = Run-Python (Join-Path $ScriptRoot 'gravar_visao.py') @($briefingPath)
    Log "gravar_visao.py exit $visaoExit"
} catch {
    Log "AVISO: gravar_visao.py lancou excecao e foi ignorado. $($_.Exception.Message)"
}
$exitCode = $exitEnvio

exit $exitCode
