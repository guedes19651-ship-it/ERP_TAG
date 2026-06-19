(function () {
  const uid = sessionStorage.getItem('erp_usuario_id');
  const nome = sessionStorage.getItem('erp_usuario_nome') || '';
  const state = { relatorios: [], relAtual: null, despesas: [], kms: [], valorKm: 0.7, osLista: [], arquivoDespesa: null, editandoCabecalho: false };

  function el(id) { return document.getElementById(id); }
  function show(id, on) {
    const e = el(id);
    if (!e) return;
    if (on) {
      e.style.display = id.startsWith('modal-') ? 'flex' : '';
    } else {
      e.style.display = 'none';
    }
  }
  function text(id, v) { const e = el(id); if (e) e.textContent = v; }
  function money(v) { return formatarMoeda(Number(v || 0)); }
  function moneyCell(v, style = '') {
    const txt = money(v).replace(/\s+/g, ' ').trim();
    const amount = txt.startsWith('R$') ? txt.slice(2).trim() : txt;
    const styleAttr = style ? ` style="${style}"` : '';
    return `<span class="money-cell"${styleAttr}><span class="money-rs">R$</span><span class="money-val">${amount}</span></span>`;
  }
  function dbr(v) { return v ? String(v).split('-').reverse().join('/') : '—'; }
  function statusLabel(s) { return ({ RASCUNHO: 'Rascunho', SUBMETIDO: 'Submetido', APROVADO: 'Aprovado', REJEITADO: 'Rejeitado', PAGO: 'Pago' })[s] || s || ''; }
  function textoOS(os) { return os ? `${os.numero_os || ''}${os.nome_fantasia ? ' — ' + os.nome_fantasia : ''}` : ''; }
  function parseMoeda(v) { let t = String(v || '0').replace(/[^\d,.-]/g, '').trim(); if (!t) return 0; if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else { const p = t.split('.'); if (p.length > 2 || (p.length === 2 && p[1].length > 2)) t = t.replace(/\./g, ''); } return parseFloat(t) || 0; }
  function limparCampoMoeda(i) { i.value = i.value.replace(/[^\d,.]/g, ''); }
  function formatarCampoMoeda(i) { i.value = money(parseMoeda(i.value)); }
  function abrirCalendario(id) { const i = el(id); if (!i) return; i.focus(); if (typeof i.showPicker === 'function') i.showPicker(); else i.click(); }
  function previewArq(input) {
    const file = input?.files?.[0] || null;
    state.arquivoDespesa = file;
    const nome = el('d-arq-nome');
    const preview = el('d-arq-preview');
    if (nome) nome.textContent = file ? file.name : 'Nenhum arquivo';
    if (!preview) return;
    preview.innerHTML = '';
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.style.cssText = 'max-width:100%;max-height:160px;border:1px solid #2a2a2a;border-radius:6px;display:block;';
      img.alt = file.name;
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);
    } else if (file.type === 'application/pdf') {
      preview.innerHTML = `<div style="font-size:.8rem;color:#9aa0a6">📄 ${file.name}</div>`;
    } else {
      preview.innerHTML = `<div style="font-size:.8rem;color:#9aa0a6">📎 ${file.name}</div>`;
    }
  }

  async function uploadComprovante(file, reembolsoId) {
    if (!file) return { url: null, nome: null };
    const bucket = 'reembolsos-docs';
    const path = `${reembolsoId}/${Date.now()}_${file.name}`.replace(/\s+/g, '_');
    const { error: uploadError } = await db.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (uploadError) throw uploadError;
    const { data } = db.storage.from(bucket).getPublicUrl(path);
    return { url: data?.publicUrl || null, nome: file.name };
  }

  async function carregar() {
    const [{ data: cfg }, { data: os }] = await Promise.all([
      db.from('reembolso_config').select('valor_km').single(),
      db.from('ordens_servico').select('id,numero_os,nome_fantasia').eq('ativo', true).order('numero_os')
    ]);
    state.valorKm = parseFloat(cfg?.valor_km) || 0.7;
    state.osLista = os || [];
    const f = el('f-os');
    if (f) f.innerHTML = '<option value="">Selecione a O.S...</option>' + state.osLista.map(o => `<option value="${o.id}">${textoOS(o)}</option>`).join('');
    const { data, error } = await db.from('reembolsos').select('*').eq('usuario_id', parseInt(uid)).order('id', { ascending: false });
    if (error) return mostrarToast('Erro ao carregar: ' + error.message, 'error');
    state.relatorios = data || [];
    aplicarFiltros();
  }

  function aplicarFiltros() {
    const q = (el('busca')?.value || '').toLowerCase();
    const st = el('filtro-status')?.value || '';
    const rows = state.relatorios.filter(r => (!q || String(r.numero_reembolso || '').toLowerCase().includes(q) || String(r.numero_os || '').toLowerCase().includes(q)) && (!st || r.status === st));
    const tbody = el('tbody-lista'); if (!tbody) return;
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#555;padding:40px;">Nenhum relatório encontrado</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => {
      const saldo = parseFloat(r.saldo_reembolso || 0);
      const cor = saldo >= 0 ? '#5aff8a' : '#ff7070';
      const excl = `<button class="btn-icon" onclick="excluirRelatorio(${r.id})" title="Excluir relatório" style="color:#ff7070;">🗑️</button>`;
      return `<tr>
        <td>${r.numero_reembolso || '—'}</td>
        <td>${r.usuario_nome || '—'}</td>
        <td>${r.numero_os || '—'}</td>
        <td>${moneyCell(r.total_geral)}</td>
        <td>${moneyCell(r.adiantamento)}</td>
        <td>${moneyCell(saldo, `color:${cor};font-weight:600;`)}</td>
        <td><span class="badge-st badge-${r.status}">${statusLabel(r.status)}</span></td>
        <td class="acao"><button class="btn-icon" onclick="abrirRelatorio(${r.id})" title="Abrir">📂</button></td>
        <td class="acao">${excl}</td>
      </tr>`;
    }).join('');
  }

  function renderCabecalho() {
    const r = state.relAtual; if (!r) return;
    text('ed-num', r.numero_reembolso || '—');
    text('ed-func', r.usuario_nome || '—');
    text('ed-os', r.numero_os || '—');
    text('ed-obs', r.observacao || '—');
  }

  function renderDespesas() {
    const tbody = el('tbody-desp'); if (!tbody || !state.relAtual) return;
    const editavel = ['RASCUNHO', 'REJEITADO'].includes(state.relAtual.status);
    if (!state.despesas.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:#555;text-align:center;padding:18px;">Nenhuma despesa lançada</td></tr>'; return; }
    tbody.innerHTML = state.despesas.map(d => {
      const arq = d.arquivo_url
        ? `<span style="display:flex;justify-content:center;gap:8px;white-space:nowrap;"><a href="${d.arquivo_url}" target="_blank" class="link-doc" title="${d.arquivo_nome || ''}">📎 Ver</a><a href="#" onclick="baixarComprovante(this);return false;" data-url="${encodeURIComponent(d.arquivo_url)}" data-nome="${encodeURIComponent(d.arquivo_nome || 'comprovante')}" class="link-doc" title="Baixar comprovante">⬇️ Baixar</a></span>`
        : '<span style="color:#3a3a3a;">—</span>';
      const acao = editavel
        ? `<span style="display:flex;gap:2px;justify-content:center;align-items:center;"><button class="btn-icon" onclick="editarDespesa(${d.id})" title="Editar" style="color:#5aafff;">✏️</button><button class="btn-icon" onclick="excluirDespesa(${d.id})" title="Excluir" style="color:#ff7070;">🗑️</button></span>`
        : '';
      return `<tr>
        <td style="font-size:.83rem;">${dbr(d.data_despesa)}</td>
        <td><span style="font-size:.75rem;background:#1e1e1e;border:1px solid #333;padding:2px 8px;border-radius:10px;">${d.tipo || '—'}</span></td>
        <td style="color:#bbb;">${d.descricao || '—'}</td>
        <td style="font-size:.8rem;color:#777;">${d.numero_documento || '—'}</td>
        <td class="right" style="font-weight:600;">${money(d.valor)}</td>
        <td class="center">${arq}</td>
        <td class="acao center">${acao}</td>
      </tr>`;
    }).join('');
  }

  function renderKm() {
    const tbody = el('tbody-km'); if (!tbody || !state.relAtual) return;
    const editavel = ['RASCUNHO', 'REJEITADO'].includes(state.relAtual.status);
    const taxa = state.relAtual.valor_km_utilizado || state.valorKm;
    text('info-taxa', `Taxa aplicada: ${money(taxa)} / km`);
    if (!state.kms.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:#555;text-align:center;padding:18px;">Nenhuma quilometragem lançada</td></tr>'; return; }
    tbody.innerHTML = state.kms.map(k => {
      const v = (parseFloat(k.km) || 0) * taxa;
      const acao = editavel ? `<span style="display:flex;gap:2px;justify-content:center;align-items:center;"><button class="btn-icon" onclick="editarKm(${k.id})" title="Editar" style="color:#5aafff;">✏️</button><button class="btn-icon" onclick="excluirKm(${k.id})" title="Excluir" style="color:#aa3333;">🗑️</button></span>` : '';
      return `<tr>
        <td style="font-size:.83rem;">${dbr(k.data_km)}</td>
        <td style="color:#bbb;font-size:.83rem;">${k.percurso || '—'}</td>
        <td style="color:#aaa;">${k.descricao || '—'}</td>
        <td class="right">${Number(k.km || 0).toFixed(1)}</td>
        <td class="right" style="font-weight:600;">${money(v)}</td>
        <td class="acao center">${acao}</td>
      </tr>`;
    }).join('');
  }

  function atualizarResumo() {
    if (!state.relAtual) return;
    const taxa = state.relAtual.valor_km_utilizado || state.valorKm;
    const totDesp = state.despesas.reduce((a, d) => a + (parseFloat(d.valor) || 0), 0);
    const qtdKm = state.kms.reduce((a, k) => a + (parseFloat(k.km) || 0), 0);
    const totKm = qtdKm * taxa;
    const total = totDesp + totKm;
    const adiant = parseFloat(state.relAtual.adiantamento) || 0;
    const saldo = total - adiant;
    text('r-desp', money(totDesp));
    text('r-km-qtd', qtdKm.toFixed(1));
    text('r-km-val', money(totKm));
    text('r-total', money(total));
    text('r-adiant', money(adiant));
    const s = el('r-saldo'); if (s) { s.textContent = money(saldo); s.style.color = saldo >= 0 ? '#5aff8a' : '#ff7070'; }
  }

  async function abrirRelatorio(id) {
    const rel = state.relatorios.find(r => r.id === id); if (!rel) return;
    state.relAtual = rel;
    const [{ data: d1 }, { data: d2 }] = await Promise.all([
      db.from('reembolso_despesas').select('*').eq('reembolso_id', id).order('data_despesa'),
      db.from('reembolso_km').select('*').eq('reembolso_id', id).order('data_km')
    ]);
    state.despesas = d1 || [];
    state.kms = d2 || [];
    show('secao-lista', false); show('secao-edicao', true);
    renderCabecalho(); renderDespesas(); renderKm(); atualizarResumo();
    const editavel = ['RASCUNHO', 'REJEITADO'].includes(state.relAtual.status);
    show('btn-add-desp', editavel); show('btn-add-km', editavel); show('btn-edit-cab', editavel); show('btn-submeter', editavel); show('btn-reenv-email', state.relAtual.status !== 'RASCUNHO');
    const av = el('aviso-rej'); if (av) av.style.display = state.relAtual.status === 'REJEITADO' ? 'block' : 'none';
    if (state.relAtual.status === 'REJEITADO') text('txt-motivo', state.relAtual.motivo_rejeicao || '(sem motivo informado)');
  }

  function voltarLista() { state.relAtual = null; state.despesas = []; state.kms = []; show('secao-edicao', false); show('secao-lista', true); aplicarFiltros(); }
  async function excluirRelatorio(id) {
    const rel = state.relatorios.find(r => r.id === id); if (!rel) return;
    if (!await confirmar(`Excluir o relatório ${rel.numero_reembolso}?`, 'Confirmar Exclusão')) return;
    await db.from('reembolso_despesas').delete().eq('reembolso_id', id);
    await db.from('reembolso_km').delete().eq('reembolso_id', id);
    const { error } = await db.from('reembolsos').delete().eq('id', id);
    if (error) return mostrarToast('Erro ao excluir relatório: ' + error.message, 'error');
    state.relatorios = state.relatorios.filter(r => r.id !== id); aplicarFiltros(); mostrarToast('Relatório excluído', 'success');
  }

  function abrirModalRelatorio(){
    state.editandoCabecalho = false;
    text('modal-rel-titulo','Novo Relatório');
    text('btn-salvar-rel','Criar Relatório');
    el('f-os').value='';
    el('f-adiant').value='0,00';
    el('f-obs').value='';
    show('modal-rel', true);
  }
  function editarCabecalho(){
    if (!state.relAtual) return mostrarToast('Abra um relatório para editar o cabeçalho.', 'error');
    state.editandoCabecalho = true;
    text('modal-rel-titulo','Editar Cabeçalho');
    text('btn-salvar-rel','Salvar Alterações');
    el('f-os').value = String(state.relAtual.os_id || '');
    el('f-adiant').value = money(parseFloat(state.relAtual.adiantamento) || 0).replace(/^R\$\s*/, '');
    el('f-obs').value = state.relAtual.observacao || '';
    show('modal-rel', true);
  }
  function fecharModalRel(){ show('modal-rel', false); }
  function abrirModalDespesa(){ text('modal-desp-titulo','Nova Despesa'); text('btn-salvar-desp','Adicionar'); el('d-data').value=''; el('d-tipo').value=''; el('d-desc').value=''; el('d-doc').value=''; el('d-valor').value='0,00'; el('d-arquivo').value=''; state.arquivoDespesa = null; text('d-arq-nome','Nenhum arquivo'); el('d-arq-preview').innerHTML=''; show('modal-desp', true); }
  function fecharModalDesp(){ show('modal-desp', false); }
  function abrirModalKm(){ text('modal-km-titulo','Nova Quilometragem'); text('btn-salvar-km','Adicionar'); el('k-data').value=''; el('k-percurso').value=''; el('k-desc').value=''; el('k-km').value=''; text('k-preview',''); show('modal-km', true); }
  function fecharModalKm(){ show('modal-km', false); }

  function proximoNumeroReembolso(lista) {
    const nums = (lista || [])
      .map(r => String(r.numero_reembolso || ''))
      .map(s => {
        const m = s.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => Number.isFinite(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `RB-${String(next).padStart(4, '0')}`;
  }

  async function salvarRelatorio() {
    const osId = el('f-os').value;
    const adiantamento = parseMoeda(el('f-adiant').value);
    const observacao = el('f-obs').value.trim();
    if (!osId) return mostrarToast('Selecione a O.S.', 'error');

    const osSel = state.osLista.find(o => String(o.id) === String(osId));
    if (!osSel) return mostrarToast('O.S. inválida.', 'error');

    const btn = el('btn-salvar-rel');
    const textoBtn = btn?.textContent || 'Criar Relatório';
    if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
    try {
      if (state.editandoCabecalho && state.relAtual) {
        const totais = {
          total_despesas: state.despesas.reduce((a, d) => a + (parseFloat(d.valor) || 0), 0),
          total_km: state.kms.reduce((a, k) => a + (parseFloat(k.km) || 0), 0),
        };
        totais.total_km_valor = totais.total_km * (state.relAtual.valor_km_utilizado || state.valorKm);
        totais.total_geral = totais.total_despesas + totais.total_km_valor;
        totais.saldo_reembolso = totais.total_geral - adiantamento;
        const payload = {
          os_id: osSel.id,
          numero_os: textoOS(osSel),
          adiantamento,
          observacao: observacao || null,
          ...totais
        };
        const { data, error } = await db.from('reembolsos').update(payload).eq('id', state.relAtual.id).select('*').single();
        if (error) throw error;
        state.relAtual = data;
        state.relatorios = state.relatorios.map(r => r.id === data.id ? data : r);
        fecharModalRel();
        renderCabecalho();
        atualizarResumo();
        aplicarFiltros();
        mostrarToast('Cabeçalho atualizado com sucesso.', 'success');
      } else {
        const numeroReembolso = proximoNumeroReembolso(state.relatorios);
        const payload = {
          numero_reembolso: numeroReembolso,
          usuario_id: parseInt(uid),
          usuario_nome: nome || sessionStorage.getItem('erp_usuario_nome') || null,
          os_id: osSel.id,
          numero_os: textoOS(osSel),
          adiantamento,
          observacao: observacao || null,
          status: 'RASCUNHO',
          total_despesas: 0,
          total_km: 0,
          valor_km_utilizado: state.valorKm,
          total_km_valor: 0,
          total_geral: 0,
          saldo_reembolso: -adiantamento
        };
        const { data, error } = await db.from('reembolsos').insert(payload).select('*').single();
        if (error) throw error;
        state.relatorios.unshift(data);
        fecharModalRel();
        await abrirRelatorio(data.id);
        mostrarToast('Relatório criado com sucesso.', 'success');
      }
    } catch (error) {
      mostrarToast('Erro ao salvar relatório: ' + (error.message || error), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
      state.editandoCabecalho = false;
    }
  }

  async function salvarDespesa() {
    if (!state.relAtual) return mostrarToast('Abra um relatório antes de adicionar despesas.', 'error');
    const tipo = el('d-tipo').value.trim();
    const data = el('d-data').value;
    const descricao = el('d-desc').value.trim();
    const numeroDocumento = el('d-doc').value.trim();
    const valor = parseMoeda(el('d-valor').value);
    if (!tipo) return mostrarToast('Selecione o tipo da despesa.', 'error');
    if (!data) return mostrarToast('Informe a data da despesa.', 'error');
    if (!valor && valor !== 0) return mostrarToast('Informe o valor da despesa.', 'error');

    const btn = el('btn-salvar-desp');
    const textoBtn = btn?.textContent || 'Adicionar';
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      let arquivoUrl = null;
      let arquivoNome = null;
      if (state.arquivoDespesa) {
        const up = await uploadComprovante(state.arquivoDespesa, state.relAtual.id);
        arquivoUrl = up.url;
        arquivoNome = up.nome;
      }
      const payload = {
        reembolso_id: state.relAtual.id,
        tipo,
        data_despesa: data,
        descricao: descricao || null,
        valor,
        numero_documento: numeroDocumento || null,
        arquivo_url: arquivoUrl,
        arquivo_nome: arquivoNome
      };
      const { data: inserido, error } = await db.from('reembolso_despesas').insert(payload).select('*').single();
      if (error) throw error;
      state.despesas.push(inserido);
      state.despesas.sort((a, b) => String(a.data_despesa || '').localeCompare(String(b.data_despesa || '')));
      renderDespesas();
      atualizarResumo();
      fecharModalDesp();
      mostrarToast('Despesa adicionada com sucesso.', 'success');
    } catch (error) {
      mostrarToast('Erro ao salvar despesa: ' + (error.message || error), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
    }
  }

  async function salvarKm() {
    if (!state.relAtual) return mostrarToast('Abra um relatório antes de adicionar quilometragem.', 'error');
    const data = el('k-data').value;
    const percurso = el('k-percurso').value.trim();
    const descricao = el('k-desc').value.trim();
    const km = parseFloat(el('k-km').value || '0');
    if (!data) return mostrarToast('Informe a data da quilometragem.', 'error');
    if (!km || km <= 0) return mostrarToast('Informe a quilometragem rodada.', 'error');

    const btn = el('btn-salvar-km');
    const textoBtn = btn?.textContent || 'Adicionar';
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const payload = {
        reembolso_id: state.relAtual.id,
        data_km: data,
        percurso: percurso || null,
        descricao: descricao || null,
        km
      };
      const { data: inserido, error } = await db.from('reembolso_km').insert(payload).select('*').single();
      if (error) throw error;
      state.kms.push(inserido);
      state.kms.sort((a, b) => String(a.data_km || '').localeCompare(String(b.data_km || '')));
      renderKm();
      atualizarResumo();
      fecharModalKm();
      mostrarToast('Quilometragem adicionada com sucesso.', 'success');
    } catch (error) {
      mostrarToast('Erro ao salvar km: ' + (error.message || error), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
    }
  }

  function editarDespesa(){ mostrarToast('Edição completa será reabilitada na próxima etapa.', 'error'); }
  function editarKm(){ mostrarToast('Edição completa será reabilitada na próxima etapa.', 'error'); }
  async function excluirDespesa(id){ if(!await confirmar('Excluir esta despesa?')) return; const { error } = await db.from('reembolso_despesas').delete().eq('id', id); if (error) return mostrarToast('Erro: ' + error.message, 'error'); state.despesas = state.despesas.filter(d => d.id !== id); renderDespesas(); atualizarResumo(); }
  async function excluirKm(id){ if(!await confirmar('Excluir esta linha de km?')) return; const { error } = await db.from('reembolso_km').delete().eq('id', id); if (error) return mostrarToast('Erro: ' + error.message, 'error'); state.kms = state.kms.filter(k => k.id !== id); renderKm(); atualizarResumo(); }
  async function baixarComprovante(btn){ const url = decodeURIComponent(btn.dataset.url || ''); const nome = decodeURIComponent(btn.dataset.nome || 'comprovante'); if (!url) return; const old = btn.textContent; btn.textContent = 'Baixando...'; try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } catch { mostrarToast('Não foi possível baixar o comprovante', 'error'); } finally { btn.textContent = old; } }
  async function submeterRelatorio(){ if (!state.relAtual) return; if (!state.despesas.length && !state.kms.length) return mostrarToast('Adicione ao menos uma despesa ou km antes de submeter', 'error'); if (!await confirmar('Submeter para aprovação? Não poderá mais editar após submeter.', 'Confirmar Submissão', 'warning')) return; const { error } = await db.from('reembolsos').update({ status: 'SUBMETIDO' }).eq('id', state.relAtual.id); if (error) return mostrarToast('Erro: ' + error.message, 'error'); state.relAtual.status = 'SUBMETIDO'; show('btn-submeter', false); show('btn-add-desp', false); show('btn-add-km', false); show('btn-edit-cab', false); mostrarToast('Relatório submetido com sucesso.', 'success'); }
  function reenviarEmail(){ mostrarToast('Função de e-mail mantida como está.', 'success'); }
  function gerarPDF() {
    if (!state.relAtual) return mostrarToast('Abra um relatório antes de gerar o PDF.', 'error');
    const taxa = state.relAtual.valor_km_utilizado || state.valorKm;
    const totDesp = state.despesas.reduce((a, d) => a + (parseFloat(d.valor) || 0), 0);
    const qtdKm = state.kms.reduce((a, k) => a + (parseFloat(k.km) || 0), 0);
    const totKm = qtdKm * taxa;
    const total = totDesp + totKm;
    const adiant = parseFloat(state.relAtual.adiantamento) || 0;
    const saldo = total - adiant;

    const payload = {
      usuarioNome: nome,
      relatorio: {
        ...state.relAtual,
        status_label: statusLabel(state.relAtual.status)
      },
      despesas: state.despesas,
      kms: state.kms,
      totais: {
        totDesp,
        totKmQtd: qtdKm,
        totKmVal: totKm,
        adiant,
        saldo,
        taxa
      }
    };

    localStorage.setItem('pdf_reembolso', JSON.stringify(payload));
    const win = window.open(`dist/reembolso-pdf.html?v=20260618-3`, '_blank');
    if (!win) mostrarToast('Permita pop-ups para abrir o PDF.', 'error');
  }

  window.aplicarFiltros = aplicarFiltros;
  window.abrirModalRelatorio = abrirModalRelatorio;
  window.editarCabecalho = editarCabecalho;
  window.fecharModalRel = fecharModalRel;
  window.salvarRelatorio = salvarRelatorio;
  window.abrirModalDespesa = abrirModalDespesa;
  window.fecharModalDesp = fecharModalDesp;
  window.abrirModalKm = abrirModalKm;
  window.fecharModalKm = fecharModalKm;
  window.salvarDespesa = salvarDespesa;
  window.salvarKm = salvarKm;
  window.abrirRelatorio = abrirRelatorio;
  window.voltarLista = voltarLista;
  window.excluirRelatorio = excluirRelatorio;
  window.excluirDespesa = excluirDespesa;
  window.excluirKm = excluirKm;
  window.editarDespesa = editarDespesa;
  window.editarKm = editarKm;
  window.baixarComprovante = baixarComprovante;
  window.submeterRelatorio = submeterRelatorio;
  window.reenviarEmail = reenviarEmail;
  window.gerarPDF = gerarPDF;
  window.limparCampoMoeda = limparCampoMoeda;
  window.formatarCampoMoeda = formatarCampoMoeda;
  window.abrirCalendario = abrirCalendario;
  window.previewArq = previewArq;
  window.aplicarFiltros = aplicarFiltros;

  el('nome-usuario').textContent = nome;
  el('busca')?.addEventListener('input', aplicarFiltros);
  el('filtro-status')?.addEventListener('change', aplicarFiltros);
  carregar();
})();
