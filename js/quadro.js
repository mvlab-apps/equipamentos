// Quadro de posse (estilo Trello), tabela dinâmica, mover/emprestar/devolver e conferência
import {
  html, useState, useEffect, useMemo, sb, store, useStore, ir, q, acao, toast, msgErro, isAdmin,
  GRUPOS, fmtData, fmtMoeda, fmtRelativo, paraLocalInput, deLocalInput, normalizar,
  Icone, Badge, Campo, Modal, Vazio, Busca, nomePessoa, pessoasAtivas, minhaPessoa, carregarTudo, kitPorId, primeiroNome,
  chaveUnidade, agrupar, listaCodigos, Stepper, corDono, corPessoa, Ponto,
} from './core.js';
import { buscarEquip, SeletorItens } from './picker.js';
import { resumoJob, jobAtivo } from './cobertura.js';

const BASE = '__base';
const chave = (id) => id || BASE;
const ordemEq = (a, b) => GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo) || a.categoria_ordem - b.categoria_ordem || a.nome.localeCompare(b.nome, 'pt-BR');

// ================================================================== MOVER (modal reutilizado no app inteiro)
export function MoverModal({ itens, para: paraInicial, tipo: tipoInicial, projeto: projetoInicial = '', ate: ateInicial, jobId = null, onClose, onFeito }) {
  const st = useStore();
  const pedidos = itens.map((i) => ({ ...i, e: st.equipamentos.find((x) => x.id === i.equipamento_id) })).filter((x) => x.e);
  // kit fixo vai sempre inteiro: completa com os itens que faltarem
  const idsPedidos = new Set(pedidos.map((x) => x.e.id));
  const kitsFixos = [...new Set(pedidos.map((x) => x.e.kit_id).filter((kid) => kitPorId(kid)?.modo === 'fixo'))];
  const completados = kitsFixos.flatMap((kid) => st.equipamentos.filter((e) => e.kit_id === kid && e.status !== 'baixado' && !idsPedidos.has(e.id)).map((e) => ({ equipamento_id: e.id, kit_id: kid, e })));
  const todos = [...pedidos, ...completados];
  // unidades iguais viram uma linha "N×" com contador: dá para mover só parte delas
  const chG = (x) => chaveUnidade(x.e) + '|' + (x.kit_id || x.e.kit_id || '');
  const grupos = agrupar(todos, chG);
  const [qtd, setQtd] = useState({});
  const nDe = (g) => qtd[chG(g[0])] ?? g.length;
  const lista = grupos.flatMap((g) => g.slice(0, nDe(g)));
  const temEmprestado = lista.some((x) => x.e.emprestado);
  const colabs = lista.filter((x) => x.e.dono_id);
  const [para, setPara] = useState(paraInicial === undefined ? '' : paraInicial === null ? BASE : paraInicial);
  const destino = para === BASE ? null : para || undefined;
  const tipoPadrao = () => {
    if (tipoInicial) return tipoInicial;
    if (temEmprestado && lista.every((x) => x.e.emprestado && x.e.titular_id === destino)) return 'devolver';
    if (destino && lista.every((x) => x.e.titular_id && x.e.titular_id !== destino)) return 'emprestar';
    if (colabs.length) return para === BASE && temEmprestado ? 'devolver' : 'emprestar';
    return 'transferir';
  };
  const [tipo, setTipo] = useState(tipoPadrao);
  useEffect(() => { if (!tipoInicial) setTipo(tipoPadrao()); }, [para]);
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(19, 0, 0, 0);
  const [ate, setAte] = useState(paraLocalInput(ateInicial || amanha));
  // empréstimo sem data = posse permanente ("cedido"): o item continua sendo do titular, mas fica com a pessoa até alguém devolver
  const [semData, setSemData] = useState(() => !ateInicial && todos.length > 0 && todos.every((x) => x.e.dono_id));
  const [projeto, setProjeto] = useState(projetoInicial);
  const [obs, setObs] = useState('');
  const [nova, setNova] = useState('');
  const [enviando, setEnviando] = useState(false);

  const destinoDe = (e) => (tipo === 'devolver' ? e.titular_id : destino);
  const linhas = lista.map((x) => ({ ...x, de: x.e.portador_id, para: destinoDe(x.e) }));
  const mudam = linhas.filter((l) => (tipo === 'transferir' ? l.de !== (l.para ?? null) || l.e.titular_id !== (l.para ?? null) : l.de !== (l.para ?? null)));

  const confirmar = async () => {
    let alvo = destino;
    if (para === '__nova') {
      if (!nova.trim()) return toast('Digite o nome da pessoa.', 'erro');
      try { const p = await q(sb.from('pessoas').insert({ nome: nova.trim(), funcao: 'Externo', externo: true }).select().single()); alvo = p.id; }
      catch (e) { return toast(msgErro(e), 'erro'); }
    }
    if (!lista.length) return toast('Nenhum item selecionado.', 'erro');
    if (tipo !== 'devolver' && para === '') return toast('Escolha para onde vão os itens.', 'erro');
    if (tipo === 'transferir' && colabs.length) return toast(`Equipamento de colaborador não pode ser transferido nem guardado na base: ${colabs.map((x) => x.e.codigo).join(', ')}. Use Emprestar, ou tire esses itens da seleção.`, 'erro');
    if (tipo === 'emprestar' && !alvo) return toast('Empréstimo precisa de uma pessoa (não da base).', 'erro');
    setEnviando(true);
    const ok = await acao(() => q(sb.rpc('mover_itens', {
      p_itens: lista.map((x) => ({ equipamento_id: x.e.id, kit_id: x.kit_id || x.e.kit_id || null })), p_para: tipo === 'devolver' ? null : alvo ?? null,
      p_tipo: tipo, p_ate: tipo === 'emprestar' && !semData ? deLocalInput(ate) : null, p_projeto: projeto, p_obs: obs, p_job_id: jobId,
    })), `${mudam.length || lista.length} item(ns) movido(s).`);
    setEnviando(false);
    if (ok) { await carregarTudo(); onFeito && onFeito(); onClose(); }
  };

  const nomeDestino = para === BASE ? 'a base' : para === '__nova' ? nova || 'nova pessoa' : nomePessoa(para);
  return html`<${Modal} largo titulo=${`Mover ${lista.length} ${lista.length === 1 ? 'item' : 'itens'}`} onClose=${onClose}
    rodape=${html`<button class="btn" onClick=${onClose}>Cancelar</button><button class="btn primary" disabled=${enviando} onClick=${confirmar}><${Icone} n="check" s=${16} />${enviando ? 'Registrando…' : 'Confirmar'}</button>`}>
    <div class="stack lg">
      <div class="grid-form">
        <${Campo} rotulo="Para onde / para quem">
          <select class="input" value=${para} onChange=${(e) => setPara(e.target.value)} disabled=${tipo === 'devolver'}>
            <option value="">Escolha…</option>
            <option value=${BASE}>Base (guardar)</option>
            ${pessoasAtivas().map((p) => html`<option value=${p.id}>${p.nome}${p.funcao ? ' — ' + p.funcao : ''}</option>`)}
            <option value="__nova">+ Outra pessoa (freelancer, cliente…)</option>
          </select>
          ${para === '__nova' && html`<input class="input" style="margin-top:6px" placeholder="Nome" value=${nova} onInput=${(e) => setNova(e.target.value)} autofocus />`}
        <//>
        <${Campo} rotulo="Projeto / job (opcional)"><input class="input" value=${projeto} onInput=${(e) => setProjeto(e.target.value)} placeholder="Ex.: Itaú Views 17/10" /><//>
      </div>
      ${colabs.length > 0 && html`<div class="alert colab small"><span>◆</span><div>${colabs.length === lista.length ? 'Todos os itens são' : `${colabs.length} item(ns) são`} equipamento próprio de colaborador (${[...new Set(colabs.map((x) => primeiroNome(x.e.dono_nome)))].join(', ')}). Eles só podem ser <b>emprestados</b> ou <b>devolvidos ao dono</b> — nunca transferidos ou guardados na base.</div></div>`}
      <div class="stack" style="gap:8px">
        <label class="check" style=${colabs.length ? 'opacity:.5' : ''}><input type="radio" name="tipo" disabled=${colabs.length > 0} checked=${tipo === 'transferir'} onChange=${() => setTipo('transferir')} />
          <span><b>${para === BASE ? 'Guardar na base' : 'Transferir'}</b> <span class="muted">— ${para === BASE ? 'deixa de ter titular' : `passa a ser de ${nomeDestino} (titular)`}</span></span></label>
        <label class="check" style=${para === BASE ? 'opacity:.5' : ''}><input type="radio" name="tipo" disabled=${para === BASE} checked=${tipo === 'emprestar'} onChange=${() => setTipo('emprestar')} />
          <span><b>Emprestar / ceder</b> <span class="muted">— fica com ${nomeDestino}, mas continua sendo do titular. Com data de devolução, ou sem data (posse permanente)</span></span></label>
        ${temEmprestado && html`<label class="check"><input type="radio" name="tipo" checked=${tipo === 'devolver'} onChange=${() => setTipo('devolver')} />
          <span><b>Devolver ao titular</b> <span class="muted">— cada item volta para quem é o dono dele</span></span></label>`}
      </div>
      ${completados.length > 0 && html`<div class="alert info small"><${Icone} n="kit" s=${16} /><div>Kit fixo vai inteiro: ${kitsFixos.map((kid) => kitPorId(kid)?.nome).join(', ')} (+${completados.length} item(ns) incluído(s) automaticamente).</div></div>`}
      ${tipo === 'emprestar' && html`<div class="grid-form"><${Campo} rotulo="Devolução">
          <label class="check" style="margin-bottom:6px"><input type="checkbox" checked=${semData} onChange=${(e) => setSemData(e.target.checked)} />Sem data — fica com a pessoa até alguém devolver</label>
          ${!semData && html`<input class="input" type="datetime-local" value=${ate} onInput=${(e) => setAte(e.target.value)} />`}<//>
        <${Campo} rotulo="Observação"><input class="input" value=${obs} onInput=${(e) => setObs(e.target.value)} /><//></div>`}
      <div class="card flush"><div class="list">${grupos.map((g) => {
        const n = nDe(g); const usados = g.slice(0, n); const e = g[0].e; const k = chG(g[0]);
        const de = [...new Set(usados.map((x) => nomePessoa(x.e.portador_id)))].join(', ') || nomePessoa(e.portador_id);
        const pra = tipo === 'devolver' ? [...new Set(usados.map((x) => nomePessoa(destinoDe(x.e))))].join(', ') : nomeDestino;
        return html`<div class="li" key=${k} style=${n === 0 ? 'opacity:.45' : ''}>
          ${g.length > 1 && html`<span class="qtd">${n}×</span>`}
          <div class="grow"><div class="t ellipsis">${e.nome}</div><div class="s"><span class="mono">${g.length > 1 ? (n ? listaCodigos(usados.map((x) => x.e)) : 'nenhuma unidade') : e.codigo}</span>${e.kit_nome ? ' · ' + e.kit_nome : ''}${e.dono_id ? html` · <span class="tag-colab">◆ próprio de ${primeiroNome(e.dono_nome)}</span>` : e.titular_id ? ' · titular: ' + e.titular_nome : ''}</div></div>
          ${g.length > 1 && kitPorId(e.kit_id)?.modo !== 'fixo' && html`<${Stepper} valor=${n} min=${0} max=${g.length} rotulo="Quantas unidades mover" onChange=${(v) => setQtd({ ...qtd, [k]: v })} />`}
          <span class="small muted nowrap">${de} → <b style="color:var(--text)">${pra}</b></span></div>`;
      })}</div></div>
    </div><//>`;
}

// ================================================================== CONFERÊNCIA
function Conferencia({ pessoa, itens, onClose }) {
  const [ok, setOk] = useState(() => new Set(itens.map((e) => e.id)));
  const [obs, setObs] = useState('');
  const tg = (id) => { const s = new Set(ok); s.has(id) ? s.delete(id) : s.add(id); setOk(s); };
  const salvar = async () => {
    const faltando = itens.filter((e) => !ok.has(e.id)).map((e) => e.id);
    if (await acao(() => q(sb.rpc('registrar_conferencia', { p_pessoa: pessoa, p_ok: [...ok], p_faltando: faltando, p_obs: obs })),
      faltando.length ? `Conferência salva — ${faltando.length} item(ns) não encontrados.` : 'Conferência salva: tudo certo.')) onClose(true);
  };
  return html`<${Modal} largo titulo=${'Conferência — ' + nomePessoa(pessoa)} onClose=${() => onClose(false)}
    rodape=${html`<button class="btn" onClick=${() => onClose(false)}>Cancelar</button><button class="btn primary" onClick=${salvar}>Salvar conferência</button>`}>
    <div class="stack"><div class="muted small">Desmarque o que <b>não</b> estiver com ${pessoa ? 'a pessoa' : 'a base'}. Itens faltando ficam registrados no histórico deles.</div>
      <div class="card flush" style="max-height:50vh;overflow:auto"><div class="list">${agrupar(itens, (e) => chaveUnidade(e) + '|' + (e.kit_id || '')).map((g) => {
        const e = g[0];
        if (g.length === 1) return html`<label class="li click" key=${e.id}>
          <input type="checkbox" class="check" checked=${ok.has(e.id)} onChange=${() => tg(e.id)} />
          <div class="grow"><div class="t ellipsis">${e.nome}</div><div class="s"><span class="mono">${e.codigo}</span> · ${e.categoria}${e.kit_nome ? ' · ' + e.kit_nome : ''}</div></div></label>`;
        const achados = g.filter((x) => ok.has(x.id)).length;
        // unidades iguais: informa quantas foram encontradas; as que faltarem são marcadas a partir do fim da lista
        const definir = (n) => { const s = new Set(ok); g.forEach((x, i) => (i < n ? s.add(x.id) : s.delete(x.id))); setOk(s); };
        return html`<div class="li" key=${e.id}><span class="qtd">${g.length}×</span>
          <div class="grow"><div class="t ellipsis">${e.nome}</div><div class="s"><span class="mono">${listaCodigos(g, 4)}</span> · ${e.categoria}${e.kit_nome ? ' · ' + e.kit_nome : ''}</div></div>
          <span class="small muted nowrap">encontradas</span><${Stepper} valor=${achados} min=${0} max=${g.length} onChange=${definir} /></div>`;
      })}</div></div>
      <${Campo} rotulo="Observações"><input class="input" value=${obs} onInput=${(e) => setObs(e.target.value)} /><//>
      <div class="small muted">${ok.size}/${itens.length} conferidos</div></div><//>`;
}

// ================================================================== QUADRO
export function Quadro({ query }) {
  const st = useStore();
  const [termo, setTermo] = useState(query.q || '');
  const [grupo, setGrupo] = useState(query.grupo || '');
  const [prop, setProp] = useState(query.prop || '');
  const [vista, setVista] = useState(query.vista || 'quadro');
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [mover, setMover] = useState(null);
  const [conf, setConf] = useState(null);
  const [ultConf, setUltConf] = useState({});
  const [sobre, setSobre] = useState(null);
  const [gruposAbertos, setGruposAbertos] = useState(new Set());
  const [fechados, setFechados] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('kits_fechados') || '[]')); } catch (_) { return new Set(); } });

  useEffect(() => {
    q(sb.from('conferencias').select('pessoa_id, criado_em, faltando').order('criado_em', { ascending: false }).limit(300))
      .then((l) => { const m = {}; l.forEach((c) => { const k = chave(c.pessoa_id); if (!m[k]) m[k] = c; }); setUltConf(m); }).catch(() => {});
  }, [st.atualizadoEm]);

  const visiveis = useMemo(() => buscarEquip(st.equipamentos.filter((e) => e.status !== 'baixado' && (!grupo || e.grupo === grupo)
    && (!prop || (prop === 'colab' ? e.dono_id : !e.dono_id))), termo), [st.equipamentos, termo, grupo, prop]);
  const colunas = [{ id: null, nome: 'Na base', funcao: 'Guardado' }, ...pessoasAtivas()];
  const porColuna = {}; colunas.forEach((c) => (porColuna[chave(c.id)] = []));
  visiveis.forEach((e) => { const k = chave(e.portador_id); (porColuna[k] = porColuna[k] || []).push(e); });
  // pessoas inativas que ainda têm itens aparecem no fim
  Object.keys(porColuna).forEach((k) => { if (k !== BASE && !colunas.some((c) => c.id === k)) colunas.push({ id: k, nome: nomePessoa(k), funcao: 'inativa' }); });

  const atrasados = st.equipamentos.filter((e) => e.atrasado);
  const em7 = Date.now() + 7 * 86400000;
  const jobsPendentes = st.jobs.filter((j) => jobAtivo(j) && new Date(j.fim) >= new Date() && new Date(j.inicio) <= em7).map((j) => ({ j, r: resumoJob(j) })).filter((x) => x.r.estado === 'falta' || x.r.conflitos.length);
  const manut = st.equipamentos.filter((e) => e.status === 'manutencao').length;
  const eu = minhaPessoa();

  const toggle = (ids) => { const s = new Set(sel); const todos = ids.every((id) => s.has(id)); ids.forEach((id) => (todos ? s.delete(id) : s.add(id))); setSel(s); };
  const abrirMover = (itens, para) => setMover({ itens, para });
  const onDrop = (ev, destino) => {
    ev.preventDefault(); setSobre(null);
    try { const d = JSON.parse(ev.dataTransfer.getData('text/plain')); if (d?.itens?.length) abrirMover(d.itens, destino); } catch (_) {}
  };
  const arrastar = (ev, itens) => { ev.dataTransfer.setData('text/plain', JSON.stringify({ itens })); ev.dataTransfer.effectAllowed = 'move'; };
  const fecharKit = (k) => { const s = new Set(fechados); s.has(k) ? s.delete(k) : s.add(k); setFechados(s); try { localStorage.setItem('kits_fechados', JSON.stringify([...s])); } catch (_) {} };

  const extras = (e) => html`${e.emprestado && e.portador_id ? html` · <span style=${'color:' + (e.atrasado ? 'var(--bad)' : corDono(e) || 'var(--res)')}>${e.emprestimo_ate ? 'de ' : 'cedido por '}${e.dono_id ? primeiroNome(e.dono_nome) : e.titular_nome ? primeiroNome(e.titular_nome) : 'base'}${e.emprestimo_ate ? ', volta ' + fmtData(e.emprestimo_ate) : ''}</span>` : ''}
    ${e.status !== 'ok' ? html` · <span style="color:var(--warn)">${e.status === 'manutencao' ? 'manutenção' : e.status}</span>` : ''}`;
  // unidades iguais na mesma situação viram uma linha "N×"
  const chaveQ = (e) => chaveUnidade(e) + '|' + (e.titular_id || '') + '|' + (e.emprestado ? e.emprestimo_ate || 'e' : '') + '|' + e.status;
  const abrirGrupo = (gk) => { const s = new Set(gruposAbertos); s.has(gk) ? s.delete(gk) : s.add(gk); setGruposAbertos(s); };
  const GrupoLinha = ({ g, gk }) => {
    const e = g[0]; const ids = g.map((x) => x.id); const nSel = ids.filter((id) => sel.has(id)).length; const aberto = gruposAbertos.has(gk);
    return html`<div key=${gk} class="qgrupo">
      <div class=${'qitem grupo' + (nSel === g.length ? ' sel' : '') + (e.dono_id ? ' colab' : '') + (corDono(e) ? ' tem-cor' : '')} style=${corDono(e) ? '--cor:' + corDono(e) : ''} draggable=${!selecionando && !travado(e)}
        title=${g.length + ' unidades iguais · ' + g.map((x) => x.codigo).join(', ')}
        onDragStart=${(ev) => arrastar(ev, g.map((x) => ({ equipamento_id: x.id, kit_id: x.kit_id })))}
        onClick=${() => (selecionando ? toggle(travado(e) ? idsKit(e.kit_id) : ids) : abrirGrupo(gk))}>
        ${selecionando && html`<input type="checkbox" class="check" checked=${nSel === g.length} ref=${(el) => { if (el) el.indeterminate = nSel > 0 && nSel < g.length; }} onClick=${(ev) => ev.stopPropagation()} onChange=${() => toggle(ids)} />`}
        <span class="qtd">${g.length}×</span>
        <div class="grow" style="min-width:0"><div class="qnome">${e.nome}</div>
          <div class="qmeta">${e.dono_id ? html`<span class="tag-colab">próprio${e.portador_id !== e.dono_id ? ' de ' + primeiroNome(e.dono_nome) : ''}</span> · ` : ''}<span class="mono">${listaCodigos(g, 2)}</span> · ${e.categoria}${extras(e)}</div></div>
        <span class="caret" title="Ver unidades" onClick=${(ev) => { ev.stopPropagation(); abrirGrupo(gk); }}>${aberto ? '▾' : '▸'}</span>
      </div>
      ${aberto && html`<div class="qsub">${g.map((x) => ItemLinha({ e: x }))}</div>`}
    </div>`;
  };
  const Linhas = (arr, prefixo) => agrupar(arr, chaveQ).map((g) => (g.length === 1 ? ItemLinha({ e: g[0] }) : GrupoLinha({ g, gk: prefixo + '|' + chaveQ(g[0]) })));

  // item de kit fixo não sai sozinho: arrastar/selecionar pega o kit inteiro
  const travado = (e) => !!e.kit_id && kitPorId(e.kit_id)?.modo === 'fixo';
  const idsKit = (kid) => st.equipamentos.filter((x) => x.kit_id === kid && x.status !== 'baixado').map((x) => x.id);
  const ItemLinha = ({ e }) => {
    const marcado = sel.has(e.id); const cor = corDono(e);
    return html`<div key=${e.id} class=${'qitem' + (marcado ? ' sel' : '') + (e.dono_id ? ' colab' : '') + (cor ? ' tem-cor' : '')} style=${cor ? '--cor:' + cor : ''}
      title=${(e.dono_id ? 'Equipamento próprio de ' + e.dono_nome + ' (não pertence à produtora)' : e.titular_id ? 'Responsável: ' + e.titular_nome : '') + (travado(e) ? ' · kit fixo: vai inteiro' : '')}
      draggable=${!selecionando && !travado(e)} onDragStart=${(ev) => arrastar(ev, [{ equipamento_id: e.id, kit_id: e.kit_id }])}
      onClick=${() => (selecionando ? toggle(travado(e) ? idsKit(e.kit_id) : [e.id]) : ir('/equipamento/' + e.id))}>
      ${selecionando && html`<input type="checkbox" class="check" checked=${marcado} onClick=${(ev) => ev.stopPropagation()} onChange=${() => toggle(travado(e) ? idsKit(e.kit_id) : [e.id])} />`}
      <div class="grow" style="min-width:0"><div class="qnome">${e.nome}</div>
        <div class="qmeta">${e.dono_id ? html`<span class="tag-colab">próprio${e.portador_id !== e.dono_id ? ' de ' + primeiroNome(e.dono_nome) : ''}</span> · ` : ''}<span class="mono">${e.codigo}</span> · ${e.categoria}${extras(e)}</div></div>
    </div>`;
  };

  const Coluna = ({ c }) => {
    const k = chave(c.id);
    const itens = (porColuna[k] || []).slice().sort(ordemEq);
    const kits = {}; const soltos = [];
    itens.forEach((e) => (e.kit_id ? (kits[e.kit_id] = kits[e.kit_id] || []).push(e) : soltos.push(e)));
    const uc = ultConf[k];
    const valor = itens.filter((e) => !e.dono_id).reduce((s, e) => s + (Number(e.valor_compra) || 0), 0);
    const nColab = itens.filter((e) => e.dono_id).length;
    const corCol = corPessoa(c.id);
    return html`<section key=${k} class=${'qcol' + (sobre === k ? ' alvo' : '') + (eu && eu.id === c.id ? ' eu' : '') + (corCol ? ' tem-cor' : '')} style=${corCol ? '--cor:' + corCol : ''}
      onDragOver=${(ev) => { ev.preventDefault(); if (sobre !== k) setSobre(k); }} onDragLeave=${(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setSobre(null); }}
      onDrop=${(ev) => onDrop(ev, c.id)}>
      <header class="qhead">
        <div class="row between nw"><div style="min-width:0"><h3 class="ellipsis">${c.nome}${eu && eu.id === c.id ? html` <span class="badge b-gold plain">você</span>` : ''}</h3>
          <div class="small muted ellipsis">${c.funcao || ''}</div></div>
          <span class="row nw" style="gap:4px">${nColab > 0 && html`<span class="badge b-colab plain" title="Equipamentos próprios (não são da produtora)">◆ ${nColab}</span>`}<span class="badge b-neutro plain" title="Itens da produtora">${itens.length - nColab}</span></span></div>
        <div class="row between nw small" style="margin-top:6px">
          <span class="faint">${uc ? `Conferido ${fmtRelativo(uc.criado_em)}${uc.faltando?.length ? ` · ${uc.faltando.length} faltando` : ''}` : 'Nunca conferido'}${isAdmin() && valor ? ' · ' + fmtMoeda(valor) : ''}</span>
          ${itens.length > 0 && html`<button class="btn ghost sm" onClick=${() => setConf({ pessoa: c.id, itens })}>Conferir</button>`}
        </div>
        ${selecionando && sel.size > 0 && html`<button class="btn primary sm block" style="margin-top:8px" onClick=${() => abrirMover([...sel].map((id) => ({ equipamento_id: id, kit_id: store.get().equipamentos.find((e) => e.id === id)?.kit_id })), c.id)}>Mover ${sel.size} para cá</button>`}
      </header>
      <div class="qbody">
        ${Object.entries(kits).map(([kid, arr]) => {
          const kit = kitPorId(kid); const membros = st.equipamentos.filter((e) => e.kit_id === kid && e.status !== 'baixado'); const total = membros.length; const fk = k + kid;
          const fora = membros.filter((e) => chave(e.portador_id) !== k);
          return html`<div class=${'qkit' + (arr.every((e) => e.dono_id) ? ' colab' : '')} key=${kid}>
            <div class="qkit-h" draggable=${!selecionando} onDragStart=${(ev) => arrastar(ev, arr.map((e) => ({ equipamento_id: e.id, kit_id: kid })))}
              onClick=${() => (selecionando ? toggle(arr.map((e) => e.id)) : fecharKit(fk))}>
              <span class="caret">${fechados.has(fk) ? '▸' : '▾'}</span><b class="ellipsis grow">${kit?.nome || 'Kit'}</b>
              ${kit?.modo === 'fixo' ? html`<span class="badge b-fixo plain" title="Kit fixo: os itens vão sempre juntos">fixo</span>` : ''}
              ${kit?.tipo && html`<span class="badge b-gold plain">${kit.tipo}</span>`}
              <span class="small muted">${arr.length}${arr.length < total ? '/' + total : ''}</span>
              <a href=${'#/kit/' + kid} class="small" onClick=${(ev) => ev.stopPropagation()} title="Abrir kit">↗</a>
            </div>
            ${fora.length > 0 && arr.length >= fora.length && html`<div class="qkit-fora">Fora do kit: ${fora.slice(0, 3).map((e) => `${e.nome} com ${e.portador_id ? primeiroNome(nomePessoa(e.portador_id)) : 'a base'}`).join(' · ')}${fora.length > 3 ? ` · +${fora.length - 3}` : ''}</div>`}
            ${!fechados.has(fk) && Linhas(arr, fk)}
          </div>`;
        })}
        ${Linhas(soltos, k)}
        ${!itens.length && html`<div class="qvazio">${termo || grupo ? 'Nada com este filtro' : 'Arraste itens para cá'}</div>`}
      </div>
    </section>`;
  };

  return html`<div>
    <div class="page-head"><div><h1>Quadro de equipamentos</h1><p>Quem está com o quê. Arraste um item ou kit para outra coluna para transferir ou emprestar.</p></div>
      <div class="row">
        <div class="chips"><button class=${'chip' + (vista === 'quadro' ? ' on' : '')} onClick=${() => setVista('quadro')}>Quadro</button>
          <button class=${'chip' + (vista === 'tabela' ? ' on' : '')} onClick=${() => setVista('tabela')}>Tabela</button></div>
        <a class="btn primary" href="#/mover"><${Icone} n="saida" s=${16} />Mover itens</a>
      </div></div>

    ${(atrasados.length > 0 || jobsPendentes.length > 0 || manut > 0) && html`<div class="row" style="margin-bottom:14px;gap:8px">
      ${atrasados.length > 0 && html`<a class="alert bad" href="#/movimentos" style="text-decoration:none"><${Icone} n="relogio" s=${16} />${atrasados.length} empréstimo(s) atrasado(s)</a>`}
      ${jobsPendentes.length > 0 && html`<a class="alert warn" href="#/jobs?pendentes=1" style="text-decoration:none"><${Icone} n="agenda" s=${16} />${jobsPendentes.length} job(s) nos próximos 7 dias com falta ou conflito</a>`}
      ${manut > 0 && html`<a class="alert info" href="#/manutencao" style="text-decoration:none"><${Icone} n="chave" s=${16} />${manut} em manutenção</a>`}
    </div>`}

    <div class="stack" style="margin-bottom:14px">
      <div class="row"><${Busca} valor=${termo} onInput=${setTermo} placeholder="Filtrar por nome, código, marca, tag…" />
        ${vista === 'quadro' && html`<button class=${'btn' + (selecionando ? ' primary' : '')} onClick=${() => { setSelecionando(!selecionando); setSel(new Set()); }}>
          <${Icone} n="check" s=${16} />${selecionando ? `Selecionando (${sel.size})` : 'Selecionar vários'}</button>`}</div>
      <div class="chips">
        <button class=${'chip' + (!prop ? ' on' : '')} onClick=${() => setProp('')}>Tudo</button>
        <button class=${'chip' + (prop === 'mv' ? ' on' : '')} onClick=${() => setProp('mv')}>Da produtora <span class="n">${st.equipamentos.filter((e) => !e.dono_id && e.status !== 'baixado').length}</span></button>
        <button class=${'chip' + (prop === 'colab' ? ' on' : '')} style="border-color:var(--colab-line);color:var(--colab)" onClick=${() => setProp('colab')}>◆ De colaboradores <span class="n">${st.equipamentos.filter((e) => e.dono_id && e.status !== 'baixado').length}</span></button>
      </div>
      <div class="chips"><button class=${'chip' + (!grupo ? ' on' : '')} onClick=${() => setGrupo('')}>Todos</button>
        ${GRUPOS.filter((g) => st.equipamentos.some((e) => e.grupo === g)).map((g) => html`<button class=${'chip' + (grupo === g ? ' on' : '')} onClick=${() => setGrupo(grupo === g ? '' : g)}>${g} <span class="n">${st.equipamentos.filter((e) => e.grupo === g && e.status !== 'baixado').length}</span></button>`)}</div>
      ${vista === 'quadro' && html`<div class="legenda-cores"><span>A faixa colorida mostra de quem é o item (dono ou responsável). Faixa de outra cor na coluna = emprestado ou cedido.</span>
        ${pessoasAtivas().filter((p) => p.cor).map((p) => html`<span class="nowrap"><${Ponto} cor=${p.cor} />${primeiroNome(p.nome)}</span>`)}</div>`}
    </div>

    ${vista === 'quadro'
      ? html`<div class="quadro" onDragOver=${(ev) => { const el = ev.currentTarget; const r = el.getBoundingClientRect(); if (ev.clientX > r.right - 70) el.scrollLeft += 18; else if (ev.clientX < r.left + 70) el.scrollLeft -= 18; }}>${colunas.map((c) => Coluna({ c }))}</div>`
      : html`<${TabelaDinamica} itens=${visiveis} colunas=${colunas} onCelula=${(g, cat, pid) => { setVista('quadro'); setGrupo(g); setTermo(cat || ''); }} />`}

    ${selecionando && sel.size > 0 && html`<div class="barra-sel"><span>${sel.size} selecionado(s)</span>
      <button class="btn primary" onClick=${() => abrirMover([...sel].map((id) => ({ equipamento_id: id, kit_id: store.get().equipamentos.find((e) => e.id === id)?.kit_id })), undefined)}>Mover para…</button>
      <button class="btn ghost" onClick=${() => setSel(new Set())}>Limpar</button></div>`}
    ${mover && html`<${MoverModal} itens=${mover.itens} para=${mover.para} onClose=${() => setMover(null)} onFeito=${() => { setSel(new Set()); setSelecionando(false); }} />`}
    ${conf && html`<${Conferencia} pessoa=${conf.pessoa} itens=${conf.itens} onClose=${(salvou) => { setConf(null); if (salvou) carregarTudo(); }} />`}
  </div>`;
}

// ================================================================== TABELA DINÂMICA
function TabelaDinamica({ itens, colunas, onCelula }) {
  const [abertos, setAbertos] = useState(new Set());
  const [medida, setMedida] = useState('qtd');
  const val = (arr) => (medida === 'qtd' ? arr.length : arr.filter((e) => !e.dono_id).reduce((s, e) => s + (Number(e.valor_compra) || 0), 0));
  const fmt = (v) => (medida === 'qtd' ? (v || '') : v ? fmtMoeda(v).replace(',00', '') : '');
  const grupos = GRUPOS.filter((g) => itens.some((e) => e.grupo === g));
  const cel = (arr, c) => arr.filter((e) => chave(e.portador_id) === chave(c.id));
  const tg = (g) => { const s = new Set(abertos); s.has(g) ? s.delete(g) : s.add(g); setAbertos(s); };
  return html`<div class="stack">
    ${isAdmin() && html`<div class="chips"><button class=${'chip' + (medida === 'qtd' ? ' on' : '')} onClick=${() => setMedida('qtd')}>Quantidade</button>
      <button class=${'chip' + (medida === 'valor' ? ' on' : '')} onClick=${() => setMedida('valor')}>Valor de compra (só produtora)</button></div>`}
    <div class="card flush tbl-wrap"><table class="tbl pivot"><thead><tr><th>Grupo / categoria</th>${colunas.map((c) => html`<th class="right nowrap">${c.id ? html`<${Ponto} cor=${corPessoa(c.id)} />${c.nome.split(' ')[0]}` : 'Base'}</th>`)}<th class="right">Total</th></tr></thead>
      <tbody>${grupos.map((g) => {
        const gi = itens.filter((e) => e.grupo === g);
        const cats = [...new Set(gi.map((e) => e.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        return html`<tr class="click grp" onClick=${() => tg(g)}><td><b>${abertos.has(g) ? '▾' : '▸'} ${g}</b></td>
            ${colunas.map((c) => html`<td class="right">${fmt(val(cel(gi, c)))}</td>`)}<td class="right"><b>${fmt(val(gi))}</b></td></tr>
          ${abertos.has(g) && cats.map((cat) => { const ci = gi.filter((e) => e.categoria === cat); return html`<tr>
            <td style="padding-left:30px" class="muted">${cat}</td>
            ${colunas.map((c) => { const v = val(cel(ci, c)); return html`<td class="right">${v ? html`<a href="#" onClick=${(ev) => { ev.preventDefault(); onCelula(g, cat, c.id); }}>${fmt(v)}</a>` : ''}</td>`; })}
            <td class="right">${fmt(val(ci))}</td></tr>`; })}`;
      })}
      <tr class="tot"><td><b>Total</b></td>${colunas.map((c) => html`<td class="right"><b>${fmt(val(cel(itens, c)))}</b></td>`)}<td class="right"><b>${fmt(val(itens))}</b></td></tr>
      </tbody></table></div></div>`;
}

// ================================================================== PÁGINA "MOVER" (fluxo pelo celular / leitor QR)
export function MoverPagina({ query }) {
  const st = useStore();
  const [itens, setItens] = useState(() => (query.itens ? query.itens.split(',').filter((id) => st.equipamentos.some((e) => e.id === id)).map((id) => ({ equipamento_id: id, kit_id: st.equipamentos.find((e) => e.id === id)?.kit_id })) : []));
  const [modal, setModal] = useState(false);
  const eu = minhaPessoa();
  return html`<div>
    <div class="page-head"><div><h1>Mover itens</h1><p>Busque, toque nos itens ou leia as etiquetas com a câmera. Depois escolha para quem vão.</p></div></div>
    <div class="stack lg">
      <${SeletorItens} itens=${itens} onChange=${setItens} modo="mover" />
      <div class="row between"><span class="muted small">${itens.length} item(ns)</span>
        <div class="row">
          ${eu && html`<button class="btn" disabled=${!itens.length} onClick=${() => setModal({ para: eu.id })}>Estão comigo</button>`}
          <button class="btn primary" disabled=${!itens.length} onClick=${() => setModal({})}><${Icone} n="saida" s=${16} />Escolher destino</button></div></div>
    </div>
    ${modal && html`<${MoverModal} itens=${itens} para=${modal.para} onClose=${() => setModal(false)} onFeito=${() => { setItens([]); ir('/quadro'); }} />`}
  </div>`;
}
