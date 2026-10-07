import { html, useStore, ir, fmtData, fmtRelativo, fmtMoeda, hojeISO, isAdmin, Icone, Vazio, Responsavel, perfilPorId, eqPorId } from './core.js';

export function Painel() {
  const st = useStore();
  const eq = st.equipamentos.filter((e) => e.status !== 'baixado');
  const n = (s) => eq.filter((e) => e.status === s).length;
  const agora = new Date();
  const atrasadas = st.retiradas.filter((r) => r.previsao_retorno && new Date(r.previsao_retorno) < agora);
  const hoje = hojeISO(); const em7 = hojeISO(new Date(Date.now() + 7 * 86400000));
  const proxReservas = st.reservas.filter((r) => r.inicio <= em7).slice(0, 6);
  const garantia = eq.filter((e) => e.garantia_ate && e.garantia_ate >= hoje && e.garantia_ate <= hojeISO(new Date(Date.now() + 60 * 86400000)));
  const semSerie = eq.filter((e) => !e.numero_serie && Number(e.valor_compra) >= 500).length;
  const semNF = eq.filter((e) => !e.nf_numero).length;
  const semValor = eq.filter((e) => e.valor_compra === null || e.valor_compra === undefined).length;
  const manAbertas = st.manutencoes.filter((m) => m.status === 'aberta');
  const patrimonio = eq.reduce((s, e) => s + (Number(e.valor_compra) || 0), 0);
  const emUsoValor = eq.filter((e) => e.status === 'em_uso').reduce((s, e) => s + (Number(e.valor_compra) || 0), 0);
  const minhas = st.retiradas.filter((r) => r.responsavel_id === st.perfil.id);

  const kpi = (v, l, cor, href) => html`<button class="kpi" onClick=${() => ir(href)}><div class="v">${v}</div><div class="l"><span class="dot" style=${'background:' + cor}></span>${l}</div></button>`;
  const CardSaida = ({ r }) => {
    const pend = r.retirada_itens.filter((i) => !i.devolvido_em).length;
    const atras = r.previsao_retorno && new Date(r.previsao_retorno) < agora;
    return html`<a class="li" href=${'#/saida/' + r.id}>
      <div class="grow"><div class="t ellipsis">#${r.numero} · <${Responsavel} id=${r.responsavel_id} nome=${r.responsavel_nome} />${r.projeto ? ' · ' + r.projeto : ''}</div>
        <div class="s">${pend} ${pend === 1 ? 'item' : 'itens'} · saiu ${fmtData(r.saida_em)} · volta ${r.previsao_retorno ? fmtData(r.previsao_retorno, true) : 'sem previsão'}</div></div>
      ${atras ? html`<span class="badge b-atrasado">Atrasado ${fmtRelativo(r.previsao_retorno).replace('há ', '')}</span>` : html`<span class="badge b-em_uso">${r.previsao_retorno ? fmtRelativo(r.previsao_retorno) : 'em uso'}</span>`}
    </a>`;
  };

  return html`<div>
    <div class="page-head"><div><h1>Olá, ${(st.perfil.nome || '').split(' ')[0] || 'equipe'}</h1><p>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      <div class="row"><a class="btn" href="#/reservas?nova=1"><${Icone} n="agenda" s=${16} />Reservar</a><a class="btn primary" href="#/saida/nova"><${Icone} n="saida" s=${16} />Nova saída</a></div></div>

    <div class="kpis">
      ${kpi(eq.length, 'Itens ativos', 'var(--gold)', '/equipamentos')}
      ${kpi(n('disponivel'), 'Disponíveis', 'var(--ok)', '/equipamentos?status=disponivel')}
      ${kpi(n('em_uso'), 'Em uso', 'var(--use)', '/equipamentos?status=em_uso')}
      ${kpi(atrasadas.length, 'Saídas atrasadas', 'var(--bad)', '/saidas')}
      ${kpi(n('manutencao'), 'Em manutenção', 'var(--warn)', '/manutencao')}
    </div>

    ${minhas.length > 0 && html`<div class="alert info" style="margin-bottom:16px"><${Icone} n="relogio" />
      <div>Você está com ${minhas.reduce((s, r) => s + r.retirada_itens.filter((i) => !i.devolvido_em).length, 0)} item(ns) em ${minhas.length} saída(s). <a href="#/saidas?minhas=1">Ver minhas saídas</a></div></div>`}

    <div class="cols-2-1">
      <div class="stack lg">
        ${atrasadas.length > 0 && html`<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2 style="color:var(--bad)"><${Icone} n="alerta" />Devoluções atrasadas</h2></div>
          <div class="list">${atrasadas.map((r) => html`<${CardSaida} key=${r.id} r=${r} />`)}</div></div>`}
        <div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Fora da base agora</h2><a class="small" href="#/saidas">Todas →</a></div>
          <div class="list">${st.retiradas.filter((r) => !atrasadas.includes(r)).slice(0, 10).map((r) => html`<${CardSaida} key=${r.id} r=${r} />`)}
            ${st.retiradas.length === 0 && html`<${Vazio} titulo="Tudo na base">Nenhum equipamento fora no momento.<//>`}</div></div>
        <div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Próximas reservas (7 dias)</h2><a class="small" href="#/reservas">Agenda →</a></div>
          <div class="list">${proxReservas.map((r) => html`<a class="li" key=${r.id} href=${'#/reservas?ver=' + r.id}>
              <div class="grow"><div class="t">${r.titulo}${r.cliente ? html` <span class="muted">· ${r.cliente}</span>` : ''}</div>
                <div class="s">${fmtData(r.inicio)}${r.fim !== r.inicio ? ' → ' + fmtData(r.fim) : ''} · ${r.reserva_itens.length} itens · ${r.responsavel_nome || '—'}</div></div>
              <span class="badge b-reservado">${r.inicio <= hoje ? 'hoje' : fmtRelativo(r.inicio)}</span></a>`)}
            ${!proxReservas.length && html`<${Vazio} titulo="Sem reservas próximas" />`}</div></div>
      </div>
      <div class="stack lg">
        ${isAdmin() && html`<div class="card"><div class="small muted">Patrimônio cadastrado</div><div style="font-size:24px;font-weight:700">${fmtMoeda(patrimonio)}</div>
          <div class="small muted" style="margin-top:6px">${fmtMoeda(emUsoValor)} fora da base agora</div></div>`}
        <div class="card"><div class="card-head"><h3>Atenção</h3></div><div class="stack" style="gap:10px">
          ${manAbertas.length > 0 && html`<a class="row nw" href="#/manutencao"><span class="badge b-manutencao">${manAbertas.length}</span><span>manutenções abertas</span></a>`}
          ${garantia.length > 0 && html`<a class="row nw" href="#/equipamentos?alerta=garantia"><span class="badge b-reservado">${garantia.length}</span><span>garantias vencem em 60 dias</span></a>`}
          ${semNF > 0 && html`<a class="row nw" href="#/equipamentos?alerta=sem_nf"><span class="badge b-neutro">${semNF}</span><span>itens sem nº de nota fiscal</span></a>`}
          ${semValor > 0 && html`<a class="row nw" href="#/equipamentos?alerta=sem_valor"><span class="badge b-neutro">${semValor}</span><span>itens sem valor de compra</span></a>`}
          ${semSerie > 0 && html`<a class="row nw" href="#/equipamentos?alerta=sem_serie"><span class="badge b-neutro">${semSerie}</span><span>itens acima de R$ 500 sem nº de série</span></a>`}
          ${!manAbertas.length && !garantia.length && !semNF && !semValor && !semSerie && html`<span class="muted">Nada pendente.</span>`}
        </div></div>
        ${manAbertas.length > 0 && html`<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h3>Em manutenção</h3></div><div class="list">
          ${manAbertas.slice(0, 5).map((m) => { const e = eqPorId(m.equipamento_id); return e && html`<a class="li" key=${m.id} href=${'#/equipamento/' + e.id}><div class="grow"><div class="t ellipsis">${e.nome}</div><div class="s ellipsis">${m.descricao}</div></div></a>`; })}</div></div>`}
      </div>
    </div>
  </div>`;
}
