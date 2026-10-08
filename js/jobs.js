// Jobs (gravações): agenda sincronizada com o Google Calendar, modelos de equipamento e checklist
import {
  html, useState, useEffect, useMemo, sb, store, useStore, ir, q, acao, toast, confirmar, msgErro, isAdmin,
  fmtData, fmtRelativo, paraLocalInput, deLocalInput, normalizar, TIPOS_KIT,
  Icone, Badge, Campo, Modal, Vazio, Busca, nomePessoa, pessoasAtivas, carregarTudo, kitPorId,
} from './core.js';
import { SeletorItens, buscarEquip } from './picker.js';
import { resumoJob, cobertura, conflitos, sugerir, itensDoJob, rotuloRequisito, jobAtivo, modeloDe } from './cobertura.js';
import { MoverModal } from './quadro.js';

const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaLongo = (d) => new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const diaChave = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const faixa = (j) => (j.dia_inteiro ? 'Dia inteiro' : `${hora(j.inicio)}–${hora(j.fim)}`);

export function Jobs({ query }) {
  const st = useStore();
  const [aba, setAba] = useState(query.aba || 'proximos');
  const [termo, setTermo] = useState('');
  const [pend, setPend] = useState(!!query.pendentes);
  const [ocultos, setOcultos] = useState(false);
  const [novo, setNovo] = useState(false);
  useEffect(() => { setAba(query.aba || 'proximos'); setPend(!!query.pendentes); }, [query.aba, query.pendentes]);
  const agora = new Date();
  const ult = st.config.ultima_sincronizacao;

  const lista = useMemo(() => {
    let l = st.jobs.filter((j) => (aba === 'proximos' ? new Date(j.fim) >= agora : new Date(j.fim) < agora));
    if (!ocultos) l = l.filter(jobAtivo);
    const t = normalizar(termo);
    if (t) l = l.filter((j) => normalizar(`${j.titulo} ${j.local} ${j.cliente} ${modeloDe(j)?.nome || ''}`).includes(t));
    let r = l.map((j) => ({ j, r: resumoJob(j) }));
    if (pend) r = r.filter((x) => x.r.estado === 'falta' || x.r.conflitos.length || x.r.estado === 'semmodelo');
    if (aba !== 'proximos') r.reverse();
    return r;
  }, [st.jobs, st.equipamentos, st.modelos, aba, termo, pend, ocultos]);

  const grupos = []; let atual = null;
  lista.forEach((x) => { const k = diaChave(x.j.inicio); if (!atual || atual.k !== k) { atual = { k, d: x.j.inicio, itens: [] }; grupos.push(atual); } atual.itens.push(x); });

  return html`<div>
    <div class="page-head"><div><h1>Jobs</h1>
      <p>${ult ? `Agenda sincronizada com o Google Calendar ${fmtRelativo(ult)} (${fmtData(ult, true)}).` : html`Sincronização com o Google Calendar ainda não configurada${isAdmin() ? html` — <a href="#/pessoas?aba=google">configurar</a>` : ''}.`}</p></div>
      <button class="btn primary" onClick=${() => setNovo(true)}><${Icone} n="mais" s=${16} />Job manual</button></div>
    <div class="tabs">
      ${[['proximos', 'Próximos'], ['passados', 'Passados'], ['modelos', `Modelos (${st.modelos.length})`]].map(([k, r]) => html`<button class=${'tab' + (aba === k ? ' on' : '')} onClick=${() => setAba(k)}>${r}</button>`)}
    </div>
    ${aba === 'modelos' ? html`<${Modelos} />` : html`
      <div class="row" style="margin-bottom:6px"><${Busca} valor=${termo} onInput=${setTermo} placeholder="Buscar job, local, modelo…" />
        <label class="check"><input type="checkbox" checked=${pend} onChange=${(e) => setPend(e.target.checked)} />Só com pendências</label>
        <label class="check"><input type="checkbox" checked=${ocultos} onChange=${(e) => setOcultos(e.target.checked)} />Mostrar ignorados/cancelados</label></div>
      ${grupos.map((g) => html`<div key=${g.k}><div class="dia">${diaLongo(g.d)}</div><div class="card flush">
        ${g.itens.map(({ j, r }) => html`<div class="job" key=${j.id} onClick=${() => ir('/job/' + j.id)} style=${jobAtivo(j) ? '' : 'opacity:.5'}>
          <div class="hora">${faixa(j)}</div>
          <div style="min-width:0"><div class="ellipsis" style="font-weight:550">${j.titulo}</div>
            <div class="small muted ellipsis">${r.modelo ? r.modelo.nome : 'sem modelo'}${j.local ? ' · ' + j.local : ''}${j.responsavel_id ? ' · ' + nomePessoa(j.responsavel_id) : ''}</div></div>
          <div class="row nw" style="gap:6px">
            ${!jobAtivo(j) && html`<span class="badge b-neutro">${j.status}</span>`}
            ${r.conflitos.length > 0 && html`<span class="badge b-atrasado" title="Equipamento em dois jobs no mesmo horário">Conflito</span>`}
            <span class=${'badge b-' + (r.estado === 'ok' ? 'ok' : r.estado)}>${r.rot}</span>
          </div></div>`)}
      </div></div>`)}
      ${!lista.length && html`<div class="card"><${Vazio} titulo=${st.jobs.length ? 'Nenhum job com esses filtros' : 'Nenhum job ainda'}>${!st.jobs.length ? 'Configure a sincronização com o Google Calendar ou crie um job manual.' : ''}<//></div>`}`}
    ${novo && html`<${FormJob} inicial=${{}} onClose=${() => setNovo(false)} />`}
  </div>`;
}

// ================================================================== DETALHE DO JOB
export function DetalheJob({ id }) {
  const st = useStore();
  const j = st.jobs.find((x) => x.id === id);
  const [editItens, setEditItens] = useState(false);
  const [editar, setEditar] = useState(false);
  const [entregar, setEntregar] = useState(false);
  const [desc, setDesc] = useState(false);
  if (!j) return html`<${Vazio} titulo="Job não encontrado">Pode ser antigo demais ou ter sido removido. <a href="#/jobs">Voltar</a><//>`;
  const r = resumoJob(j);
  const itens = itensDoJob(j);
  const confIds = new Map(r.conflitos.map((c) => [c.equipamento_id, c.job]));

  const salvarItens = (lista, msg) => acao(() => q(sb.rpc('salvar_itens_job', { p_job_id: j.id, p_itens: lista })), msg);
  const autoSugerir = async () => {
    if (!r.modelo) return toast('Escolha um modelo para o job primeiro.', 'erro');
    const s = sugerir(j);
    if (!s.novos.length) return toast(s.naoAtendidos.length ? 'Não há itens livres para: ' + s.naoAtendidos.join('; ') : 'Nada a sugerir — o job já está completo.', s.naoAtendidos.length ? 'erro' : 'info');
    const atuais = (j.job_itens || []).map((i) => ({ equipamento_id: i.equipamento_id, kit_id: i.kit_id }));
    if (await salvarItens([...atuais, ...s.novos], `${s.novos.length} item(ns) sugerido(s) e adicionados.`)) {
      await carregarTudo();
      if (s.naoAtendidos.length) toast('Ainda falta: ' + s.naoAtendidos.join('; '), 'erro');
    }
  };
  const mudar = async (patch, msg) => { if (await acao(() => q(sb.from('jobs').update(patch).eq('id', j.id)), msg)) carregarTudo(); };
  const excluir = async () => { if (await confirmar(`Excluir o job "${j.titulo}"?`, { perigo: true, ok: 'Excluir' })) if (await acao(() => q(sb.from('jobs').delete().eq('id', j.id)), 'Job excluído.')) { await carregarTudo(); ir('/jobs'); } };

  // agrupado por quem está com o item agora
  const porPessoa = {};
  itens.forEach((i) => { const k = i.e.portador_id || ''; (porPessoa[k] = porPessoa[k] || []).push(i); });

  return html`<div>
    <a class="crumb" href="#/jobs">← Jobs</a>
    <div class="page-head"><div><div class="row" style="gap:8px"><h1>${j.titulo}</h1>
        ${j.origem === 'google' && html`<span class="badge b-neutro plain" title="Vem do Google Calendar">Google Agenda</span>`}
        ${!jobAtivo(j) && html`<span class="badge b-atrasado plain">${j.status}</span>`}</div>
      <p>${diaLongo(j.inicio)} · ${faixa(j)}${j.local ? ' · ' + j.local : ''}</p></div>
      <div class="row">
        <button class="btn" onClick=${autoSugerir}><${Icone} n="check" s=${16} />Sugerir equipamentos</button>
        <button class="btn primary" onClick=${() => setEditItens(true)}><${Icone} n="kit" s=${16} />Escolher equipamentos</button>
        <button class="btn icon" title="Editar job" onClick=${() => setEditar(true)}><${Icone} n="editar" /></button>
      </div></div>

    <div class="cols-2-1">
      <div class="stack lg">
        <div class="card">
          <div class="card-head"><h2>Checklist ${r.modelo ? html`<span class="muted" style="font-weight:500">· ${r.modelo.nome}</span>` : ''}</h2>
            ${r.modelo && r.linhas.length > 0 && html`<span class=${'badge b-' + (r.falta ? 'falta' : 'ok')}>${r.falta ? `Faltam ${r.falta}` : 'Completo'}</span>`}</div>
          ${!r.modelo ? html`<div class="stack"><div class="muted">Este job não tem modelo. Escolha um para ver o que é necessário:</div>
              <select class="input" style="max-width:360px" value="" onChange=${(e) => e.target.value && mudar({ modelo_id: e.target.value }, 'Modelo aplicado.')}>
                <option value="">Escolher modelo…</option>${st.modelos.map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select>
              <div class="small faint">Para reconhecer automaticamente jobs parecidos, adicione palavras-chave ao modelo na aba Modelos.</div></div>`
          : !r.linhas.length ? html`<div class="muted">O modelo <b>${r.modelo.nome}</b> ainda não tem requisitos. <a href="#/jobs?aba=modelos">Definir requisitos</a></div>`
          : r.linhas.map((l) => html`<div class="req" key=${l.r.id}>
              <span style=${'color:' + (l.falta ? 'var(--warn)' : 'var(--ok)')}><${Icone} n=${l.falta ? 'alerta' : 'check'} s=${17} /></span>
              <div><div style="font-weight:550">${rotuloRequisito(l.r)}</div>
                <div class="small muted">${l.alocados.length ? l.alocados.map((a) => a.nome).join(' · ') : 'nada alocado'}${l.r.obs ? ' — ' + l.r.obs : ''}</div></div>
              <span class="small nowrap" style=${l.falta ? 'color:var(--warn)' : 'color:var(--muted)'}>${l.alocados.length}/${l.qtd}</span></div>`)}
        </div>

        ${r.conflitos.length > 0 && html`<div class="alert bad"><${Icone} n="alerta" /><div><b>Conflito de agenda:</b> ${r.conflitos.length} item(ns) também estão em outro job no mesmo horário:
          ${[...new Map(r.conflitos.map((c) => [c.job.id, c.job])).values()].map((o) => html` <a href=${'#/job/' + o.id}>${o.titulo} (${faixa(o)})</a>`)}</div></div>`}

        <div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Quem leva o quê</h2><span class="small muted">${itens.length} itens</span></div>
          ${!itens.length ? html`<${Vazio} titulo="Nenhum equipamento escolhido">Use "Sugerir equipamentos" para preencher a partir do modelo, ou escolha manualmente.<//>`
          : Object.entries(porPessoa).sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : nomePessoa(a).localeCompare(nomePessoa(b)))).map(([pid, arr]) => html`<div key=${pid}>
              <div class="li" style="background:var(--surface-2)"><b class="grow">${pid ? nomePessoa(pid) : 'Na base (alguém precisa buscar)'}</b><span class="small muted">${arr.length}</span></div>
              ${arr.map((i) => html`<a class="li" key=${i.equipamento_id} href=${'#/equipamento/' + i.equipamento_id}>
                <div class="grow"><div class="t ellipsis">${i.e.nome}</div><div class="s"><span class="mono">${i.e.codigo}</span> · ${i.e.categoria}${i.kit_id ? ' · ' + (kitPorId(i.kit_id)?.nome || '') : ''}${i.e.dono_id ? html` · <span class="tag-colab">◆ próprio de ${i.e.dono_nome}</span>` : ''}
                  ${confIds.has(i.equipamento_id) ? html` · <span style="color:var(--bad)">também em ${confIds.get(i.equipamento_id).titulo}</span>` : ''}</div></div>
                ${i.e.status !== 'ok' ? html`<${Badge} e=${i.e} />` : ''}</a>`)}</div>`)}
          ${itens.length > 0 && html`<div class="row" style="padding:12px 16px;border-top:1px solid var(--border)">
            <button class="btn sm" onClick=${() => setEntregar(true)}><${Icone} n="saida" s=${15} />Emprestar tudo ao responsável</button>
            <span class="small faint">Registra que os itens ficam com uma pessoa até o fim do job.</span></div>`}
        </div>
      </div>

      <div class="stack lg">
        <div class="card stack">
          <${Campo} rotulo="Modelo"><select class="input" value=${j.modelo_id || ''} onChange=${(e) => mudar({ modelo_id: e.target.value || null }, 'Modelo atualizado.')}>
            <option value="">— sem modelo —</option>${st.modelos.map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select><//>
          <${Campo} rotulo="Responsável pelo equipamento"><select class="input" value=${j.responsavel_id || ''} onChange=${(e) => mudar({ responsavel_id: e.target.value || null }, 'Responsável atualizado.')}>
            <option value="">—</option>${pessoasAtivas().map((p) => html`<option value=${p.id}>${p.nome}</option>`)}</select><//>
          ${j.cliente && html`<div><div class="small muted">Cliente</div>${j.cliente}</div>`}
          ${j.obs && html`<div><div class="small muted">Observações</div><div style="white-space:pre-line">${j.obs}</div></div>`}
          ${j.descricao && html`<div><a href="#" class="small" onClick=${(e) => { e.preventDefault(); setDesc(!desc); }}>${desc ? 'Ocultar' : 'Ver'} descrição do convite</a>
            ${desc && html`<div class="small muted" style="white-space:pre-line;margin-top:6px;max-height:300px;overflow:auto">${j.descricao.replace(/<[^>]+>/g, ' ')}</div>`}</div>`}
        </div>
        <div class="card stack" style="gap:8px">
          ${jobAtivo(j)
            ? html`<button class="btn sm" onClick=${() => mudar({ status: 'ignorado' }, 'Job marcado como ignorado.')}>Não é gravação (ignorar)</button>`
            : html`<button class="btn sm" onClick=${() => mudar({ status: 'ativo' }, 'Job reativado.')}>Reativar job</button>`}
          ${(isAdmin() || (j.origem === 'manual' && j.criado_por === st.perfil.id)) && html`<button class="btn danger sm" onClick=${excluir}><${Icone} n="lixo" s=${15} />Excluir job</button>`}
          ${j.origem === 'google' && html`<div class="small faint">Título, data e local vêm da agenda e são atualizados automaticamente.</div>`}
        </div>
      </div>
    </div>
    ${editItens && html`<${EditarItens} job=${j} onClose=${() => setEditItens(false)} />`}
    ${editar && html`<${FormJob} inicial=${j} onClose=${() => setEditar(false)} />`}
    ${entregar && html`<${MoverModal} itens=${(j.job_itens || []).map((i) => ({ equipamento_id: i.equipamento_id, kit_id: i.kit_id }))} para=${j.responsavel_id || undefined}
      tipo="emprestar" projeto=${j.titulo} ate=${j.fim} jobId=${j.id} onClose=${() => setEntregar(false)} />`}
  </div>`;
}

function EditarItens({ job, onClose }) {
  const [itens, setItens] = useState(() => (job.job_itens || []).map((i) => ({ equipamento_id: i.equipamento_id, kit_id: i.kit_id })));
  const outros = conflitos({ ...job, job_itens: itens });
  const alertas = {}; outros.forEach((c) => (alertas[c.equipamento_id] = `também em ${c.job.titulo} (${faixa(c.job)})`));
  itens.forEach((i) => { const e = store.get().equipamentos.find((x) => x.id === i.equipamento_id);
    if (e?.dono_id && e.dono_id !== job.responsavel_id) alertas[e.id] = (alertas[e.id] ? alertas[e.id] + ' · ' : '') + `próprio de ${e.dono_nome} — combine com ele`; });
  const salvar = async () => { if (await acao(() => q(sb.rpc('salvar_itens_job', { p_job_id: job.id, p_itens: itens })), 'Equipamentos do job salvos.')) { await carregarTudo(); onClose(); } };
  return html`<${Modal} largo titulo=${'Equipamentos · ' + job.titulo} onClose=${onClose}
    rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar (${itens.length})</button>`}>
    <div class="stack">${outros.length > 0 && html`<div class="alert warn">${outros.length} item(ns) já estão em outro job no mesmo horário.</div>`}
      <${SeletorItens} itens=${itens} onChange=${setItens} modo="job" alertas=${alertas} /></div><//>`;
}

function FormJob({ inicial, onClose }) {
  const st = useStore();
  const google = inicial.origem === 'google';
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(10, 0, 0, 0);
  const [f, setF] = useState({
    titulo: inicial.titulo || '', cliente: inicial.cliente || '', local: inicial.local || '',
    inicio: paraLocalInput(inicial.inicio || amanha), fim: paraLocalInput(inicial.fim || new Date(amanha.getTime() + 2 * 3600000)),
    modelo_id: inicial.modelo_id || '', responsavel_id: inicial.responsavel_id || '', obs: inicial.obs || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    const id = await acao(() => q(sb.rpc('salvar_job', {
      p_id: inicial.id || null, p_titulo: f.titulo, p_cliente: f.cliente, p_local: f.local, p_inicio: deLocalInput(f.inicio), p_fim: deLocalInput(f.fim),
      p_dia_inteiro: false, p_modelo_id: f.modelo_id || null, p_responsavel_id: f.responsavel_id || null, p_obs: f.obs,
    })), inicial.id ? 'Job atualizado.' : 'Job criado.');
    if (id) { await carregarTudo(); onClose(); if (!inicial.id) ir('/job/' + id); }
  };
  return html`<${Modal} titulo=${inicial.id ? 'Editar job' : 'Novo job manual'} onClose=${onClose}
    rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar</button>`}>
    <div class="grid-form">
      ${google && html`<div class="alert info span-all small">Job do Google Agenda: título, horário e local são controlados pela agenda.</div>`}
      <${Campo} rotulo="Título" obrig cls="span-all"><input class="input" value=${f.titulo} onInput=${set('titulo')} disabled=${google} placeholder="Ex.: Podcast Agrocast ep. 12" /><//>
      <${Campo} rotulo="Início"><input class="input" type="datetime-local" value=${f.inicio} onInput=${set('inicio')} disabled=${google} /><//>
      <${Campo} rotulo="Fim"><input class="input" type="datetime-local" value=${f.fim} onInput=${set('fim')} disabled=${google} /><//>
      <${Campo} rotulo="Local"><input class="input" value=${f.local} onInput=${set('local')} disabled=${google} /><//>
      <${Campo} rotulo="Cliente"><input class="input" value=${f.cliente} onInput=${set('cliente')} /><//>
      <${Campo} rotulo="Modelo"><select class="input" value=${f.modelo_id} onChange=${set('modelo_id')}><option value="">Automático pelo título</option>${st.modelos.map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select><//>
      <${Campo} rotulo="Responsável"><select class="input" value=${f.responsavel_id} onChange=${set('responsavel_id')}><option value="">—</option>${pessoasAtivas().map((p) => html`<option value=${p.id}>${p.nome}</option>`)}</select><//>
      <${Campo} rotulo="Observações" cls="span-all"><textarea class="input" value=${f.obs} onInput=${set('obs')}></textarea><//>
    </div><//>`;
}

// ================================================================== MODELOS
function Modelos() {
  const st = useStore();
  const [editar, setEditar] = useState(null);
  const futuros = st.jobs.filter((j) => jobAtivo(j) && new Date(j.fim) >= new Date());
  return html`<div class="stack">
    <div class="row between"><p class="muted" style="margin:0;max-width:720px">Um modelo diz o que um tipo de gravação precisa. Jobs cujo título contém uma das palavras-chave recebem o modelo sozinhos (ex.: "mind asset" reconhece "Rec Mind Asset").</p>
      <button class="btn primary" onClick=${() => setEditar({})}><${Icone} n="mais" s=${16} />Novo modelo</button></div>
    <div class="cols" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
      ${st.modelos.map((m) => { const n = futuros.filter((j) => j.modelo_id === m.id).length; const reqs = (m.modelo_requisitos || []).slice().sort((a, b) => a.ordem - b.ordem);
        return html`<div class="card click" key=${m.id} onClick=${() => setEditar(m)} style="cursor:pointer">
          <div class="row between nw"><h3 class="ellipsis">${m.nome}</h3><span class="badge b-neutro plain">${n} próximos</span></div>
          <div class="small faint" style="margin:4px 0 10px">${m.palavras_chave ? 'Reconhece: ' + m.palavras_chave : 'Sem palavras-chave'}</div>
          ${reqs.length ? html`<div class="small" style="line-height:1.7">${reqs.map((r) => html`<div>• ${rotuloRequisito(r)}</div>`)}</div>` : html`<div class="small" style="color:var(--warn)">Sem requisitos definidos</div>`}
        </div>`; })}
    </div>
    ${!st.modelos.length && html`<div class="card"><${Vazio} titulo="Nenhum modelo" /></div>`}
    ${editar && html`<${FormModelo} inicial=${editar} onClose=${() => setEditar(null)} />`}
  </div>`;
}

function FormModelo({ inicial, onClose }) {
  const st = useStore();
  const [f, setF] = useState({ nome: inicial.nome || '', palavras_chave: inicial.palavras_chave || '', obs: inicial.obs || '' });
  const [reqs, setReqs] = useState(() => (inicial.modelo_requisitos || []).slice().sort((a, b) => a.ordem - b.ordem).map((r) => ({ ...r })));
  const tiposKit = [...new Set([...TIPOS_KIT, ...st.kits.map((k) => k.tipo).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const categorias = [...new Set([...st.categorias.map((c) => c.nome), ...st.equipamentos.map((e) => e.categoria)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const setR = (i, patch) => setReqs(reqs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (tipo) => setReqs([...reqs, { tipo, valor: tipo === 'kit' ? tiposKit[0] || 'Câmera' : tipo === 'categoria' ? categorias[0] || '' : '', quantidade: 1, obs: '' }]);
  const kitsSemTipo = st.kits.filter((k) => !k.tipo).length;

  const salvar = async () => {
    if (!f.nome.trim()) return toast('Dê um nome ao modelo.', 'erro');
    if (reqs.some((r) => !r.valor)) return toast('Complete todos os requisitos.', 'erro');
    const ok = await acao(async () => {
      const reg = { nome: f.nome.trim(), palavras_chave: f.palavras_chave.trim() || null, obs: f.obs.trim() || null };
      const m = inicial.id ? await q(sb.from('modelos').update(reg).eq('id', inicial.id).select().single()) : await q(sb.from('modelos').insert(reg).select().single());
      await q(sb.from('modelo_requisitos').delete().eq('modelo_id', m.id));
      if (reqs.length) await q(sb.from('modelo_requisitos').insert(reqs.map((r, i) => ({ modelo_id: m.id, tipo: r.tipo, valor: r.valor, quantidade: Math.max(1, Number(r.quantidade) || 1), obs: r.obs || null, ordem: i + 1 }))));
      const n = await q(sb.rpc('reaplicar_modelos'));
      if (n) toast(`${n} job(s) futuros reconhecidos por este modelo.`, 'ok');
    }, 'Modelo salvo.');
    if (ok) { await carregarTudo(); onClose(); }
  };
  const excluir = async () => { if (await confirmar(`Excluir o modelo "${inicial.nome}"? Os jobs ficam sem modelo.`, { perigo: true, ok: 'Excluir' })) if (await acao(() => q(sb.from('modelos').delete().eq('id', inicial.id)), 'Modelo excluído.')) { await carregarTudo(); onClose(); } };

  return html`<${Modal} largo titulo=${inicial.id ? 'Editar modelo' : 'Novo modelo de job'} onClose=${onClose}
    rodape=${html`${inicial.id && html`<button class="btn danger" style="margin-right:auto" onClick=${excluir}>Excluir</button>`}<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar modelo</button>`}>
    <div class="stack lg">
      <div class="grid-form">
        <${Campo} rotulo="Nome" obrig><input class="input" value=${f.nome} onInput=${(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Podcast Agrocast" autofocus /><//>
        <${Campo} rotulo="Palavras-chave no título (separe por vírgula)" cls="span-2"><input class="input" value=${f.palavras_chave} onInput=${(e) => setF({ ...f, palavras_chave: e.target.value })} placeholder="agrocast, podcast agro" /><//>
      </div>
      <div>
        <div class="row between" style="margin-bottom:8px"><h3>O que este job precisa</h3>
          <div class="row" style="gap:6px"><button class="btn sm" onClick=${() => add('kit')}>+ Kit</button><button class="btn sm" onClick=${() => add('categoria')}>+ Categoria</button><button class="btn sm" onClick=${() => add('item')}>+ Item específico</button></div></div>
        ${kitsSemTipo > 0 && html`<div class="alert info small" style="margin-bottom:10px">${kitsSemTipo} kit(s) estão sem tipo definido e não contam para requisitos "kit de…". Defina o tipo na página do kit.</div>`}
        ${!reqs.length && html`<div class="muted small">Ex.: 2 × kit de Luz, 3 × kit de Câmera, 3 × Tripés e suportes, 1 × kit de Áudio.</div>`}
        <div class="stack" style="gap:8px">${reqs.map((r, i) => html`<div class="row nw" key=${i} style="gap:8px;flex-wrap:wrap">
          ${r.tipo !== 'item' && html`<input class="input" type="number" min="1" style="width:70px" value=${r.quantidade} onInput=${(e) => setR(i, { quantidade: e.target.value })} />`}
          <span class="small muted" style="width:86px">${r.tipo === 'kit' ? '× kit de' : r.tipo === 'categoria' ? '× categoria' : 'item'}</span>
          ${r.tipo === 'kit' ? html`<input class="input" list="dl-tipos" style="flex:1 1 160px" value=${r.valor} onInput=${(e) => setR(i, { valor: e.target.value })} />`
            : r.tipo === 'categoria' ? html`<select class="input" style="flex:1 1 160px" value=${r.valor} onChange=${(e) => setR(i, { valor: e.target.value })}>${categorias.map((c) => html`<option>${c}</option>`)}</select>`
            : html`<select class="input" style="flex:1 1 200px" value=${r.valor} onChange=${(e) => setR(i, { valor: e.target.value })}><option value="">Escolha o item…</option>${st.equipamentos.filter((e) => e.status !== 'baixado').map((e) => html`<option value=${e.id}>${e.codigo} · ${e.nome}</option>`)}</select>`}
          <input class="input" style="flex:1 1 140px" placeholder="obs. (opcional)" value=${r.obs || ''} onInput=${(e) => setR(i, { obs: e.target.value })} />
          <button class="btn ghost sm icon" aria-label="Remover" onClick=${() => setReqs(reqs.filter((_, j) => j !== i))}><${Icone} n="x" s=${15} /></button>
        </div>`)}</div>
        <datalist id="dl-tipos">${tiposKit.map((t) => html`<option value=${t} />`)}</datalist>
      </div>
      <${Campo} rotulo="Observações"><textarea class="input" value=${f.obs} onInput=${(e) => setF({ ...f, obs: e.target.value })} placeholder="Montagem, cuidados, quem costuma ir…"></textarea><//>
    </div><//>`;
}
