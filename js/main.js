import {
  html, render, useState, useEffect, sb, configurado, store, useStore, carregarTudo, assinarTempoReal, useRota, ir,
  Icone, Logo, Toasts, ConfirmHost, toast, msgErro, isAdmin, EMPRESA, q, acao, Campo, Modal,
} from './core.js';
import { Quadro, MoverPagina } from './quadro.js';
import { ListaEquipamentos, DetalheEquipamento, PorCodigo } from './equipamentos.js';
import { ListaKits, DetalheKit, KitPorCodigo } from './kits.js';
import { Jobs, DetalheJob } from './jobs.js';
import { Movimentos } from './movimentos.js';
import { Manutencao } from './manutencao.js';
import { Pessoas } from './pessoas.js';
import { resumoJob, jobAtivo } from './cobertura.js';

// ------------------------------------------------------------------ autenticação
async function carregarPerfil(session) {
  if (!session) { store.set({ session: null, perfil: null, pronto: true }); return; }
  try {
    let perfil = await q(sb.from('perfis').select('*').eq('id', session.user.id).maybeSingle());
    store.set({ session, perfil, pronto: !perfil?.ativo });
    if (perfil?.ativo) { await carregarTudo(); assinarTempoReal(); }
  } catch (e) { toast(msgErro(e), 'erro'); store.set({ session, perfil: null, pronto: true }); }
}

function Login() {
  const [modo, setModo] = useState('entrar');
  const [f, setF] = useState({ nome: '', email: '', senha: '' });
  const [env, setEnv] = useState(false);
  const [aviso, setAviso] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e) => {
    e.preventDefault(); setEnv(true); setAviso('');
    try {
      if (modo === 'entrar') {
        await q(sb.auth.signInWithPassword({ email: f.email.trim(), password: f.senha }));
      } else if (modo === 'cadastrar') {
        if (!f.nome.trim()) throw new Error('Informe seu nome.');
        const r = await q(sb.auth.signUp({ email: f.email.trim(), password: f.senha, options: { data: { nome: f.nome.trim() } } }));
        if (!r.session) setAviso('Cadastro criado. Se o seu projeto exige confirmação, verifique seu e-mail e depois entre.');
      } else {
        await q(sb.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: location.origin + location.pathname }));
        setAviso('Se o e-mail existir, você receberá um link para criar nova senha.');
      }
    } catch (err) { toast(msgErro(err), 'erro'); }
    setEnv(false);
  };
  return html`<div class="auth"><form class="card stack" onSubmit=${enviar}>
    <div class="row"><div class="brand-mark"><${Logo} /></div><div><div class="brand-name">${EMPRESA}</div><div class="brand-sub">Gestor de equipamentos</div></div></div>
    <h1>${modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar acesso' : 'Recuperar senha'}</h1>
    ${modo === 'cadastrar' && html`<${Campo} rotulo="Nome"><input class="input" value=${f.nome} onInput=${set('nome')} autocomplete="name" required /><//>`}
    <${Campo} rotulo="E-mail"><input class="input" type="email" value=${f.email} onInput=${set('email')} autocomplete="email" required /><//>
    ${modo !== 'recuperar' && html`<${Campo} rotulo="Senha"><input class="input" type="password" value=${f.senha} onInput=${set('senha')} autocomplete=${modo === 'entrar' ? 'current-password' : 'new-password'} minlength="6" required /><//>`}
    ${aviso && html`<div class="alert info">${aviso}</div>`}
    <button class="btn primary block" disabled=${env}>${env ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar acesso' : 'Enviar link'}</button>
    <div class="row between small">
      ${modo === 'entrar'
        ? html`<a href="#" onClick=${(e) => { e.preventDefault(); setModo('cadastrar'); }}>Primeiro acesso? Criar conta</a><a href="#" onClick=${(e) => { e.preventDefault(); setModo('recuperar'); }}>Esqueci a senha</a>`
        : html`<a href="#" onClick=${(e) => { e.preventDefault(); setModo('entrar'); }}>← Voltar para entrar</a>`}
    </div>
  </form></div>`;
}

function NovaSenha({ onFim }) {
  const [s, setS] = useState('');
  const salvar = async (e) => { e.preventDefault(); if (await acao(() => q(sb.auth.updateUser({ password: s })), 'Senha atualizada.')) onFim(); };
  return html`<div class="auth"><form class="card stack" onSubmit=${salvar}><h1>Nova senha</h1>
    <${Campo} rotulo="Nova senha"><input class="input" type="password" minlength="6" required value=${s} onInput=${(e) => setS(e.target.value)} /><//>
    <button class="btn primary block">Salvar</button></form></div>`;
}

function Aguardando({ perfil }) {
  return html`<div class="auth"><div class="card stack">
    <div class="row"><div class="brand-mark"><${Logo} /></div><div class="brand-name">${EMPRESA}</div></div>
    <h1>Aguardando aprovação</h1>
    <p class="muted" style="margin:0">Olá, ${perfil?.nome || perfil?.email || ''}. Seu acesso foi criado e precisa ser aprovado por um administrador. Avise o responsável e recarregue esta página depois.</p>
    <div class="row"><button class="btn" onClick=${() => location.reload()}>Recarregar</button><button class="btn ghost" onClick=${() => sb.auth.signOut()}>Sair</button></div>
  </div></div>`;
}

function SemConfig() {
  return html`<div class="auth"><div class="card stack" style="max-width:520px">
    <div class="row"><div class="brand-mark"><${Logo} /></div><div class="brand-name">${EMPRESA}</div></div>
    <h1>Falta configurar o banco</h1>
    <p class="muted" style="margin:0">Abra o arquivo <span class="mono">config.js</span> e preencha a URL e a chave pública (anon) do seu projeto Supabase. O passo a passo está no <span class="mono">LEIA-ME.md</span>.</p>
  </div></div>`;
}

// ------------------------------------------------------------------ casca
function MeuPerfil({ onClose }) {
  const st = useStore(); const p = st.perfil;
  const [f, setF] = useState({ nome: p.nome || '', telefone: p.telefone || '' });
  const salvar = async () => {
    const ok = await acao(() => q(sb.from('perfis').update({ nome: f.nome.trim(), telefone: f.telefone.trim() || null }).eq('id', p.id)), 'Perfil salvo.');
    if (ok) { store.set({ perfil: { ...p, ...f } }); onClose(); }
  };
  return html`<${Modal} titulo="Meu perfil" onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar</button>`}>
    <div class="stack">
      <${Campo} rotulo="Nome"><input class="input" value=${f.nome} onInput=${(e) => setF({ ...f, nome: e.target.value })} /><//>
      <${Campo} rotulo="Telefone / WhatsApp"><input class="input" value=${f.telefone} onInput=${(e) => setF({ ...f, telefone: e.target.value })} /><//>
      <div class="small muted">${p.email} · ${p.papel === 'admin' ? 'Administrador' : 'Membro'}</div>
    </div><//>`;
}

function Casca({ rota, children }) {
  const st = useStore();
  const [menu, setMenu] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const atrasadas = st.equipamentos.filter((e) => e.atrasado).length;
  const em7 = Date.now() + 7 * 86400000;
  const jobsPend = st.jobs.filter((j) => jobAtivo(j) && new Date(j.fim) >= new Date() && new Date(j.inicio) <= em7).filter((j) => { const r = resumoJob(j); return r.estado === 'falta' || r.conflitos.length; }).length;
  const pendentes = isAdmin() ? st.perfis.filter((p) => !p.ativo).length : 0;
  const manAbertas = st.manutencoes.filter((m) => m.status === 'aberta').length;
  const sec = rota.partes[0] || 'quadro';
  const ativo = (k) => (k === sec || (k === 'equipamentos' && ['equipamento', 'e'].includes(sec)) || (k === 'kits' && ['kit', 'k'].includes(sec)) || (k === 'jobs' && sec === 'job') ? 'on' : '');
  useEffect(() => setMenu(false), [rota.path]);
  const link = (k, n, rot, extra) => html`<a href=${'#/' + k} class=${ativo(k)}><${Icone} n=${n} />${rot}${extra ? html`<span class="count">${extra}</span>` : ''}</a>`;
  return html`<div class="app">
    <aside class=${'sidebar' + (menu ? ' open' : '')}>
      <div class="brand"><div class="brand-mark"><${Logo} /></div><div><div class="brand-name">${EMPRESA}</div><div class="brand-sub">Equipamentos</div></div></div>
      <a href="#/mover" class="btn primary block" style="margin:0 0 12px"><${Icone} n="saida" s=${16} />Mover itens</a>
      <nav class="nav">
        ${link('quadro', 'painel', 'Quadro')}
        ${link('jobs', 'agenda', 'Jobs', jobsPend || '')}
        ${link('equipamentos', 'caixa', 'Equipamentos')}
        ${link('kits', 'kit', 'Kits')}
        ${link('movimentos', 'volta', 'Movimentações', atrasadas || '')}
        ${link('manutencao', 'chave', 'Manutenção', manAbertas || '')}
        <div class="sep"></div>${link('pessoas', 'equipe', isAdmin() ? 'Pessoas e acesso' : 'Pessoas', pendentes || '')}
      </nav>
      <div class="sidebar-foot stack" style="gap:8px">
        <button class="btn ghost" style="justify-content:flex-start;padding:0 6px" onClick=${() => setPerfilAberto(true)}><${Icone} n="usuario" s=${16} /><span class="ellipsis">${st.perfil?.nome || st.perfil?.email}</span></button>
        <button class="btn ghost sm" style="justify-content:flex-start" onClick=${() => sb.auth.signOut()}><${Icone} n="sair" s=${15} />Sair</button>
        <div class="small faint">${st.carregando ? 'Sincronizando…' : st.atualizadoEm ? 'Sincronizado ' + st.atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
      </div>
    </aside>
    ${menu && html`<div class="scrim" onClick=${() => setMenu(false)}></div>`}
    <div style="min-width:0">
      <div class="topbar-m"><button class="btn ghost icon" onClick=${() => setMenu(true)} aria-label="Menu"><${Icone} n="menu" /></button>
        <div class="row nw" style="gap:8px"><${Logo} /><b>${EMPRESA}</b></div><span class="small faint" style="width:36px">${st.carregando ? '⟳' : ''}</span></div>
      <main class=${'main' + (['quadro', 'painel', undefined].includes(rota.partes[0]) ? ' largo' : '')}>${children}</main>
    </div>
    <nav class="bottom-nav">
      <a href="#/quadro" class=${ativo('quadro')}><${Icone} n="painel" />Quadro</a>
      <a href="#/jobs" class=${ativo('jobs')}><${Icone} n="agenda" />Jobs</a>
      <a href="#/mover" class="fab"><${Icone} n="saida" />Mover</a>
      <a href="#/equipamentos" class=${ativo('equipamentos')}><${Icone} n="caixa" />Itens</a>
      <a href="#/movimentos" class=${ativo('movimentos')}><${Icone} n="volta" />Empréstimos</a>
    </nav>
    ${perfilAberto && html`<${MeuPerfil} onClose=${() => setPerfilAberto(false)} />`}
  </div>`;
}

function Rotas({ rota }) {
  const [a, b, c] = rota.partes;
  switch (a) {
    case undefined: case 'quadro': case 'painel': return html`<${Quadro} query=${rota.query} />`;
    case 'mover': return html`<${MoverPagina} query=${rota.query} />`;
    case 'jobs': return html`<${Jobs} query=${rota.query} />`;
    case 'job': return html`<${DetalheJob} id=${b} />`;
    case 'movimentos': return html`<${Movimentos} />`;
    case 'pessoas': case 'equipe': return html`<${Pessoas} query=${rota.query} />`;
    case 'equipamentos': return html`<${ListaEquipamentos} query=${rota.query} />`;
    case 'equipamento': return html`<${DetalheEquipamento} id=${b} />`;
    case 'e': return html`<${PorCodigo} codigo=${decodeURIComponent(b || '')} />`;
    case 'kits': return html`<${ListaKits} />`;
    case 'kit': return html`<${DetalheKit} id=${b} />`;
    case 'k': return html`<${KitPorCodigo} codigo=${decodeURIComponent(b || '')} />`;
    case 'manutencao': return html`<${Manutencao} />`;
    default: return html`<p class="muted">Página não encontrada. <a href="#/quadro">Voltar ao quadro</a></p>`;
  }
}

function App() {
  const st = useStore();
  const rota = useRota();
  const [recuperando, setRecuperando] = useState(false);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => carregarPerfil(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (ev === 'SIGNED_IN' && session?.user?.id !== store.get().session?.user?.id) carregarPerfil(session);
      if (ev === 'SIGNED_OUT') { store.set({ session: null, perfil: null, equipamentos: [], jobs: [] }); }
    });
    const foco = () => store.get().perfil?.ativo && document.visibilityState === 'visible' && carregarTudo();
    document.addEventListener('visibilitychange', foco);
    return () => { sub.subscription.unsubscribe(); document.removeEventListener('visibilitychange', foco); };
  }, []);

  let corpo;
  if (!configurado) corpo = html`<${SemConfig} />`;
  else if (recuperando) corpo = html`<${NovaSenha} onFim=${() => setRecuperando(false)} />`;
  else if (!st.pronto && !st.session) corpo = html`<div class="boot">Carregando…</div>`;
  else if (!st.session) corpo = html`<${Login} />`;
  else if (!st.perfil || !st.perfil.ativo) corpo = st.pronto ? html`<${Aguardando} perfil=${st.perfil} />` : html`<div class="boot">Carregando…</div>`;
  else if (!st.pronto) corpo = html`<div class="boot">Carregando inventário…</div>`;
  else corpo = html`<${Casca} rota=${rota}><${Rotas} rota=${rota} /><//>`;
  return html`${corpo}<${Toasts} /><${ConfirmHost} />`;
}

render(html`<${App} />`, document.getElementById('app'));
