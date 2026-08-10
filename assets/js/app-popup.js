(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const ensure = () => {
    let element = document.getElementById('appPopupModal');
    if (element) return element;
    element = document.createElement('div');
    element.id = 'appPopupModal';
    element.className = 'modal fade';
    element.tabIndex = -1;
    element.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 shadow"><div class="modal-header"><h2 class="modal-title h5" id="appPopupTitle"></h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body" id="appPopupMessage"></div><div class="modal-footer" id="appPopupActions"></div></div></div>`;
    document.body.append(element);
    return element;
  };
  const open = ({ title, message, type = 'info', confirmText = 'OK', cancelText = null }) => new Promise(resolve => {
    const element = ensure();
    const modal = bootstrap.Modal.getOrCreateInstance(element);
    document.getElementById('appPopupTitle').textContent = title;
    document.getElementById('appPopupMessage').innerHTML = `<div class="d-flex gap-3"><i class="bi bi-${type === 'danger' ? 'exclamation-octagon-fill text-danger' : type === 'success' ? 'check-circle-fill text-success' : 'info-circle-fill text-primary'} fs-3"></i><p class="mb-0">${escapeHtml(message)}</p></div>`;
    const actions = document.getElementById('appPopupActions');
    actions.innerHTML = `${cancelText ? `<button type="button" class="btn btn-light" data-popup-cancel>${escapeHtml(cancelText)}</button>` : ''}<button type="button" class="btn btn-${type === 'danger' ? 'danger' : 'primary'}" data-popup-confirm>${escapeHtml(confirmText)}</button>`;
    let resolved = false;
    const finish = answer => { if (resolved) return; resolved = true; modal.hide(); resolve(answer); };
    actions.querySelector('[data-popup-confirm]').addEventListener('click', () => finish(true), { once: true });
    actions.querySelector('[data-popup-cancel]')?.addEventListener('click', () => finish(false), { once: true });
    element.addEventListener('hidden.bs.modal', () => { if (!resolved) { resolved = true; resolve(false); } }, { once: true });
    modal.show();
  });
  window.AppPopup = {
    show: (message, title = 'Notice') => open({ title, message }),
    success: (message, title = 'Success') => open({ title, message, type: 'success' }),
    error: (message, title = 'Something went wrong') => open({ title, message, type: 'danger' }),
    confirm: (message, title = 'Please confirm') => open({ title, message, type: 'danger', confirmText: 'Continue', cancelText: 'Cancel' })
  };
})();
