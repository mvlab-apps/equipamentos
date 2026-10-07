import {
  html, useState, useEffect, useMemo, sb, store, useStore, ir, q, acao, toast, confirmar, msgErro, isAdmin,
  CONDICAO, fmtData, fmtRelativo, fmtMoeda, hojeISO, paraLocalInput, deLocalInput, normalizar,
  Icone, Campo, Modal, Vazio, Busca, Responsavel, perfilPorId, nomePerfil, eqPorId, kitPorId, imprimir, EMPRESA, carregarTudo,
} from './core.js';
import { SeletorItens } from './picker.js';

// ================================================================== NOVA SAÍDA
export function NovaSaida({ query }) {
  const st = useStore();
  const reserva = query.reserva ? st.reservas.find((r) => r.id === query.reserva) : null;
  const [itens, setItens] = useState(() => {
    const est = store.get();
    if (reserva) return reserva.reserva_itens.filter((i) => eqPorId(i.equipamento_id)?.status === 'disponivel').map((i) => ({ equipamento_id: i.equipamento_id, kit_id: i.kit_id }));
    if (query.kit) return est.equipamentos.filter((e) => e.kit_id === query.kit && e.status === 'disponivel').map((e) => ({ equipamento_id: e.id, kit_id: e.kit_id }));
    if (query.itens) return query.itens.split(',').filter((id) => est.equipamentos.find((e) => e.id === id && e.status === 'disponivel')).map((id) => ({ equipamento_id: id, kit_id: null }));
    return [];
  });
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(10, 0, 0, 0);
  const [f, setF] = useState(() => ({
    responsavel_id: reserva?.responsavel_id || st.perfil.id, responsavel_nome: reserva && !reserva.responsavel_id ? reserva.responsavel_nome || '' : '',
    projeto: reserva?.titulo || '', cliente: reserva?.cliente || '', destino: '',
    previsao: paraLocalInput(reserva ? reserva.fim + 'T19:00:00' : amanha), obs: '',
  }));
  const [externo, setExterno] = useState(!!(reserva && !reserva.responsavel_id && reserva.responsavel_nome));
  const [conflitos, setConflitos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const projetos = useMemo(() => [...new Set(st.retiradas.map((r) => r.projeto).filter(Boolean))], [st.retiradas]);

  // reservas de outros projetos que colidem com o período desta saída
  useEffect(() => {
    if (!itens.length) { setConflitos([]); return; }
    const fim = f.previsao ? f.previsao.slice(0, 10) : hojeISO();
    const t = setTimeout(async () => {
      try {
        const c = await q(sb.rpc('conflitos_reserva', { p_equipamentos: itens.map((i) => i.equipamento_id), p_inicio: hojeISO(), p_fim: fim < hojeISO() ? hojeISO() : fim, p_ignorar: reserva?.id || null }));
        setConflitos(c || []);
      } catch (_) { setConflitos([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [itens, f.previsao]);
  const alertas = {}; conflitos.forEach((c) => (alertas[c.equipamento_id] = `reservado ${fmtData(c.inicio)} p/ ${c.titulo}`));

  const valorDiaria = itens.reduce((s, i) => s + (Number(eqPorId(i.equipamento_id)?.valor_locacao) || 0), 0);

  const enviar = async (ev) => {
    ev.preventDefault();
    if (!itens.length) return toast('Adicione pelo menos um equipamento.', 'erro');
    if (externo && !f.responsavel_nome.trim()) return toast('Informe o nome do responsável.', 'erro');
    if (conflitos.length && !(await confirmar(`${conflitos.length} item(ns) estão reservados para outro projeto dentro deste período:\n\n${conflitos.map((c) => `• ${c.codigo} ${c.nome} — ${c.titulo} (${fmtData(c.inicio)})`).join('\n')}\n\nRegistrar a saída mesmo assim?`, { ok: 'Registrar mesmo assim' }))) return;
    setEnviando(true);
    try {
      const id = await q(sb.rpc('registrar_saida', {
        p_responsavel_id: externo ? null : f.responsavel_id, p_responsavel_nome: externo ? f.responsavel_nome.trim() : null,
        p_projeto: f.projeto, p_cliente: f.cliente, p_destino: f.destino, p_previsao: deLocalInput(f.previsao), p_obs: f.obs,
        p_itens: itens, p_reserva_id: reserva?.id || null,
      }));
      toast(`Saída registrada com ${itens.length} item(ns).`, 'ok');
      await carregarTudo();
      ir('/saida/' + id + '?nova=1');
    } catch (e) { toast(msgErro(e), 'erro'); await carregarTudo(); }
    setEnviando(false);
  };

  return html`<form onSubmit=${enviar}>
    <div class="page-head"><div><h1>Nova saída</h1><p>${reserva ? html`A partir da reserva <b>${reserva.titulo}</b>.` : 'Registre quem está levando o quê, para qual projeto e quando volta.'}</p></div></div>
    <div class="stack lg">
      <div class="card"><div class="grid-form">
        <${Campo} rotulo="Responsável" obrig>
          ${externo ? html`<input class="input" value=${f.responsavel_nome} onInput=${set('responsavel_nome')} placeholder="Nome do freelancer / externo" />`
            : html`<select class="input" value=${f.responsavel_id} onChange=${set('responsavel_id')}>${st.perfis.filter((p) => p.ativo).map((p) => html`<option value=${p.id}>${nomePerfil(p)}</option>`)}</select>`}
          <label class="check small" style="margin-top:4px"><input type="checkbox" checked=${externo} onChange=${(e) => setExterno(e.target.checked)} />Pessoa externa (sem acesso ao sistema)</label>
        <//>
        <${Campo} rotulo="Projeto / job"><input class="input" list="dl-proj" value=${f.projeto} onInput=${set('projeto')} placeholder="Ex.: Itaú Views ep. 12" /><datalist id="dl-proj">${projetos.map((p) => html`<option value=${p} />`)}</datalist><//>
        <${Campo} rotulo="Cliente"><input class="input" value=${f.cliente} onInput=${set('cliente')} /><//>
        <${Campo} rotulo="Destino / locação"><input class="input" value=${f.destino} onInput=${set('destino')} placeholder="Estúdio, endereço, cidade…" /><//>
        <${Campo} rotulo="Previsão de retorno" obrig><input class="input" type="datetime-local" value=${f.previsao} onInput=${set('previsao')} required /><//>
        <${Campo} rotulo="Observações" cls="span-2"><input class="input" value=${f.obs} onInput=${set('obs')} placeholder="Ex.: levar carregadores, cuidado com chuva…" /><//>
      </div></div>
      <${SeletorItens} itens=${itens} onChange=${setItens} modo="saida" alertas=${alertas} />
      ${conflitos.length > 0 && html`<div class="alert warn"><${Icone} n="alerta" /><div>${conflitos.length} item(ns) têm reserva de outro projeto no período. Confira antes de confirmar.</div></div>`}
      <div class="row between">
        <span class="muted small">${itens.length} item(ns)${valorDiaria ? ` · diária de locação somada: ${fmtMoeda(valorDiaria)}` : ''}</span>
        <div class="row"><a class="btn" href="#/painel">Cancelar</a><button class="btn primary" disabled=${enviando || !itens.length}><${Icone} n="check" s=${16} />${enviando ? 'Registrando…' : 'Confirmar saída'}</button></div>
      </div>
    </div>
  </form>`;
}

// ================================================================== LISTA
export function ListaSaidas({ query }) {
  const st = useStore();
  const [aba, setAba] = useState('abertas');
  const [minhas, setMinhas] = useState(!!query.minhas);
  const [termo, setTermo] = useState('');
  const [hist, setHist] = useState(null);
  useEffect(() => {
    if (aba !== 'historico') return;
    q(sb.from('retiradas').select('*, retirada_itens(*)').not('encerrada_em', 'is', null).order('saida_em', { ascending: false }).limit(200)).then(setHist).catch((e) => toast(msgErro(e), 'erro'));
  }, [aba]);
  const base = aba === 'abertas' ? st.retiradas : hist || [];
  const agora = new Date();
  const lista = base.filter((r) => (!minhas || r.responsavel_id === st.perfil.id) &&
    normalizar(`${r.numero} ${r.responsavel_nome} ${r.projeto} ${r.cliente} ${r.destino}`).includes(normalizar(termo)));
  return html`<div>
    <div class="page-head"><div><h1>Saídas e devoluções</h1><p>Para devolver, abra a saída e marque os itens que voltaram.</p></div>
      <a class="btn primary" href="#/saida/nova"><${Icone} n="saida" s=${16} />Nova saída</a></div>
    <div class="tabs"><button class=${'tab' + (aba === 'abertas' ? ' on' : '')} onClick=${() => setAba('abertas')}>Em aberto (${st.retiradas.length})</button>
      <button class=${'tab' + (aba === 'historico' ? ' on' : '')} onClick=${() => setAba('historico')}>Encerradas</button></div>
    <div class="row" style="margin-bottom:14px"><${Busca} valor=${termo} onInput=${setTermo} placeholder="Nº, responsável, projeto, cliente…" />
      <label class="check"><input type="checkbox" checked=${minhas} onChange=${(e) => setMinhas(e.target.checked)} />Só as minhas</label></div>
    <div class="card flush"><div class="list">
      ${aba === 'historico' && hist === null && html`<div class="empty">Carregando…</div>`}
      ${lista.map((r) => {
        const pend = r.retirada_itens.filter((i) => !i.devolvido_em).length; const tot = r.retirada_itens.length;
        const atras = !r.encerrada_em && r.previsao_retorno && new Date(r.previsao_retorno) < agora;
        return html`<a class="li" key=${r.id} href=${'#/saida/' + r.id}>
          <div class="mono faint" style="width:44px">#${r.numero}</div>
          <div class="grow"><div class="t ellipsis"><${Responsavel} id=${r.responsavel_id} nome=${r.responsavel_nome} />${r.projeto ? html` <span class="muted">· ${r.projeto}</span>` : ''}</div>
            <div class="s">Saída ${fmtData(r.saida_em, true)} · ${r.encerrada_em ? 'devolvida ' + fmtData(r.encerrada_em, true) : 'volta ' + (r.previsao_retorno ? fmtData(r.previsao_retorno, true) : '—')} · ${r.encerrada_em ? tot : `${pend}/${tot}`} itens</div></div>
          ${r.encerrada_em ? html`<span class="badge b-neutro">Encerrada</span>` : atras ? html`<span class="badge b-atrasado">Atrasada</span>` : pend < tot ? html`<span class="badge b-manutencao">Parcial</span>` : html`<span class="badge b-em_uso">Em uso</span>`}
        </a>`;
      })}
      ${(aba === 'abertas' || hist) && !lista.length && html`<${Vazio} titulo=${aba === 'abertas' ? 'Nenhuma saída em aberto' : 'Nada encontrado'} />`}
    </div></div>
  </div>`;
}

// ================================================================== DETALHE / DEVOLUÇÃO
export function DetalheSaida({ id }) {
  const st = useStore();
  const [r, setR] = useState(() => st.retiradas.find((x) => x.id === id) || null);
  const [marc, setMarc] = useState({});
  const [prazo, setPrazo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const recarregar = () => q(sb.from('retiradas').select('*, retirada_itens(*)').eq('id', id).maybeSingle()).then(setR).catch((e) => toast(msgErro(e), 'erro'));
  useEffect(() => { recarregar(); }, [id, st.atualizadoEm]);
  if (!r) return html`<div class="muted">Carregando…</div>`;

  const itens = r.retirada_itens.map((i) => ({ ...i, e: eqPorId(i.equipamento_id) })).sort((a, b) => (a.e?.codigo || '').localeCompare(b.e?.codigo || ''));
  const pend = itens.filter((i) => !i.devolvido_em);
  const atras = !r.encerrada_em && r.previsao_retorno && new Date(r.previsao_retorno) < new Date();
  const marcados = pend.filter((i) => marc[i.id]?.on);
  const setM = (iid, patch) => setMarc({ ...marc, [iid]: { cond: 'bom', obs: '', ...(marc[iid] || {}), ...patch } });
  const todos = () => { const m = {}; pend.forEach((i) => (m[i.id] = { cond: marc[i.id]?.cond || i.condicao_saida || 'bom', obs: marc[i.id]?.obs || '', on: true })); setMarc(m); };

  const devolver = async () => {
    const danif = marcados.filter((i) => marc[i.id].cond === 'danificado');
    if (danif.some((i) => !marc[i.id].obs.trim())) return toast('Descreva o problema dos itens marcados como danificados.', 'erro');
    setEnviando(true);
    const ok = await acao(() => q(sb.rpc('registrar_devolucao', { p_itens: marcados.map((i) => ({ retirada_item_id: i.id, condicao: marc[i.id].cond, obs: marc[i.id].obs })) })),
      `${marcados.length} item(ns) devolvido(s).${danif.length ? ' Danificados foram para manutenção.' : ''}`);
    setEnviando(false);
    if (ok) { setMarc({}); await carregarTudo(); recarregar(); }
  };

  const romaneio = () => imprimir(html`<div class="doc">
    <div style="display:flex;justify-content:space-between;align-items:flex-end"><h1>Termo de retirada de equipamentos · #${r.numero}</h1><b>${EMPRESA}</b></div>
    <div class="meta">
      <div><b>Responsável:</b> ${perfilPorId(r.responsavel_id) ? nomePerfil(perfilPorId(r.responsavel_id)) : r.responsavel_nome}</div>
      <div><b>Projeto:</b> ${r.projeto || '—'}${r.cliente ? ' · ' + r.cliente : ''}</div>
      <div><b>Saída:</b> ${fmtData(r.saida_em, true)}</div><div><b>Retorno previsto:</b> ${fmtData(r.previsao_retorno, true)}</div>
      <div><b>Destino:</b> ${r.destino || '—'}</div><div><b>Obs.:</b> ${r.obs || '—'}</div>
    </div>
    <table><thead><tr><th>✓ Saída</th><th>Código</th><th>Equipamento</th><th>Nº série</th><th>Kit</th><th>Condição</th><th>✓ Retorno</th></tr></thead>
      <tbody>${itens.map((i) => html`<tr><td style="width:14mm"></td><td>${i.e?.codigo}</td><td>${i.e?.nome}</td><td>${i.e?.numero_serie || ''}</td><td>${i.kit_id ? kitPorId(i.kit_id)?.nome || '' : ''}</td><td>${CONDICAO[i.condicao_saida] || ''}</td><td style="width:14mm"></td></tr>`)}</tbody></table>
    <div class="terms">Declaro ter recebido os equipamentos acima em perfeito estado de funcionamento, comprometendo-me a zelar por sua guarda e conservação e a devolvê-los na data prevista. Danos, perdas ou extravios devem ser comunicados imediatamente.</div>
    <div class="sign"><div>Responsável pela retirada</div><div>Conferido por (${EMPRESA})</div></div>
  </div>`);

  return html`<div>
    <a class="crumb" href="#/saidas">← Saídas</a>
    <div class="page-head"><div><div class="row" style="gap:8px"><h1>Saída #${r.numero}</h1>
        ${r.encerrada_em ? html`<span class="badge b-neutro">Encerrada</span>` : atras ? html`<span class="badge b-atrasado">Atrasada</span>` : html`<span class="badge b-em_uso">Em aberto</span>`}</div>
      <p><${Responsavel} id=${r.responsavel_id} nome=${r.responsavel_nome} />${r.projeto ? ' · ' + r.projeto : ''}${r.cliente ? ' · ' + r.cliente : ''}</p></div>
      <div class="row"><button class="btn" onClick=${romaneio}><${Icone} n="impressora" s=${16} />Termo / romaneio</button>
        ${!r.encerrada_em && html`<button class="btn" onClick=${() => setPrazo(true)}><${Icone} n="relogio" s=${16} />Alterar prazo</button>`}</div></div>

    <div class="card" style="margin-bottom:16px"><div class="dl">
      <div><span>Saída</span><b>${fmtData(r.saida_em, true)}</b></div>
      <div><span>Retorno previsto</span><b style=${atras ? 'color:var(--bad)' : ''}>${r.previsao_retorno ? `${fmtData(r.previsao_retorno, true)} (${fmtRelativo(r.previsao_retorno)})` : '—'}</b></div>
      <div><span>Destino</span><b>${r.destino || '—'}</b></div>
      <div><span>Registrada por</span><b>${nomePerfil(perfilPorId(r.criado_por)) || '—'}</b></div>
      ${r.encerrada_em && html`<div><span>Encerrada</span><b>${fmtData(r.encerrada_em, true)}</b></div>`}
      ${r.obs && html`<div><span>Observações</span><b>${r.obs}</b></div>`}
    </div></div>

    ${pend.length > 0 && html`<div class="card flush" style="margin-bottom:16px">
      <div class="card-head" style="padding:14px 16px 0"><h2>Devolver</h2><button class="btn sm" onClick=${todos}><${Icone} n="check" s=${15} />Marcar todos</button></div>
      <div class="list">${pend.map((i) => { const m = marc[i.id] || {}; return html`<div class="li" key=${i.id} style="flex-wrap:wrap">
        <label class="check grow" style="min-width:220px"><input type="checkbox" checked=${!!m.on} onChange=${(e) => setM(i.id, { on: e.target.checked, cond: m.cond || i.condicao_saida || 'bom' })} />
          <div style="min-width:0"><div class="t ellipsis">${i.e?.nome || '?'}</div><div class="s"><span class="mono">${i.e?.codigo}</span>${i.kit_id ? ' · ' + (kitPorId(i.kit_id)?.nome || 'kit') : ''}</div></div></label>
        ${m.on && html`<select class="input" style="width:140px;height:32px" value=${m.cond} onChange=${(e) => setM(i.id, { cond: e.target.value })}>${Object.entries(CONDICAO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
          <input class="input" style="flex:1 1 200px;height:32px" placeholder=${m.cond === 'danificado' ? 'Descreva o problema (obrigatório)' : 'Observação (opcional)'} value=${m.obs} onInput=${(e) => setM(i.id, { obs: e.target.value })} />`}
      </div>`; })}</div>
      <div class="row between" style="padding:12px 16px;border-top:1px solid var(--border)"><span class="small muted">${marcados.length} de ${pend.length} marcados</span>
        <button class="btn primary" disabled=${!marcados.length || enviando} onClick=${devolver}><${Icone} n="volta" s=${16} />${enviando ? 'Registrando…' : `Registrar devolução (${marcados.length})`}</button></div>
    </div>`}

    ${itens.some((i) => i.devolvido_em) && html`<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h3>Já devolvidos</h3></div><div class="list">
      ${itens.filter((i) => i.devolvido_em).map((i) => html`<a class="li" key=${i.id} href=${'#/equipamento/' + i.equipamento_id}>
        <div class="grow"><div class="t ellipsis">${i.e?.nome}</div><div class="s"><span class="mono">${i.e?.codigo}</span> · ${fmtData(i.devolvido_em, true)} · recebido por ${nomePerfil(perfilPorId(i.recebido_por)) || '—'}${i.obs_retorno ? ' · ' + i.obs_retorno : ''}</div></div>
        <span class=${'badge ' + (i.condicao_retorno === 'danificado' ? 'b-manutencao' : 'b-disponivel')}>${CONDICAO[i.condicao_retorno] || 'OK'}</span></a>`)}</div></div>`}
    ${prazo && html`<${AlterarPrazo} r=${r} onClose=${() => { setPrazo(false); recarregar(); }} />`}
  </div>`;
}

function AlterarPrazo({ r, onClose }) {
  const [v, setV] = useState(paraLocalInput(r.previsao_retorno));
  const [obs, setObs] = useState(r.obs || '');
  const salvar = async () => { if (await acao(() => q(sb.from('retiradas').update({ previsao_retorno: deLocalInput(v), obs: obs.trim() || null }).eq('id', r.id)), 'Prazo atualizado.')) onClose(); };
  return html`<${Modal} titulo="Alterar prazo de retorno" onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar</button>`}>
    <div class="stack"><${Campo} rotulo="Nova previsão"><input class="input" type="datetime-local" value=${v} onInput=${(e) => setV(e.target.value)} /><//>
    <${Campo} rotulo="Observações"><input class="input" value=${obs} onInput=${(e) => setObs(e.target.value)} /><//></div><//>`;
}
