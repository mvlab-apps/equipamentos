// Seletor de itens (busca + leitor de QR + kits), usado em Saída e Reserva
import { html, useState, useMemo, useEffect, useRef, store, useStore, normalizar, Busca, Badge, Icone, Modal, toast, kitPorId, chaveUnidade, agrupar, listaCodigos, distribuicao, Stepper } from './core.js';

export function buscarEquip(lista, termo) {
  const t = normalizar(termo).trim();
  if (!t) return lista;
  const partes = t.split(/\s+/);
  return lista.filter((e) => {
    const alvo = normalizar([e.codigo, e.nome, e.marca, e.modelo, e.numero_serie, e.categoria, e.tags, e.kit_nome, e.localizacao].join(' '));
    return partes.every((p) => alvo.includes(p));
  });
}

// extrai código de um QR lido (URL do app ou texto puro)
export function interpretarCodigo(txt) {
  const s = (txt || '').trim();
  let m = s.match(/#\/e\/([^?#]+)/); if (m) return { tipo: 'item', codigo: decodeURIComponent(m[1]).toUpperCase() };
  m = s.match(/#\/k\/([^?#]+)/); if (m) return { tipo: 'kit', codigo: decodeURIComponent(m[1]).toUpperCase() };
  return { tipo: 'texto', codigo: s.toUpperCase() };
}

let carregandoLib = null;
function carregarLeitor() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!carregandoLib) carregandoLib = new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = 'vendor/html5-qrcode.min.js'; s.onload = ok; s.onerror = erro; document.head.appendChild(s);
  });
  return carregandoLib;
}

export function LeitorQR({ onLido, onClose }) {
  const [erro, setErro] = useState('');
  const [ultimo, setUltimo] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    let leitor; let vivo = true; const recentes = new Map();
    carregarLeitor().then(() => {
      if (!vivo) return;
      leitor = new window.Html5Qrcode('leitor', { verbose: false });
      ref.current = leitor;
      return leitor.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, (txt) => {
        const agora = Date.now();
        if (recentes.has(txt) && agora - recentes.get(txt) < 2500) return;
        recentes.set(txt, agora);
        if (navigator.vibrate) navigator.vibrate(60);
        setUltimo(onLido(txt) || txt);
      });
    }).catch((e) => setErro('Não foi possível abrir a câmera. Verifique a permissão do navegador. ' + (e?.message || '')));
    return () => { vivo = false; try { ref.current && ref.current.stop().catch(() => {}); } catch (_) {} };
  }, []);
  return html`<${Modal} titulo="Ler etiquetas (QR)" onClose=${onClose} rodape=${html`<button class="btn primary" onClick=${onClose}>Concluir</button>`}>
    <div class="stack">
      ${erro ? html`<div class="alert bad">${erro}</div>` : html`<div id="leitor"></div>`}
      <div class="small muted">Aponte para as etiquetas uma a uma. Cada leitura entra na lista automaticamente.</div>
      ${ultimo && html`<div class="alert ok">${ultimo}</div>`}
    </div><//>`;
}

/**
 * itens: [{equipamento_id, kit_id}]
 * modo: 'mover' (qualquer item não baixado) | 'job' (itens operacionais ou em manutenção)
 */
export function SeletorItens({ itens, onChange, modo = 'mover', alertas = {} }) {
  const st = useStore();
  const [termo, setTermo] = useState('');
  const [aba, setAba] = useState('itens');
  const [leitor, setLeitor] = useState(false);
  const atual = useRef({ itens, onChange });
  atual.current = { itens, onChange };
  const lerItens = () => atual.current.itens;
  const gravar = (novo) => { atual.current.itens = novo; atual.current.onChange(novo); };
  const selIds = new Set(itens.map((i) => i.equipamento_id));
  const jaTem = (id) => lerItens().some((i) => i.equipamento_id === id);
  const elegivel = (e) => (modo === 'mover' ? e.status !== 'baixado' : !['baixado', 'extraviado'].includes(e.status));

  // unidades iguais aparecem como um resultado só ("5×"); cada toque adiciona mais uma
  const resultados = useMemo(() => agrupar(buscarEquip(st.equipamentos.filter((e) => e.status !== 'baixado'), termo)).slice(0, 40), [st.equipamentos, termo]);
  // próxima unidade livre de um grupo: primeiro as da base, depois as que estão com alguém
  const proxima = (g) => g.filter((e) => elegivel(e) && !jaTem(e.id)).sort((a, b) => (a.portador_id ? 1 : 0) - (b.portador_id ? 1 : 0))[0];
  const definirQtd = (g, n) => {
    const atuais = lerItens().filter((i) => !i.kit_id && g.some((e) => e.id === i.equipamento_id));
    if (n < atuais.length) { const tirar = new Set(atuais.slice(n).map((i) => i.equipamento_id)); gravar(lerItens().filter((i) => !tirar.has(i.equipamento_id))); }
    else { const livres = g.filter((e) => elegivel(e) && !jaTem(e.id)).sort((a, b) => (a.portador_id ? 1 : 0) - (b.portador_id ? 1 : 0)).slice(0, n - atuais.length); gravar([...lerItens(), ...livres.map((e) => ({ equipamento_id: e.id, kit_id: null }))]); }
  };

  const adicionar = (e, kit_id = null) => {
    if (jaTem(e.id)) return false;
    // item de kit fixo entra com o kit inteiro
    const kf = e.kit_id && kitPorId(e.kit_id);
    if (kf && kf.modo === 'fixo' && !kit_id) { adicionarKit(kf); return true; }
    if (!elegivel(e)) { toast(`${e.codigo} está ${e.status === 'baixado' ? 'baixado' : 'indisponível'}.`, 'erro'); return false; }
    gravar([...lerItens(), { equipamento_id: e.id, kit_id }]); return true;
  };
  const adicionarKit = (k) => {
    const membros = st.equipamentos.filter((e) => e.kit_id === k.id);
    const fora = membros.filter((e) => !elegivel(e) && !jaTem(e.id));
    const novos = membros.filter((e) => elegivel(e) && !jaTem(e.id)).map((e) => ({ equipamento_id: e.id, kit_id: k.id }));
    gravar([...lerItens(), ...novos]);
    if (fora.length) toast(`${k.nome}: ${novos.length} adicionados. Fora: ${fora.map((e) => e.codigo).join(', ')} (indisponível).`, 'erro');
    else toast(`${k.nome}: ${novos.length} itens adicionados.`, 'ok');
    return `${k.nome} (+${novos.length})`;
  };
  const remover = (id) => {
    const e = store.get().equipamentos.find((x) => x.id === id); const kf = e?.kit_id && kitPorId(e.kit_id);
    if (kf && kf.modo === 'fixo') return gravar(lerItens().filter((i) => store.get().equipamentos.find((x) => x.id === i.equipamento_id)?.kit_id !== kf.id));
    gravar(lerItens().filter((i) => i.equipamento_id !== id));
  };
  const removerKit = (kid) => gravar(lerItens().filter((i) => i.kit_id !== kid));

  const porCodigo = (txt) => {
    const r = interpretarCodigo(txt);
    if (r.tipo === 'kit' || (r.tipo === 'texto' && store.get().kits.some((k) => (k.codigo || '').toUpperCase() === r.codigo))) {
      const k = store.get().kits.find((k) => (k.codigo || '').toUpperCase() === r.codigo);
      if (k) return adicionarKit(k);
    }
    const e = store.get().equipamentos.find((e) => e.codigo.toUpperCase() === r.codigo);
    if (e) { if (adicionar(e)) { setTermo(''); return `${e.codigo} · ${e.nome} adicionado`; } return `${e.codigo} não adicionado`; }
    if (r.tipo !== 'texto') toast('Etiqueta não encontrada: ' + r.codigo, 'erro');
    return null;
  };

  const kitsResumo = st.kits.map((k) => {
    const m = st.equipamentos.filter((e) => e.kit_id === k.id);
    return { ...k, total: m.length, disp: m.filter(elegivel).length };
  }).filter((k) => k.total && normalizar(k.nome + ' ' + (k.codigo || '')).includes(normalizar(termo)));

  const selecionados = itens.map((i) => ({ ...i, e: st.equipamentos.find((e) => e.id === i.equipamento_id) })).filter((x) => x.e);
  const gruposKit = {};
  selecionados.forEach((s) => { const k = s.kit_id || ''; (gruposKit[k] = gruposKit[k] || []).push(s); });

  return html`<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    <div class="stack">
      <div class="row nw">
        <${Busca} valor=${termo} onInput=${setTermo} placeholder="Nome, código, marca, nº de série… (Enter adiciona pelo código)" onEnter=${(v) => { if (!porCodigo(v)) { const r = buscarEquip(st.equipamentos.filter(elegivel), v); if (r.length === 1) { adicionar(r[0]); setTermo(''); } } }} />
        <button type="button" class="btn icon" title="Ler QR com a câmera" onClick=${() => setLeitor(true)}><${Icone} n="camera" /></button>
      </div>
      <div class="tabs" style="margin:0">
        <button type="button" class=${'tab' + (aba === 'itens' ? ' on' : '')} onClick=${() => setAba('itens')}>Equipamentos</button>
        <button type="button" class=${'tab' + (aba === 'kits' ? ' on' : '')} onClick=${() => setAba('kits')}>Kits (${st.kits.length})</button>
      </div>
      <div class="picker-results list">
        ${aba === 'itens' ? resultados.map((g) => {
          const e = g[0];
          if (g.length === 1) {
            const ok = elegivel(e); const ja = selIds.has(e.id);
            return html`<div key=${e.id} class=${'li click' + (!ok || ja ? ' disabled-row' : '')} onClick=${() => !ja && adicionar(e)}>
              <div class="grow"><div class="t ellipsis">${e.nome}</div><div class="s"><span class="mono">${e.codigo}</span> · ${e.categoria}${e.kit_nome ? ' · ' + e.kit_nome : ''} · ${e.portador_nome ? 'com ' + e.portador_nome : 'na base'}${e.dono_id ? html` · <span class="tag-colab">◆ próprio</span>` : ''}</div></div>
              ${ja ? html`<span class="badge b-gold plain">Na lista</span>` : html`<${Badge} e=${e} />`}
            </div>`;
          }
          const naLista = g.filter((x) => selIds.has(x.id)).length; const prox = proxima(g);
          return html`<div key=${'g' + e.id} class=${'li click' + (!prox ? ' disabled-row' : '')} onClick=${() => prox && adicionar(prox)}>
            <span class="qtd">${g.length}×</span>
            <div class="grow"><div class="t ellipsis">${e.nome}</div><div class="s">${e.categoria} · ${distribuicao(g)}${e.dono_id ? html` · <span class="tag-colab">◆ próprio</span>` : ''}</div></div>
            ${naLista ? html`<${Stepper} valor=${naLista} min=${0} max=${g.filter((x) => elegivel(x)).length} rotulo="Quantas unidades" onChange=${(n) => definirQtd(g, n)} />` : html`<span class="btn sm">+1</span>`}
          </div>`;
        }) : kitsResumo.map((k) => html`<div key=${k.id} class=${'li click' + (k.disp === 0 ? ' disabled-row' : '')} onClick=${() => adicionarKit(k)}>
            <div class="grow"><div class="t">${k.nome}</div><div class="s">${k.codigo ? html`<span class="mono">${k.codigo}</span> · ` : ''}${k.total} itens${k.tipo ? ' · ' + k.tipo : ''} · ${k.modo === 'fixo' ? 'kit fixo' : 'conjunto'}</div></div>
            <span class="btn sm">Adicionar kit</span></div>`)}
        ${aba === 'itens' && !resultados.length && html`<div class="empty">Nada encontrado.</div>`}
        ${aba === 'kits' && !kitsResumo.length && html`<div class="empty">Nenhum kit cadastrado.</div>`}
      </div>
    </div>
    <div class="card flush">
      <div class="card-head" style="padding:14px 16px 0"><h3>Selecionados <span class="badge b-gold plain">${selecionados.length}</span></h3>
        ${selecionados.length > 0 && html`<button type="button" class="btn ghost sm" onClick=${() => onChange([])}>Limpar</button>`}</div>
      <div class="list sel-list">
        ${!selecionados.length && html`<div class="empty">Busque, toque num item ou leia o QR da etiqueta.</div>`}
        ${Object.entries(gruposKit).map(([kid, arr]) => html`
          ${kid && html`<div class="li" style="background:var(--surface-2)"><div class="grow small"><b>${kitPorId(kid)?.nome || 'Kit'}</b></div><button type="button" class="btn ghost sm" onClick=${() => removerKit(kid)}>Remover kit</button></div>`}
          ${agrupar(arr, (x) => chaveUnidade(x.e)).map((g) => {
            const s = g[0];
            if (g.length === 1) return html`<div key=${s.equipamento_id} class="li">
              <div class="grow"><div class="t ellipsis">${s.e.nome}</div>
                <div class="s"><span class="mono">${s.e.codigo}</span>${alertas[s.equipamento_id] ? html` · <span style="color:var(--res)">${alertas[s.equipamento_id]}</span>` : ''}</div></div>
              <button type="button" class="btn ghost sm icon" aria-label="Remover" onClick=${() => remover(s.equipamento_id)}><${Icone} n="x" s=${16} /></button></div>`;
            const alerta = g.map((x) => alertas[x.equipamento_id]).filter(Boolean)[0];
            const todasUnid = store.get().equipamentos.filter((e) => e.status !== 'baixado' && chaveUnidade(e) === chaveUnidade(s.e));
            return html`<div key=${'g' + s.equipamento_id} class="li"><span class="qtd">${g.length}×</span>
              <div class="grow"><div class="t ellipsis">${s.e.nome}</div>
                <div class="s"><span class="mono">${listaCodigos(g.map((x) => x.e))}</span>${alerta ? html` · <span style="color:var(--res)">${alerta}</span>` : ''}</div></div>
              ${!kid && html`<${Stepper} valor=${g.length} min=${0} max=${todasUnid.filter(elegivel).length} onChange=${(n) => definirQtd(todasUnid, n)} />`}
              <button type="button" class="btn ghost sm icon" aria-label="Remover todas" onClick=${() => { const ids = new Set(g.map((x) => x.equipamento_id)); gravar(lerItens().filter((i) => !ids.has(i.equipamento_id))); }}><${Icone} n="x" s=${16} /></button></div>`;
          })}`)}
      </div>
    </div>
    ${leitor && html`<${LeitorQR} onLido=${porCodigo} onClose=${() => setLeitor(false)} />`}
  </div>`;
}
