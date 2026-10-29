/* The only bundled frontend code allowed to invoke native commands. */
const form = document.querySelector('#server-form');
const input = document.querySelector('#server-url');
const button = document.querySelector('#connect');
const status = document.querySelector('#status');

function setStatus(message, ok = false) {
  status.textContent = message;
  status.classList.toggle('ok', ok);
}

function normalizeServer(value) {
  const url = new URL(value.trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('HTTPS is required, except for localhost development.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use only a server address; omit credentials, paths and parameters.');
  }
  return url.origin;
}

const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
if (!invoke) {
  setStatus('Launch this page with the Sentinel desktop application.');
  button.disabled = true;
} else {
  invoke('get_server').then((url) => {
    if (url) input.value = url;
  }).catch(() => setStatus('Cannot read saved server settings.'));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!invoke) return;
  let url;
  try {
    url = normalizeServer(input.value);
  } catch (error) {
    setStatus(error.message);
    return;
  }
  button.disabled = true;
  setStatus('Opening the configured workspace…', true);
  try {
    await invoke('connect_server', { url });
  } catch (error) {
    setStatus(String(error || 'Could not save this server.'));
    button.disabled = false;
  }
});
