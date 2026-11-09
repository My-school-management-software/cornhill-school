#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The native shell deliberately exposes no Tauri commands or plugins.
    // CORNHILL remains a remote, authenticated web application.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run CORNHILL native application");
}
