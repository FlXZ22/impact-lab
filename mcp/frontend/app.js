(() => {
  'use strict';

  // Configurazione: window.COMUNE_MILANO_API_BASE ha precedenza sul meta tag.
  const API_BASE = (window.COMUNE_MILANO_API_BASE || document.querySelector('meta[name="api-base"]')?.content || '/api').replace(/\/$/, '');
  const endpoints = {
    createDraft: `${API_BASE}/segnalazioni/bozze`,
    confirm: (draftId) => `${API_BASE}/segnalazioni/${encodeURIComponent(draftId)}/conferma`,
    status: (reference) => `${API_BASE}/pratiche/${encodeURIComponent(reference)}`,
    spid: `${API_BASE}/auth/spid`,
    cie: `${API_BASE}/auth/cie`
  };

  const state = { draftId: null, report: null, reference: null };
  const views = [...document.querySelectorAll('[data-view]')];
  const loading = document.querySelector('#loading');
  const toast = document.querySelector('#toast');
  const form = document.querySelector('#report-form');

  document.querySelector('#spid-link').href = endpoints.spid;
  document.querySelector('#cie-link').href = endpoints.cie;

  function showView(name) {
    views.forEach((view) => { view.hidden = view.dataset.view !== name; });
    const order = ['report', 'review', 'receipt'];
    const current = order.indexOf(name);
    document.querySelectorAll('[data-step-indicator]').forEach((item, index) => {
      item.classList.toggle('is-current', index === current);
      item.classList.toggle('is-complete', current > index || name === 'status');
    });
    document.querySelector('.steps').hidden = name === 'status';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector(`[data-view="${name}"] h1`)?.focus?.({ preventScroll: true });
  }

  function setLoading(active) { loading.hidden = !active; }
  function notify(message, type = '') {
    toast.textContent = message;
    toast.className = `toast ${type}`.trim();
    toast.hidden = false;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => { toast.hidden = true; }, 5000);
  }

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers }
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `Richiesta non riuscita (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function reportFromForm() {
    const data = new FormData(form);
    return {
      category: 'illuminazione_pubblica',
      location: data.get('location').trim(),
      problem: data.get('problem'),
      assetId: data.get('assetId').trim() || null,
      details: data.get('details').trim() || null
    };
  }

  function validateReport(report) {
    let valid = true;
    const rules = [
      ['location', report.location, 'Indica dove si trova il lampione.'],
      ['problem', report.problem, 'Seleziona il tipo di problema.']
    ];
    rules.forEach(([name, value, message]) => {
      const input = form.elements[name];
      const error = document.querySelector(`#${name}-error`);
      input.setAttribute('aria-invalid', String(!value));
      error.textContent = value ? '' : message;
      if (!value) valid = false;
    });
    if (!valid) form.querySelector('[aria-invalid="true"]')?.focus();
    return valid;
  }

  function readableProblem(value) {
    return ({ spento: 'Lampione spento', intermittente: 'Luce intermittente', danneggiato: 'Lampione danneggiato', 'acceso-giorno': 'Acceso durante il giorno', altro: 'Altro problema' })[value] || value;
  }

  function renderSummary() {
    const fields = [
      ['Luogo', state.report.location],
      ['Problema', readableProblem(state.report.problem)],
      ['Codice lampione', state.report.assetId || 'Non indicato'],
      ['Dettagli', state.report.details || 'Nessun dettaglio aggiuntivo']
    ];
    const list = document.querySelector('#summary-list');
    list.replaceChildren(...fields.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; row.append(dt, dd); return row;
    }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const report = reportFromForm();
    if (!validateReport(report)) return;
    setLoading(true);
    try {
      const data = await apiFetch(endpoints.createDraft, { method: 'POST', body: JSON.stringify(report) });
      state.draftId = data.id || data.draftId;
      if (!state.draftId) throw new Error('Il backend non ha restituito l’identificativo della bozza.');
      state.report = report;
      renderSummary();
      showView('review');
    } catch (error) {
      notify(`Non è stato possibile creare la bozza. ${error.message}`, 'error');
    } finally { setLoading(false); }
  });

  document.querySelector('#confirm-button').addEventListener('click', async () => {
    if (!document.querySelector('#authenticated').checked) {
      notify('Completa prima l’accesso con SPID o CIE sul portale ufficiale.', 'error');
      document.querySelector('#authenticated').focus();
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(endpoints.confirm(state.draftId), { method: 'POST', body: JSON.stringify({ confirmed: true }) });
      state.reference = data.reference || data.numeroPratica || data.id;
      if (!state.reference) throw new Error('Il backend non ha restituito il numero pratica.');
      document.querySelector('#receipt-id').textContent = state.reference;
      document.querySelector('#receipt-status').textContent = data.statusLabel || data.status || 'Ricevuta';
      document.querySelector('#receipt-date').textContent = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short' }).format(data.submittedAt ? new Date(data.submittedAt) : new Date());
      showView('receipt');
    } catch (error) { notify(`Invio non completato. ${error.message}`, 'error'); }
    finally { setLoading(false); }
  });

  document.querySelector('#status-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#reference');
    const reference = input.value.trim();
    document.querySelector('#reference-error').textContent = reference ? '' : 'Inserisci il numero pratica.';
    input.setAttribute('aria-invalid', String(!reference));
    if (!reference) return input.focus();
    setLoading(true);
    try {
      const data = await apiFetch(endpoints.status(reference));
      const result = document.querySelector('#status-result');
      result.innerHTML = '';
      const title = document.createElement('h2'); title.textContent = `Pratica ${data.reference || reference}`;
      const badge = document.createElement('p'); badge.innerHTML = `<span class="status-badge"></span>`; badge.firstElementChild.textContent = data.statusLabel || data.status || 'In lavorazione';
      const dl = document.createElement('dl');
      [['Ultimo aggiornamento', data.updatedAt ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data.updatedAt)) : 'Non disponibile'], ['Nota', data.message || data.note || 'La pratica è stata presa in carico.']].forEach(([label, value]) => {
        const wrap = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value; wrap.append(dt, dd); dl.append(wrap);
      });
      result.append(title, badge, dl); result.hidden = false;
    } catch (error) {
      document.querySelector('#status-result').hidden = true;
      notify(error.status === 404 ? 'Pratica non trovata. Controlla il numero e riprova.' : `Stato non disponibile. ${error.message}`, 'error');
    } finally { setLoading(false); }
  });

  document.querySelector('#details').addEventListener('input', (event) => { document.querySelector('#details-count').textContent = event.target.value.length; });
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'edit' || action === 'back-home') showView('report');
    if (action === 'show-status') { document.querySelector('#reference').value = state.reference || ''; showView('status'); }
    if (action === 'new-report') { form.reset(); state.draftId = state.report = state.reference = null; document.querySelector('#details-count').textContent = '0'; showView('report'); }
    if (action === 'copy-reference' && state.reference) {
      try { await navigator.clipboard.writeText(state.reference); notify('Numero pratica copiato.'); }
      catch { notify('Copia non disponibile. Seleziona il numero manualmente.', 'error'); }
    }
  }));
})();
