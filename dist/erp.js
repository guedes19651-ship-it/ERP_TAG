// ============================================================
// ERP TAG - JavaScript compartilhado por TODAS as páginas
// Contém: conexão com Supabase e funções reutilizáveis
// ============================================================

// ---- CONFIGURAÇÃO DO SUPABASE ----
const SUPABASE_URL = 'https://qcfcoixjhrnubzmjlqpu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_33woKBfLKrEaS3spKb1aig_M-0gDrZw';

// Cria a conexão com o banco — disponível em todas as páginas
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

padronizarCabecalhoReferencia();


// Impede que janelas de cadastro/edicao fechem ao clicar no fundo escuro.
// O fechamento deve acontecer somente por botoes explicitos: Cancelar, X, Salvar etc.
document.addEventListener('mousedown', bloquearCliqueForaModal, true);
document.addEventListener('click', bloquearCliqueForaModal, true);

function bloquearCliqueForaModal(e) {
  const overlay = e.target?.classList?.contains('modal-overlay') ? e.target : null;
  if (!overlay || (!overlay.classList.contains('active') && !overlay.classList.contains('aberto'))) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

function padronizarCabecalhoReferencia() {
  const header = document.querySelector('.header');
  if (!header) return;

  const nomeUsuario = header.querySelector('#nome-usuario');
  if (!nomeUsuario) return;

  const filhos = Array.from(header.children);
  const blocoDireita = filhos.find(el => el.contains && el.contains(nomeUsuario));
  if (!blocoDireita) return;

  blocoDireita.classList.add('header-ref-right');
  nomeUsuario.classList.add('header-ref-user-name');

  const spans = Array.from(blocoDireita.querySelectorAll('span'));
  const iconeUsuario = spans.find(span => span !== nomeUsuario);
  if (iconeUsuario) iconeUsuario.classList.add('header-ref-user-icon');
}


// ---- FORMATAR VALOR EM REAIS ----
// Uso: formatarMoeda(1234.5)  →  "R$ 1.234,50"
function formatarMoeda(valor) {
  return 'R$ ' + (Number(valor) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ---- FORMATAR TELEFONE ----
// Padrao usado nos campos Fone / Telefone / Celular:
// Celular: 55 11 98539-8433
// Fixo:    55 11 41230-660
function apenasDigitosTelefone(valor) {
  return String(valor || '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
}

function formatarTelefone(valor) {
  let digitos = apenasDigitosTelefone(valor);
  if (!digitos) return '';

  if (!digitos.startsWith('55') && digitos.length >= 10) {
    digitos = '55' + digitos;
  }

  if (digitos.startsWith('55')) {
    digitos = digitos.slice(0, 13);
    if (digitos.length <= 2) return digitos;
    if (digitos.length <= 4) return digitos.slice(0, 2) + ' ' + digitos.slice(2);

    const ddi = digitos.slice(0, 2);
    const ddd = digitos.slice(2, 4);
    const numero = digitos.slice(4);

    if (numero.length <= 5) return ddi + ' ' + ddd + ' ' + numero;
    if (numero.length <= 9) return ddi + ' ' + ddd + ' ' + numero.slice(0, 5) + '-' + numero.slice(5);
    return ddi + ' ' + ddd + ' ' + numero.slice(0, 5) + '-' + numero.slice(5, 9);
  }

  digitos = digitos.slice(0, 11);
  if (digitos.length <= 2) return digitos;

  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);

  if (numero.length <= 5) return ddd + ' ' + numero;
  if (numero.length <= 9) return ddd + ' ' + numero.slice(0, 5) + '-' + numero.slice(5);
  return ddd + ' ' + numero.slice(0, 5) + '-' + numero.slice(5, 9);
}

function mascaraFone(valor) {
  return formatarTelefone(valor);
}

function mascaraCelular(valor) {
  return formatarTelefone(valor);
}


// ---- MODAL DE CONFIRMAÇÃO ----
// Uso: await confirmar('Mensagem', 'Título', 'danger')   → exclusão (vermelho)
//      await confirmar('Mensagem', 'Título', 'warning')  → aviso (laranja)
// Retorna true (confirmado) ou false (cancelado).
function confirmar(mensagem, titulo, tipo = 'danger') {
  const config = {
    danger:  { icone: '🗑️', cor: '#c0392b', corHover: '#e74c3c', btnLabel: 'Excluir',    tituloDefault: 'Confirmar exclusão' },
    warning: { icone: '⚠️', cor: '#d97706', corHover: '#f59e0b', btnLabel: 'Confirmar',  tituloDefault: 'Atenção'            },
  };
  const cfg = config[tipo] || config.danger;
  const tituloFinal = titulo || cfg.tituloDefault;

  return new Promise(resolve => {
    let overlay = document.getElementById('erp-confirm-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'erp-confirm-overlay';
      overlay.innerHTML = `
        <style>
          #erp-confirm-overlay {
            display:none; position:fixed; inset:0; background:rgba(0,0,0,0.80);
            z-index:9999; align-items:center; justify-content:center;
          }
          #erp-confirm-overlay.ativo { display:flex; }
          #erp-confirm-box {
            background:#161616; border:1px solid #333; border-radius:12px;
            padding:32px 28px 24px; width:420px; max-width:92vw;
            box-shadow:0 20px 60px rgba(0,0,0,0.7);
            animation:erp-confirm-in 0.15s ease;
          }
          @keyframes erp-confirm-in {
            from { transform:scale(0.92); opacity:0; }
            to   { transform:scale(1);    opacity:1; }
          }
          #erp-confirm-icone { font-size:36px; margin-bottom:14px; }
          #erp-confirm-titulo { font-size:16px; font-weight:700; color:#fff; margin-bottom:10px; }
          #erp-confirm-msg { font-size:13px; color:#aaa; white-space:pre-wrap; line-height:1.6; margin-bottom:28px; }
          #erp-confirm-footer { display:flex; gap:10px; justify-content:flex-end; }
          #erp-confirm-cancel {
            padding:9px 20px; border-radius:7px; border:1px solid #444;
            background:transparent; color:#ccc; font-size:13px; font-weight:600; cursor:pointer;
          }
          #erp-confirm-cancel:hover { background:#222; color:#fff; }
          #erp-confirm-ok {
            padding:9px 20px; border-radius:7px; border:none;
            color:#fff; font-size:13px; font-weight:700; cursor:pointer; transition:background 0.15s;
          }
        </style>
        <div id="erp-confirm-box">
          <div id="erp-confirm-icone"></div>
          <div id="erp-confirm-titulo"></div>
          <div id="erp-confirm-msg"></div>
          <div id="erp-confirm-footer">
            <button id="erp-confirm-cancel">Cancelar</button>
            <button id="erp-confirm-ok"></button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }

    const btnOk = document.getElementById('erp-confirm-ok');
    document.getElementById('erp-confirm-icone').textContent  = cfg.icone;
    document.getElementById('erp-confirm-titulo').textContent = tituloFinal;
    document.getElementById('erp-confirm-msg').textContent    = mensagem;
    btnOk.textContent   = cfg.btnLabel;
    btnOk.style.background = cfg.cor;
    btnOk.onmouseover   = () => btnOk.style.background = cfg.corHover;
    btnOk.onmouseout    = () => btnOk.style.background = cfg.cor;
    overlay.classList.add('ativo');

    function fechar(resultado) {
      overlay.classList.remove('ativo');
      resolve(resultado);
    }

    btnOk.onclick = () => fechar(true);
    document.getElementById('erp-confirm-cancel').onclick = () => fechar(false);

    let mousedownNoOverlay = false;
    overlay.addEventListener('mousedown', e => { mousedownNoOverlay = e.target === overlay; }, { once: true });
    overlay.addEventListener('click', e => { if (mousedownNoOverlay && e.target === overlay) fechar(false); }, { once: true });
  });
}


// ---- BADGE DE STATUS ----
// Retorna o HTML colorido conforme o status do pedido
// Uso: badgeStatus('Aberto')  →  <span class="badge badge-azul">Aberto</span>
function badgeStatus(status) {
  const cores = {
    'Aberto':      'badge-azul',
    'Em Produção': 'badge-amarelo',
    'Concluído':   'badge-verde',
    'Cancelado':   'badge-vermelho'
  };
  const classe = cores[status] || 'badge-azul';
  return `<span class="badge ${classe}">${status}</span>`;
}
