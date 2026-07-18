# Dynamic Island Projects

App Electron para Windows: uma "Dynamic Island" (gota estilo notch da Apple) colada no topo da tela que lista os projetos de `C:\Projetos` (estrutura `Categoria\projeto`), abre-os no VS Code e mostra em tempo real o status das sessões do Claude Code do usuário.

## Arquitetura

```
main.js                     # processo principal: janela, tray, IPC, watchers, notificações
preload.js                  # contextBridge — todo canal IPC passa por aqui (window.api.*)
index.html                  # UI completa (CSS + JS inline, sem frameworks)
hooks/status-hook.js        # chamado pelos hooks globais do Claude Code (fora do Electron!)
scripts/make-icon.js        # gera os 4 PNGs da bandeja (sem libs de imagem)
scripts/make-ico.js         # gera assets/icon.ico 256px para o electron-builder
scripts/fullscreen-watch.ps1# watcher de tela cheia (spawnado pelo main, imprime 0/1)
```

### Fluxo do status do Claude Code
1. Hooks globais em `~/.claude/settings.json` (UserPromptSubmit/PostToolUse→`working`, Notification→`waiting`, Stop→`done`, SessionEnd→`end`) chamam `hooks/status-hook.js`.
2. O hook grava `%LOCALAPPDATA%\notch-bar\status\<session_id>.json` com `{sessionId, cwd, state, ts, startTs, summary, detail}`.
   - `detail` = atividade ao vivo ("editando X", "rodando: Y") ou a mensagem da Notification no waiting.
   - `summary` = última mensagem de texto do assistant, extraída do fim do transcript no Stop.
   - Regra importante: `waiting` NUNCA sobrescreve `done` (o Claude Code dispara uma Notification de "aguardando input" logo após o Stop).
3. `main.js` observa a pasta (fs.watch + poll 3s), difunde via IPC, detecta transições (notificação nativa + toast + som + contador diário em `stats.json`).
4. Clicar num item "done" faz "ack": apaga o arquivo de status e abre/foca o VS Code (`code <pasta>` reutiliza a janela existente).

### Outras integrações
- **Abertos no VS Code**: `tasklist /v` filtrando `Code.exe`; o nome da pasta é o penúltimo segmento do título da janela.
- **Git**: branch lida direto de `.git/HEAD` (rápido); dirty via `git status --porcelain` com cache de 60s e 4 workers.
- **PRs**: `gh search prs --author "@me" --state open` a cada 5min; falha silenciosa se `gh` não existir.
- **Config do usuário**: `%LOCALAPPDATA%\notch-bar\config.json` (favoritos, recentes, settings: sons/toastMs/displayId).

## Comandos

```bash
npm start                        # dev
npm run icon                     # regenera PNGs + ICO
npx electron-builder --win dir   # build → dist\win-unpacked\Dynamic Island Projects.exe
```

**Após qualquer mudança de código, o exe empacotado precisa de rebuild** — o usuário roda o app de `dist\win-unpacked\` (registro `HKCU\...\Run\DynamicIslandProjects`). Fluxo: matar o processo "Dynamic Island Projects", rebuildar, reiniciar o exe.

## Pegadinhas conhecidas

- **BOM**: arquivos de status com BOM são ignorados pelo `JSON.parse` do app. O PowerShell 5.1 (`Set-Content -Encoding utf8`) grava BOM — em testes manuais, usar `[System.IO.File]::WriteAllText` com `UTF8Encoding($false)`.
- **Não usar `spawn` com `shell:true` + array de args** — gera DeprecationWarning (DEP0190) no Node 24+. Usar `exec` com a linha completa.
- A UI é re-renderizada por completo em cada evento (`render()`); não há estado de DOM a preservar, exceto `search.value` e `selIdx`.
- A janela transparente é redimensionada pelo main (`COLLAPSED`/`TOAST`/`EXPANDED` + `centerBounds`); o CSS anima o conteúdo, nunca a janela.
- Os fillets (curvas côncavas da gota) são pseudo-elementos com `radial-gradient` cuja cor precisa bater com o background do elemento — se mudar a cor de fundo, mudar também nos fillets.
- Textos da UI em pt-BR.
