---
name: update
description: Atualiza o Dynamic Island Projects para a última versão — git pull, dependências, rebuild do executável e restart do app. Use quando o usuário pedir para atualizar a ilha/barra.
---

# Atualização do Dynamic Island Projects

Atualize a instalação local para a última versão do repositório. Execute na pasta deste projeto:

## 1. Puxar as mudanças

```
git pull
```

- Se não houver mudanças ("Already up to date"), informe o usuário e pare — nada a fazer.
- Se houver conflitos com mudanças locais, mostre-os ao usuário e pergunte como proceder; não descarte mudanças locais sem confirmação.
- Resuma pro usuário o que veio no update (`git log --oneline HEAD@{1}..HEAD`).

## 2. Dependências e ícones (apenas se necessário)

- Se `package.json`/`package-lock.json` mudaram no pull: `npm install`
- Se `scripts/make-icon.js` ou `scripts/make-ico.js` mudaram: `npm run icon`

## 3. Rebuild

```
npx electron-builder --win dir
```

## 4. Reiniciar o app

```powershell
Get-Process "Dynamic Island Projects" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "<PASTA>\dist\win-unpacked\Dynamic Island Projects.exe"
```

(`<PASTA>` = caminho absoluto desta pasta.)

Confirme que o processo voltou a rodar e conte ao usuário, em uma frase, o que mudou na versão nova.

## Observações

- Os hooks do Claude Code apontam para `hooks\status-hook.js` desta pasta — o pull já atualiza o hook automaticamente, sem mexer no settings.json (a menos que o update peça um evento de hook novo; nesse caso o changelog/README vai indicar).
- Se o build falhar por antivírus, oriente a criar exceção para a pasta.
