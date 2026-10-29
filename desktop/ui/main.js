/* Local native settings only. The Nitro WebView never receives native IPC. */
const invoke = window.__TAURI__?.core?.invoke;
const status = document.getElementById('status');
const form = document.getElementById('providers');
const save = document.getElementById('save');
const fields = {
  googleClientId: document.getElementById('google-id'),
  googleClientSecret: document.getElementById('google-secret'),
  msClientId: document.getElementById('ms-id'),
  msClientSecret: document.getElementById('ms-secret')
};
const notice = (message, ok = false) => {
  status.textContent = message;
  status.classList.toggle('ok', ok);
};
if (!invoke) {
  notice('Launch this page with the Sentinel desktop application.');
  save.disabled = true;
} else {
  invoke('provider_settings').then(data => {
    fields.googleClientId.value = data.googleClientId || '';
    fields.msClientId.value = data.msClientId || '';
    if (data.googleSecretConfigured) fields.googleClientSecret.placeholder = 'Secret already saved';
    if (data.msSecretConfigured) fields.msClientSecret.placeholder = 'Secret already saved';
  }).catch(() => notice('OS keychain is unavailable. Unlock your credential vault and restart.'));
  const check = async () => {
    try {
      const data = await invoke('desktop_status');
      if (data.error) {
        notice(data.error);
        return;
      }
      notice(data.ready ? 'Local email service is ready.' : 'Starting local email service…', data.ready);
    } catch {
      notice('Cannot check local service status.');
    }
  };
  void check();
  setInterval(check, 1500);
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!invoke) return;
  save.disabled = true;
  try {
    await invoke('save_provider_settings', Object.fromEntries(
      Object.entries(fields).map(([name, el]) => [name, el.value])
    ));
    fields.googleClientSecret.value = '';
    fields.msClientSecret.value = '';
    notice('Saved securely to your operating system credential vault. Restarting…', true);
  } catch (error) {
    notice(String(error));
  } finally {
    save.disabled = false;
  }
});
