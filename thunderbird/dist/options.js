// thunderbird/src/mail.js
function checkBaseUrl(raw) {
  const u = new URL(String(raw).trim());
  if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname))
    throw new Error("The API URL must use https (http is allowed only for localhost).");
  return `${u.origin}${u.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")}`;
}

// thunderbird/src/options.js
var $ = (id) => document.getElementById(id);
var { settings } = await browser.storage.local.get("settings");
for (const k of ["baseUrl", "apiKey", "model"]) $(k).value = settings?.[k] ?? "";
$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const next = {
    baseUrl: $("baseUrl").value.trim(),
    apiKey: $("apiKey").value,
    model: $("model").value.trim()
  };
  try {
    next.baseUrl = checkBaseUrl(next.baseUrl);
    const url = new URL(next.baseUrl);
    const ok = await browser.permissions.request({ origins: [`${url.origin}/*`] });
    if (!ok) throw new Error("Permission to contact the provider was not granted.");
    await browser.storage.local.set({ settings: next });
    $("status").textContent = "Saved.";
  } catch (err) {
    $("status").textContent = err.message;
  }
});
