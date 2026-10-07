import {
  html, useState, useEffect, sb, useStore, ir, q, acao, toast, confirmar, msgErro, isAdmin,
  fmtData, fmtRelativo, hojeISO, nomePerfil, eqPorId, kitPorId, perfilPorId,
  Icone, Campo, Modal, Vazio, Badge,
} from './core.js';
import { SeletorItens } from './picker.js';

export function Reservas({ query }) {
  const st = useStore();
  const [form, setForm] = useState(query.nova ? {} : null);
  const [ver, setVer] = useState(query.ver || null);
  useEffect(() => { if (query.ver) setVer(query.ver); if (query.nova) setForm({}); }, [query.ver, query.nova]);
  const hoje = hojeISO();
  const grupos = {};
  st.reservas.forEach((r) => {
    const k = r.inicio <= hoje ? 'Em andamento / hoje' : r.inicio <= hojeISO(new Date(Date.now() + 7 * 86400000)) ? 'Próximos 7 dias' : 'Mais adiante';
    (grupos[k] = grupos[k] || []).push(r);
  });
  const r = ver && st.reservas.find((x) => x.id === ver);
  const fechar = () => { setVer(null); setForm(null); if (location.hash.includes('?')) history.replaceState(null, '', '#/reservas'); };
  return html`<div>
    <div class="page-head"><div><h1>Reservas</h1><p>Bloqueie equipamentos para uma diária ou projeto futuro. O sistema avisa quando houver conflito.</p></div>
      <button class="btn primary" onClick=${() => setForm({})}><${Icone} n="mais" s=${16} />Nova reserva</button></div>
    <${Agenda} reservas=${st.reservas} onVer=${setVer} />
    <div class="stack lg" style="margin-top:18px">
      ${['Em andamento / hoje', 'Próximos 7 dias', 'Mais adiante'].filter((k) => grupos[k]).map((k) => html`<div class="card flush" key=${k}>
        <div class="card-head" style="padding:14px 16px 0"><h3>${k}</h3></div>
        <div class="list">${grupos[k].map((x) => html`<div class="li click" key=${x.id} onClick=${() => setVer(x.id)}>
          <div class="grow"><div class="t">${x.titulo}${x.cliente ? html` <span class="muted">· ${x.cliente}</span>` : ''}</div>
            <div class="s">${fmtData(x.inicio)}${x.fim !== x.inicio ? ' → ' + fmtData(x.fim) : ''} · ${x.reserva_itens.length} itens · ${x.responsavel_nome || '—'}</div></div>
          <span class="badge b-reservado">${x.inicio <= hoje ? 'agora' : fmtRelativo(x.inicio)}</span></div>`)}</div></div>`)}
      ${!st.reservas.length && html`<div class="card"><${Vazio} titulo="Nenhuma reserva ativa">Use reservas para garantir equipamentos em diárias futuras.<//></div>`}
    </div>
    ${r && !form && html`<${VerReserva} r=${r} onClose=${fechar} onEditar=${() => setForm(r)} />`}
    ${form && html`<${FormReserva} inicial=${form} onClose=${fechar} />`}
  </div>`;
}

// faixa de 14 dias com contagem de itens reservados por dia
function Agenda({ reservas, onVer }) {
  const dias = [...Array(14)].map((_, i) => hojeISO(new Date(Date.now() + i * 86400000)));
  return html`<div class="card" style="overflow-x:auto;padding:12px">
    <div style="display:grid;grid-template-columns:repeat(14,minmax(64px,1fr));gap:6px;min-width:900px">
      ${dias.map((d) => { const rs = reservas.filter((r) => r.inicio <= d && r.fim >= d); const dt = new Date(d + 'T12:00:00');
        return html`<div key=${d} style=${`border:1px solid var(--border);border-radius:8px;padding:6px;min-height:96px;background:${[0, 6].includes(dt.getDay()) ? 'var(--surface-2)' : 'transparent'}`}>
          <div class="small" style="color:var(--muted)">${dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</div>
          <div style="font-weight:650">${dt.getDate()}/${dt.getMonth() + 1}</div>
          ${rs.slice(0, 3).map((r) => html`<div class="ellipsis" style="font-size:11px;margin-top:3px;padding:1px 5px;border-radius:4px;background:var(--res-soft);color:var(--res);cursor:pointer" title=${r.titulo} onClick=${() => onVer(r.id)}>${r.titulo}</div>`)}
          ${rs.length > 3 && html`<div class="faint" style="font-size:11px">+${rs.length - 3}</div>`}
        </div>`; })}
    </div></div>`;
}

function VerReserva({ r, onClose, onEditar }) {
  const st = useStore();
  const pode = isAdmin() || r.criado_por === st.perfil.id;
  const itens = r.reserva_itens.map((i) => ({ ...i, e: eqPorId(i.equipamento_id) })).filter((i) => i.e);
  const disp = itens.filter((i) => i.e.status === 'disponivel').length;
  const cancelar = async () => { if (await confirmar(`Cancelar a reserva "${r.titulo}"?`, { perigo: true, ok: 'Cancelar reserva' })) if (await acao(() => q(sb.rpc('cancelar_reserva', { p_id: r.id })), 'Reserva cancelada.')) onClose(); };
  return html`<${Modal} largo titulo=${r.titulo} onClose=${onClose} rodape=${html`
      ${pode && html`<button class="btn danger" onClick=${cancelar}>Cancelar reserva</button>`}
      ${pode && html`<button class="btn" onClick=${onEditar}><${Icone} n="editar" s=${15} />Editar</button>`}
      <button class="btn primary" disabled=${!disp} onClick=${() => ir('/saida/nova?reserva=' + r.id)}><${Icone} n="saida" s=${15} />Converter em saída (${disp})</button>`}>
    <div class="stack">
      <div class="dl"><div><span>Período</span><b>${fmtData(r.inicio)}${r.fim !== r.inicio ? ' → ' + fmtData(r.fim) : ''}</b></div>
        <div><span>Cliente</span><b>${r.cliente || '—'}</b></div><div><span>Responsável</span><b>${r.responsavel_nome || '—'}</b></div>
        <div><span>Criada por</span><b>${nomePerfil(perfilPorId(r.criado_por)) || '—'}</b></div></div>
      ${r.obs && html`<div class="muted">${r.obs}</div>`}
      <div class="card flush"><div class="list">${itens.map((i) => html`<a class="li" key=${i.equipamento_id} href=${'#/equipamento/' + i.e.id}>
        <div class="grow"><div class="t ellipsis">${i.e.nome}</div><div class="s"><span class="mono">${i.e.codigo}</span>${i.kit_id ? ' · ' + (kitPorId(i.kit_id)?.nome || '') : ''}${i.e.status === 'em_uso' ? ' · com ' + i.e.responsavel_nome + (i.e.previsao_retorno ? ', volta ' + fmtData(i.e.previsao_retorno) : '') : ''}</div></div>
        <${Badge} e=${i.e} /></a>`)}</div></div>
    </div><//>`;
}

function FormReserva({ inicial, onClose }) {
  const st = useStore();
  const editando = !!inicial.id;
  const [f, setF] = useState({
    titulo: inicial.titulo || '', cliente: inicial.cliente || '', inicio: inicial.inicio || hojeISO(new Date(Date.now() + 86400000)), fim: inicial.fim || hojeISO(new Date(Date.now() + 86400000)),
    responsavel_id: inicial.id ? inicial.responsavel_id || '' : st.perfil.id, responsavel_nome: inicial.responsavel_id ? '' : inicial.responsavel_nome || '', obs: inicial.obs || '',
  });
  const [itens, setItens] = useState(() => (inicial.reserva_itens || []).map((i) => ({ equipamento_id: i.equipamento_id, kit_id: i.kit_id })));
  const [conf, setConf] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    if (!itens.length || !f.inicio || !f.fim || f.fim < f.inicio) { setConf([]); return; }
    const t = setTimeout(() => q(sb.rpc('conflitos_reserva', { p_equipamentos: itens.map((i) => i.equipamento_id), p_inicio: f.inicio, p_fim: f.fim, p_ignorar: inicial.id || null })).then((c) => setConf(c || [])).catch(() => setConf([])), 300);
    return () => clearTimeout(t);
  }, [itens, f.inicio, f.fim]);
  // itens em uso com retorno previsto depois do início
  const emUso = itens.map((i) => eqPorId(i.equipamento_id)).filter((e) => e && e.status === 'em_uso' && (!e.previsao_retorno || e.previsao_retorno.slice(0, 10) >= f.inicio));
  const alertas = {};
  conf.forEach((c) => (alertas[c.equipamento_id] = `já reservado: ${c.titulo} (${fmtData(c.inicio)})`));
  emUso.forEach((e) => (alertas[e.id] = (alertas[e.id] ? alertas[e.id] + ' · ' : '') + `em uso, volta ${e.previsao_retorno ? fmtData(e.previsao_retorno) : 'sem previsão'}`));

  const salvar = async () => {
    if (!f.titulo.trim()) return toast('Informe o projeto/título.', 'erro');
    if (f.fim < f.inicio) return toast('A data final é anterior à inicial.', 'erro');
    if (!itens.length) return toast('Adicione equipamentos à reserva.', 'erro');
    if (conf.length && !(await confirmar(`${conf.length} item(ns) já estão reservados no período:\n\n${conf.map((c) => `• ${c.codigo} ${c.nome} — ${c.titulo}`).join('\n')}\n\nSalvar mesmo assim (reserva dupla)?`, { ok: 'Salvar mesmo assim' }))) return;
    const ok = await acao(() => q(sb.rpc('salvar_reserva', {
      p_id: inicial.id || null, p_titulo: f.titulo, p_cliente: f.cliente, p_responsavel_id: f.responsavel_id || null,
      p_responsavel_nome: f.responsavel_id ? null : f.responsavel_nome, p_inicio: f.inicio, p_fim: f.fim, p_obs: f.obs, p_itens: itens,
    })), editando ? 'Reserva atualizada.' : 'Reserva criada.');
    if (ok) onClose();
  };
  return html`<${Modal} largo titulo=${editando ? 'Editar reserva' : 'Nova reserva'} onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar reserva</button>`}>
    <div class="stack lg">
      <div class="grid-form">
        <${Campo} rotulo="Projeto / diária" obrig cls="span-2"><input class="input" value=${f.titulo} onInput=${set('titulo')} placeholder="Ex.: LeaderTalks — gravação" autofocus /><//>
        <${Campo} rotulo="Cliente"><input class="input" value=${f.cliente} onInput=${set('cliente')} /><//>
        <${Campo} rotulo="Início" obrig><input class="input" type="date" value=${f.inicio} onInput=${(e) => setF({ ...f, inicio: e.target.value, fim: f.fim < e.target.value ? e.target.value : f.fim })} /><//>
        <${Campo} rotulo="Fim" obrig><input class="input" type="date" value=${f.fim} min=${f.inicio} onInput=${set('fim')} /><//>
        <${Campo} rotulo="Responsável"><select class="input" value=${f.responsavel_id} onChange=${set('responsavel_id')}><option value="">Pessoa externa…</option>${st.perfis.filter((p) => p.ativo).map((p) => html`<option value=${p.id}>${nomePerfil(p)}</option>`)}</select>
          ${!f.responsavel_id && html`<input class="input" style="margin-top:6px" value=${f.responsavel_nome} onInput=${set('responsavel_nome')} placeholder="Nome do responsável externo" />`}<//>
        <${Campo} rotulo="Observações" cls="span-2"><input class="input" value=${f.obs} onInput=${set('obs')} /><//>
      </div>
      <${SeletorItens} itens=${itens} onChange=${setItens} modo="reserva" alertas=${alertas} />
      ${(conf.length > 0 || emUso.length > 0) && html`<div class="alert warn"><${Icone} n="alerta" /><div>${conf.length ? `${conf.length} item(ns) com reserva sobreposta. ` : ''}${emUso.length ? `${emUso.length} item(ns) estão em uso e podem não voltar a tempo.` : ''}</div></div>`}
    </div><//>`;
}
