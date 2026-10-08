// Regras de jobs: cobertura dos requisitos do modelo, conflitos de agenda e sugestão automática
import { store, normalizar } from './core.js';

const mesmo = (a, b) => normalizar(a).trim() === normalizar(b).trim();
const sobrepoe = (a, b) => new Date(a.inicio) < new Date(b.fim) && new Date(b.inicio) < new Date(a.fim);
export const jobAtivo = (j) => j.status === 'ativo';
const OPERACIONAL = (e) => e && e.status === 'ok';

export function modeloDe(job) { return job.modelo_id ? store.get().modelos.find((m) => m.id === job.modelo_id) : null; }

export function rotuloRequisito(r) {
  const st = store.get();
  if (r.tipo === 'kit') return `${r.quantidade}× kit de ${r.valor}`;
  if (r.tipo === 'categoria') return `${r.quantidade}× ${r.valor}`;
  const e = st.equipamentos.find((x) => x.id === r.valor);
  return `${e ? e.nome : 'Item removido'}`;
}

// itens do job enriquecidos
export function itensDoJob(job) {
  const st = store.get();
  return (job.job_itens || []).map((i) => ({ ...i, e: st.equipamentos.find((x) => x.id === i.equipamento_id) })).filter((i) => i.e);
}

// para cada requisito: quantos estão alocados e quanto falta
export function cobertura(job) {
  const st = store.get();
  const modelo = modeloDe(job);
  const itens = itensDoJob(job);
  const linhas = (modelo?.modelo_requisitos || []).slice().sort((a, b) => a.ordem - b.ordem).map((r) => {
    let alocados = [];
    if (r.tipo === 'kit') {
      const kitIds = [...new Set(itens.map((i) => i.e.kit_id).filter(Boolean))];
      alocados = kitIds.map((id) => st.kits.find((k) => k.id === id)).filter((k) => k && mesmo(k.tipo || '', r.valor)).map((k) => ({ id: k.id, nome: k.nome, kit: true }));
    } else if (r.tipo === 'categoria') {
      alocados = itens.filter((i) => mesmo(i.e.categoria, r.valor)).map((i) => ({ id: i.e.id, nome: i.e.nome }));
    } else {
      alocados = itens.filter((i) => i.e.id === r.valor).map((i) => ({ id: i.e.id, nome: i.e.nome }));
    }
    const qtd = r.tipo === 'item' ? 1 : r.quantidade;
    return { r, alocados, falta: Math.max(0, qtd - alocados.length), qtd };
  });
  const falta = linhas.reduce((s, l) => s + l.falta, 0);
  return { modelo, linhas, falta, nItens: itens.length };
}

export function jobsSobrepostos(job) {
  return store.get().jobs.filter((o) => o.id !== job.id && jobAtivo(o) && sobrepoe(job, o));
}

// itens deste job que também estão em outro job no mesmo horário
export function conflitos(job) {
  const meus = new Set((job.job_itens || []).map((i) => i.equipamento_id));
  const out = [];
  for (const o of jobsSobrepostos(job)) for (const i of o.job_itens || []) if (meus.has(i.equipamento_id)) out.push({ equipamento_id: i.equipamento_id, job: o });
  return out;
}

export function resumoJob(job) {
  const c = cobertura(job);
  const conf = conflitos(job);
  let estado = 'vazio', rot = 'Sem equipamentos';
  if (c.modelo && c.linhas.length) {
    if (c.falta === 0) { estado = 'ok'; rot = 'Completo'; } else { estado = 'falta'; rot = `Faltam ${c.falta}`; }
  } else if (c.nItens) { estado = 'ok'; rot = `${c.nItens} itens`; }
  else if (!c.modelo) { estado = 'semmodelo'; rot = 'Sem modelo'; }
  else { estado = 'semreq'; rot = 'Modelo sem requisitos'; }
  return { ...c, conflitos: conf, estado, rot };
}

/**
 * Sugere itens para cobrir o que falta. Prioridade: com o responsável do job → na base → demais.
 * Evita itens em manutenção e itens já alocados em jobs no mesmo horário.
 */
export function sugerir(job) {
  const st = store.get();
  const c = cobertura(job);
  const ocupados = new Set(jobsSobrepostos(job).flatMap((o) => (o.job_itens || []).map((i) => i.equipamento_id)));
  const atuais = new Set((job.job_itens || []).map((i) => i.equipamento_id));
  const novos = [];
  const usar = (e, kit_id = null) => { atuais.add(e.id); novos.push({ equipamento_id: e.id, kit_id }); };
  const prioridade = (portador) => (job.responsavel_id && portador === job.responsavel_id ? 0 : !portador ? 1 : 2);
  const naoAtendidos = [];

  for (const l of c.linhas) {
    if (!l.falta) continue;
    const { r } = l;
    let faltam = l.falta;
    if (r.tipo === 'kit') {
      const candidatos = st.kits.filter((k) => mesmo(k.tipo || '', r.valor)).map((k) => {
        const membros = st.equipamentos.filter((e) => e.kit_id === k.id);
        return { k, membros, livre: membros.length > 0 && membros.every((e) => !ocupados.has(e.id) && !atuais.has(e.id)) && membros.some(OPERACIONAL) };
      }).filter((x) => x.livre).sort((a, b) => prioridade(a.membros[0]?.portador_id) - prioridade(b.membros[0]?.portador_id));
      for (const x of candidatos) { if (!faltam) break; x.membros.filter(OPERACIONAL).forEach((e) => usar(e, x.k.id)); faltam--; }
    } else if (r.tipo === 'categoria') {
      const candidatos = st.equipamentos.filter((e) => OPERACIONAL(e) && mesmo(e.categoria, r.valor) && !ocupados.has(e.id) && !atuais.has(e.id))
        .sort((a, b) => (a.kit_id ? 1 : 0) - (b.kit_id ? 1 : 0) || prioridade(a.portador_id) - prioridade(b.portador_id));
      for (const e of candidatos) { if (!faltam) break; usar(e); faltam--; }
    } else {
      const e = st.equipamentos.find((x) => x.id === r.valor);
      if (e && OPERACIONAL(e) && !ocupados.has(e.id) && !atuais.has(e.id)) { usar(e); faltam--; }
    }
    if (faltam > 0) naoAtendidos.push(`${rotuloRequisito(r)} (faltam ${faltam})`);
  }
  return { novos, naoAtendidos };
}
