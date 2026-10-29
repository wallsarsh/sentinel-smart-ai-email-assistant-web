//! Native shell for the existing Sentinel service.
//! The loaded HTTPS application is deliberately NOT granted native IPC permissions.
//! All mail, secrets, background work and send authorization remain on the server.
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, WebviewWindowBuilder},
    AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow,
};

#[derive(Clone, Default)]
struct ServerState {
    origin: Arc<Mutex<Option<String>>>,
}

/// Only HTTPS remote services (or genuine local loopback development servers).
/// No paths/queries/embedded credentials: the Nuxt API and OAuth callbacks live at /.
fn validate_server(input: &str) -> Result<Url, String> {
    let url = Url::parse(input.trim()).map_err(|_| "Enter a complete server URL.".to_string())?;
    let host = url.host_str().ok_or("The server must have a hostname.")?;
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("Use HTTPS. HTTP is allowed only for localhost and loopback testing.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Credentials must not be embedded in a server URL.".into());
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err("Enter only the server origin, without a path, query or fragment.".into());
    }
    Ok(url)
}

fn app_page(url: &Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https")
            && url.host_str() == Some("tauri.localhost"))
}

// Kept for explicit identity-domain regression tests; these are not used for embedded auth.
#[cfg(test)]
fn is_identity_provider(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    matches!(
        url.host_str(),
        Some("accounts.google.com"
            | "login.microsoftonline.com"
            | "login.live.com"
            | "login.microsoft.com"
            | "account.live.com"
            | "login.windows.net")
    )
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("server.json"))
        .map_err(|_| "Cannot locate the desktop configuration directory.".into())
}

fn read_server(app: &AppHandle) -> Option<Url> {
    let path = config_path(app).ok()?;
    let data = fs::read(path).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&data).ok()?;
    validate_server(value.get("url")?.as_str()?).ok()
}

fn write_server(app: &AppHandle, url: &Url) -> Result<(), String> {
    let path = config_path(app)?;
    fs::create_dir_all(path.parent().ok_or("Invalid configuration directory.")?)
        .map_err(|_| "Could not create the desktop configuration directory.")?;
    let body = serde_json::to_vec(&serde_json::json!({ "url": url.as_str() }))
        .map_err(|_| "Could not serialize the server address.")?;
    fs::write(path, body).map_err(|_| "Could not save the server address.".into())
}

// The URL is configuration, never a password, refresh token, cookie or API key.
// For every sensitive operation, require the original app's server-side auth.
fn local_caller(window: &WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "main" | "settings") {
        return Err("Unexpected application window.".into());
    }
    if !app_page(&window.url().map_err(|_| "Cannot verify the calling window.")?) {
        return Err("Remote pages cannot change native settings.".into());
    }
    Ok(())
}

#[tauri::command]
fn get_server(window: WebviewWindow, app: AppHandle) -> Result<Option<String>, String> {
    local_caller(&window)?;
    Ok(read_server(&app).map(|url| url.to_string()))
}

#[tauri::command]
fn connect_server(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ServerState>,
    url: String,
) -> Result<(), String> {
    local_caller(&window)?;
    let parsed = validate_server(&url)?;
    write_server(&app, &parsed)?;
    let origin = parsed.origin().ascii_serialization();
    *state.origin.lock().map_err(|_| "Could not update navigation policy.")? = Some(origin);
    let main = app
        .get_webview_window("main")
        .ok_or("The main desktop window is unavailable.")?;
    main.navigate(parsed).map_err(|_| "Could not open the configured server.")?;
    if window.label() == "settings" {
        let _ = window.close();
    }
    Ok(())
}

fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("Sentinel — Server settings")
        .inner_size(520.0, 570.0)
        .resizable(false)
        .on_navigation(app_page)
        .build()?;
    Ok(())
}

fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| focus_main(app)))
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![get_server, connect_server])
        .setup(|app| {
            let saved = read_server(app.handle());
            let state = app.state::<ServerState>();
            *state.origin.lock().expect("server navigation mutex poisoned") =
                saved.as_ref().map(|url| url.origin().ascii_serialization());

            let allowed = Arc::clone(&state.origin);
            let main = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Sentinel AI Email Assistant")
            .inner_size(1190.0, 820.0)
            .min_inner_size(790.0, 580.0)
            .on_navigation(move |url| {
                if app_page(url) {
                    return true;
                }
                let configured = allowed.lock().ok().and_then(|state| state.clone());
                if configured.as_deref() == Some(url.origin().ascii_serialization().as_str()) {
                    // Provider authorization is completed in the system browser.
                    // The desktop WebView and system browser have different cookie
                    // stores; launch the Accounts page, not the protected /connect
                    // URL, so the user can sign in on the web then grant consent.
                    if matches!(
                        url.path(),
                        "/api/accounts/google/connect" | "/api/accounts/microsoft/connect"
                    ) {
                        let mut accounts = url.clone();
                        accounts.set_path("/settings/accounts");
                        accounts.set_query(None);
                        accounts.set_fragment(None);
                        let _ = open::that(accounts.as_str());
                        return false;
                    }
                    return true;
                }
                // Untrusted links and identity-provider pages always open in the
                // OS browser, never as additional privileged app windows.
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

            let open_item = MenuItem::with_id(app, "open", "Open Sentinel", true, None::<&str>)?;
            let settings_item =
                MenuItem::with_id(app, "settings", "Server settings", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &settings_item, &quit_item])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Sentinel AI Email Assistant")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main(app),
                    "settings" => { let _ = open_settings(app); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        focus_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            if let Some(url) = saved {
                // A missing/offline service cannot change the saved URL; use tray
                // Settings to recover. No Node, Postgres or SMTP server is bundled.
                let _ = main.navigate(url);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Sentinel desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_and_loopback_only() {
        assert!(validate_server("https://sentinel.example.org").is_ok());
        assert!(validate_server("http://localhost:3000").is_ok());
        assert!(validate_server("http://127.0.0.1:3000").is_ok());
        assert!(validate_server("http://[::1]:3000").is_ok());
        for invalid in [
            "http://sentinel.example.org",
            "http://localhost.evil.org",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://user:pass@example.org",
            "https://example.org/extra",
            "https://example.org/?token=secret",
            "https://example.org/#fragment",
        ] {
            assert!(validate_server(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn provider_allowlist_is_narrow() {
        assert!(is_identity_provider(&Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap()));
        assert!(is_identity_provider(&Url::parse("https://login.microsoftonline.com/common").unwrap()));
        assert!(!is_identity_provider(&Url::parse("https://accounts.google.com.evil.org").unwrap()));
        assert!(!is_identity_provider(&Url::parse("http://accounts.google.com").unwrap()));
    }
}
