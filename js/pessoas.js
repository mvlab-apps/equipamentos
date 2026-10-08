// Pessoas (quem guarda equipamento), acesso ao sistema, categorias e sincronização com o Google Calendar
import {
  html, useState, useEffect, sb, store, useStore, q, acao, confirmar, toast, fmtData, fmtRelativo, Icone, Campo, Modal, Vazio,
  carregarTudo, nomePerfil, GRUPOS, baixar, isAdmin,
} from './core.js';

export function Pessoas({ query }) {
  const [aba, setAba] = useState(query.aba || 'pessoas');
  useEffect(() => { carregarTudo(); }, []);
  useEffect(() => { if (query.aba) setAba(query.aba); }, [query.aba]);
  const abas = [['pessoas', 'Pessoas'], ['acesso', 'Acesso ao sistema'], ['categorias', 'Categorias'], ['google', 'Google Agenda']].filter(([k]) => isAdmin() || ['pessoas', 'categorias'].includes(k));
  return html`<div>
    <div class="page-head"><div><h1>Pessoas e configurações</h1><p>Quem guarda equipamento, quem acessa o sistema e como os itens são organizados.</p></div></div>
    <div class="tabs">${abas.map(([k, r]) => html`<button class=${'tab' + (aba === k ? ' on' : '')} onClick=${() => setAba(k)}>${r}</button>`)}</div>
    ${aba === 'pessoas' && html`<${ListaPessoas} />`}
    ${aba === 'acesso' && html`<${Acesso} />`}
    ${aba === 'categorias' && html`<${Categorias} />`}
    ${aba === 'google' && html`<${Google} />`}
  </div>`;
}

// ------------------------------------------------------------------ pessoas
function ListaPessoas() {
  const st = useStore();
  const [form, setForm] = useState(null);
  const lista = st.pessoas.slice().sort((a, b) => (b.ativo - a.ativo) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  const qtd = (id) => st.equipamentos.filter((e) => e.portador_id === id).length;
  return html`<div class="stack">
    <div class="row between"><p class="muted" style="margin:0;max-width:700px">Cada pessoa vira uma coluna no Quadro. Não precisa ter login; se tiver, vincule para ela ver "seus itens" e usar "Está comigo agora".</p>
      <button class="btn primary" onClick=${() => setForm({})}><${Icone} n="mais" s=${16} />Nova pessoa</button></div>
    <div class="card flush tbl-wrap"><table class="tbl"><thead><tr><th>Pessoa</th><th class="hide-m">Login vinculado</th><th class="right">Itens agora</th><th class="right hide-m">Ordem</th><th></th></tr></thead>
      <tbody>${lista.map((p) => html`<tr key=${p.id} class="click" onClick=${() => setForm(p)} style=${p.ativo ? '' : 'opacity:.5'}>
        <td><div style="font-weight:550">${p.nome}${!p.ativo ? ' (inativa)' : ''}</div><div class="small muted">${p.funcao || ''}</div></td>
        <td class="hide-m small">${p.perfil_id ? nomePerfil(st.perfis.find((x) => x.id === p.perfil_id)) : html`<span class="faint">—</span>`}</td>
        <td class="right"><a href=${'#/equipamentos?pessoa=' + p.id} onClick=${(e) => e.stopPropagation()}>${qtd(p.id)}</a></td>
        <td class="right hide-m muted">${p.ordem}</td><td class="right"><${Icone} n="editar" s=${15} /></td></tr>`)}</tbody></table></div>
    ${form && html`<${FormPessoa} inicial=${form} onClose=${() => setForm(null)} />`}
  </div>`;
}

function FormPessoa({ inicial, onClose }) {
  const st = useStore();
  const [f, setF] = useState({ nome: inicial.nome || '', funcao: inicial.funcao || '', perfil_id: inicial.perfil_id || '', ordem: inicial.ordem ?? 100, ativo: inicial.ativo ?? true });
  const usados = new Set(st.pessoas.filter((p) => p.perfil_id && p.id !== inicial.id).map((p) => p.perfil_id));
  const salvar = async () => {
    if (!f.nome.trim()) return toast('Informe o nome.', 'erro');
    const reg = { nome: f.nome.trim(), funcao: f.funcao.trim() || null, perfil_id: f.perfil_id || null, ordem: Number(f.ordem) || 100, ativo: f.ativo };
    if (await acao(() => (inicial.id ? q(sb.from('pessoas').update(reg).eq('id', inicial.id)) : q(sb.from('pessoas').insert(reg))), 'Pessoa salva.')) { await carregarTudo(); onClose(); }
  };
  const excluir = async () => {
    const n = st.equipamentos.filter((e) => e.portador_id === inicial.id || e.titular_id === inicial.id).length;
    if (n) return toast(`${inicial.nome} ainda tem ${n} item(ns). Mova-os antes, ou marque a pessoa como inativa.`, 'erro');
    if (await confirmar(`Remover ${inicial.nome}?`, { perigo: true, ok: 'Remover' })) if (await acao(() => q(sb.from('pessoas').delete().eq('id', inicial.id)), 'Removida.')) { await carregarTudo(); onClose(); }
  };
  const podeEditar = isAdmin() || !inicial.id;
  return html`<${Modal} titulo=${inicial.id ? inicial.nome : 'Nova pessoa'} onClose=${onClose}
    rodape=${html`${inicial.id && isAdmin() && html`<button class="btn danger" style="margin-right:auto" onClick=${excluir}>Remover</button>`}<button class="btn" onClick=${onClose}>Cancelar</button>${podeEditar && html`<button class="btn primary" onClick=${salvar}>Salvar</button>`}`}>
    <div class="stack">
      ${!podeEditar && html`<div class="alert info small">Só administradores editam pessoas.</div>`}
      <${Campo} rotulo="Nome" obrig><input class="input" value=${f.nome} disabled=${!podeEditar} onInput=${(e) => setF({ ...f, nome: e.target.value })} autofocus /><//>
      <${Campo} rotulo="Função"><input class="input" value=${f.funcao} disabled=${!podeEditar} onInput=${(e) => setF({ ...f, funcao: e.target.value })} placeholder="Filmmaker, coordenador de captação…" /><//>
      <div class="grid-form">
        <${Campo} rotulo="Login vinculado"><select class="input" value=${f.perfil_id} disabled=${!podeEditar} onChange=${(e) => setF({ ...f, perfil_id: e.target.value })}>
          <option value="">Sem login</option>${st.perfis.filter((p) => !usados.has(p.id)).map((p) => html`<option value=${p.id}>${nomePerfil(p)} (${p.email})</option>`)}</select><//>
        <${Campo} rotulo="Ordem no quadro"><input class="input" type="number" value=${f.ordem} disabled=${!podeEditar} onInput=${(e) => setF({ ...f, ordem: e.target.value })} /><//>
      </div>
      <label class="check"><input type="checkbox" checked=${f.ativo} disabled=${!podeEditar} onChange=${(e) => setF({ ...f, ativo: e.target.checked })} />Ativa (aparece no quadro)</label>
    </div><//>`;
}

// ------------------------------------------------------------------ acesso (usuários)
function Acesso() {
  const st = useStore();
  const [cfg, setCfg] = useState({ dominio: st.config.dominio_auto_aprovado || '', prefixo: st.config.prefixo_codigo || 'MV' });
  const pend = st.perfis.filter((p) => !p.ativo);
  const ativos = st.perfis.filter((p) => p.ativo);
  const upd = (p, patch, msg) => acao(() => q(sb.from('perfis').update(patch).eq('id', p.id)), msg);
  const salvarCfg = () => acao(() => q(sb.from('config').upsert([{ chave: 'dominio_auto_aprovado', valor: cfg.dominio.trim().replace(/^@/, '') }, { chave: 'prefixo_codigo', valor: cfg.prefixo.trim().toUpperCase() || 'MV' }])), 'Configurações salvas.');
  const Linha = ({ p }) => html`<tr key=${p.id}>
    <td><div style="font-weight:550">${p.nome || '—'}${p.id === st.perfil.id ? html` <span class="badge b-gold plain">você</span>` : ''}</div><div class="small muted">${p.email}</div></td>
    <td class="hide-m small muted">${fmtData(p.criado_em)}</td>
    <td><select class="input" style="width:auto;height:32px" value=${p.papel} onChange=${(e) => upd(p, { papel: e.target.value }, 'Papel atualizado.')}>
      <option value="membro">Membro</option><option value="admin">Administrador</option></select></td>
    <td class="right">${p.ativo
      ? html`<button class="btn ghost sm" disabled=${p.id === st.perfil.id} onClick=${async () => (await confirmar(`Bloquear o acesso de ${p.nome || p.email}?`, { perigo: true, ok: 'Bloquear' })) && upd(p, { ativo: false }, 'Acesso bloqueado.')}>Bloquear</button>`
      : html`<button class="btn primary sm" onClick=${() => upd(p, { ativo: true }, 'Acesso aprovado.')}><${Icone} n="check" s=${15} />Aprovar</button>`}</td></tr>`;
  return html`<div class="stack lg">
    <p class="muted" style="margin:0">Membros movem equipamentos, editam jobs e modelos. Administradores também cadastram itens, kits, valores, notas fiscais e pessoas.</p>
    ${pend.length > 0 && html`<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Aguardando aprovação</h2></div>
      <div class="tbl-wrap"><table class="tbl"><tbody>${pend.map((p) => html`<${Linha} p=${p} />`)}</tbody></table></div></div>`}
    <div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Com acesso (${ativos.length})</h2></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pessoa</th><th class="hide-m">Desde</th><th>Papel</th><th></th></tr></thead><tbody>${ativos.map((p) => html`<${Linha} p=${p} />`)}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h2>Configurações</h2></div><div class="grid-form">
      <${Campo} rotulo="Domínio aprovado automaticamente"><input class="input" value=${cfg.dominio} onInput=${(e) => setCfg({ ...cfg, dominio: e.target.value })} placeholder="labmv.com.br" /><//>
      <${Campo} rotulo="Prefixo dos códigos automáticos"><input class="input mono" value=${cfg.prefixo} onInput=${(e) => setCfg({ ...cfg, prefixo: e.target.value })} /><//>
      <div class="field" style="justify-content:flex-end"><button class="btn primary" onClick=${salvarCfg}>Salvar</button></div></div></div>
  </div>`;
}

// ------------------------------------------------------------------ categorias
function Categorias() {
  const st = useStore();
  const usadas = [...new Set(st.equipamentos.map((e) => e.categoria))];
  const nomes = [...new Set([...st.categorias.map((c) => c.nome), ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const [nova, setNova] = useState({ nome: '', grupo: 'Câmera' });
  const grupoDe = (n) => st.categorias.find((c) => c.nome === n)?.grupo || '';
  const salvar = (nome, grupo) => acao(() => q(sb.from('categorias').upsert({ nome, grupo, ordem: (GRUPOS.indexOf(grupo) + 1) * 10 })), 'Categoria atualizada.').then(carregarTudo);
  return html`<div class="stack">
    <p class="muted" style="margin:0;max-width:720px">Cada categoria pertence a um grupo (Câmera, Luz, Maquinária, Áudio…). Os grupos aparecem como filtros no Quadro e na tabela dinâmica. Categorias usadas nos itens mas sem grupo aparecem em "Outros".</p>
    <div class="card flush tbl-wrap"><table class="tbl"><thead><tr><th>Categoria</th><th class="right">Itens</th><th>Grupo</th></tr></thead><tbody>
      ${nomes.map((n) => html`<tr key=${n}><td>${n}${!grupoDe(n) ? html` <span class="badge b-falta plain">sem grupo</span>` : ''}</td><td class="right muted">${st.equipamentos.filter((e) => e.categoria === n).length}</td>
        <td>${isAdmin() ? html`<select class="input" style="width:auto;height:32px" value=${grupoDe(n)} onChange=${(e) => salvar(n, e.target.value)}><option value="">—</option>${GRUPOS.map((g) => html`<option>${g}</option>`)}</select>` : grupoDe(n) || 'Outros'}</td></tr>`)}
    </tbody></table></div>
    ${isAdmin() && html`<div class="row"><input class="input" style="max-width:240px" placeholder="Nova categoria" value=${nova.nome} onInput=${(e) => setNova({ ...nova, nome: e.target.value })} />
      <select class="input" style="width:auto" value=${nova.grupo} onChange=${(e) => setNova({ ...nova, grupo: e.target.value })}>${GRUPOS.map((g) => html`<option>${g}</option>`)}</select>
      <button class="btn" onClick=${() => nova.nome.trim() && salvar(nova.nome.trim(), nova.grupo).then(() => setNova({ ...nova, nome: '' }))}>Adicionar</button></div>`}
  </div>`;
}

// ------------------------------------------------------------------ Google Agenda
function Google() {
  const st = useStore();
  const [cal, setCal] = useState(st.config.google_calendar_id || '');
  const token = st.config.token_sincronizacao;
  const ult = st.config.ultima_sincronizacao;
  if (!isAdmin()) return html`<div class="card"><${Vazio} titulo="Somente administradores">${ult ? 'Última sincronização ' + fmtRelativo(ult) + '.' : ''}<//></div>`;
  const cfg = window.MVLAB_CONFIG || {};
  const url = (cfg.supabaseUrl || '').trim().replace(/\/(rest|auth)\/v1.*$/i, '').replace(/\/+$/, '');
  const salvarCal = () => acao(() => q(sb.from('config').upsert({ chave: 'google_calendar_id', valor: cal.trim() })), 'ID da agenda salvo.').then(carregarTudo);
  const novoToken = async () => {
    if (!(await confirmar('Gerar uma nova chave? O script atual do Google para de funcionar até você colar o novo.', { ok: 'Gerar nova' }))) return;
    const t = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await acao(() => q(sb.from('config').upsert({ chave: 'token_sincronizacao', valor: t })), 'Nova chave gerada. Baixe o script de novo.');
    carregarTudo();
  };
  const script = () => {
    if (!cal.trim()) return toast('Cole o ID da agenda primeiro.', 'erro');
    baixar('sincronizar-agenda.gs', scriptGoogle({ url, chave: (cfg.supabaseAnonKey || '').trim(), token, calendario: cal.trim() }), 'text/plain;charset=utf-8');
  };
  return html`<div class="stack lg">
    <div class=${'alert ' + (ult ? 'ok' : 'info')}><${Icone} n="agenda" /><div>${ult ? html`Última sincronização <b>${fmtRelativo(ult)}</b> (${fmtData(ult, true)}). ${st.jobs.filter((j) => j.origem === 'google').length} jobs vindos da agenda.` : 'A agenda ainda não sincronizou nenhuma vez.'}</div></div>
    <div class="card stack">
      <h2>Como ligar a agenda de gravações</h2>
      <ol style="margin:0;padding-left:20px;line-height:1.9">
        <li>No Google Agenda, abra <b>Configurações</b> da agenda "GRAVAÇÕES MV LAB" → <b>Integrar agenda</b> → copie o <b>ID da agenda</b> (termina em <span class="mono">@group.calendar.google.com</span>) e cole abaixo.</li>
        <li>Clique em <b>Baixar script</b>.</li>
        <li>Entre em <a href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a> com uma conta que vê essa agenda → <b>Novo projeto</b> → apague o conteúdo e cole o do arquivo baixado → salve.</li>
        <li>No menu de funções escolha <b>instalar</b> e clique em <b>Executar</b>. Autorize o acesso à agenda quando o Google pedir.</li>
        <li>Pronto: a cada 30 minutos as gravações dos últimos 7 dias e dos próximos 4 meses são enviadas para cá. Eventos apagados viram "cancelado".</li>
      </ol>
      <div class="grid-form">
        <${Campo} rotulo="ID da agenda" cls="span-2"><input class="input mono" value=${cal} onInput=${(e) => setCal(e.target.value)} placeholder="xxxx@group.calendar.google.com" /><//>
        <div class="field" style="justify-content:flex-end"><div class="row"><button class="btn" onClick=${salvarCal}>Salvar</button><button class="btn primary" onClick=${script}><${Icone} n="baixar" s=${16} />Baixar script</button></div></div>
      </div>
      <div class="small faint">O script usa uma chave secreta própria (não é a sua senha). Se ela vazar, gere outra: <a href="#" onClick=${(e) => { e.preventDefault(); novoToken(); }}>gerar nova chave</a>.</div>
    </div>
  </div>`;
}

export function scriptGoogle({ url, chave, token, calendario }) {
  return `/**
 * MV LAB · Gestor de Equipamentos — sincronização da agenda de gravações
 * Cole em script.google.com, salve, escolha a função "instalar" e clique em Executar.
 * Depois disso roda sozinho a cada 30 minutos (função "sincronizar").
 */
const SUPABASE_URL = ${JSON.stringify(url)};
const SUPABASE_KEY = ${JSON.stringify(chave)};
const TOKEN = ${JSON.stringify(token || '')};
const CALENDAR_ID = ${JSON.stringify(calendario)};
const DIAS_ANTES = 7;
const DIAS_DEPOIS = 120;

function sincronizar() {
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) throw new Error('Agenda não encontrada. Verifique o CALENDAR_ID e se esta conta tem acesso a ela.');
  const de = new Date(); de.setDate(de.getDate() - DIAS_ANTES); de.setHours(0, 0, 0, 0);
  const ate = new Date(); ate.setDate(ate.getDate() + DIAS_DEPOIS);
  const eventos = [];
  cal.getEvents(de, ate).forEach(function (e) {
    try {
      const tipo = e.getEventType ? String(e.getEventType()) : 'DEFAULT';
      if (tipo === 'OUT_OF_OFFICE' || tipo === 'WORKING_LOCATION' || tipo === 'FOCUS_TIME') return;
    } catch (err) {}
    eventos.push({
      id: e.getId() + '@' + e.getStartTime().toISOString(),
      titulo: e.getTitle(),
      inicio: e.getStartTime().toISOString(),
      fim: e.getEndTime().toISOString(),
      dia_inteiro: e.isAllDayEvent(),
      local: e.getLocation() || '',
      descricao: (e.getDescription() || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 3000)
    });
  });
  const headers = { apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + SUPABASE_KEY;
  const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/sincronizar_jobs', {
    method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({ p_token: TOKEN, p_eventos: eventos, p_de: de.toISOString(), p_ate: ate.toISOString() })
  });
  const codigo = resp.getResponseCode();
  if (codigo >= 300) throw new Error('Falha ao enviar (' + codigo + '): ' + resp.getContentText());
  Logger.log(eventos.length + ' eventos enviados → ' + resp.getContentText());
}

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(30).create();
  sincronizar();
}
`;
}
