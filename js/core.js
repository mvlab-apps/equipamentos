// Núcleo: cliente Supabase, estado global, utilitários e componentes compartilhados
import { html, render, useState, useEffect, useMemo, useRef, useCallback } from '../vendor/preact-htm.js';
export { html, render, useState, useEffect, useMemo, useRef, useCallback };

const CFG = window.MVLAB_CONFIG || {};
export const EMPRESA = CFG.empresa || 'MV LAB';
export const configurado = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/SEU-PROJETO|COLE-AQUI/.test(CFG.supabaseUrl + CFG.supabaseAnonKey));
// aceita a URL colada com sobras comuns (/rest/v1, barra final, espaços)
const URL_SB = (CFG.supabaseUrl || '').trim().replace(/\/(rest|auth)\/v1.*$/i, '').replace(/\/+$/, '');
export const sb = configurado ? window.supabase.createClient(URL_SB, (CFG.supabaseAnonKey || '').trim()) : null;

// ------------------------------------------------------------------ estado
const state = {
  session: null, perfil: null, pronto: false, carregando: false,
  equipamentos: [], kits: [], perfis: [], retiradas: [], reservas: [], manutencoes: [], config: {},
  atualizadoEm: null,
};
const subs = new Set();
export const store = {
  get: () => state,
  set(patch) { Object.assign(state, patch); subs.forEach((f) => f()); },
};
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return state;
}
export const isAdmin = () => state.perfil?.papel === 'admin' && state.perfil?.ativo;
export const eqPorId = (id) => state.equipamentos.find((e) => e.id === id);
export const kitPorId = (id) => state.kits.find((k) => k.id === id);
export const perfilPorId = (id) => state.perfis.find((p) => p.id === id);
export const nomePerfil = (p) => (p ? p.nome || p.email : '');

async function buscarTodos(fabrica) {
  const out = []; const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await fabrica().range(de, de + passo - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < passo) break;
  }
  return out;
}

export async function carregarTudo() {
  if (!sb || !state.perfil?.ativo) return;
  store.set({ carregando: true });
  try {
    const [equipamentos, kits, perfis, retiradas, reservas, manutencoes, cfg] = await Promise.all([
      buscarTodos(() => sb.from('v_equipamentos').select('*').order('codigo')),
      buscarTodos(() => sb.from('kits').select('*').order('nome')),
      buscarTodos(() => sb.from('perfis').select('*').order('nome')),
      buscarTodos(() => sb.from('retiradas').select('*, retirada_itens(*)').is('encerrada_em', null).order('saida_em', { ascending: false })),
      buscarTodos(() => sb.from('reservas').select('*, reserva_itens(*)').eq('status', 'ativa').gte('fim', hojeISO()).order('inicio')),
      buscarTodos(() => sb.from('manutencoes').select('*').order('criado_em', { ascending: false }).limit(500)),
      buscarTodos(() => sb.from('config').select('*')),
    ]);
    const config = {}; cfg.forEach((c) => (config[c.chave] = c.valor));
    store.set({ equipamentos, kits, perfis, retiradas, reservas, manutencoes, config, atualizadoEm: new Date(), pronto: true });
  } catch (e) {
    toast(msgErro(e), 'erro');
  } finally {
    store.set({ carregando: false });
  }
}

let timerRecarga;
export function recarregarEmBreve(ms = 400) { clearTimeout(timerRecarga); timerRecarga = setTimeout(carregarTudo, ms); }

let canal;
export function assinarTempoReal() {
  if (!sb || canal) return;
  try {
    canal = sb.channel('mudancas');
    ['equipamentos', 'retiradas', 'reservas', 'manutencoes'].forEach((t) =>
      canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => recarregarEmBreve(600)));
    canal.subscribe();
  } catch (_) { /* tempo real é opcional */ }
}

// ------------------------------------------------------------------ rotas
export function useRota() {
  const ler = () => {
    const h = location.hash.replace(/^#/, '') || '/painel';
    const [p, q = ''] = h.split('?');
    return { path: p, partes: p.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(q)) };
  };
  const [rota, setRota] = useState(ler);
  useEffect(() => { const f = () => { setRota(ler()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return rota;
}
export const ir = (h) => { location.hash = h; };

// ------------------------------------------------------------------ formatação
export const STATUS = {
  disponivel: 'Disponível', em_uso: 'Em uso', manutencao: 'Manutenção', extraviado: 'Extraviado', baixado: 'Baixado',
};
export const CONDICAO = { novo: 'Novo', bom: 'Bom', regular: 'Regular', danificado: 'Danificado' };
export const TIPO_ANEXO = { nota_fiscal: 'Nota fiscal', foto: 'Foto', manual: 'Manual', garantia: 'Garantia', seguro: 'Seguro', outro: 'Outro' };
export const CATEGORIAS_SUGERIDAS = ['Câmera', 'Lentes', 'Iluminação', 'Grip', 'Tripés e suportes', 'Rigagem', 'Áudio', 'Monitoramento', 'Filtros', 'Baterias', 'Energia e fontes', 'Cartões de memória', 'Cabos', 'Drone', 'Estabilizadores', 'Teleprompter', 'Bags e cases', 'Acessórios', 'Informática', 'Outros'];

export function hojeISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function fmtData(v, comHora = false) {
  if (!v) return '—';
  const d = typeof v === 'string' && v.length === 10 ? new Date(v + 'T12:00:00') : new Date(v);
  if (isNaN(d)) return '—';
  return comHora
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtRelativo(v) {
  if (!v) return '';
  const d = typeof v === 'string' && v.length === 10 ? new Date(v + 'T12:00:00') : new Date(v);
  const h = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
  if (diff === 0) return 'hoje'; if (diff === 1) return 'amanhã'; if (diff === -1) return 'ontem';
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`;
}
export const fmtMoeda = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const paraLocalInput = (v) => { if (!v) return ''; const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const deLocalInput = (s) => (s ? new Date(s).toISOString() : null);
export const normalizar = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function numeroBR(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (!t || t === '-') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t); return isNaN(n) ? null : n;
}
export function dataBR(s) {
  if (!s) return null; const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
export function msgErro(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (/User already registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/duplicate key.*codigo/i.test(m)) return 'Já existe um equipamento com esse código.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}

// status "efetivo" para exibição (inclui reserva vigente hoje e atraso)
export function statusExibicao(e) {
  if (e.status === 'em_uso' && e.atrasado) return { cls: 'atrasado', rot: 'Atrasado' };
  if (e.status === 'disponivel' && e.reserva_inicio && e.reserva_inicio <= hojeISO() && e.reserva_fim >= hojeISO())
    return { cls: 'reservado', rot: 'Reservado hoje' };
  return { cls: e.status, rot: STATUS[e.status] || e.status };
}

// ------------------------------------------------------------------ ícones (traço)
const P = {
  painel: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  caixa: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  kit: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16',
  saida: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  volta: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  agenda: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  chave: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z',
  equipe: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  etiqueta: 'M3 3h7l11 11-7 7L3 10zM7.5 7.5h.01',
  mais: 'M12 5v14M5 12h14',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  x: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  clipe: 'M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7',
  camera: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2',
  baixar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  subir: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  alerta: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12l5 5L20 7',
  sair: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  impressora: 'M7 9V3h10v6M7 18H4v-8h16v8h-3M7 14h10v7H7z',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  usuario: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  engrenagem: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};
export function Icone({ n, s = 18 }) {
  return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[n] || ''} /></svg>`;
}
export function Logo({ s = 18 }) {
  return html`<svg width=${s} height=${s} viewBox="0 0 32 32" aria-hidden="true"><path d="M7 8l9 8-9 8zM16 8l9 8-9 8z" fill="#e7b553"/></svg>`;
}

// ------------------------------------------------------------------ toast / modal / confirmação
let pushToast = null;
export function toast(msg, tipo = 'info') { pushToast ? pushToast(msg, tipo) : console.log(msg); }
export function Toasts() {
  const [itens, setItens] = useState([]);
  useEffect(() => {
    pushToast = (msg, tipo) => {
      const id = Math.random();
      setItens((l) => [...l, { id, msg, tipo }]);
      setTimeout(() => setItens((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 7000 : 3800);
    };
    return () => (pushToast = null);
  }, []);
  return html`<div class="toasts" role="status">${itens.map((t) => html`<div key=${t.id} class=${'toast ' + t.tipo}>${t.msg}</div>`)}</div>`;
}

export function Modal({ titulo, onClose, children, rodape, largo }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose && onClose();
    addEventListener('keydown', f); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', f); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="modal-bg" onMouseDown=${(e) => e.target === e.currentTarget && onClose && onClose()}>
    <div class=${'modal' + (largo ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${titulo}>
      <div class="modal-head"><h2>${titulo}</h2>${onClose && html`<button class="btn ghost icon" onClick=${onClose} aria-label="Fechar"><${Icone} n="x" /></button>`}</div>
      <div class="modal-body">${children}</div>
      ${rodape && html`<div class="modal-foot">${rodape}</div>`}
    </div></div>`;
}

let abrirConfirm = null;
export function confirmar(mensagem, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((res) => (abrirConfirm ? abrirConfirm({ mensagem, titulo, ok, perigo, res }) : res(window.confirm(mensagem))));
}
export function ConfirmHost() {
  const [c, setC] = useState(null);
  useEffect(() => { abrirConfirm = setC; return () => (abrirConfirm = null); }, []);
  if (!c) return null;
  const fim = (v) => { c.res(v); setC(null); };
  return html`<${Modal} titulo=${c.titulo} onClose=${() => fim(false)} rodape=${html`
      <button class="btn" onClick=${() => fim(false)}>Cancelar</button>
      <button class=${'btn ' + (c.perigo ? 'danger' : 'primary')} onClick=${() => fim(true)} autofocus>${c.ok}</button>`}>
    <p style="margin:0;white-space:pre-line">${c.mensagem}</p><//>`;
}

// ------------------------------------------------------------------ peças de UI
export function Badge({ e }) {
  const s = statusExibicao(e);
  return html`<span class=${'badge b-' + s.cls}>${s.rot}</span>`;
}
export function StatusBadge({ status, children }) {
  return html`<span class=${'badge b-' + status}>${children || STATUS[status] || status}</span>`;
}
export function Campo({ rotulo, obrig, children, cls = '' }) {
  return html`<label class=${'field ' + cls}><span>${rotulo}${obrig && html` <b>*</b>`}</span>${children}</label>`;
}
export function Vazio({ titulo, children }) {
  return html`<div class="empty"><b>${titulo}</b>${children}</div>`;
}
export function Busca({ valor, onInput, placeholder = 'Buscar…', autoFocus, onEnter }) {
  return html`<div class="search"><${Icone} n="busca" s=${16} />
    <input class="input" type="search" value=${valor} placeholder=${placeholder} autofocus=${autoFocus}
      onInput=${(e) => onInput(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && onEnter && (e.preventDefault(), onEnter(e.target.value))} /></div>`;
}
export function Responsavel({ id, nome }) {
  const p = id ? perfilPorId(id) : null;
  return html`<span>${(p && nomePerfil(p)) || nome || '—'}</span>`;
}

// URL assinada de arquivo privado (cache de 50 min)
const cacheUrl = new Map();
export async function urlArquivo(path) {
  if (!path) return null;
  const c = cacheUrl.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await sb.storage.from('anexos').createSignedUrl(path, 3600);
  if (error) return null;
  cacheUrl.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60000 });
  return data.signedUrl;
}
export function Foto({ path, cls = 'photo', vazio = 'Sem foto' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let vivo = true; setUrl(null); if (path) urlArquivo(path).then((u) => vivo && setUrl(u)); return () => (vivo = false); }, [path]);
  return html`<div class=${cls}>${url ? html`<img src=${url} alt="" loading="lazy" />` : html`<span class="small">${vazio}</span>`}</div>`;
}
export async function enviarArquivo(file, pasta) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('anexos').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

// QR → URL que abre o item direto no app
export const urlItem = (codigo) => `${location.origin}${location.pathname}#/e/${encodeURIComponent(codigo)}`;
export const urlKit = (codigo) => `${location.origin}${location.pathname}#/k/${encodeURIComponent(codigo)}`;
export function qrSvg(texto, cell = 3) {
  const qr = window.qrcode(0, 'M'); qr.addData(texto); qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}

// impressão: renderiza conteúdo em #print-root e chama print
export function imprimir(vnode) {
  const root = document.getElementById('print-root');
  render(vnode, root);
  setTimeout(() => { window.print(); setTimeout(() => render(null, root), 500); }, 150);
}

// CSV
export function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const prim = texto.split(/\r?\n/)[0] || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let campo = ''; let linha = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo); if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
  return linhas;
}
export function gerarCSV(cabecalho, linhas) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
}
export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

// desembrulha resposta do Supabase (lança erro)
export async function q(promessa) { const { data, error } = await promessa; if (error) throw error; return data; }

// executa uma ação com feedback
export async function acao(fn, sucesso) {
  try { const r = await fn(); if (sucesso) toast(sucesso, 'ok'); recarregarEmBreve(150); return r ?? true; }
  catch (e) { toast(msgErro(e), 'erro'); return false; }
}
