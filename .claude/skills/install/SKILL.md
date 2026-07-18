---
name: install
description: Instala o Dynamic Island Projects nesta máquina — dependências, build do executável, hooks globais do Claude Code, inicialização com o Windows e primeiro start. Use quando o usuário pedir para instalar, configurar ou "fazer funcionar" este projeto.
---

# Instalação do Dynamic Island Projects

Você vai instalar este app na máquina do usuário, de ponta a ponta. Execute os passos na ordem. Este projeto só funciona no **Windows**.

## 1. Verificar pré-requisitos

Verifique e reporte o que faltar (não prossiga sem os dois primeiros):

- `node --version` (precisa de Node 18+)
- `npm --version`
- `(Get-Command code -ErrorAction SilentlyContinue).Source` — o CLI `code` do VS Code é necessário para abrir projetos. Se faltar, instrua: VS Code → `Ctrl+Shift+P` → "Shell Command: Install 'code' command in PATH".
- `git --version` — opcional (usado para branch/dirty/clonar), mas recomendado.

## 2. Ajustar a pasta raiz de projetos

O app lista projetos de `C:\Projetos` com estrutura `Categoria\projeto` (ex.: `C:\Projetos\Trabalho\meu-app`). **Pergunte ao usuário onde ficam os projetos dele.** Se não for `C:\Projetos`, edite a constante `ROOT` no topo de `main.js` antes de buildar.

## 3. Instalar e buildar

Na pasta deste projeto:

```
npm install
npm run icon
npx electron-builder --win dir
```

O executável final fica em `dist\win-unpacked\Dynamic Island Projects.exe`. Se o electron não baixar o binário no `npm install` (pasta `node_modules\electron\dist` ausente), rode `node node_modules\electron\install.js`.

## 4. Configurar os hooks globais do Claude Code

É isso que faz a ilha mostrar o status das sessões. Edite `~/.claude/settings.json` do usuário:

- **Leia o arquivo antes e faça merge** — nunca substitua hooks/configurações existentes. Se já houver hooks nos mesmos eventos, adicione as entradas ao lado das existentes.
- Use o **caminho absoluto real** desta pasta clonada em `args` (abaixo está como `<PASTA>`; substitua por algo como `C:\Users\fulano\dynamic-island-projects`).

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node", "args": ["<PASTA>\\hooks\\status-hook.js", "working"], "async": true, "timeout": 10 }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "node", "args": ["<PASTA>\\hooks\\status-hook.js", "working"], "async": true, "timeout": 10 }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node", "args": ["<PASTA>\\hooks\\status-hook.js", "waiting"], "async": true, "timeout": 10 }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node", "args": ["<PASTA>\\hooks\\status-hook.js", "done"], "async": true, "timeout": 10 }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node", "args": ["<PASTA>\\hooks\\status-hook.js", "end"], "async": true, "timeout": 10 }] }]
  }
}
```

Valide o JSON depois de editar (um settings.json inválido desativa silenciosamente todas as configurações). Teste o hook:

```
'{"session_id":"teste","cwd":"C:\\x"}' | node <PASTA>\hooks\status-hook.js working
```

Deve criar `%LOCALAPPDATA%\notch-bar\status\teste.json`. Apague o arquivo de teste depois.

## 5. Iniciar com o Windows (perguntar antes)

Pergunte se o usuário quer que o app inicie com o Windows. Se sim:

```powershell
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "DynamicIslandProjects" -Value '"<PASTA>\dist\win-unpacked\Dynamic Island Projects.exe"'
```

## 6. Iniciar e verificar

```powershell
Start-Process "<PASTA>\dist\win-unpacked\Dynamic Island Projects.exe"
```

Confirme que o processo "Dynamic Island Projects" está rodando e diga ao usuário:

- A **gota** aparece no topo central da tela — clique nela ou use `Ctrl+Alt+P`
- `Ctrl+Alt+1..9` abre os favoritos (marque com ⭐ no painel)
- O status das sessões do Claude Code passa a aparecer **nas próximas sessões** iniciadas após configurar os hooks (sessões já abertas aparecem no próximo prompt enviado)
- Engrenagem ⚙ no painel: sons, duração do toast e monitor

## Solução de problemas

- **Gota não aparece**: cheque se há outra instância rodando (`Get-Process "Dynamic Island Projects"`); o app usa single-instance.
- **Status do Claude não aparece**: valide o JSON do settings.json, confirme o caminho absoluto nos hooks e rode o teste do passo 4.
- **Antivírus**: o build do electron-builder e o exe sem assinatura podem ser bloqueados por antivírus — o usuário pode precisar criar uma exceção.
