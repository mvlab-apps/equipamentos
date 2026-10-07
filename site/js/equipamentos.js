import {
  html, useState, useEffect, useMemo, sb, store, useStore, ir, q, acao, toast, confirmar, msgErro, isAdmin,
  STATUS, CONDICAO, TIPO_ANEXO, CATEGORIAS_SUGERIDAS, fmtData, fmtMoeda, fmtRelativo, hojeISO, numeroBR, dataBR, normalizar,
  Icone, Badge, Campo, Modal, Vazio, Busca, Foto, urlArquivo, enviarArquivo, qrSvg, urlItem, imprimir, lerCSV, gerarCSV, baixar,
  Responsavel, EMPRESA, recarregarEmBreve, carregarTudo,
} from './core.js';
import { buscarEquip } from './picker.js';

const CAMPOS_TEXTO = ['codigo', 'nome', 'categoria', 'marca', 'modelo', 'numero_serie', 'localizacao', 'proprietario', 'fornecedor', 'nf_numero', 'seguro_apolice', 'tags', 'observacoes'];

// ================================================================== LISTA
export function ListaEquipamentos({ query }) {
  const st = useStore();
  const [termo, setTermo] = useState(query.q || '');
  const [status, setStatus] = useState(query.status || 'ativos');
  const [cat, setCat] = useState(query.categoria || '');
  const [sel, setSel] = useState(new Set());
  const [form, setForm] = useState(null);
  const [importar, setImportar] = useState(false);
  const alerta = query.alerta;
  useEffect(() => { if (query.status) setStatus(query.status); }, [query.status]);

  const categorias = useMemo(() => [...new Set(st.equipamentos.map((e) => e.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [st.equipamentos]);
  const lista = useMemo(() => {
    let l = st.equipamentos;
    if (status === 'ativos') l = l.filter((e) => e.status !== 'baixado');
    else if (status === 'atrasado') l = l.filter((e) => e.status === 'em_uso' && e.atrasado);
    else if (status === 'reservado') l = l.filter((e) => e.reserva_id);
    else if (status !== 'todos') l = l.filter((e) => e.status === status);
    if (cat) l = l.filter((e) => e.categoria === cat);
    const hoje = hojeISO(); const lim = hojeISO(new Date(Date.now() + 60 * 86400000));
    if (alerta === 'garantia') l = l.filter((e) => e.garantia_ate && e.garantia_ate >= hoje && e.garantia_ate <= lim);
    if (alerta === 'sem_nf') l = l.filter((e) => !e.nf_numero && e.status !== 'baixado');
    if (alerta === 'sem_valor') l = l.filter((e) => (e.valor_compra === null || e.valor_compra === undefined) && e.status !== 'baixado');
    if (alerta === 'sem_serie') l = l.filter((e) => !e.numero_serie && Number(e.valor_compra) >= 500 && e.status !== 'baixado');
    return buscarEquip(l, termo);
  }, [st.equipamentos, termo, status, cat, alerta]);

  const conta = (s) => st.equipamentos.filter((e) => (s === 'ativos' ? e.status !== 'baixado' : s === 'atrasado' ? e.status === 'em_uso' && e.atrasado : s === 'reservado' ? e.reserva_id : e.status === s)).length;
  const chips = [['ativos', 'Todos'], ['disponivel', 'Disponíveis'], ['em_uso', 'Em uso'], ['atrasado', 'Atrasados'], ['reservado', 'Com reserva'], ['manutencao', 'Manutenção'], ['extraviado', 'Extraviados'], ['baixado', 'Baixados']];
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const todosSel = lista.length > 0 && lista.every((e) => sel.has(e.id));

  const exportar = () => {
    const cab = ['codigo', 'nome', 'categoria', 'marca', 'modelo', 'numero_serie', 'status', 'condicao', 'localizacao', 'proprietario', 'valor_compra', 'valor_locacao', 'data_compra', 'fornecedor', 'nf_numero', 'garantia_ate', 'seguro_apolice', 'tags', 'kit', 'com_quem', 'projeto', 'previsao_retorno', 'observacoes'];
    const br = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    const linhas = lista.map((e) => [e.codigo, e.nome, e.categoria, e.marca, e.modelo, e.numero_serie, STATUS[e.status], CONDICAO[e.condicao], e.localizacao, e.proprietario, br(e.valor_compra), br(e.valor_locacao), e.data_compra, e.fornecedor, e.nf_numero, e.garantia_ate, e.seguro_apolice, e.tags, e.kit_nome, e.responsavel_nome, e.projeto, e.previsao_retorno ? fmtData(e.previsao_retorno, true) : '', e.observacoes]);
    baixar(`equipamentos-${hojeISO()}.csv`, gerarCSV(cab, linhas));
  };
  const etiquetas = () => {
    const alvo = st.equipamentos.filter((e) => sel.has(e.id));
    if (!alvo.length) return toast('Selecione os itens na lista (caixas à esquerda).', 'erro');
    imprimirEtiquetas(alvo);
  };

  return html`<div>
    <div class="page-head"><div><h1>Equipamentos</h1><p>${lista.length} de ${st.equipamentos.length} itens${alerta ? html` · filtro de alerta ativo <a href="#/equipamentos">limpar</a>` : ''}</p></div>
      <div class="row">
        <button class="btn" onClick=${exportar}><${Icone} n="baixar" s=${16} />Exportar CSV</button>
        ${isAdmin() && html`<button class="btn" onClick=${() => setImportar(true)}><${Icone} n="subir" s=${16} />Importar</button>
          <button class="btn primary" onClick=${() => setForm({})}><${Icone} n="mais" s=${16} />Novo equipamento</button>`}
      </div></div>
    <div class="stack" style="margin-bottom:14px">
      <div class="row"><${Busca} valor=${termo} onInput=${setTermo} placeholder="Buscar por nome, código, marca, série, tag…" />
        <select class="input" style="width:auto;min-width:170px" value=${cat} onChange=${(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>${categorias.map((c) => html`<option>${c}</option>`)}</select></div>
      <div class="chips">${chips.map(([k, r]) => html`<button class=${'chip' + (status === k ? ' on' : '')} onClick=${() => setStatus(k)}>${r} <span class="n">${conta(k)}</span></button>`)}</div>
    </div>
    ${sel.size > 0 && html`<div class="alert info row between" style="margin-bottom:12px"><span>${sel.size} selecionado(s)</span>
      <div class="row"><button class="btn sm" onClick=${etiquetas}><${Icone} n="qr" s=${15} />Imprimir etiquetas</button>
        <button class="btn sm" onClick=${() => { const ids = [...sel].filter((id) => store.get().equipamentos.find((e) => e.id === id)?.status === 'disponivel'); ir('/saida/nova?itens=' + ids.join(',')); }}><${Icone} n="saida" s=${15} />Retirar selecionados</button>
        <button class="btn ghost sm" onClick=${() => setSel(new Set())}>Limpar</button></div></div>`}
    <div class="card flush tbl-wrap">
      <table class="tbl"><thead><tr>
        <th style="width:36px"><input type="checkbox" class="check" checked=${todosSel} onChange=${() => setSel(todosSel ? new Set() : new Set(lista.map((e) => e.id)))} aria-label="Selecionar todos" /></th>
        <th>Equipamento</th><th class="hide-m">Categoria</th><th>Status</th><th class="hide-m">Com quem / onde</th>${isAdmin() && html`<th class="hide-m right">Valor</th>`}
      </tr></thead><tbody>
        ${lista.slice(0, 600).map((e) => html`<tr key=${e.id} class="click" onClick=${() => ir('/equipamento/' + e.id)}>
          <td onClick=${(ev) => ev.stopPropagation()}><input type="checkbox" class="check" checked=${sel.has(e.id)} onChange=${() => toggle(e.id)} aria-label=${'Selecionar ' + e.codigo} /></td>
          <td style="min-width:200px"><div style="font-weight:550">${e.nome}</div><div class="small muted"><span class="mono">${e.codigo}</span>${e.marca ? ' · ' + e.marca : ''}${e.kit_nome ? ' · ' + e.kit_nome : ''}</div></td>
          <td class="hide-m">${e.categoria}</td>
          <td><${Badge} e=${e} /></td>
          <td class="hide-m small">${e.status === 'em_uso' ? html`<b style="font-weight:550">${e.responsavel_nome}</b>${e.projeto ? html`<div class="muted">${e.projeto}</div>` : ''}`
            : html`<span class="muted">${e.localizacao || '—'}${e.reserva_inicio ? html`<div style="color:var(--res)">Reserva ${fmtData(e.reserva_inicio)}: ${e.reserva_titulo}</div>` : ''}</span>`}</td>
          ${isAdmin() && html`<td class="hide-m right nowrap">${fmtMoeda(e.valor_compra)}</td>`}
        </tr>`)}
      </tbody></table>
      ${!lista.length && html`<${Vazio} titulo=${st.equipamentos.length ? 'Nenhum item com esses filtros' : 'Inventário vazio'}>${!st.equipamentos.length && isAdmin() ? 'Cadastre o primeiro item ou importe sua planilha.' : ''}<//>`}
    </div>
    ${form && html`<${FormEquipamento} inicial=${form} onClose=${() => setForm(null)} />`}
    ${importar && html`<${Importar} onClose=${() => setImportar(false)} />`}
  </div>`;
}

export function imprimirEtiquetas(itens) {
  imprimir(html`<div class="labels">${itens.map((e) => html`<div class="label">
    <span dangerouslySetInnerHTML=${{ __html: qrSvg(urlItem(e.codigo)) }}></span>
    <div style="min-width:0"><div class="le">${EMPRESA}</div><div class="lc">${e.codigo}</div><div class="ln">${e.nome}</div></div></div>`)}</div>`);
}

// ================================================================== FORMULÁRIO
export function FormEquipamento({ inicial, onClose, onSalvo }) {
  const st = useStore();
  const editando = !!inicial.id;
  const [f, setF] = useState(() => ({
    codigo: '', nome: '', categoria: '', marca: '', modelo: '', numero_serie: '', status: 'disponivel', condicao: 'bom',
    localizacao: '', proprietario: 'MV LAB', valor_compra: '', valor_locacao: '', data_compra: '', fornecedor: '', nf_numero: '',
    garantia_ate: '', seguro_apolice: '', tags: '', observacoes: '', kit_id: '', ...Object.fromEntries(Object.entries(inicial).map(([k, v]) => [k, v ?? ''])),
  }));
  const [nf, setNf] = useState(null);
  const [foto, setFoto] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const categorias = [...new Set([...CATEGORIAS_SUGERIDAS, ...st.equipamentos.map((e) => e.categoria)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const locais = [...new Set(st.equipamentos.map((e) => e.localizacao).filter(Boolean))];

  const salvar = async (ev) => {
    ev.preventDefault();
    if (!f.nome.trim()) return toast('Informe o nome.', 'erro');
    setSalvando(true);
    try {
      const reg = {};
      CAMPOS_TEXTO.forEach((k) => (reg[k] = (f[k] || '').toString().trim() || null));
      reg.categoria = reg.categoria || 'Outros'; reg.proprietario = reg.proprietario || 'MV LAB';
      if (!editando && !reg.codigo) delete reg.codigo;
      reg.status = f.status; reg.condicao = f.condicao;
      reg.valor_compra = numeroBR(f.valor_compra); reg.valor_locacao = numeroBR(f.valor_locacao);
      reg.data_compra = f.data_compra || null; reg.garantia_ate = f.garantia_ate || null;
      if (foto) reg.foto_path = await enviarArquivo(foto, 'fotos');
      const salvo = editando
        ? await q(sb.from('equipamentos').update(reg).eq('id', inicial.id).select().single())
        : await q(sb.from('equipamentos').insert(reg).select().single());
      // kit
      const kitAntes = inicial.kit_id || '';
      if (f.kit_id !== kitAntes) {
        if (kitAntes) await q(sb.from('kit_itens').delete().eq('equipamento_id', salvo.id));
        if (f.kit_id) await q(sb.from('kit_itens').insert({ kit_id: f.kit_id, equipamento_id: salvo.id }));
      }
      if (nf) {
        const path = await enviarArquivo(nf, 'nf/' + salvo.id);
        await q(sb.from('anexos').insert({ equipamento_id: salvo.id, tipo: 'nota_fiscal', nome: nf.name, path, tamanho: nf.size, mime: nf.type }));
      }
      toast(editando ? 'Alterações salvas.' : `Cadastrado como ${salvo.codigo}.`, 'ok');
      await carregarTudo();
      onClose(); onSalvo ? onSalvo(salvo) : !editando && ir('/equipamento/' + salvo.id);
    } catch (e) { toast(msgErro(e), 'erro'); }
    setSalvando(false);
  };

  return html`<${Modal} largo titulo=${editando ? 'Editar ' + inicial.codigo : 'Novo equipamento'} onClose=${onClose}
    rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" disabled=${salvando} onClick=${salvar}>${salvando ? 'Salvando…' : 'Salvar'}</button>`}>
    <form class="stack lg" onSubmit=${salvar}>
      <datalist id="dl-cat">${categorias.map((c) => html`<option value=${c} />`)}</datalist>
      <datalist id="dl-loc">${locais.map((c) => html`<option value=${c} />`)}</datalist>
      <div><h3 style="margin-bottom:10px">Identificação</h3><div class="grid-form">
        <${Campo} rotulo="Nome" obrig cls="span-2"><input class="input" value=${f.nome} onInput=${set('nome')} placeholder="Ex.: Sony FX3" required autofocus /><//>
        <${Campo} rotulo="Código / patrimônio"><input class="input mono" value=${f.codigo} onInput=${set('codigo')} placeholder=${editando ? '' : 'Automático (MV-0001…)'} /><//>
        <${Campo} rotulo="Categoria"><input class="input" list="dl-cat" value=${f.categoria} onInput=${set('categoria')} placeholder="Escolha ou digite" /><//>
        <${Campo} rotulo="Marca"><input class="input" value=${f.marca} onInput=${set('marca')} /><//>
        <${Campo} rotulo="Modelo"><input class="input" value=${f.modelo} onInput=${set('modelo')} /><//>
        <${Campo} rotulo="Nº de série"><input class="input mono" value=${f.numero_serie} onInput=${set('numero_serie')} /><//>
        <${Campo} rotulo="Kit"><select class="input" value=${f.kit_id} onChange=${set('kit_id')}><option value="">— Nenhum —</option>${st.kits.map((k) => html`<option value=${k.id}>${k.nome}</option>`)}</select><//>
        <${Campo} rotulo="Tags (busca)" cls="span-2"><input class="input" value=${f.tags} onInput=${set('tags')} placeholder="ex.: lapela, wireless, 2.4ghz" /><//>
      </div></div>
      <div><h3 style="margin-bottom:10px">Situação</h3><div class="grid-form">
        <${Campo} rotulo="Status"><select class="input" value=${f.status} onChange=${set('status')} disabled=${f.status === 'em_uso'}>
          ${Object.entries(STATUS).filter(([k]) => k !== 'em_uso' || f.status === 'em_uso').map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select><//>
        <${Campo} rotulo="Condição"><select class="input" value=${f.condicao} onChange=${set('condicao')}>${Object.entries(CONDICAO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select><//>
        <${Campo} rotulo="Localização na base"><input class="input" list="dl-loc" value=${f.localizacao} onInput=${set('localizacao')} placeholder="Prateleira, case, sala…" /><//>
        <${Campo} rotulo="Proprietário"><input class="input" value=${f.proprietario} onInput=${set('proprietario')} placeholder="MV LAB ou terceiro (sublocado)" /><//>
      </div></div>
      <div><h3 style="margin-bottom:10px">Compra, nota fiscal e seguro</h3><div class="grid-form">
        <${Campo} rotulo="Valor de compra (R$)"><input class="input" inputmode="decimal" value=${f.valor_compra} onInput=${set('valor_compra')} placeholder="0,00" /><//>
        <${Campo} rotulo="Diária de locação (R$)"><input class="input" inputmode="decimal" value=${f.valor_locacao} onInput=${set('valor_locacao')} placeholder="0,00" /><//>
        <${Campo} rotulo="Data da compra"><input class="input" type="date" value=${f.data_compra} onInput=${set('data_compra')} /><//>
        <${Campo} rotulo="Fornecedor / loja"><input class="input" value=${f.fornecedor} onInput=${set('fornecedor')} /><//>
        <${Campo} rotulo="Nº da nota fiscal"><input class="input" value=${f.nf_numero} onInput=${set('nf_numero')} /><//>
        <${Campo} rotulo="Garantia até"><input class="input" type="date" value=${f.garantia_ate} onInput=${set('garantia_ate')} /><//>
        <${Campo} rotulo="Apólice de seguro"><input class="input" value=${f.seguro_apolice} onInput=${set('seguro_apolice')} /><//>
        <${Campo} rotulo="Anexar nota fiscal (PDF/foto)"><input class="input" style="padding-top:6px" type="file" accept="application/pdf,image/*,.xml" onChange=${(e) => setNf(e.target.files[0] || null)} /><//>
        <${Campo} rotulo=${editando && inicial.foto_path ? 'Trocar foto do item' : 'Foto do item'}><input class="input" style="padding-top:6px" type="file" accept="image/*" capture="environment" onChange=${(e) => setFoto(e.target.files[0] || null)} /><//>
      </div></div>
      <${Campo} rotulo="Observações"><textarea class="input" value=${f.observacoes} onInput=${set('observacoes')} placeholder="Acessórios que acompanham, cuidados, defeitos conhecidos…"></textarea><//>
    </form><//>`;
}

// ================================================================== DETALHE
export function PorCodigo({ codigo }) {
  const st = useStore();
  const e = st.equipamentos.find((x) => x.codigo.toUpperCase() === codigo.toUpperCase());
  if (!e) return html`<${Vazio} titulo=${'Etiqueta ' + codigo + ' não encontrada'}><a href="#/equipamentos">Ver equipamentos</a><//>`;
  return html`<${DetalheEquipamento} id=${e.id} />`;
}

export function DetalheEquipamento({ id }) {
  const st = useStore();
  const e = st.equipamentos.find((x) => x.id === id);
  const [aba, setAba] = useState('info');
  const [editar, setEditar] = useState(false);
  const [problema, setProblema] = useState(false);
  if (!e) return html`<${Vazio} titulo="Equipamento não encontrado"><a href="#/equipamentos">Voltar</a><//>`;
  const reservas = st.reservas.filter((r) => r.reserva_itens.some((i) => i.equipamento_id === e.id));
  const manut = st.manutencoes.filter((m) => m.equipamento_id === e.id);

  const excluir = async () => {
    if (!(await confirmar(`Excluir ${e.codigo} · ${e.nome} definitivamente?\nO histórico de saídas impede a exclusão de itens já movimentados — nesse caso use o status "Baixado".`, { perigo: true, ok: 'Excluir' }))) return;
    if (await acao(() => q(sb.from('equipamentos').delete().eq('id', e.id)), 'Equipamento excluído.')) ir('/equipamentos');
  };

  return html`<div>
    <a class="crumb" href="#/equipamentos">← Equipamentos</a>
    <div class="page-head"><div><div class="row" style="gap:8px"><h1>${e.nome}</h1><${Badge} e=${e} /></div>
      <p><span class="mono">${e.codigo}</span> · ${e.categoria}${e.marca ? ' · ' + e.marca : ''}${e.modelo ? ' ' + e.modelo : ''}</p></div>
      <div class="row">
        ${e.status === 'disponivel' && html`<a class="btn primary" href=${'#/saida/nova?itens=' + e.id}><${Icone} n="saida" s=${16} />Retirar</a>`}
        ${e.status === 'em_uso' && html`<a class="btn primary" href=${'#/saida/' + e.retirada_id}><${Icone} n="volta" s=${16} />Devolver</a>`}
        <button class="btn" onClick=${() => setProblema(true)}><${Icone} n="alerta" s=${16} />Reportar problema</button>
        <button class="btn icon" title="Imprimir etiqueta" onClick=${() => imprimirEtiquetas([e])}><${Icone} n="qr" /></button>
        ${isAdmin() && html`<button class="btn icon" title="Editar" onClick=${() => setEditar(true)}><${Icone} n="editar" /></button>`}
      </div></div>

    ${e.status === 'em_uso' && html`<div class=${'alert ' + (e.atrasado ? 'bad' : 'info')} style="margin-bottom:16px"><${Icone} n="usuario" />
      <div>Com <b>${e.responsavel_nome}</b>${e.projeto ? ' · ' + e.projeto : ''} desde ${fmtData(e.saida_em, true)}.
      ${e.previsao_retorno ? html` Retorno previsto ${fmtData(e.previsao_retorno, true)} (${fmtRelativo(e.previsao_retorno)}).` : ' Sem previsão de retorno.'}
      <a href=${'#/saida/' + e.retirada_id}> Saída #${e.retirada_numero}</a></div></div>`}

    <div class="cols-2-1">
      <div>
        <div class="tabs">
          ${[['info', 'Detalhes'], ['anexos', 'Notas e anexos'], ['historico', 'Histórico']].map(([k, r]) => html`<button class=${'tab' + (aba === k ? ' on' : '')} onClick=${() => setAba(k)}>${r}</button>`)}
        </div>
        ${aba === 'info' && html`<div class="card stack lg">
          <div class="dl">
            <div><span>Código</span><b class="mono">${e.codigo}</b></div>
            <div><span>Nº de série</span><b class="mono">${e.numero_serie || '—'}</b></div>
            <div><span>Condição</span><b>${CONDICAO[e.condicao]}</b></div>
            <div><span>Localização</span><b>${e.localizacao || '—'}</b></div>
            <div><span>Kit</span><b>${e.kit_id ? html`<a href=${'#/kit/' + e.kit_id}>${e.kit_nome}</a>` : '—'}</b></div>
            <div><span>Proprietário</span><b>${e.proprietario}</b></div>
            <div><span>Diária de locação</span><b>${fmtMoeda(e.valor_locacao)}</b></div>
            ${isAdmin() && html`<div><span>Valor de compra</span><b>${fmtMoeda(e.valor_compra)}</b></div>`}
            <div><span>Data da compra</span><b>${fmtData(e.data_compra)}</b></div>
            <div><span>Fornecedor</span><b>${e.fornecedor || '—'}</b></div>
            <div><span>Nota fiscal</span><b>${e.nf_numero || '—'}</b></div>
            <div><span>Garantia até</span><b>${e.garantia_ate ? html`${fmtData(e.garantia_ate)} ${e.garantia_ate < hojeISO() ? html`<span class="badge b-neutro plain">vencida</span>` : ''}` : '—'}</b></div>
            <div><span>Seguro</span><b>${e.seguro_apolice || '—'}</b></div>
          </div>
          ${e.tags && html`<div><div class="small muted" style="margin-bottom:6px">Tags</div><div class="chips">${e.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => html`<span class="badge b-neutro plain">${t}</span>`)}</div></div>`}
          ${e.observacoes && html`<div><div class="small muted" style="margin-bottom:4px">Observações</div><div style="white-space:pre-line">${e.observacoes}</div></div>`}
        </div>`}
        ${aba === 'anexos' && html`<${Anexos} eq=${e} />`}
        ${aba === 'historico' && html`<${Historico} eq=${e} />`}
      </div>
      <div class="stack lg">
        <${Foto} path=${e.foto_path} />
        <div class="card"><div class="card-head"><h3>Reservas</h3></div>
          ${reservas.length ? html`<div class="stack" style="gap:8px">${reservas.map((r) => html`<a href=${'#/reservas?ver=' + r.id} class="row nw" key=${r.id}><span class="badge b-reservado plain">${fmtData(r.inicio)}${r.fim !== r.inicio ? '–' + fmtData(r.fim) : ''}</span><span class="ellipsis">${r.titulo}</span></a>`)}</div>`
            : html`<div class="muted small">Nenhuma reserva futura.</div>`}</div>
        ${manut.filter((m) => m.status === 'aberta').map((m) => html`<div class="alert warn" key=${m.id}><${Icone} n="chave" /><div><b>Manutenção aberta</b> desde ${fmtData(m.aberta_em)}<br />${m.descricao}</div></div>`)}
        ${isAdmin() && html`<button class="btn danger sm" style="align-self:flex-start" onClick=${excluir}><${Icone} n="lixo" s=${15} />Excluir item</button>`}
      </div>
    </div>
    ${editar && html`<${FormEquipamento} inicial=${e} onClose=${() => setEditar(false)} onSalvo=${() => {}} />`}
    ${problema && html`<${ReportarProblema} eq=${e} onClose=${() => setProblema(false)} />`}
  </div>`;
}

export function ReportarProblema({ eq, onClose }) {
  const [d, setD] = useState('');
  const enviar = async () => { if (await acao(() => q(sb.rpc('abrir_manutencao', { p_equipamento_id: eq.id, p_descricao: d })), 'Problema registrado. O item foi para manutenção.')) onClose(); };
  return html`<${Modal} titulo=${'Reportar problema · ' + eq.codigo} onClose=${onClose} rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" disabled=${!d.trim()} onClick=${enviar}>Registrar</button>`}>
    <div class="stack"><${Campo} rotulo="O que aconteceu?"><textarea class="input" value=${d} onInput=${(e) => setD(e.target.value)} placeholder="Ex.: sapata quebrada, cooler fazendo barulho, faltando cabo…" autofocus></textarea><//>
    <div class="small muted">${eq.status === 'disponivel' ? 'O item ficará indisponível (status Manutenção) até um admin concluir o reparo.' : 'O item continua com quem está; a manutenção fica registrada.'}</div></div><//>`;
}

function Anexos({ eq }) {
  const [lista, setLista] = useState(null);
  const [tipo, setTipo] = useState('nota_fiscal');
  const [enviando, setEnviando] = useState(false);
  const carregar = () => q(sb.from('anexos').select('*').eq('equipamento_id', eq.id).order('criado_em', { ascending: false })).then(setLista).catch((e) => toast(msgErro(e), 'erro'));
  useEffect(carregar, [eq.id]);
  const enviar = async (ev) => {
    const files = [...ev.target.files]; if (!files.length) return;
    setEnviando(true);
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) { toast(`${file.name}: máximo 20 MB.`, 'erro'); continue; }
        const path = await enviarArquivo(file, (tipo === 'nota_fiscal' ? 'nf/' : 'anexos/') + eq.id);
        await q(sb.from('anexos').insert({ equipamento_id: eq.id, tipo, nome: file.name, path, tamanho: file.size, mime: file.type }));
      }
      toast('Arquivo(s) enviado(s).', 'ok'); carregar();
    } catch (e) { toast(msgErro(e), 'erro'); }
    setEnviando(false); ev.target.value = '';
  };
  const abrir = async (a) => { const u = await urlArquivo(a.path); u ? window.open(u, '_blank', 'noopener') : toast('Não foi possível abrir o arquivo.', 'erro'); };
  const apagar = async (a) => {
    if (!(await confirmar(`Remover "${a.nome}"?`, { perigo: true, ok: 'Remover' }))) return;
    await acao(async () => { await sb.storage.from('anexos').remove([a.path]); await q(sb.from('anexos').delete().eq('id', a.id)); }, 'Removido.');
    carregar();
  };
  const usarComoFoto = (a) => acao(() => q(sb.from('equipamentos').update({ foto_path: a.path }).eq('id', eq.id)), 'Foto principal atualizada.');
  return html`<div class="card stack">
    <div class="row"><select class="input" style="width:auto" value=${tipo} onChange=${(e) => setTipo(e.target.value)}>${Object.entries(TIPO_ANEXO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
      <label class="btn primary" style=${enviando ? 'opacity:.6;pointer-events:none' : ''}><${Icone} n="clipe" s=${16} />${enviando ? 'Enviando…' : 'Anexar arquivo'}
        <input type="file" multiple class="hidden" accept="application/pdf,image/*,.xml,.doc,.docx" onChange=${enviar} /></label></div>
    ${lista === null ? html`<div class="muted">Carregando…</div>` : !lista.length ? html`<${Vazio} titulo="Nenhum anexo">Envie a nota fiscal, o manual ou fotos do estado do item.<//>`
      : html`<div class="list" style="margin:0 -18px -18px">${lista.map((a) => html`<div class="li" key=${a.id}>
          <div class="thumb"><${Icone} n=${a.mime?.startsWith('image/') ? 'camera' : 'clipe'} s=${17} /></div>
          <div class="grow"><a href="#" class="t ellipsis" style="display:block" onClick=${(ev) => { ev.preventDefault(); abrir(a); }}>${a.nome}</a>
            <div class="s">${TIPO_ANEXO[a.tipo]} · ${fmtData(a.criado_em)}${a.tamanho ? ' · ' + (a.tamanho / 1048576).toFixed(1) + ' MB' : ''}</div></div>
          ${isAdmin() && a.mime?.startsWith('image/') && html`<button class="btn ghost sm" onClick=${() => usarComoFoto(a)}>Usar como foto</button>`}
          <button class="btn ghost sm icon" aria-label="Remover" onClick=${() => apagar(a)}><${Icone} n="lixo" s=${15} /></button></div>`)}</div>`}
  </div>`;
}

function Historico({ eq }) {
  const [ev, setEv] = useState(null);
  useEffect(() => { q(sb.from('eventos').select('*').eq('equipamento_id', eq.id).order('criado_em', { ascending: false }).limit(200)).then(setEv).catch((e) => toast(msgErro(e), 'erro')); }, [eq.id, eq.atualizado_em, eq.status]);
  if (ev === null) return html`<div class="muted">Carregando…</div>`;
  return html`<div class="card"><div class="timeline">
    ${ev.map((x) => html`<div class="tl" key=${x.id}><i class=${x.tipo}></i><div><div>${x.descricao}</div><div class="small faint">${fmtData(x.criado_em, true)}</div></div></div>`)}
    ${!ev.length && html`<div class="muted">Sem eventos.</div>`}</div></div>`;
}

// ================================================================== IMPORTAÇÃO CSV
const ALIAS = {
  codigo: ['codigo', 'código', 'patrimonio', 'patrimônio', 'etiqueta', 'id'],
  nome: ['nome', 'equipamento', 'item', 'descricao', 'descrição'],
  categoria: ['categoria', 'tipo', 'grupo'],
  marca: ['marca', 'fabricante'],
  modelo: ['modelo'],
  numero_serie: ['numero_serie', 'nº série', 'n° série', 'no série', 'numero de serie', 'número de série', 'serie', 'série', 'serial', 'sn'],
  status: ['status', 'situação', 'situacao'],
  localizacao: ['localizacao', 'localização', 'local', 'onde'],
  proprietario: ['proprietario', 'proprietário', 'dono'],
  valor_compra: ['valor_compra', 'valor', 'valor de compra', 'preço', 'preco', 'custo'],
  valor_locacao: ['valor_locacao', 'locação', 'locacao', 'diária', 'diaria', 'valor locação'],
  data_compra: ['data_compra', 'data de compra', 'data compra', 'compra'],
  fornecedor: ['fornecedor', 'loja'],
  nf_numero: ['nf_numero', 'nota fiscal', 'nf', 'nº nf', 'numero nf'],
  garantia_ate: ['garantia_ate', 'garantia', 'garantia até'],
  seguro_apolice: ['seguro_apolice', 'seguro', 'apólice', 'apolice'],
  tags: ['tags', 'palavras-chave', 'palavras chave'],
  kit: ['kit'],
  observacoes: ['observacoes', 'observações', 'obs', 'notas'],
};
const STATUS_ALIAS = { 'disponivel': 'disponivel', 'em uso': 'em_uso', 'em_uso': 'em_uso', 'manutencao': 'manutencao', 'em manutencao': 'manutencao', 'extraviado': 'extraviado', 'perdido': 'extraviado', 'baixado': 'baixado', 'vendido': 'baixado' };

function Importar({ onClose }) {
  const st = useStore();
  const [linhas, setLinhas] = useState(null);
  const [mapa, setMapa] = useState({});
  const [modo, setModo] = useState('pular');
  const [prog, setProg] = useState(null);
  const ler = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    const buf = await file.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    const l = lerCSV(txt);
    if (l.length < 2) return toast('Arquivo vazio ou sem cabeçalho.', 'erro');
    const cab = l[0].map((c) => normalizar(c).trim());
    const m = {};
    Object.entries(ALIAS).forEach(([campo, nomes]) => { const i = cab.findIndex((c) => nomes.map(normalizar).includes(c)); if (i >= 0) m[campo] = i; });
    if (m.nome === undefined) return toast('Não encontrei a coluna "Nome" no arquivo.', 'erro');
    setMapa(m); setLinhas(l.slice(1));
  };
  const registros = useMemo(() => {
    if (!linhas) return [];
    const v = (row, k) => { const i = mapa[k]; if (i === undefined) return null; const s = (row[i] || '').trim(); return s === '' || s === '-' ? null : s; };
    return linhas.map((row) => {
      const st0 = normalizar(v(row, 'status') || '');
      return {
        codigo: v(row, 'codigo'), nome: v(row, 'nome'), categoria: v(row, 'categoria') || 'Outros', marca: v(row, 'marca'), modelo: v(row, 'modelo'),
        numero_serie: v(row, 'numero_serie'), status: STATUS_ALIAS[st0] === 'em_uso' ? 'disponivel' : STATUS_ALIAS[st0] || 'disponivel',
        localizacao: v(row, 'localizacao'), proprietario: v(row, 'proprietario') || 'MV LAB',
        valor_compra: numeroBR(v(row, 'valor_compra')), valor_locacao: numeroBR(v(row, 'valor_locacao')),
        data_compra: dataBR(v(row, 'data_compra')), fornecedor: v(row, 'fornecedor'), nf_numero: v(row, 'nf_numero'),
        garantia_ate: dataBR(v(row, 'garantia_ate')), seguro_apolice: v(row, 'seguro_apolice'), tags: v(row, 'tags'),
        observacoes: v(row, 'observacoes'), _kit: v(row, 'kit'),
      };
    }).filter((r) => r.nome);
  }, [linhas, mapa]);
  const existentes = new Map(st.equipamentos.map((e) => [e.codigo.toUpperCase(), e]));
  const porSerie = new Map(st.equipamentos.filter((e) => e.numero_serie).map((e) => [e.numero_serie.toUpperCase(), e]));
  const achar = (r) => (r.codigo && existentes.get(r.codigo.toUpperCase())) || (r.numero_serie && porSerie.get(r.numero_serie.toUpperCase())) || null;
  const dup = registros.filter(achar).length;

  const importar = async () => {
    setProg({ feito: 0, total: registros.length, erros: [] });
    const erros = []; let feito = 0;
    const kits = new Map(store.get().kits.map((k) => [normalizar(k.nome), k]));
    const vinculos = [];
    for (const r of registros) {
      const { _kit, ...reg } = r;
      Object.keys(reg).forEach((k) => reg[k] === null && k !== 'codigo' && delete reg[k]);
      if (!reg.codigo) delete reg.codigo;
      try {
        const ex = achar(r);
        let salvo;
        if (ex) {
          if (modo === 'pular') { feito++; setProg({ feito, total: registros.length, erros }); continue; }
          delete reg.status;
          salvo = await q(sb.from('equipamentos').update(reg).eq('id', ex.id).select('id').single());
        } else salvo = await q(sb.from('equipamentos').insert(reg).select('id').single());
        if (_kit) {
          let k = kits.get(normalizar(_kit));
          if (!k) { k = await q(sb.from('kits').insert({ nome: _kit }).select().single()); kits.set(normalizar(_kit), k); }
          vinculos.push({ kit_id: k.id, equipamento_id: salvo.id });
        }
      } catch (e) { erros.push(`${r.nome}: ${msgErro(e)}`); }
      feito++; setProg({ feito, total: registros.length, erros: [...erros] });
    }
    if (vinculos.length) {
      try { await q(sb.from('kit_itens').upsert(vinculos, { onConflict: 'equipamento_id' })); } catch (e) { erros.push('Kits: ' + msgErro(e)); }
    }
    await carregarTudo();
    setProg({ feito, total: registros.length, erros, fim: true });
    toast(`Importação concluída: ${feito - erros.length} itens.`, erros.length ? 'erro' : 'ok');
  };

  const modelo = () => baixar('modelo-importacao.csv', gerarCSV(['codigo', 'nome', 'categoria', 'marca', 'modelo', 'numero_serie', 'status', 'localizacao', 'proprietario', 'valor_compra', 'valor_locacao', 'data_compra', 'fornecedor', 'nf_numero', 'garantia_ate', 'seguro_apolice', 'tags', 'kit', 'observacoes'],
    [['', 'Sony FX3', 'Câmera', 'Sony', 'ILME-FX3', '1234567', 'disponivel', 'Armário 1', 'MV LAB', '25000,00', '450,00', '15/03/2024', 'Loja X', '12345', '15/03/2025', '', 'cinema line, full frame', 'Kit Câmera A', 'Acompanha 2 baterias']]));

  return html`<${Modal} largo titulo="Importar planilha (CSV)" onClose=${prog && !prog.fim ? null : onClose}
    rodape=${prog?.fim ? html`<button class="btn primary" onClick=${onClose}>Fechar</button>`
      : html`<button class="btn" onClick=${onClose} disabled=${!!prog}>Cancelar</button><button class="btn primary" disabled=${!registros.length || !!prog} onClick=${importar}>Importar ${registros.length || ''} itens</button>`}>
    <div class="stack">
      ${!linhas && html`<p class="muted" style="margin:0">Aceita CSV separado por ponto e vírgula ou vírgula (Excel/Google Sheets → Salvar como CSV). Colunas reconhecidas: nome (obrigatória), código, categoria, marca, modelo, nº série, status, local, valor, locação/diária, data de compra, fornecedor, nota fiscal, garantia, seguro, tags, kit, observações. Sem código, o sistema gera MV-0001, MV-0002…</p>
        <div class="row"><label class="btn primary"><${Icone} n="subir" s=${16} />Escolher arquivo CSV<input type="file" class="hidden" accept=".csv,text/csv" onChange=${ler} /></label>
        <button class="btn ghost" onClick=${modelo}><${Icone} n="baixar" s=${16} />Baixar modelo</button></div>`}
      ${linhas && !prog && html`
        <div class="alert info"><div>${registros.length} itens lidos. Colunas reconhecidas: ${Object.keys(mapa).join(', ')}.${dup ? html`<br /><b>${dup}</b> já existem (mesmo código ou nº de série).` : ''}</div></div>
        ${dup > 0 && html`<div class="row"><label class="check"><input type="radio" name="m" checked=${modo === 'pular'} onChange=${() => setModo('pular')} />Pular os que já existem</label>
          <label class="check"><input type="radio" name="m" checked=${modo === 'atualizar'} onChange=${() => setModo('atualizar')} />Atualizar os que já existem</label></div>`}
        <div class="tbl-wrap card flush" style="max-height:320px;overflow:auto"><table class="tbl"><thead><tr><th>Nome</th><th>Categoria</th><th>Série</th><th class="right">Valor</th><th class="right">Diária</th><th>Kit</th></tr></thead>
          <tbody>${registros.slice(0, 200).map((r) => html`<tr><td>${r.nome}${achar(r) ? html` <span class="badge b-neutro plain">existe</span>` : ''}</td><td>${r.categoria}</td><td class="mono">${r.numero_serie || '—'}</td><td class="right nowrap">${fmtMoeda(r.valor_compra)}</td><td class="right nowrap">${fmtMoeda(r.valor_locacao)}</td><td>${r._kit || ''}</td></tr>`)}</tbody></table></div>`}
      ${prog && html`<div class="stack"><div>${prog.fim ? 'Concluído' : 'Importando…'} ${prog.feito}/${prog.total}</div>
        <div style="height:6px;background:var(--surface-3);border-radius:4px"><div style=${`height:100%;width:${(prog.feito / prog.total) * 100}%;background:var(--gold);border-radius:4px`}></div></div>
        ${prog.erros.length > 0 && html`<div class="alert bad"><div>${prog.erros.slice(0, 20).map((e) => html`<div>${e}</div>`)}</div></div>`}</div>`}
    </div><//>`;
}
