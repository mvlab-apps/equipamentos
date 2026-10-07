import { html, useState, useMemo, sb, useStore, q, acao, toast, isAdmin, fmtData, fmtMoeda, numeroBR, eqPorId, nomePerfil, perfilPorId, Icone, Campo, Modal, Vazio, Busca } from './core.js';
import { buscarEquip } from './picker.js';
import { ReportarProblema } from './equipamentos.js';

export function Manutencao() {
  const st = useStore();
  const [aba, setAba] = useState('aberta');
  const [concluir, setConcluir] = useState(null);
  const [novo, setNovo] = useState(false);
  const [eqSel, setEqSel] = useState(null);
  const lista = st.manutencoes.filter((m) => m.status === aba);
  const custoAno = st.manutencoes.filter((m) => m.status === 'concluida' && (m.concluida_em || '').slice(0, 4) === String(new Date().getFullYear())).reduce((s, m) => s + (Number(m.custo) || 0), 0);
  return html`<div>
    <div class="page-head"><div><h1>Manutenção</h1><p>Reparos, limpezas e revisões. Itens devolvidos danificados entram aqui automaticamente.${isAdmin() && custoAno ? ` Gasto em ${new Date().getFullYear()}: ${fmtMoeda(custoAno)}.` : ''}</p></div>
      <button class="btn primary" onClick=${() => setNovo(true)}><${Icone} n="alerta" s=${16} />Reportar problema</button></div>
    <div class="tabs"><button class=${'tab' + (aba === 'aberta' ? ' on' : '')} onClick=${() => setAba('aberta')}>Abertas (${st.manutencoes.filter((m) => m.status === 'aberta').length})</button>
      <button class=${'tab' + (aba === 'concluida' ? ' on' : '')} onClick=${() => setAba('concluida')}>Concluídas</button></div>
    <div class="card flush"><div class="list">
      ${lista.map((m) => { const e = eqPorId(m.equipamento_id); return html`<div class="li" key=${m.id} style="flex-wrap:wrap">
        <a class="grow" href=${e ? '#/equipamento/' + e.id : '#'} style="color:inherit;min-width:220px"><div class="t">${e ? e.nome : 'Item removido'} ${e && html`<span class="mono faint">${e.codigo}</span>`}</div>
          <div class="s">${m.descricao}</div>
          <div class="s">Aberta ${fmtData(m.aberta_em)} por ${nomePerfil(perfilPorId(m.criado_por)) || '—'}${m.fornecedor ? ' · ' + m.fornecedor : ''}${m.status === 'concluida' ? ` · concluída ${fmtData(m.concluida_em)}${m.solucao ? ': ' + m.solucao : ''}${m.custo ? ' · ' + fmtMoeda(m.custo) : ''}` : ''}</div></a>
        ${m.status === 'aberta' && isAdmin() && html`<button class="btn sm" onClick=${() => setConcluir(m)}><${Icone} n="check" s=${15} />Concluir</button>`}
      </div>`; })}
      ${!lista.length && html`<${Vazio} titulo=${aba === 'aberta' ? 'Nenhuma manutenção aberta' : 'Nada concluído ainda'} />`}
    </div></div>
    ${concluir && html`<${Concluir} m=${concluir} onClose=${() => setConcluir(null)} />`}
    ${novo && !eqSel && html`<${EscolherItem} onClose=${() => setNovo(false)} onEscolher=${(e) => setEqSel(e)} />`}
    ${eqSel && html`<${ReportarProblema} eq=${eqSel} onClose=${() => { setEqSel(null); setNovo(false); }} />`}
  </div>`;
}

function EscolherItem({ onClose, onEscolher }) {
  const st = useStore();
  const [t, setT] = useState('');
  const l = useMemo(() => buscarEquip(st.equipamentos.filter((e) => e.status !== 'baixado'), t).slice(0, 50), [t]);
  return html`<${Modal} titulo="Qual equipamento?" onClose=${onClose}><div class="stack"><${Busca} valor=${t} onInput=${setT} autoFocus placeholder="Buscar…" />
    <div class="picker-results list">${l.map((e) => html`<div class="li click" key=${e.id} onClick=${() => onEscolher(e)}><div class="grow"><div class="t">${e.nome}</div><div class="s mono">${e.codigo}</div></div></div>`)}</div></div><//>`;
}

function Concluir({ m, onClose }) {
  const [f, setF] = useState({ solucao: '', custo: '', fornecedor: m.fornecedor || '', liberar: true });
  const salvar = async () => {
    const ok = await acao(async () => {
      if (f.fornecedor !== (m.fornecedor || '')) await q(sb.from('manutencoes').update({ fornecedor: f.fornecedor || null }).eq('id', m.id));
      await q(sb.rpc('concluir_manutencao', { p_id: m.id, p_solucao: f.solucao, p_custo: numeroBR(f.custo), p_liberar: f.liberar }));
    }, 'Manutenção concluída.');
    if (ok) onClose();
  };
  return html`<${Modal} titulo="Concluir manutenção" onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Concluir</button>`}>
    <div class="stack"><div class="muted">${m.descricao}</div>
      <${Campo} rotulo="O que foi feito"><textarea class="input" value=${f.solucao} onInput=${(e) => setF({ ...f, solucao: e.target.value })}></textarea><//>
      <div class="grid-form"><${Campo} rotulo="Custo (R$)"><input class="input" inputmode="decimal" value=${f.custo} onInput=${(e) => setF({ ...f, custo: e.target.value })} /><//>
        <${Campo} rotulo="Assistência / fornecedor"><input class="input" value=${f.fornecedor} onInput=${(e) => setF({ ...f, fornecedor: e.target.value })} /><//></div>
      <label class="check"><input type="checkbox" checked=${f.liberar} onChange=${(e) => setF({ ...f, liberar: e.target.checked })} />Liberar o item (volta a ficar disponível)</label></div><//>`;
}
