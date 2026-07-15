use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::Mutex,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Emitter, Manager, State,
};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager(pub Mutex<HashMap<String, PtySession>>);

#[derive(Serialize, Clone)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
}

fn find_in_path(exe: &str) -> Option<String> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).find_map(|dir| {
        let full = dir.join(exe);
        full.is_file().then(|| full.to_string_lossy().into_owned())
    })
}

#[tauri::command]
pub fn home_dir() -> String {
    std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".into())
}

#[tauri::command]
pub fn detect_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();
    if let Some(p) = find_in_path("pwsh.exe") {
        shells.push(ShellInfo {
            name: "PowerShell 7".into(),
            path: p,
            args: vec!["-NoLogo".into()],
        });
    }
    if let Some(p) = find_in_path("powershell.exe") {
        shells.push(ShellInfo {
            name: "Windows PowerShell".into(),
            path: p,
            args: vec!["-NoLogo".into()],
        });
    }
    if let Some(p) = find_in_path("cmd.exe") {
        shells.push(ShellInfo {
            name: "命令提示字元".into(),
            path: p,
            args: vec![],
        });
    }
    for candidate in [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ] {
        if Path::new(candidate).is_file() {
            shells.push(ShellInfo {
                name: "Git Bash".into(),
                path: candidate.into(),
                args: vec!["-i".into(), "-l".into()],
            });
            break;
        }
    }
    if let Some(p) = find_in_path("wsl.exe") {
        shells.push(ShellInfo {
            name: "WSL".into(),
            path: p,
            args: vec![],
        });
    }
    shells
}

#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    state: State<'_, PtyManager>,
    id: String,
    shell: String,
    args: Vec<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    if sessions.contains_key(&id) {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    let dir = cwd
        .filter(|d| !d.trim().is_empty() && Path::new(d).is_dir())
        .unwrap_or_else(home_dir);
    cmd.cwd(dir);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    {
        let id = id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if on_data
                            .send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
            if let Some(mgr) = app.try_state::<PtyManager>() {
                mgr.0.lock().unwrap().remove(&id);
            }
            let _ = app.emit("pty-exit", &id);
        });
    }

    sessions.insert(
        id,
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn write_pty(state: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    if let Some(s) = state.0.lock().unwrap().get_mut(&id) {
        s.writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_pty(
    state: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if let Some(s) = state.0.lock().unwrap().get_mut(&id) {
        s.master
            .resize(PtySize {
                rows: rows.max(2),
                cols: cols.max(2),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kill_pty(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    let session = state.0.lock().unwrap().remove(&id);
    if let Some(mut s) = session {
        let _ = s.child.kill();
    }
    Ok(())
}
