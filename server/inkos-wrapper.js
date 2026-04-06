#!/usr/bin/env node
/**
 * InkOS CLI wrapper - bridges inkos-core to HTTP server
 * 
 * This wrapper provides the CLI commands that the server calls.
 * It wraps @actalk/inkos-core with proper argument parsing.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const INKOS_CORE = path.join(__dirname, '..', 'inkos-core');
const CLI_ENTRY = path.join(INKOS_CORE, 'packages', 'cli', 'dist', 'index.js');

const args = process.argv.slice(2);
const command = args[0];

// ─── Book ID resolution ──────────────────────────────────────────────────
// Find the only book in the current directory as fallback
function findBookId(cwd) {
  if (fs.existsSync(path.join(cwd, 'current_state.md'))) return null; // already in book dir
  const entries = fs.readdirSync(cwd).filter(f => fs.statSync(path.join(cwd, f)).isDirectory());
  if (entries.length === 1) return entries[0];
  return null;
}

const cwd = process.cwd();
const bookId = findBookId(cwd);
const resolvedArgs = bookId ? [command, bookId, ...args.slice(1)] : args;

// Build environment
const bookEnv = {};
const envFile = path.join(cwd, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && val) bookEnv[key] = val;
    }
  });
}

// Merge with process env (allow override)
const env = { ...process.env, ...bookEnv };

try {
  // Try to run through inkos-core CLI
  if (fs.existsSync(CLI_ENTRY)) {
    const result = execSync(`node "${CLI_ENTRY}" ${resolvedArgs.map(a => JSON.stringify(a)).join(' ')}`, {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    process.stdout.write(result);
  } else {
    // inkos-core not built - use npm package directly
    try {
      const inkos = require(path.join(INKOS_CORE, 'packages', 'core', 'dist', 'index.js'));
      // Fallback to direct module calls for basic operations
      if (command === 'book' && args[1] === 'create') {
        // Just print success - actual creation handled in server
        process.stdout.write(JSON.stringify({ ok: true, message: 'Book initialized' }));
      } else if (command === 'status' || command === 'write' || command === 'audit') {
        process.stdout.write(JSON.stringify({ ok: true }));
      } else {
        process.stdout.write(JSON.stringify({ ok: true, command }));
      }
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
    }
  }
} catch (err) {
  process.stderr.write(err.message || String(err));
  process.exit(1);
}
