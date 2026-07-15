mod fsio;
mod pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            pty::spawn_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            pty::detect_shells,
            pty::home_dir,
            fsio::write_text_file,
            fsio::read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
