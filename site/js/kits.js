import {
  html, useState, useMemo, sb, useStore, ir, q, acao, toast, confirmar, isAdmin, normalizar,
  Icone, Badge, Campo, Modal, Vazio, Busca, qrSvg, urlKit, imprimir, EMPRESA, carregarTudo,
} from './core.js';
import { buscarEquip } from './picker.js';
import { imprimirEtiquetas } from './equipamentos.js';

function resumoKit(k, eqs) {
  const m = eqs.filter((e) => e.kit_id === k.id);
  const disp = m.filter((e) => e.status === 'disponivel').length;
  const uso = m.filter((e) => e.status === 'em_uso').length;
  let sit = 'disponivel', rot = 'Completo';
  if (!m.length) { sit = 'baixado'; rot = 'Vazio'; }
  else if (uso === m.length) { sit = 'em_uso'; rot = 'Em uso'; }
  else if (disp < m.length) { sit = 'manutencao'; rot = `Parcial ${disp}/${m.length}`; }
  return { membros: m, disp, uso, sit, rot };
}

export function ListaKits() {
  const st = useStore();
  const [termo, setTermo] = useState('');
  const [form, setForm] = useState(null);
  const lista = st.kits.filter((k) => normalizar(k.nome + ' ' + (k.codigo || '') + ' ' + (k.descricao || '')).includes(normalizar(termo)));
  return html`<div>
    <div class="page-head"><div><h1>Kits</h1><p>Conjuntos que saem juntos (ex.: luz + tripé + softbox). Ao retirar um kit, todos os itens disponíveis entram na saída.</p></div>
      ${isAdmin() && html`<button class="btn primary" onClick=${() => setForm({})}><${Icone} n="mais" s=${16} />Novo kit</button>`}</div>
    <div class="row" style="margin-bottom:14px"><${Busca} valor=${termo} onInput=${setTermo} placeholder="Buscar kit…" /></div>
    <div class="cols" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
      ${lista.map((k) => { const r = resumoKit(k, st.equipamentos); return html`<a class="card" key=${k.id} href=${'#/kit/' + k.id} style="color:inherit;text-decoration:none">
        <div class="row between nw"><h3 class="ellipsis">${k.nome}</h3><span class=${'badge b-' + r.sit}>${r.rot}</span></div>
        <div class="small muted" style="margin:4px 0 10px">${k.codigo ? html`<span class="mono">${k.codigo}</span> · ` : ''}${r.membros.length} itens</div>
        <div class="small" style="color:var(--muted);line-height:1.6">${r.membros.slice(0, 5).map((e) => e.nome).join(' · ')}${r.membros.length > 5 ? ` · +${r.membros.length - 5}` : ''}</div>
      </a>`; })}
    </div>
    ${!lista.length && html`<div class="card"><${Vazio} titulo="Nenhum kit">${isAdmin() ? 'Crie um kit e adicione os itens que saem juntos.' : ''}<//></div>`}
    ${form && html`<${FormKit} inicial=${form} onClose=${() => setForm(null)} />`}
  </div>`;
}

function FormKit({ inicial, onClose }) {
  const [f, setF] = useState({ nome: inicial.nome || '', codigo: inicial.codigo || '', descricao: inicial.descricao || '' });
  const salvar = async () => {
    if (!f.nome.trim()) return toast('Informe o nome do kit.', 'erro');
    const reg = { nome: f.nome.trim(), codigo: f.codigo.trim().toUpperCase() || null, descricao: f.descricao.trim() || null };
    const r = await acao(() => inicial.id ? q(sb.from('kits').update(reg).eq('id', inicial.id).select().single()) : q(sb.from('kits').insert(reg).select().single()), 'Kit salvo.');
    if (r) { await carregarTudo(); onClose(); if (!inicial.id) ir('/kit/' + r.id); }
  };
  return html`<${Modal} titulo=${inicial.id ? 'Editar kit' : 'Novo kit'} onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar</button>`}>
    <div class="stack">
      <${Campo} rotulo="Nome" obrig><input class="input" value=${f.nome} onInput=${(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Kit Luz Amaran 1" autofocus /><//>
      <${Campo} rotulo="Código (para etiqueta)"><input class="input mono" value=${f.codigo} onInput=${(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ex.: KIT-LUZ-1" /><//>
      <${Campo} rotulo="Descrição / checklist"><textarea class="input" value=${f.descricao} onInput=${(e) => setF({ ...f, descricao: e.target.value })} placeholder="O que deve voltar no case, ordem de montagem…"></textarea><//>
    </div><//>`;
}

export function KitPorCodigo({ codigo }) {
  const st = useStore();
  const k = st.kits.find((x) => (x.codigo || '').toUpperCase() === codigo.toUpperCase());
  return k ? html`<${DetalheKit} id=${k.id} />` : html`<${Vazio} titulo=${'Kit ' + codigo + ' não encontrado'} />`;
}

export function DetalheKit({ id }) {
  const st = useStore();
  const k = st.kits.find((x) => x.id === id);
  const [editar, setEditar] = useState(false);
  const [add, setAdd] = useState(false);
  if (!k) return html`<${Vazio} titulo="Kit não encontrado"><a href="#/kits">Voltar</a><//>`;
  const r = resumoKit(k, st.equipamentos);
  const remover = async (e) => { await acao(() => q(sb.from('kit_itens').delete().eq('equipamento_id', e.id).eq('kit_id', k.id)), 'Item removido do kit.'); };
  const excluir = async () => {
    if (!(await confirmar(`Excluir o kit "${k.nome}"? Os equipamentos continuam cadastrados.`, { perigo: true, ok: 'Excluir kit' }))) return;
    if (await acao(() => q(sb.from('kits').delete().eq('id', k.id)), 'Kit excluído.')) ir('/kits');
  };
  const etiqueta = () => imprimir(html`<div class="labels"><div class="label"><span dangerouslySetInnerHTML=${{ __html: qrSvg(urlKit(k.codigo || k.id)) }}></span>
    <div><div class="le">${EMPRESA} · KIT</div><div class="lc">${k.codigo || ''}</div><div class="ln">${k.nome} (${r.membros.length} itens)</div></div></div></div>`);
  const disponiveis = r.membros.filter((e) => e.status === 'disponivel');
  return html`<div>
    <a class="crumb" href="#/kits">← Kits</a>
    <div class="page-head"><div><div class="row" style="gap:8px"><h1>${k.nome}</h1><span class=${'badge b-' + r.sit}>${r.rot}</span></div>
      <p>${k.codigo ? html`<span class="mono">${k.codigo}</span> · ` : ''}${r.membros.length} itens</p></div>
      <div class="row">
        ${disponiveis.length > 0 && html`<a class="btn primary" href=${'#/saida/nova?kit=' + k.id}><${Icone} n="saida" s=${16} />Retirar kit</a>`}
        <button class="btn" onClick=${() => (k.codigo ? etiqueta() : toast('Defina um código para o kit antes de imprimir a etiqueta.', 'erro'))}><${Icone} n="qr" s=${16} />Etiqueta do kit</button>
        <button class="btn" onClick=${() => r.membros.length && imprimirEtiquetas(r.membros)}><${Icone} n="impressora" s=${16} />Etiquetas dos itens</button>
        ${isAdmin() && html`<button class="btn icon" title="Editar" onClick=${() => setEditar(true)}><${Icone} n="editar" /></button>`}
      </div></div>
    ${k.descricao && html`<div class="card" style="margin-bottom:16px;white-space:pre-line">${k.descricao}</div>`}
    <div class="card flush">
      <div class="card-head" style="padding:14px 16px 0"><h3>Itens do kit</h3>${isAdmin() && html`<button class="btn sm" onClick=${() => setAdd(true)}><${Icone} n="mais" s=${15} />Adicionar itens</button>`}</div>
      <div class="list">${r.membros.map((e) => html`<div class="li" key=${e.id}>
        <a class="grow" href=${'#/equipamento/' + e.id} style="color:inherit"><div class="t">${e.nome}</div><div class="s"><span class="mono">${e.codigo}</span>${e.status === 'em_uso' ? ' · com ' + e.responsavel_nome : ''}</div></a>
        <${Badge} e=${e} />
        ${isAdmin() && html`<button class="btn ghost sm icon" aria-label="Remover do kit" onClick=${() => remover(e)}><${Icone} n="x" s=${15} /></button>`}</div>`)}
        ${!r.membros.length && html`<${Vazio} titulo="Kit vazio">Adicione os equipamentos que compõem este kit.<//>`}</div>
    </div>
    ${isAdmin() && html`<button class="btn danger sm" style="margin-top:16px" onClick=${excluir}><${Icone} n="lixo" s=${15} />Excluir kit</button>`}
    ${editar && html`<${FormKit} inicial=${k} onClose=${() => setEditar(false)} />`}
    ${add && html`<${AdicionarAoKit} kit=${k} onClose=${() => setAdd(false)} />`}
  </div>`;
}

function AdicionarAoKit({ kit, onClose }) {
  const st = useStore();
  const [termo, setTermo] = useState('');
  const [sel, setSel] = useState(new Set());
  const lista = useMemo(() => buscarEquip(st.equipamentos.filter((e) => e.kit_id !== kit.id && e.status !== 'baixado'), termo).slice(0, 80), [termo, st.equipamentos]);
  const tg = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const salvar = async () => {
    const ids = [...sel];
    const ok = await acao(async () => {
      await q(sb.from('kit_itens').delete().in('equipamento_id', ids));
      await q(sb.from('kit_itens').insert(ids.map((id) => ({ kit_id: kit.id, equipamento_id: id }))));
    }, `${ids.length} item(ns) adicionados ao kit.`);
    if (ok) onClose();
  };
  return html`<${Modal} largo titulo=${'Adicionar ao ' + kit.nome} onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" disabled=${!sel.size} onClick=${salvar}>Adicionar ${sel.size || ''}</button>`}>
    <div class="stack"><${Busca} valor=${termo} onInput=${setTermo} autoFocus placeholder="Buscar equipamento…" />
      <div class="small muted">Cada item pertence a um único kit; se já estiver em outro, será movido.</div>
      <div class="picker-results list">${lista.map((e) => html`<label class="li click" key=${e.id}><input type="checkbox" class="check" checked=${sel.has(e.id)} onChange=${() => tg(e.id)} />
        <div class="grow"><div class="t">${e.nome}</div><div class="s"><span class="mono">${e.codigo}</span> · ${e.categoria}${e.kit_nome ? html` · <span style="color:var(--warn)">no ${e.kit_nome}</span>` : ''}</div></div></label>`)}</div></div><//>`;
}
