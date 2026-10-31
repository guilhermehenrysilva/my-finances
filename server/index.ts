import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { api } from './routes.ts';
import { runSync } from './sync.ts';
import { pluggyConfigured } from './pluggy.ts';

const PORT = Number(process.env.PORT ?? 47815);
// Fora do Docker, escute só na máquina local. No container, o compose limita a porta a 127.0.0.1.
const HOST = process.env.HOST ?? '127.0.0.1';
const SYNC_INTERVAL_HOURS = Number(process.env.SYNC_INTERVAL_HOURS ?? 6);

const app = new Hono();
app.route('/api', api);
app.use('/*', serveStatic({ root: './web/dist' }));
app.get('/*', serveStatic({ root: './web/dist', path: 'index.html' }));

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`Financeiro rodando em http://localhost:${PORT} (no Docker: http://financeiro.localhost)`);
  if (!pluggyConfigured) console.log('Pluggy não configurada: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env');
});

if (pluggyConfigured) {
  const sync = () => runSync().catch((err) => console.error('Falha na sincronização:', err));
  sync();
  setInterval(sync, SYNC_INTERVAL_HOURS * 3_600_000);
}
