// Simulador mínimo da API da Pluggy para testes locais. Todos os dados são fictícios e datados
// em ago–out/2026: os testes rodam com FINANCEIRO_TODAY=2026-10-31.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 47899);

const NU = '11111111-1111-4111-8111-111111111111';
const SAN = '22222222-2222-4222-8222-222222222222';
const accounts = {
  [NU]: [
    { id: 'acc-nu-cc', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta Nubank', number: '1234-5', balance: 12480.5 },
    { id: 'acc-nu-card', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Nubank Ultravioleta', number: '4321', balance: 812.4,
      creditData: { creditLimit: 15000, availableCreditLimit: 14187.6, balanceCloseDate: '2026-11-03T03:00:00.000Z', balanceDueDate: '2026-11-10T03:00:00.000Z' } },
  ],
  [SAN]: [{ id: 'acc-san-cc', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta Santander', number: '9999', balance: 1250 }],
};
const t = (id, date, description, amount, type, extra = {}) => ({ id, date: `${date}T15:00:00.000Z`, description, amount, type, status: 'POSTED', ...extra });
const txs = {
  'acc-nu-cc': [
    t('t1', '2026-10-02', 'Transferência enviada pelo Pix - JOAO DA SILVA', -31.9, 'DEBIT'),
    t('t2', '2026-10-05', 'Pagamento de boleto efetuado - G6 INTERNET', -99.9, 'DEBIT'),
    t('t3', '2026-10-10', 'Pagamento de fatura', -1320, 'DEBIT'),
    t('t4', '2026-10-12', 'Transferência enviada pelo Pix - FULANO DE TAL', -500, 'DEBIT'),
    t('t5', '2026-10-15', 'Transferência recebida pelo Pix - EMPRESA EXEMPLO LTDA', 12000, 'CREDIT'),
    t('t6', '2026-10-20', 'Pagamento de boleto efetuado - CONDOMINIO', -650, 'DEBIT'),
    t('t7', '2026-10-20', 'Aplicação RDB', -2000, 'DEBIT'),
    t('t8', '2026-10-25', 'Transferência enviada pelo Pix - Padaria Pao Quente', -18.5, 'DEBIT', { paymentData: { paymentMethod: 'PIX' } }),
    t('t9', '2026-10-30', 'Transferência enviada pelo Pix - Posto Shell', -64, 'DEBIT'),
    t('a1', '2026-08-05', 'Pagamento de boleto efetuado - G6 INTERNET', -99.9, 'DEBIT'),
    t('a2', '2026-08-12', 'Pagamento de boleto efetuado - IPTU 2026', -210, 'DEBIT'),
    t('a3', '2026-08-20', 'Transferência enviada pelo Pix - Loja de Moveis', -1250, 'DEBIT'),
    t('a4', '2026-08-25', 'Transferência enviada pelo Pix - Mercado', -680, 'DEBIT'),
    t('s1b', '2026-09-05', 'Pagamento de boleto efetuado - G6 INTERNET', -99.9, 'DEBIT'),
    t('s2b', '2026-09-12', 'Pagamento de boleto efetuado - IPTU 2026', -210, 'DEBIT'),
    t('s3b', '2026-09-20', 'Transferência enviada pelo Pix - Mercado', -940, 'DEBIT'),
  ],
  'acc-nu-card': [
    t('c1', '2026-09-28', 'iFood', 72.4, 'DEBIT'),
    t('c2', '2026-10-01', 'Amazon - Parcela 2/5', 150, 'DEBIT', { creditCardMetadata: { installmentNumber: 2, totalInstallments: 5 } }),
    t('c3', '2026-10-04', 'Uber', 22.09, 'DEBIT'),
    t('c4', '2026-10-10', 'Pagamento recebido', -1320, 'CREDIT'),
    t('c5', '2026-10-18', 'Estorno Uber', -10, 'CREDIT'),
    { ...t('c6', '2026-10-30', 'Mercado Livre', 89.9, 'DEBIT'), status: 'PENDING' },
    t('c7', '2026-09-01', 'Amazon - Parcela 1/5', 150, 'DEBIT', { creditCardMetadata: { installmentNumber: 1, totalInstallments: 5 } }),
    t('c8', '2026-10-05', 'Loja de Eletros - Geladeira', 320, 'DEBIT', { creditCardMetadata: { installmentNumber: 3, totalInstallments: 10 } }),
    t('c9', '2026-10-12', 'LOJA DE ROUPAS PARC 02/03', 89, 'DEBIT'),
    t('c10', '2026-09-15', 'Fone Bluetooth', 60, 'DEBIT', { creditCardMetadata: { installmentNumber: 3, totalInstallments: 3 } }),
  ],
  'acc-san-cc': [
    t('s1', '2026-10-08', 'PIX ENVIADO - ACADEMIA FIT', -120, 'DEBIT'),
    t('s-a8', '2026-08-07', 'PIX ENVIADO - ACADEMIA FIT', -120, 'DEBIT'),
    t('s-a9', '2026-09-09', 'PIX ENVIADO - ACADEMIA FIT', -115, 'DEBIT'),
  ],
};
const bills = {
  'acc-nu-card': [
    { id: 'bill-2026-09', dueDate: '2026-09-10T03:00:00.000Z', totalAmount: 1050 },
    { id: 'bill-2026-10', dueDate: '2026-10-10T03:00:00.000Z', totalAmount: 1320 },
  ],
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'POST' && url.pathname === '/auth') return send(200, { apiKey: 'mock-key' });
  if (req.headers['x-api-key'] !== 'mock-key') return send(403, { message: 'forbidden' });
  const item = url.pathname.match(/^\/items\/(.+)$/);
  if (item) return accounts[item[1]] ? send(200, { id: item[1], status: 'UPDATED', lastUpdatedAt: new Date().toISOString(), connector: { name: 'MeuPluggy' } }) : send(404, { message: 'not found' });
  if (url.pathname === '/accounts') return send(200, { results: accounts[url.searchParams.get('itemId')] ?? [] });
  if (url.pathname === '/transactions') {
    const from = url.searchParams.get('from');
    const list = (txs[url.searchParams.get('accountId')] ?? []).filter((x) => x.date.slice(0, 10) >= from);
    return send(200, { results: list, page: 1, totalPages: 1, total: list.length });
  }
  if (url.pathname === '/bills') {
    const list = bills[url.searchParams.get('accountId')];
    return list ? send(200, { results: list }) : send(404, { message: 'not available' });
  }
  send(404, { message: 'unknown' });
}).listen(PORT, '127.0.0.1', () => console.log(`simulador da Pluggy em http://127.0.0.1:${PORT}`));
