(function () {
  let activeDialog = null;

  function openDialog(options) {
    if (activeDialog) activeDialog.closeWith(null);
    const dialog = document.createElement('dialog');
    dialog.className = 'site-dialog';
    const form = document.createElement('form');
    form.className = 'site-dialog-form';
    form.method = 'dialog';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'site-dialog-eyebrow';
    eyebrow.textContent = options.eyebrow || 'A little note';
    const title = document.createElement('h2');
    title.className = 'site-dialog-title';
    title.textContent = options.title || 'Just checking';
    const message = document.createElement('p');
    message.className = 'site-dialog-message';
    message.textContent = options.message || '';
    form.append(eyebrow, title, message);

    let input = null;
    if (options.input) {
      input = document.createElement('input');
      input.className = 'site-dialog-input';
      input.type = 'text';
      input.placeholder = options.placeholder || '';
      input.value = options.defaultValue || '';
      input.maxLength = options.maxLength || 120;
      input.setAttribute('aria-label', options.inputLabel || 'Our answer');
      form.appendChild(input);
    }

    const actions = document.createElement('div');
    actions.className = 'site-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'site-dialog-button';
    cancel.textContent = options.cancelText || 'Cancel';
    const primary = document.createElement('button');
    primary.type = 'submit';
    primary.className = 'site-dialog-button ' + (options.danger ? 'is-danger' : 'is-primary');
    primary.textContent = options.confirmText || 'Okay';

    return new Promise(resolve => {
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        if (activeDialog === api) activeDialog = null;
        resolve(value);
      }
      const api = { closeWith: finish };
      activeDialog = api;
      cancel.addEventListener('click', () => finish(options.input ? null : false));
      form.addEventListener('submit', event => {
        event.preventDefault();
        finish(options.input ? input.value : true);
      });
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish(options.input ? null : false);
      });
      if (!options.alert) actions.appendChild(cancel);
      actions.appendChild(primary);
      form.appendChild(actions);
      dialog.appendChild(form);
      document.body.appendChild(dialog);
      dialog.showModal();
      if (input) input.focus();
      else primary.focus();
    });
  }

  window.siteDialog = {
    alert(message, options) {
      return openDialog({ ...options, message, title: options && options.title || 'A little note', confirmText: options && options.confirmText || 'Got it', cancelText: options && options.cancelText || 'Close', alert: true });
    },
    confirm(message, options) {
      return openDialog({ ...options, message, title: options && options.title || 'Just checking', confirmText: options && options.confirmText || 'Continue', cancelText: options && options.cancelText || 'Cancel', danger: true });
    },
    prompt(message, options) {
      return openDialog({ ...options, message, input: true, title: options && options.title || 'Where should it go?', confirmText: options && options.confirmText || 'Continue', cancelText: options && options.cancelText || 'Cancel' });
    }
  };
})();
