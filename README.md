# 🏝️ Dynamic Island Projects

Uma **Dynamic Island para Windows** — inspirada na ilha dinâmica da Apple — que vive no topo da tela e funciona como centro de comando dos seus projetos e das suas sessões do **Claude Code**.

Uma "gota" estilo notch fica colada na borda superior do monitor. Clicou (ou `Ctrl+Alt+P`), ela expande num painel com todos os seus projetos organizados por categoria, prontos pra abrir no VS Code com um clique.

## ✨ Funcionalidades

### Integração com Claude Code
- **Status ao vivo de cada sessão**: pontinhos animados enquanto o Claude trabalha, `?` quando ele precisa de você, `✓` quando termina
- **Atividade em tempo real**: "editando main.js…", "rodando testes…" — você vê o que cada sessão está fazendo sem trocar de janela
- **Motivo da espera**: quando o Claude pede permissão ou faz uma pergunta, a mensagem aparece na ilha
- **Resumo da conclusão**: ao terminar, a última resposta do Claude aparece no item (e na notificação)
- **Toast estilo Dynamic Island**: a gota cresce mostrando "✓ projeto terminou" e recolhe sozinha
- **Notificação nativa do Windows + som discreto** ao terminar ou precisar de você
- **Ícone da bandeja como semáforo**: roxo (normal), laranja (trabalhando), âmbar (esperando você), verde (pronto)
- **Contador diário** de tarefas concluídas por projeto

### Produtividade
- **Busca instantânea** com navegação por teclado (`↑↓`, `Enter`)
- **Favoritos** (⭐) com atalhos globais `Ctrl+Alt+1..9`
- **Recentes** baseados no seu uso
- **Seção "Abertos no VS Code"** — clicar foca a janela existente
- **Git**: branch atual e indicador de mudanças não commitadas por projeto
- **PRs abertas** via GitHub CLI (`gh`)
- **Criar projeto pela busca**: digitou um nome que não existe → cria a pasta, roda `git init` e abre
- **Clonar pela busca**: cole uma URL de repositório → escolhe a categoria e clona
- **Menu de contexto**: abrir no Explorer, terminal, copiar caminho, abrir repositório no navegador

### Comportamento de ilha
- **Mini-status**: com uma única sessão ativa, a gota mostra o nome do projeto
- **Auto-hide em tela cheia** (vídeos/jogos) — volta sozinha quando você sai
- **Multi-monitor**: escolha em qual tela a ilha fica
- **Configurações no próprio painel** (⚙): sons, duração do toast, monitor

## 📁 Estrutura esperada dos projetos

```
C:\Projetos\
├── Estudo\
├── Pessoais\
├── Trabalho\
└── ...        ← categorias livres, cada subpasta é um projeto
```

(O caminho raiz é configurável na constante `ROOT` em `main.js`.)

## 🚀 Instalação

### Com Claude Code (recomendado — instala tudo sozinho)

```bash
git clone https://github.com/aeusteixeira/dynamic-island-projects.git
cd dynamic-island-projects
claude
```

E dentro do Claude Code, digite:

```
/install
```

O Claude verifica os pré-requisitos, instala as dependências, builda o executável, configura os hooks de status no seu `~/.claude/settings.json` (com merge seguro), pergunta se você quer iniciar com o Windows e já deixa a ilha rodando.

### Manual

```bash
git clone https://github.com/aeusteixeira/dynamic-island-projects.git
cd dynamic-island-projects
npm install
npm run icon        # gera os ícones (PNG + ICO)
npm start           # roda em modo dev
```

Para gerar o executável:

```bash
npx electron-builder --win dir
# → dist\win-unpacked\Dynamic Island Projects.exe
```

Para iniciar com o Windows: botão direito no ícone da bandeja → "Iniciar com o Windows".

## 🔌 Hooks do Claude Code

O status das sessões vem de hooks globais do Claude Code. Adicione ao seu `~/.claude/settings.json` (ajuste o caminho):

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node", "args": ["C:\\caminho\\dynamic-island-projects\\hooks\\status-hook.js", "working"], "async": true, "timeout": 10 }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "node", "args": ["C:\\caminho\\dynamic-island-projects\\hooks\\status-hook.js", "working"], "async": true, "timeout": 10 }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node", "args": ["C:\\caminho\\dynamic-island-projects\\hooks\\status-hook.js", "waiting"], "async": true, "timeout": 10 }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node", "args": ["C:\\caminho\\dynamic-island-projects\\hooks\\status-hook.js", "done"], "async": true, "timeout": 10 }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node", "args": ["C:\\caminho\\dynamic-island-projects\\hooks\\status-hook.js", "end"], "async": true, "timeout": 10 }] }]
  }
}
```

Os hooks gravam arquivos de status em `%LOCALAPPDATA%\notch-bar\status\`, que o app observa em tempo real.

## ⌨️ Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+Alt+P` | Abre/fecha a ilha (global) |
| `Ctrl+Alt+1..9` | Abre o favorito N (global) |
| `↑` `↓` `Enter` | Navega e abre |
| Botão direito | Menu de ações do projeto |
| `Esc` | Fecha o painel |

## 🛠️ Stack

Electron + HTML/CSS/JS puro. Sem frameworks, sem dependências de runtime — até os ícones PNG/ICO são gerados por script próprio.

---

Feito com [Claude Code](https://claude.com/claude-code) 🤖
