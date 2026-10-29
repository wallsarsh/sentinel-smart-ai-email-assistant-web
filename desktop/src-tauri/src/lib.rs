//! Self-contained Tauri shell. The bundled Node/Nitro runtime binds only to
//! 127.0.0.1 and uses persistent PGlite; no hosted backend is required.
//! Tokens, IMAP/SMTP credentials and BYO AI keys remain encrypted in PGlite.
//! Session/KEK material and optional OAuth client configuration live in the OS keyring.
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use keyring::{Entry, Error as KeyringError};
use rand::RngCore;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, WebviewWindowBuilder},
    AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow,
};

const PORT: u16 = 17861;
const ORIGIN: &str = "http://127.0.0.1:17861";
const KEYRING_SERVICE: &str = "in.simplifyit.sentinel.email.desktop";

#[derive(Default)]
struct RuntimeState {
    child: Mutex<Option<Child>>,
    error: Mutex<Option<String>>,
    ready: Mutex<bool>,
}

impl Drop for RuntimeState {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.child.lock() {
            if let Some(mut child) = slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn app_page(url: &Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https")
            && url.host_str() == Some("tauri.localhost"))
}

fn native_caller(window: &WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "main" | "settings") {
        return Err("Unexpected desktop window".into());
    }
    if !app_page(&window.url().map_err(|_| "Cannot read calling origin")?) {
        return Err("Native commands are forbidden in remote webpages".into());
    }
    Ok(())
}

fn store(name: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, name).map_err(|_| "Operating system keychain unavailable".into())
}

fn secret(name: &str) -> Result<Option<String>, String> {
    match store(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(format!("Cannot unlock the OS credential vault for {name}")),
    }
}

fn random_key(bytes: usize) -> String {
    use base64::Engine;
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::STANDARD.encode(buf)
}

fn stable_secret(name: &str, bytes: usize) -> Result<String, String> {
    if let Some(value) = secret(name)? {
        return Ok(value);
    }
    let value = random_key(bytes);
    store(name)?
        .set_password(&value)
        .map_err(|_| "Cannot save the desktop encryption key to the OS keychain".to_string())?;
    Ok(value)
}

fn optional_env(command: &mut Command, name: &str, key: &str) -> Result<(), String> {
    command.env(name, secret(key)?.unwrap_or_default());
    Ok(())
}

fn resource_root(app: &AppHandle) -> Result<PathBuf, String> {
    let target = app.path().resource_dir().map_err(|_| "Resource directory unavailable")?
        .join("runtime");
    if target.join(".output/server/index.mjs").exists() {
        return Ok(target);
    }
    #[cfg(debug_assertions)]
    {
        let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime");
        if local.join(".output/server/index.mjs").exists() {
            return Ok(local);
        }
    }
    Err("Bundled Node runtime missing. Run npm run prepare in desktop/.".into())
}

fn node_bin(root: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        root.join("bin/node.exe")
    } else {
        root.join("bin/node")
    }
}

fn runtime_command(app: &AppHandle, entrypoint: &str, probe: &str) -> Result<Command, String> {
    let root = resource_root(app)?;
    let data = app.path().app_local_data_dir().map_err(|_| "Data path unavailable")?;
    fs::create_dir_all(&data).map_err(|_| "Cannot create local application data")?;
    let db = data.join("pglite");
    let node = node_bin(&root);
    if !node.is_file() { return Err("Bundled Node executable missing".into()); }

    let session = stable_secret("session-secret", 48)?;
    let kek = stable_secret("kek-v1", 32)?;
    let mut command = Command::new(node);
    command.arg(root.join(entrypoint))
        .current_dir(&root)
        .env("NODE_ENV", "production")
        .env("PORT", PORT.to_string())
        .env("HOST", "127.0.0.1")
        .env("BASE_URL", ORIGIN)
        .env("DATABASE_URL", "pglite:local")
        .env("SENTINEL_DESKTOP_DB_DIR", db)
        .env("SENTINEL_DESKTOP_MODE", "true")
        .env("SENTINEL_DESKTOP_PROBE", probe)
        .env("ALLOW_INSECURE_HTTP", "true")
        .env("SESSION_SECRET", session)
        .env("KEK_BASE64", kek)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());
    optional_env(&mut command, "GOOGLE_CLIENT_ID", "google-client-id")?;
    optional_env(&mut command, "GOOGLE_CLIENT_SECRET", "google-client-secret")?;
    optional_env(&mut command, "MS_CLIENT_ID", "ms-client-id")?;
    optional_env(&mut command, "MS_CLIENT_SECRET", "ms-client-secret")?;
    Ok(command)
}

fn probe_runtime(probe: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{PORT}").parse().unwrap(),
        Duration::from_millis(400)
    ) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = format!(
        "GET /api/desktop/health HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nx-sentinel-desktop-probe: {probe}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() { return false; }
    let mut bytes = Vec::new();
    if stream.read_to_end(&mut bytes).is_err() { return false; }
    let response = String::from_utf8_lossy(&bytes);
    response.starts_with("HTTP/1.1 200") && response.contains("sentinel-desktop")
}

fn stop_backend(state: &RuntimeState) {
    if let Ok(mut slot) = state.child.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn launch_runtime(app: AppHandle, state: Arc<RuntimeState>) {
    thread::spawn(move || {
        *state.ready.lock().unwrap() = false;
        *state.error.lock().unwrap() = None;
        stop_backend(&state);
        let result: Result<(), String> = (|| {
            // Refuse an occupied loopback port: never display someone else's
            // local HTTP service in our app window.
            let listener = TcpListener::bind(("127.0.0.1", PORT))
                .map_err(|_| format!("Port {PORT} is occupied. Close the other application."))?;
            let probe = random_key(24);
            let mut migrate = runtime_command(&app, "dist/migrate.mjs", &probe)?;
            drop(listener);
            let status = migrate.status().map_err(|_| "Failed to start local migrations")?;
            if !status.success() { return Err("Local database migration failed".into()); }

            let mut child = runtime_command(&app, ".output/server/index.mjs", &probe)?
                .spawn().map_err(|_| "Failed to launch bundled local service")?;
            for _ in 0..160 {
                if probe_runtime(&probe) {
                    *state.child.lock().unwrap() = Some(child);
                    *state.ready.lock().unwrap() = true;
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.navigate(Url::parse(ORIGIN).unwrap());
                    }
                    return Ok(());
                }
                if let Ok(Some(_)) = child.try_wait() {
                    return Err("Local service exited before becoming ready".into());
                }
                thread::sleep(Duration::from_millis(250));
            }
            let _ = child.kill();
            let _ = child.wait();
            Err("Local service did not become ready".into())
        })();
        if let Err(error) = result {
            *state.error.lock().unwrap() = Some(error);
        }
    });
}

#[tauri::command]
fn desktop_status(window: WebviewWindow, state: State<'_, Arc<RuntimeState>>) -> Result<serde_json::Value, String> {
    native_caller(&window)?;
    Ok(serde_json::json!({
        "ready": *state.ready.lock().unwrap(),
        "error": *state.error.lock().unwrap(),
    }))
}

#[tauri::command]
fn provider_settings(window: WebviewWindow) -> Result<serde_json::Value, String> {
    native_caller(&window)?;
    Ok(serde_json::json!({
        "googleClientId": secret("google-client-id")?.unwrap_or_default(),
        "googleSecretConfigured": secret("google-client-secret")?.is_some(),
        "msClientId": secret("ms-client-id")?.unwrap_or_default(),
        "msSecretConfigured": secret("ms-client-secret")?.is_some(),
    }))
}

#[tauri::command]
fn save_provider_settings(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    google_client_id: String,
    google_client_secret: String,
    ms_client_id: String,
    ms_client_secret: String,
) -> Result<(), String> {
    native_caller(&window)?;
    if google_client_id.len() > 512 || ms_client_id.len() > 512 ||
       google_client_secret.len() > 2048 || ms_client_secret.len() > 2048 {
        return Err("Provider configuration exceeds maximum length".into());
    }
    for (key, value) in [
        ("google-client-id", google_client_id),
        ("ms-client-id", ms_client_id),
    ] {
        store(key)?.set_password(value.trim()).map_err(|_| "Cannot save provider configuration")?;
    }
    // Empty secret input keeps the previously saved secret.
    for (key, value) in [
        ("google-client-secret", google_client_secret),
        ("ms-client-secret", ms_client_secret),
    ] {
        if !value.is_empty() {
            store(key)?.set_password(&value).map_err(|_| "Cannot save provider secret")?;
        }
    }
    launch_runtime(app, state.inner().clone());
    Ok(())
}

fn focus_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("Sentinel — Provider settings")
        .inner_size(580.0, 680.0)
        .on_navigation(app_page)
        .build();
}

pub fn run() {
    let runtime = Arc::new(RuntimeState::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| focus_main(app)))
        .manage(runtime.clone())
        .invoke_handler(tauri::generate_handler![desktop_status, provider_settings, save_provider_settings])
        .setup(move |app| {
            let main = WebviewWindowBuilder::new(
                app, "main", WebviewUrl::App("index.html".into())
            )
            .title("Sentinel AI Email Assistant")
            .inner_size(1190.0, 820.0)
            .min_inner_size(790.0, 580.0)
            .on_navigation(|url| {
                if app_page(url) { return true; }
                if url.origin().ascii_serialization() == ORIGIN { return true; }
                // Native Google/Microsoft OAuth is initiated by the signed-in
                // WebView, then provider consent runs in the default browser.
                if url.scheme() == "https" {
                    let _ = open::that(url.as_str());
                }
                false
            })
            .on_new_window(|url, _| {
                if url.scheme() == "https" {
                    let _ = open::that(url.as_str());
                }
                NewWindowResponse::Deny
            })
            .build()?;

            let open = MenuItem::with_id(app, "open", "Open Sentinel", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Provider settings", true, None::<&str>)?;
            let reload = MenuItem::with_id(app, "reload", "Reload workspace", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &reload, &settings, &quit])?;
            let state = runtime.clone();
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Sentinel AI Email Assistant")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => focus_main(app),
                    "settings" => open_settings(app),
                    "reload" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.reload();
                            focus_main(app);
                        }
                    }
                    "quit" => { stop_backend(&state); app.exit(0); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event { focus_main(tray.app_handle()); }
                });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;
            let window_to_hide = main.clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close(); // continue mail checks in the system tray
                    let _ = window_to_hide.hide();
                }
            });
            launch_runtime(app.handle().clone(), runtime.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Sentinel standalone desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_native_pages_are_trusted() {
        assert!(app_page(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(!app_page(&Url::parse("https://evil.test/").unwrap()));
        assert!(!app_page(&Url::parse("http://127.0.0.1:17861/").unwrap()));
    }
    #[test]
    fn local_address_is_fixed() {
        assert_eq!(ORIGIN, "http://127.0.0.1:17861");
    }
}
