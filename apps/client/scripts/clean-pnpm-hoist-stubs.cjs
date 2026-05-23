/**
 * Removes pnpm shamefully-hoist stubs that break Metro on Windows (EACCES / empty junctions).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SKIP = new Set([".pnpm", ".bin", ".cache", ".vite", ".modules.yaml"]);

/** Linux/macOS optional native deps — broken junctions on Windows (EACCES). */
const OPTIONAL_PLATFORM_RE =
  process.platform === "win32" ? /(?:^|\/)(?:linux|darwin|android|freebsd|sunos)-/ : null;

function shouldDropScopedPkg(pkgName) {
  return pkgName.startsWith(".ignored_") || (OPTIONAL_PLATFORM_RE?.test(pkgName) ?? false);
}

function removeDir(full) {
  try {
    fs.rmSync(full, { recursive: true, force: true, maxRetries: 1 });
    return;
  } catch {
    if (process.platform === "win32") {
      execFileSync("cmd.exe", ["/d", "/s", "/c", "rmdir", full], { stdio: "ignore" });
      return;
    }
    throw new Error(`failed to remove ${full}`);
  }
}

function tryRemove(full, removed, label) {
  try {
    removeDir(full);
    removed.push(label);
    return true;
  } catch {
    return false;
  }
}

function cleanPnpmHoistStubs(nodeModulesDir) {
  const removed = [];
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = path.join(nodeModulesDir, entry);

    if (entry.startsWith(".ignored_")) {
      tryRemove(full, removed, entry);
      continue;
    }

    if (entry.startsWith("@")) {
      let scoped;
      try {
        scoped = fs.readdirSync(full);
      } catch (err) {
        if (err.code === "EACCES") tryRemove(full, removed, entry);
        continue;
      }
      for (const pkg of scoped) {
        const pkgPath = path.join(full, pkg);
        if (shouldDropScopedPkg(pkg)) {
          tryRemove(pkgPath, removed, `${entry}/${pkg}`);
          continue;
        }
        try {
          fs.lstatSync(pkgPath);
          fs.accessSync(path.join(pkgPath, "package.json"));
        } catch {
          tryRemove(pkgPath, removed, `${entry}/${pkg}`);
        }
      }
      continue;
    }

    try {
      fs.lstatSync(full);
    } catch (err) {
      if (err.code === "EACCES") tryRemove(full, removed, entry);
      continue;
    }

    try {
      fs.accessSync(path.join(full, "package.json"));
    } catch {
      tryRemove(full, removed, entry);
    }
  }

  return removed;
}

/** pnpm virtual store flat hoists — only drop EACCES / .ignored_* (not missing package.json). */
function cleanPnpmFlatHoists(nodeModulesDir) {
  const removed = [];
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = path.join(nodeModulesDir, entry);

    if (entry.startsWith(".ignored_")) {
      tryRemove(full, removed, entry);
      continue;
    }

    if (entry.startsWith("@")) {
      let scoped;
      try {
        scoped = fs.readdirSync(full);
      } catch (err) {
        if (err.code === "EACCES") tryRemove(full, removed, entry);
        continue;
      }
      for (const pkg of scoped) {
        const pkgPath = path.join(full, pkg);
        if (shouldDropScopedPkg(pkg)) {
          tryRemove(pkgPath, removed, `${entry}/${pkg}`);
          continue;
        }
        try {
          fs.lstatSync(pkgPath);
        } catch {
          tryRemove(pkgPath, removed, `${entry}/${pkg}`);
        }
      }
      continue;
    }

    try {
      fs.lstatSync(full);
    } catch (err) {
      if (err.code === "EACCES") tryRemove(full, removed, entry);
    }
  }

  return removed;
}

/** Every apps/* and packages/* node_modules (Metro watchFolders + hoisted deps). */
function discoverWorkspaceNodeModulesDirs(repoRoot) {
  const dirs = new Set([path.join(repoRoot, "node_modules")]);
  for (const scope of ["apps", "packages"]) {
    const scopeDir = path.join(repoRoot, scope);
    let children;
    try {
      children = fs.readdirSync(scopeDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      dirs.add(path.join(scopeDir, child.name, "node_modules"));
    }
  }
  return [...dirs];
}

/** Each .pnpm/<pkg>/node_modules may contain .ignored_* stubs Metro cannot lstat. */
function cleanPnpmStorePackageNodeModules(repoRoot) {
  const removed = [];
  const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
  let entries;
  try {
    entries = fs.readdirSync(pnpmDir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    if (entry === "node_modules") {
      removed.push(...cleanPnpmFlatHoists(path.join(pnpmDir, entry)));
      continue;
    }
    const innerNm = path.join(pnpmDir, entry, "node_modules");
    if (fs.existsSync(innerNm)) {
      removed.push(...cleanPnpmFlatHoists(innerNm));
    }
  }

  return removed;
}

function cleanAllWorkspaceHoistStubs(repoRoot) {
  const removed = discoverWorkspaceNodeModulesDirs(repoRoot).flatMap((dir) =>
    cleanPnpmHoistStubs(dir),
  );
  removed.push(...cleanPnpmStorePackageNodeModules(repoRoot));
  return removed;
}

module.exports = {
  cleanPnpmHoistStubs,
  cleanPnpmFlatHoists,
  cleanPnpmStorePackageNodeModules,
  discoverWorkspaceNodeModulesDirs,
  cleanAllWorkspaceHoistStubs,
};

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, "../../..");
  const removed = cleanAllWorkspaceHoistStubs(repoRoot);
  if (removed.length > 0) {
    const summary =
      removed.length > 40
        ? `${removed.length} entries (e.g. ${removed.slice(0, 5).join(", ")}, …)`
        : removed.join(", ");
    console.warn(`Removed broken pnpm hoist stubs: ${summary}`);
  }
}
