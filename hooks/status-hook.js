// Chamado pelos hooks do Claude Code. Recebe o JSON do evento via stdin
// e grava/atualiza %LOCALAPPDATA%\notch-bar\status\<session_id>.json
// Uso: node status-hook.js <working|waiting|done|end>
const fs = require('fs');
const path = require('path');
const os = require('os');

const state = process.argv[2] || 'working';
const DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'notch-bar', 'status');

// Extrai a última mensagem de texto do assistant do transcript (lê só o final do arquivo)
function lastAssistantText(transcriptPath) {
  try {
    const size = fs.statSync(transcriptPath).size;
    const len = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(transcriptPath, 'r');
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].trim()) continue;
      try {
        const j = JSON.parse(lines[i]);
        const msg = j.message;
        if (j.type === 'assistant' && msg && Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === 'text' && c.text && c.text.trim()) {
              return c.text.trim().replace(/\s+/g, ' ').slice(0, 220);
            }
          }
        }
      } catch {}
    }
  } catch {}
  return '';
}

// Descreve o que a sessão está fazendo agora, a partir da ferramenta usada
function activityFor(data) {
  const tn = data.tool_name || '';
  const ti = data.tool_input || {};
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  if (/^(Edit|Write|NotebookEdit)$/.test(tn)) return 'editando ' + base(ti.file_path);
  if (tn === 'Read') return 'lendo ' + base(ti.file_path);
  if (/^(Bash|PowerShell)$/.test(tn)) {
    return 'rodando: ' + String(ti.description || ti.command || '').replace(/\s+/g, ' ').slice(0, 70);
  }
  if (/^(Grep|Glob)$/.test(tn)) return 'buscando no código';
  if (/^Web(Fetch|Search)$/.test(tn)) return 'pesquisando na web';
  if (tn === 'Task' || tn === 'Agent') return 'rodando subagente';
  if (tn === 'TodoWrite' || tn === 'TaskCreate' || tn === 'TaskUpdate') return 'organizando tarefas';
  if (tn.startsWith('mcp__')) return 'usando ' + (tn.split('__')[1] || 'MCP');
  return tn ? 'usando ' + tn : '';
}

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const clean = input.replace(/^﻿/, '').trim();
    const data = JSON.parse(clean || '{}');
    const id = String(data.session_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    const file = path.join(DIR, id + '.json');
    if (state === 'end') {
      try { fs.unlinkSync(file); } catch {}
      return;
    }

    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}

    // "waiting" só faz sentido no meio do trabalho (ex.: pedido de permissão).
    // Depois do Stop, o Claude Code dispara uma Notification de "aguardando input"
    // que não deve sobrescrever o estado "done".
    if (state === 'waiting' && prev && prev.state === 'done') return;

    // startTs marca desde quando a sessão está no ciclo de trabalho atual
    let startTs = Date.now();
    if (prev && (prev.state === 'working' || prev.state === 'waiting') && prev.startTs) {
      startTs = prev.startTs;
    }

    let summary = (prev && prev.summary) || '';
    let detail = '';
    if (state === 'working') {
      if (prev && prev.state === 'done') summary = '';
      detail =
        data.hook_event_name === 'UserPromptSubmit'
          ? 'pensando…'
          : activityFor(data) || (prev && prev.detail) || '';
    } else if (state === 'waiting') {
      detail = String(data.message || '').replace(/\s+/g, ' ').slice(0, 160) || 'aguardando sua resposta';
    } else if (state === 'done') {
      summary = (data.transcript_path && lastAssistantText(data.transcript_path)) || summary;
    }

    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        sessionId: id,
        cwd: data.cwd || process.cwd(),
        state,
        ts: Date.now(),
        startTs,
        summary,
        detail,
      })
    );
  } catch {}
});
