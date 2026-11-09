/**
 * Host half of @local/dsh-git-gui.
 *
 * Registers one exact webServer route (`/dsh-git-gui/api`, POST JSON) that the
 * Client tab uses to inspect and operate the Git repository of the current
 * session working directory. Every request is authenticated with
 * `ctx.connection.admit` (the same browser trust + cookie check the /api
 * bridge applies) before any work runs.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_ERR_BYTES = 64 * 1024;
const GIT_TIMEOUT_MS = 20_000;
const MAX_PATHS = 2000;

/** Run one git command, capturing bounded output. Never throws. */
function runGit(cwd, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('git', args, {
        cwd,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_PAGER: 'cat',
          PAGER: 'cat',
          LC_ALL: 'C.UTF-8',
          GIT_OPTIONAL_LOCKS: '0',
        },
      });
    } catch (error) {
      resolve({ ok: false, error: String((error && error.message) || error) });
      return;
    }
    let out = '';
    let errOut = '';
    let received = 0;
    let truncated = false;
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      settle({ ok: false, error: 'git command timed out' });
    }, GIT_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      received += chunk.length;
      if (received <= MAX_OUTPUT_BYTES) out += chunk.toString('utf8');
      else truncated = true;
    });
    child.stderr.on('data', (chunk) => {
      if (errOut.length < MAX_ERR_BYTES) errOut += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      settle({
        ok: false,
        error:
          error && error.code === 'ENOENT'
            ? 'git executable not found on PATH'
            : String((error && error.message) || error),
      });
    });
    child.on('close', (code) => {
      if (code === 0) {
        settle({ ok: true, out: truncated ? `${out}\n... output truncated ...` : out });
      } else {
        settle({
          ok: false,
          error: errOut.trim() || `git exited with code ${code}`,
        });
      }
    });
  });
}

/** Parse `git status --porcelain=v1 -z -b` output. */
function parseStatus(out) {
  const parts = out.split('\0');
  let branch = null;
  let ahead = 0;
  let behind = 0;
  let upstream = null;
  let i = 0;
  if (parts[0] && parts[0].startsWith('## ')) {
    const header = parts[0].slice(3);
    i = 1;
    const tracking = header.match(/\[ahead (\d+)(?:, behind (\d+))?\]|\[behind (\d+)\]/);
    if (tracking) {
      if (tracking[1]) ahead = Number(tracking[1]);
      if (tracking[2]) behind = Number(tracking[2]);
      if (tracking[3]) behind = Number(tracking[3]);
    }
    const head = header.split('...')[0].trim();
    if (head === 'No branch') branch = '(detached HEAD)';
    else if (header.startsWith('No commits yet')) {
      branch = head;
    } else branch = head;
    const dot = header.indexOf('...');
    if (dot !== -1) {
      upstream = header
        .slice(dot + 3)
        .replace(/\s*\[[^\]]*\]\s*$/, '')
        .trim();
    }
  }
  const files = [];
  while (i < parts.length) {
    const record = parts[i];
    if (!record) {
      i += 1;
      continue;
    }
    if (record.length < 4) {
      i += 1;
      continue;
    }
    const x = record[0];
    const y = record[1];
    const path = record.slice(3);
    i += 1;
    let orig = null;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      orig = parts[i] ?? null;
      i += 1;
    }
    files.push({ x, y, path, orig });
  }
  return { branch, upstream, ahead, behind, files };
}

/** Parse `git log` records separated by \x1f fields, \x1e records. */
function parseLog(out) {
  const commits = [];
  for (const record of out.split('\x1e')) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const fields = trimmed.split('\x1f');
    if (fields.length < 5) continue;
    commits.push({
      hash: fields[0],
      short: fields[1],
      author: fields[2],
      date: fields[3],
      subject: fields[4],
    });
  }
  return commits;
}

/** Validate a client-supplied repo-relative path for git args. */
function safePath(value) {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > 1024) return null;
  if (value.includes('\0')) return null;
  if (/^[A-Za-z]:/.test(value) || value.startsWith('/') || value.startsWith('\\')) return null;
  if (value.split(/[\\/]/).includes('..')) return null;
  return value;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isLoopbackAuthority(hostHeader) {
  if (typeof hostHeader !== 'string') return false;
  const hostname = hostHeader.split(':')[0].toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

export function apply(ctx) {
  const webServer = ctx.get('webServer');
  const connection = ctx.get('connection');
  const sessions = ctx.get('sessions');
  const workingDirectory = ctx.get('workingDirectory');

  if (webServer === undefined) {
    ctx.logger?.warn?.('dsh-git-gui: webServer service unavailable; panel API disabled');
    return;
  }

  async function resolveCwd(sessionId) {
    if (typeof sessionId === 'string' && sessionId && sessions) {
      try {
        const session = sessions.get(sessionId);
        if (session && workingDirectory) return workingDirectory.get(session);
      } catch {
        /* fall through */
      }
    }
    if (workingDirectory) {
      try {
        return workingDirectory.defaultDirectory;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Resolve the repository root for a working directory: the directory itself
   * when it is inside a work tree, otherwise 鈥?when the session workspace sits
   * above the checkout 鈥?the single first-level child that is a git repository.
   */
  async function resolveRepo(cwd) {
    const direct = await runGit(cwd, ['rev-parse', '--show-toplevel']);
    if (direct.ok) return { ok: true, root: direct.out.trim() };
    try {
      const children = readdirSync(cwd, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => join(cwd, entry.name))
        .filter((child) => {
          try {
            return statSync(join(child, '.git')).isDirectory() || statSync(join(child, '.git')).isFile();
          } catch {
            return false;
          }
        });
      if (children.length === 1) {
        const child = await runGit(children[0], ['rev-parse', '--show-toplevel']);
        if (child.ok) return { ok: true, root: child.out.trim() };
      }
    } catch {
      /* keep the direct failure */
    }
    return { ok: false, error: direct.error };
  }

  const debugLogPath = join(dirname(fileURLToPath(import.meta.url)), 'client-debug.log');
  const debugLog = (line) => {
    try {
      appendFileSync(debugLogPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      /* diagnostics only */
    }
  };

  async function handle(input, cwd) {
    const action = typeof input.action === 'string' ? input.action : '';
    if (!cwd) return { ok: false, error: 'working directory unknown' };
    if (!isAbsolute(cwd)) return { ok: false, error: `working directory is not absolute: ${cwd}` };

    const repo = await resolveRepo(cwd);
    if (!repo.ok) return { ok: false, error: repo.error, notRepo: true };
    const root = repo.root;

    if (action === 'client-report') {
      debugLog(`client ${JSON.stringify(input.payload ?? input)}`);
      return { ok: true };
    }

    if (action === 'status') {
      const result = await runGit(root, ['status', '--porcelain=v1', '-z', '-b']);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, root, ...parseStatus(result.out) };
    }

    if (action === 'diff') {
      const path = safePath(input.path);
      if (!path) return { ok: false, error: 'invalid path' };
      const unstaged = await runGit(root, ['diff', '--no-color', '--', path]);
      const staged = await runGit(root, ['diff', '--cached', '--no-color', '--', path]);
      return {
        ok: true,
        path,
        unstaged: unstaged.ok ? unstaged.out : '',
        staged: staged.ok ? staged.out : '',
      };
    }

    if (action === 'log') {
      const result = await runGit(root, [
        'log',
        '-n',
        '20',
        '--date=relative',
        '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1e',
      ]);
      if (!result.ok) return { ok: true, commits: [] };
      return { ok: true, commits: parseLog(result.out) };
    }

    if (action === 'stage' || action === 'unstage') {
      const raw = Array.isArray(input.paths) ? input.paths : [];
      const paths = raw.map(safePath).filter((value) => value !== null);
      if (paths.length === 0 || paths.length > MAX_PATHS) {
        return { ok: false, error: 'invalid paths' };
      }
      if (action === 'stage') {
        const result = await runGit(root, ['add', '--', ...paths]);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      let result = await runGit(root, ['reset', '-q', 'HEAD', '--', ...paths]);
      if (!result.ok) {
        // Repository without any commit yet: unstage = remove from the index.
        result = await runGit(root, ['rm', '--cached', '-q', '-r', '--', ...paths]);
      }
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }

    if (action === 'commit') {
      const message = typeof input.message === 'string' ? input.message.trim() : '';
      if (!message) return { ok: false, error: 'commit message is empty' };
      const raw = Array.isArray(input.paths) ? input.paths : [];
      const paths = raw.map(safePath).filter((value) => value !== null);
      if (paths.length > MAX_PATHS) return { ok: false, error: 'invalid paths' };
      if (paths.length > 0) {
        const added = await runGit(root, ['add', '--', ...paths]);
        if (!added.ok) return { ok: false, error: added.error };
      }
      const args = ['commit', '-m', message];
      if (input.amend === true) args.push('--amend');
      const result = await runGit(root, args);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true };
    }

    return { ok: false, error: `unknown action: ${action}` };
  }

  const route = {
    kind: 'exact',
    path: '/dsh-git-gui/api',
    async handler(req, res) {
      const send = (status, payload) => {
        const body = JSON.stringify(payload);
        if (res.headersSent) {
          res.end(body);
          return;
        }
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(body);
      };
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' });
          res.end();
          return;
        }

        const bodyText = await readBody(req, 1024 * 1024);
        let input = {};
        try {
          input = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          send(200, { ok: false, error: 'invalid JSON body' });
          return;
        }
        const action = typeof input.action === 'string' ? input.action : '';

        // client-report only appends a local debug line, so it stays exempt
        // from authentication: client-side diagnostics must survive auth
        // problems to be useful.
        if (action !== 'client-report') {
          // Authenticate the browser request with the shared trust fence.
          let authorized = false;
          if (connection && typeof connection.admit === 'function') {
            try {
              const headers = new Headers();
              for (const [name, value] of Object.entries(req.headers)) {
                for (const item of typeof value === 'string' ? [value] : value ?? []) {
                  headers.append(name, item);
                }
              }
              const request = new Request(
                `http://${req.headers.host ?? '127.0.0.1'}${req.url ?? '/'}`,
                { method: 'POST', headers },
              );
              const admission = connection.admit(request);
              if (admission && admission.rejection) authorized = false;
              else if (admission && admission.peer) authorized = true;
              else if (admission && typeof admission.principal === 'string') authorized = true;
              else authorized = admission != null;
            } catch {
              authorized = false;
            }
          } else {
            authorized = isLoopbackAuthority(req.headers.host);
          }
          if (!authorized) {
            debugLog(`auth-rejected action=${action} url=${String(req.url)}`);
            send(401, { ok: false, error: 'unauthorized' });
            return;
          }
        }

        const cwd = await resolveCwd(input.sessionId);
        const result = await handle(input, cwd);
        if (result && typeof result === 'object') {
          result.sessionId = typeof input.sessionId === 'string' ? input.sessionId : null;
          result.cwd = cwd ?? null;
        }
        send(200, result);
      } catch (error) {
        send(200, { ok: false, error: String((error && error.message) || error) });
      }
    },
  };

  ctx.effect(() => webServer.register(route), 'dsh-git-gui.route');
}
