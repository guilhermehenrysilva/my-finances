// `npm test`: sobe o simulador da Pluggy e um servidor do app com banco temporário, roda tests/e2e.mjs e
// desliga tudo. Não toca no banco real (data/) nem no container.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = process.env.MOCK_PORT ?? '47898';
const APP_PORT = process.env.TEST_PORT ?? '47819';
const base = `http://127.0.0.1:${APP_PORT}`;
const tmp = mkdtempSync(join(tmpdir(), 'financeiro-test-'));

const children = [];
function start(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  children.push({ child, log: () => log });
  return child;
}

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Não respondeu: ${url}`);
}

let code = 1;
try {
  start(['tests/mock-pluggy.mjs'], { MOCK_PORT });
  start(['server/index.ts'], {
    PORT: APP_PORT,
    HOST: '127.0.0.1',
    DB_PATH: join(tmp, 'test.db'),
    PLUGGY_API_URL: `http://127.0.0.1:${MOCK_PORT}`,
    PLUGGY_CLIENT_ID: 'teste',
    PLUGGY_CLIENT_SECRET: 'teste',
    FINANCEIRO_TODAY: '2026-10-31',
    NODE_NO_WARNINGS: '1',
  });
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/`);
  await waitFor(`${base}/api/status`);

  const e2e = spawn(process.execPath, ['tests/e2e.mjs', base], { cwd: root, stdio: 'inherit' });
  code = await new Promise((resolve) => e2e.on('exit', (c) => resolve(c ?? 1)));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  for (const c of children) console.error(c.log());
} finally {
  for (const { child } of children) child.kill();
  // No Windows o SQLite pode segurar o arquivo por um instante depois do kill.
  await new Promise((r) => setTimeout(r, 300));
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* fica na pasta temporária do sistema */ }
}
process.exit(code);
