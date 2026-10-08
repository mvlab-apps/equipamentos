// Movimentações: empréstimos em aberto e histórico de transferências (com termo para assinatura)
import {
  html, useState, useEffect, sb, useStore, q, toast, msgErro, fmtData, fmtRelativo, nomePessoa, nomePerfil, perfilPorId,
  Icone, Modal, Vazio, Busca, imprimir, EMPRESA, normalizar, kitPorId,
} from './core.js';
import { MoverModal } from './quadro.js';

const ROT = { transferir: 'Transferência', emprestar: 'Empréstimo', devolver: 'Devolução' };

export function Movimentos() {
  const st = useStore();
  const [aba, setAba] = useState('emprestimos');
  const [hist, setHist] = useState(null);
  const [termo, setTermo] = useState('');
  const [ver, setVer] = useState(null);
  const [devolver, setDevolver] = useState(null);
  useEffect(() => {
    if (aba !== 'historico') return;
    q(sb.from('movimentos').select('*, movimento_itens(*)').order('criado_em', { ascending: false }).limit(300)).then(setHist).catch((e) => toast(msgErro(e), 'erro'));
  }, [aba, st.atualizadoEm]);

  const emprestados = st.equipamentos.filter((e) => e.emprestado && e.portador_id);
  const grupos = {};
  emprestados.forEach((e) => (grupos[e.portador_id] = grupos[e.portador_id] || []).push(e));

  const filtrados = (hist || []).filter((m) => normalizar(`${m.numero} ${ROT[m.tipo]} ${nomePessoa(m.para_pessoa_id)} ${m.projeto || ''}`).includes(normalizar(termo)));

  return html`<div>
    <div class="page-head"><div><h1>Movimentações</h1><p>Empréstimos que precisam voltar e o histórico de quem passou o quê para quem.</p></div>
      <a class="btn primary" href="#/mover"><${Icone} n="saida" s=${16} />Mover itens</a></div>
    <div class="tabs"><button class=${'tab' + (aba === 'emprestimos' ? ' on' : '')} onClick=${() => setAba('emprestimos')}>Empréstimos em aberto (${emprestados.length})</button>
      <button class=${'tab' + (aba === 'historico' ? ' on' : '')} onClick=${() => setAba('historico')}>Histórico</button></div>

    ${aba === 'emprestimos' && html`<div class="stack lg">
      ${Object.entries(grupos).map(([pid, arr]) => html`<div class="card flush" key=${pid}>
        <div class="card-head" style="padding:14px 16px 0"><h3>Com ${nomePessoa(pid)} <span class="badge b-neutro plain">${arr.length}</span></h3>
          <button class="btn sm" onClick=${() => setDevolver(arr)}><${Icone} n="volta" s=${15} />Devolver tudo</button></div>
        <div class="list">${arr.sort((a, b) => (a.emprestimo_ate || 'z').localeCompare(b.emprestimo_ate || 'z')).map((e) => html`<div class="li" key=${e.id}>
          <a class="grow" href=${'#/equipamento/' + e.id} style="color:inherit"><div class="t ellipsis">${e.nome}</div>
            <div class="s"><span class="mono">${e.codigo}</span> · de ${e.titular_nome || 'base'}${e.emprestimo_projeto ? ' · ' + e.emprestimo_projeto : ''}</div></a>
          <span class=${'badge ' + (e.atrasado ? 'b-atrasado' : 'b-emprestado')}>${e.emprestimo_ate ? (e.atrasado ? 'venceu ' : 'volta ') + fmtRelativo(e.emprestimo_ate) : 'sem prazo'}</span>
          <button class="btn ghost sm" onClick=${() => setDevolver([e])}>Devolver</button></div>`)}</div></div>`)}
      ${!emprestados.length && html`<div class="card"><${Vazio} titulo="Nenhum empréstimo em aberto">Tudo está com o titular ou na base.<//></div>`}
    </div>`}

    ${aba === 'historico' && html`<div>
      <div class="row" style="margin-bottom:12px"><${Busca} valor=${termo} onInput=${setTermo} placeholder="Nº, pessoa, projeto…" /></div>
      <div class="card flush"><div class="list">
        ${hist === null && html`<div class="empty">Carregando…</div>`}
        ${filtrados.map((m) => html`<div class="li click" key=${m.id} onClick=${() => setVer(m)}>
          <div class="mono faint" style="width:44px">#${m.numero}</div>
          <div class="grow"><div class="t ellipsis">${ROT[m.tipo]}${m.tipo === 'devolver' ? '' : ' → ' + nomePessoa(m.para_pessoa_id)}${m.projeto ? html` <span class="muted">· ${m.projeto}</span>` : ''}</div>
            <div class="s">${fmtData(m.criado_em, true)} · ${m.movimento_itens.length} itens · por ${nomePerfil(perfilPorId(m.criado_por)) || '—'}${m.ate ? ' · até ' + fmtData(m.ate, true) : ''}</div></div>
          <span class=${'badge ' + (m.tipo === 'emprestar' ? 'b-emprestado' : m.tipo === 'devolver' ? 'b-ok' : 'b-com')}>${ROT[m.tipo]}</span></div>`)}
        ${hist && !filtrados.length && html`<${Vazio} titulo="Nada encontrado" />`}
      </div></div></div>`}

    ${ver && html`<${VerMovimento} m=${ver} onClose=${() => setVer(null)} />`}
    ${devolver && html`<${MoverModal} itens=${devolver.map((e) => ({ equipamento_id: e.id, kit_id: e.kit_id }))} tipo="devolver" onClose=${() => setDevolver(null)} />`}
  </div>`;
}

function VerMovimento({ m, onClose }) {
  const st = useStore();
  const itens = m.movimento_itens.map((i) => ({ ...i, e: st.equipamentos.find((x) => x.id === i.equipamento_id) }));
  const termo = () => imprimir(html`<div class="doc">
    <div style="display:flex;justify-content:space-between;align-items:flex-end"><h1>Termo de ${ROT[m.tipo].toLowerCase()} de equipamentos · #${m.numero}</h1><b>${EMPRESA}</b></div>
    <div class="meta">
      <div><b>${m.tipo === 'devolver' ? 'Devolvido aos titulares' : 'Para: ' + nomePessoa(m.para_pessoa_id)}</b></div>
      <div><b>Data:</b> ${fmtData(m.criado_em, true)}</div>
      <div><b>Projeto:</b> ${m.projeto || '—'}</div><div><b>${m.ate ? 'Devolver até: ' + fmtData(m.ate, true) : ''}</b></div>
    </div>
    <table><thead><tr><th>✓</th><th>Código</th><th>Equipamento</th><th>Nº série</th><th>Kit</th><th>De</th><th>Para</th></tr></thead>
      <tbody>${itens.map((i) => html`<tr><td style="width:10mm"></td><td>${i.e?.codigo}</td><td>${i.e?.nome}</td><td>${i.e?.numero_serie || ''}</td><td>${i.kit_id ? kitPorId(i.kit_id)?.nome || '' : ''}</td><td>${nomePessoa(i.de_pessoa_id)}</td><td>${nomePessoa(i.para_pessoa_id)}</td></tr>`)}</tbody></table>
    <div class="terms">Declaro ter recebido os equipamentos acima em bom estado de funcionamento, comprometendo-me a zelar por sua guarda e conservação${m.ate ? ' e a devolvê-los na data indicada' : ''}. Danos, perdas ou extravios devem ser comunicados imediatamente.</div>
    <div class="sign"><div>Quem recebe</div><div>Quem entrega</div></div></div>`);
  return html`<${Modal} largo titulo=${`${ROT[m.tipo]} #${m.numero}`} onClose=${onClose}
    rodape=${html`<button class="btn" onClick=${termo}><${Icone} n="impressora" s=${16} />Imprimir termo</button><button class="btn primary" onClick=${onClose}>Fechar</button>`}>
    <div class="stack">
      <div class="small muted">${fmtData(m.criado_em, true)} · por ${nomePerfil(perfilPorId(m.criado_por)) || '—'}${m.projeto ? ' · ' + m.projeto : ''}${m.ate ? ' · até ' + fmtData(m.ate, true) : ''}${m.obs ? ' · ' + m.obs : ''}</div>
      <div class="card flush"><div class="list">${itens.map((i) => html`<a class="li" key=${i.id} href=${'#/equipamento/' + i.equipamento_id} onClick=${onClose}>
        <div class="grow"><div class="t ellipsis">${i.e?.nome || 'Item removido'}</div><div class="s mono">${i.e?.codigo || ''}</div></div>
        <span class="small muted nowrap">${nomePessoa(i.de_pessoa_id)} → ${nomePessoa(i.para_pessoa_id)}</span></a>`)}</div></div>
    </div><//>`;
}
