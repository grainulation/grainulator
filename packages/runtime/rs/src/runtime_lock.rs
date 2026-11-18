use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static OWNED: Mutex<Option<(PathBuf, String)>> = Mutex::new(None);
pub fn acquire(runtime: &Path) -> io::Result<()> {
    validate_tree(runtime)?;
    let lock = runtime.join(".write.lock");
    fs::create_dir(&lock)?;
    let token = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let owner = serde_json::json!({"schema":"grainulator.runtime.lock.v1","pid":std::process::id(),"token":token});
    if let Err(error) = fs::write(lock.join("owner.json"), owner.to_string()) {
        let _ = fs::remove_dir(&lock);
        return Err(error);
    }
    *OWNED.lock().unwrap() = Some((lock, token));
    Ok(())
}
pub fn validate_tree(runtime: &Path) -> io::Result<()> {
    if let Some(parent) = runtime.parent() {
        let marker = parent.join("migration.json");
        if marker.exists() {
            let value: serde_json::Value =
                serde_json::from_slice(&fs::read(marker)?).map_err(io::Error::other)?;
            if value.get("schema").and_then(|v| v.as_str()) != Some("grainulator.migration.v1")
                || !matches!(
                    value.get("state").and_then(|v| v.as_str()),
                    Some("complete") | Some("rolled-back")
                )
            {
                return Err(io::Error::other(
                    "project migration is incomplete; refusing runtime operations",
                ));
            }
        }
    }
    // Owned runtime artifacts cannot redirect a writer through links. Declared
    // external oracle inputs are a separate explicit run-contract capability.
    let mut cursor = Some(runtime);
    while let Some(p) = cursor {
        if let Ok(m) = fs::symlink_metadata(p) {
            if m.file_type().is_symlink() {
                return Err(io::Error::other("symlinked runtime path"));
            }
        }
        cursor = p.parent();
    }
    fn walk(p: &Path, count: &mut usize, depth: usize) -> io::Result<()> {
        if depth > 64 || *count > 100000 {
            return Err(io::Error::other("runtime tree exceeds safety limit"));
        }
        if !p.exists() {
            return Ok(());
        }
        let m = fs::symlink_metadata(p)?;
        if m.file_type().is_symlink() {
            return Err(io::Error::other("runtime artifact symlinks are forbidden"));
        }
        if m.is_dir() {
            for e in fs::read_dir(p)? {
                *count += 1;
                walk(&e?.path(), count, depth + 1)?
            }
        } else if !m.is_file() {
            return Err(io::Error::other("runtime artifacts must be regular files"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if m.is_file() && m.nlink() != 1 {
                return Err(io::Error::other(
                    "hardlinked runtime artifacts are forbidden",
                ));
            }
        }
        Ok(())
    }
    walk(runtime, &mut 0, 0)
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| io::Error::other("missing parent"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = dir.join(format!(".write-{}-{stamp}", std::process::id()));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    output.write_all(bytes)?;
    output.sync_all()?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(())
}
pub fn release() {
    if let Some((lock, token)) = OWNED.lock().unwrap().take() {
        let matching = fs::read(lock.join("owner.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .and_then(|v| v.get("token").and_then(|v| v.as_str()).map(String::from))
            == Some(token);
        if matching {
            let _ = fs::remove_file(lock.join("owner.json"));
            let _ = fs::remove_dir(lock);
        }
    }
}
pub fn exit(code: i32) -> ! {
    release();
    std::process::exit(code)
}
pub fn migration_reviewed(runtime: &Path) -> io::Result<()> {
    let marker = runtime.join("migration-required.json");
    if !marker.exists() {
        return Ok(());
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(&marker)?).map_err(io::Error::other)?;
    use sha2::{Digest, Sha256};
    let run = fs::read(runtime.join("run.json"))?;
    let hash = format!("{:x}", Sha256::digest(&run));
    if value.get("schema").and_then(|v| v.as_str()) != Some("grainulator.runtime.migration.v1")
        || value.get("state").and_then(|v| v.as_str()) != Some("reviewed")
        || value.get("reviewed_run_sha256").and_then(|v| v.as_str()) != Some(hash.as_str())
    {
        return Err(io::Error::other(
            "runtime migration needs explicit review-migration of the current run contract",
        ));
    }
    let requires_oracles = value
        .get("oracle_bindings_requiring_review")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let contract: serde_json::Value = serde_json::from_slice(&run).map_err(io::Error::other)?;
    if requires_oracles
        && contract
            .get("verification")
            .and_then(|v| v.get("mode"))
            .and_then(|v| v.as_str())
            != Some("strict")
    {
        return Err(io::Error::other(
            "converted oracle bindings require strict verification before review",
        ));
    }
    Ok(())
}
