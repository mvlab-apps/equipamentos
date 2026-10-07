import { html, useState, useEffect, sb, useStore, q, acao, confirmar, fmtData, Icone, Campo, carregarTudo } from './core.js';

export function Equipe() {
  const st = useStore();
  const [cfg, setCfg] = useState({ dominio: st.config.dominio_auto_aprovado || '', prefixo: st.config.prefixo_codigo || 'MV' });
  useEffect(() => { carregarTudo(); }, []);
  const pend = st.perfis.filter((p) => !p.ativo);
  const ativos = st.perfis.filter((p) => p.ativo);
  const upd = (p, patch, msg) => acao(() => q(sb.from('perfis').update(patch).eq('id', p.id)), msg);
  const salvarCfg = () => acao(() => q(sb.from('config').upsert([{ chave: 'dominio_auto_aprovado', valor: cfg.dominio.trim().replace(/^@/, '') }, { chave: 'prefixo_codigo', valor: cfg.prefixo.trim().toUpperCase() || 'MV' }])), 'Configurações salvas.');
  const Linha = ({ p }) => html`<tr key=${p.id}>
    <td><div style="font-weight:550">${p.nome || '—'}${p.id === st.perfil.id ? html` <span class="badge b-gold plain">você</span>` : ''}</div><div class="small muted">${p.email}${p.telefone ? ' · ' + p.telefone : ''}</div></td>
    <td class="hide-m small muted">${fmtData(p.criado_em)}</td>
    <td><select class="input" style="width:auto;height:32px" value=${p.papel} onChange=${(e) => upd(p, { papel: e.target.value }, 'Papel atualizado.')}>
      <option value="membro">Membro</option><option value="admin">Administrador</option></select></td>
    <td class="right">${p.ativo
      ? html`<button class="btn ghost sm" disabled=${p.id === st.perfil.id} onClick=${async () => (await confirmar(`Bloquear o acesso de ${p.nome || p.email}?`, { perigo: true, ok: 'Bloquear' })) && upd(p, { ativo: false }, 'Acesso bloqueado.')}>Bloquear</button>`
      : html`<button class="btn primary sm" onClick=${() => upd(p, { ativo: true }, 'Acesso aprovado.')}><${Icone} n="check" s=${15} />Aprovar</button>`}</td></tr>`;
  return html`<div>
    <div class="page-head"><div><h1>Equipe e acesso</h1><p>Membros registram saídas, devoluções, reservas e problemas. Administradores também cadastram e editam itens, kits, valores e notas fiscais.</p></div></div>
    <div class="stack lg">
      ${pend.length > 0 && html`<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Aguardando aprovação</h2></div>
        <div class="tbl-wrap"><table class="tbl"><tbody>${pend.map((p) => html`<${Linha} p=${p} />`)}</tbody></table></div></div>`}
      <div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h2>Pessoas com acesso (${ativos.length})</h2></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pessoa</th><th class="hide-m">Desde</th><th>Papel</th><th></th></tr></thead><tbody>${ativos.map((p) => html`<${Linha} p=${p} />`)}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Como convidar alguém</h2></div>
        <ol style="margin:0;padding-left:18px;line-height:1.8"><li>Envie o link deste site.</li><li>A pessoa clica em <b>Primeiro acesso? Criar conta</b>.</li>
          <li>E-mails <b>@${cfg.dominio || 'seudominio'}</b> entram aprovados; os demais aparecem acima para você aprovar.</li></ol></div>
      <div class="card"><div class="card-head"><h2>Configurações</h2></div><div class="grid-form">
        <${Campo} rotulo="Domínio aprovado automaticamente"><input class="input" value=${cfg.dominio} onInput=${(e) => setCfg({ ...cfg, dominio: e.target.value })} placeholder="labmv.com.br" /><//>
        <${Campo} rotulo="Prefixo dos códigos automáticos"><input class="input mono" value=${cfg.prefixo} onInput=${(e) => setCfg({ ...cfg, prefixo: e.target.value })} /><//>
        <div class="field" style="justify-content:flex-end"><button class="btn primary" onClick=${salvarCfg}>Salvar</button></div></div></div>
    </div></div>`;
}
