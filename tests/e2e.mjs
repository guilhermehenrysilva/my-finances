// Teste de ponta a ponta do app Financeiro contra o simulador da Pluggy (dados fictícios).
// Rode com `npm test` (tests/run.mjs sobe o simulador e um servidor de teste); ou, com eles já no ar:
//   node tests/e2e.mjs http://127.0.0.1:<porta>
const BASE = process.argv[2] ?? 'http://127.0.0.1:47817';
const B = `${BASE}/api`;
const H = { 'Content-Type': 'application/json' };
let pass = 0;
const fails = [];

async function call(method, path, body, headers = H) {
  const res = await fetch(B + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
const get = (p) => call('GET', p);
const post = (p, b) => call('POST', p, b ?? {});
const put = (p, b) => call('PUT', p, b);
const patch = (p, b) => call('PATCH', p, b);
const del = (p) => call('DELETE', p);

function check(name, cond, extra) {
  if (cond) pass++;
  else fails.push(`${name}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
}

for (let i = 0; i < 50; i++) { try { await fetch(B + '/status'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

// ---- Validações ----
check('mês inválido → 400', (await get('/dashboard?month=2026-13')).status === 400);
check('ano inválido → 400', (await get('/year?year=26')).status === 400);
check('forecast meses inválido → 400', (await get('/forecast?months=5')).status === 400);
check('itemId inválido → 400', (await post('/connections', { itemId: 'abc', label: 'X' })).status === 400);
check('conexão sem nome → 400', (await post('/connections', { itemId: '11111111-1111-4111-8111-111111111111' })).status === 400);
check('entrada valor negativo → 400', (await post('/incomes', { month: '2026-10', description: 'X', amount: -1 })).status === 400);
check('entrada descrição só espaços → 400', (await post('/incomes', { month: '2026-10', description: '   ', amount: 1 })).status === 400);
check('conta dia 0 → 400', (await post('/bills', { month: '2026-10', description: 'X', dueDay: 0 })).status === 400);
const badJson = await call('POST', '/incomes', '{nao é json');
check('JSON inválido → 400 (não 500)', badJson.status === 400, badJson);
check('PATCH lançamento inexistente → 404', (await patch('/transactions/nao-existe', { note: 'x' })).status === 404);
check('PATCH lançamento sem campos → 400', (await patch('/transactions/nao-existe', {})).status === 400);
check('DELETE conta inexistente → 404', (await del('/bills/99999')).status === 404);

// ---- Conexões e sincronização ----
check('conecta Nubank', (await post('/connections', { itemId: '11111111-1111-4111-8111-111111111111', label: 'Nubank' })).status === 201);
check('conecta Santander', (await post('/connections', { itemId: '22222222-2222-4222-8222-222222222222', label: 'Santander' })).status === 201);
check('salva titular', (await put('/settings', { ownerNames: 'Fulano de Tal' })).status === 200);
const sync = await post('/sync');
check('sincroniza sem erro', sync.json.ok === true, sync.json);
const sync2 = await post('/sync');
const txs1 = (await get('/transactions?month=2026-10&flow=')).json;
check('2ª sincronização não duplica', sync2.json.ok && new Set(txs1.map((t) => t.id)).size === txs1.length);

// ---- Classificação ----
const byId = Object.fromEntries(txs1.map((t) => [t.id, t]));
check('Pix detectado pela descrição', byId.t1?.method === 'PIX');
check('Boleto detectado', byId.t2?.method === 'BOLETO');
check('pagamento de fatura ignorado', byId.t3?.ignored_auto === 'Pagamento de fatura');
check('Pix para o titular ignorado', byId.t4?.ignored_auto === 'Transferência entre suas contas');
check('aplicação ignorada', byId.t7?.ignored_auto === 'Investimento');
check('cartão: compra 04/10 cai na fatura de nov', (await get('/transactions?month=2026-11')).json.some((t) => t.id === 'c3'));

// ---- Dashboard ----
const dash = (await get('/dashboard?month=2026-10')).json;
const sumGroups = dash.expenses.groups.reduce((s, g) => s + g.total, 0);
check('dashboard: soma dos grupos = saídas', Math.abs(sumGroups - dash.expenses.total) < 0.01, { sumGroups, total: dash.expenses.total });
check('dashboard: saldo = soma das contas', Math.abs(dash.bankTotal - 13730.5) < 0.01, dash.bankTotal);

// ---- Lançamentos: filtros e edições ----
check('filtro meio PIX', (await get('/transactions?month=2026-10&method=PIX')).json.every((t) => t.method === 'PIX'));
check('filtro só ignorados', (await get('/transactions?month=2026-10&flow=&ignored=only')).json.every((t) => t.ignored));
check('busca por texto', (await get('/transactions?month=2026-10&q=posto')).json.length === 1);
await patch('/transactions/t7', { ignored: false });
const d2 = (await get('/dashboard?month=2026-10')).json;
check('forçar contar aplicação soma 2.000', Math.abs(d2.expenses.total - dash.expenses.total - 2000) < 0.01);
await patch('/transactions/t7', { ignored: null });
await patch('/transactions/t9', { method: 'DEBITO' });
check('troca de meio', (await get('/transactions?month=2026-10&q=posto')).json[0].method === 'DEBITO');
await post('/sync');
check('troca de meio sobrevive à sincronização', (await get('/transactions?month=2026-10&q=posto')).json[0].method === 'DEBITO');
await patch('/transactions/t9', { method: null });
await patch('/transactions/t8', { note: 'pão de sábado' });
check('nota com acento + busca pela nota', (await get('/transactions?month=2026-10&q=' + encodeURIComponent('pão'))).json[0]?.note === 'pão de sábado');

// ---- Entradas ----
check('entrada com centavos', (await post('/incomes', { month: '2026-08', description: 'Salário', amount: 12000, recurring: true })).status === 201);
await post('/incomes', { month: '2026-09', description: 'Salário', amount: 12000, recurring: true });
const inc = (await get('/incomes?month=2026-10')).json;
check('outubro sugere repetir de setembro', inc.repeatFrom === '2026-09', inc);
const rep = await post('/incomes/repeat', { month: '2026-10' });
check('repetir copia 1', rep.json.copied === 1, rep.json);
const rep2 = await post('/incomes/repeat', { month: '2026-10' });
check('repetir de novo não duplica', rep2.json.copied === 0, rep2.json);

// ---- Contas a pagar ----
await post('/bills', { month: '2026-10', description: 'Internet', amount: 99.9, dueDay: 5, matchText: 'G6 Internet', recurring: true });
await post('/bills', { month: '2026-10', description: 'Condomínio', amount: 650, dueDay: 31, matchText: 'condominio', recurring: true });
await post('/bills', { month: '2026-11', description: 'Avulsa', amount: 10, dueDay: 31 });
const b10 = (await get('/bills?month=2026-10')).json;
const inet = b10.find((b) => b.description === 'Internet');
check('baixa automática pelo texto', !!inet?.paid_at && !!inet.transaction_id, inet);
check('fatura do cartão criada e paga', b10.some((b) => b.card_account_id && b.paid_at));
const b11 = (await get('/bills?month=2026-11')).json;
check('dia 31 vira 30 em novembro', b11.find((b) => b.description === 'Condomínio')?.due_date === '2026-11-30');
check('fatura aberta (valor parcial) em novembro', b11.some((b) => b.card_account_id && b.estimated === 1));
const nInet = b11.find((b) => b.description === 'Internet');
await del(`/bills/${nInet.id}`);
check('remover só do mês não volta', !(await get('/bills?month=2026-11')).json.some((b) => b.description === 'Internet'));
check('...e volta em dezembro', (await get('/bills?month=2026-12')).json.some((b) => b.description === 'Internet'));
await patch(`/bills/${inet.id}`, { paid: false });
check('desmarcar baixa automática fica desmarcada', !(await get('/bills?month=2026-10')).json.find((b) => b.id === inet.id).paid_at);
await patch(`/bills/${inet.id}`, { paid: true });

// ---- Editar conta ----
const cond = async (m) => (await get(`/bills?month=${m}`)).json.find((b) => b.description.startsWith('Condomínio'));
const cond10 = await cond('2026-10');
await get('/bills?month=2026-12'); // abre dezembro antes da edição
check('editar fatura do cartão → 400', (await put(`/bills/${b10.find((b) => b.card_account_id).id}`, { description: 'X', dueDay: 1 })).status === 400);
check('editar conta inexistente → 404', (await put('/bills/99999', { description: 'X', dueDay: 1 })).status === 404);
check('editar sem descrição → 400', (await put(`/bills/${cond10.id}`, { description: ' ', dueDay: 1 })).status === 400);
await put(`/bills/${cond10.id}`, { description: 'Condomínio só out', amount: 700, dueDay: 10, matchText: 'condominio', applyTo: 'month' });
const c10 = await cond('2026-10');
check('editar só este mês muda outubro', c10.description === 'Condomínio só out' && c10.amount === 700 && c10.due_date === '2026-10-10', c10);
check('...e não muda novembro', (await cond('2026-11')).amount === 650);
await put(`/bills/${(await cond('2026-11')).id}`, { description: 'Condomínio', amount: 720, dueDay: 31, matchText: 'condominio', applyTo: 'future' });
check('editar daqui pra frente muda dezembro já aberto', (await cond('2026-12'))?.amount === 720);
check('...e meses ainda não abertos', (await cond('2027-02'))?.amount === 720 && (await cond('2027-02')).due_date === '2027-02-28');
check('...e não muda outubro', (await cond('2026-10')).amount === 700);
// Volta aos valores originais para os testes de previsão abaixo.
await put(`/bills/${cond10.id}`, { description: 'Condomínio', amount: 650, dueDay: 31, matchText: 'condominio', applyTo: 'month' });
await put(`/bills/${(await cond('2026-11')).id}`, { description: 'Condomínio', amount: 650, dueDay: 31, matchText: 'condominio', applyTo: 'future' });
check('conta paga continua paga depois de editar', !!(await cond('2026-10')).paid_at);

// ---- Sugestões ----
const sug = (await get('/bills/suggestions')).json;
check('sugere Academia (3 meses)', sug.some((s) => s.key === 'academia fit'), sug);
check('não sugere G6 (já é conta)', !sug.some((s) => s.key.includes('internet')), sug);
await post('/bills/suggestions/dismiss', { key: 'academia fit' });
check('ignorar tira a sugestão', !(await get('/bills/suggestions')).json.some((s) => s.key === 'academia fit'));

// ---- Ano / Histórico ----
const year = (await get('/year?year=2026')).json;
check('ano: novembro (futuro) fora do gráfico', !year.months[10].hasData);
const sumMonths = year.months.filter((m) => m.hasData).reduce((s, m) => s + m.expenses, 0);
check('ano: total = soma dos meses', Math.abs(sumMonths - year.totals.expenses) < 0.01);
const oct = year.months[9];
const sumMethods = Object.values(oct.byMethod).reduce((s, v) => s + v, 0);
check('ano: meios de outubro somam a parte dos bancos', Math.abs(sumMethods - oct.bank) < 0.01, { sumMethods, oct });
check('ano: bancos + por você = saídas do mês', Math.abs(oct.bank + oct.manual - oct.expenses) < 0.01, oct);
check('ano: totais bancos + por você = saídas do ano', Math.abs(year.totals.bank + year.totals.manual - year.totals.expenses) < 0.01, year.totals);
check('ano: com banco conectado mostra a parte dos bancos', year.hasBanks === true);

// ---- Previsão ----
const fc = (await get('/forecast?months=6')).json;
const amazon = fc.installments.find((i) => i.description === 'Amazon');
check('previsão: parcelas do cartão + fora do banco = parcelas', fc.months.every((m) => Math.abs(m.cardInstallments + m.manualInstallments - m.installments) < 0.01), fc.months);
check('parcelas: Amazon agrupada em 2/5', amazon?.current === 2 && amazon.total === 5, amazon);
check('parcelas: leitura pela descrição', fc.installments.some((i) => i.description === 'LOJA DE ROUPAS'));
check('previsão: novembro soma avulsa+mensais', fc.months[1].fixed === 10 + 650, fc.months[1]);
const fcNoVar = (await get('/forecast?months=3&variable=false')).json;
check('sem variáveis = 0', fcNoVar.months.every((m) => m.variable === 0));

// ---- Conta que repete por X meses (compra parcelada fora do banco) ----
check('repetir por 1 mês → 400', (await post('/bills', { month: '2026-10', description: 'X', dueDay: 1, times: 1 })).status === 400);
check('repetir por 200 meses → 400', (await post('/bills', { month: '2026-10', description: 'X', dueDay: 1, times: 200 })).status === 400);
check('cria parcelado em 3x', (await post('/bills', { month: '2026-10', description: 'Sofá no carnê', amount: 300, dueDay: 15, times: 3 })).status === 201);
const sofa = async (m) => (await get(`/bills?month=${m}`)).json.find((b) => b.description === 'Sofá no carnê');
check('parcela 1/3 em outubro', (await sofa('2026-10'))?.repeat_index === 1 && (await sofa('2026-10'))?.repeat_total === 3);
check('parcela 3/3 em dezembro', (await sofa('2026-12'))?.repeat_index === 3);
check('não aparece em janeiro', !(await sofa('2027-01')));
const fc2 = (await get('/forecast?months=6')).json;
const sofaInst = fc2.installments.find((i) => i.manual && i.description === 'Sofá no carnê');
check('previsão lista o parcelado fora do banco', sofaInst?.current === 1 && sofaInst.total === 3 && sofaInst.remainingAmount === 600, sofaInst);
check('previsão: entra em parcelas, não em contas a pagar', fc2.months[1].installments === fc.months[1].installments + 300 && fc2.months[1].fixed === fc.months[1].fixed, { antes: fc.months[1], depois: fc2.months[1] });
check('previsão: some depois da última', fc2.months[3].installments === fc.months[3].installments);
await del(`/bills/${(await sofa('2026-11')).id}?stopRecurring=true`);
check('parar de repetir em nov apaga dez e mantém out', !(await sofa('2026-12')) && !!(await sofa('2026-10')));

// ---- Contas e cartões ----
await patch('/accounts/acc-nu-card', { closeDay: 1, dueDay: 8 });
check('mudar fechamento recalcula fatura (compra 04/10 → nov continua)', (await get('/transactions?month=2026-11')).json.some((t) => t.id === 'c3'));
await patch('/accounts/acc-nu-card', { closeDay: 3, dueDay: 10 });
await patch('/accounts/acc-san-cc', { hidden: true });
const dHidden = (await get('/dashboard?month=2026-10')).json;
check('ocultar conta tira dos totais', !dHidden.accounts.some((a) => a.id === 'acc-san-cc') && dHidden.bankTotal === 12480.5);
await patch('/accounts/acc-san-cc', { hidden: false });

// ---- Saldos e investimentos ----
const dSal = (await get('/dashboard?month=2026-10')).json;
const nuBank = dSal.banks.find((b) => b.label === 'Nubank');
check('investimentos sincronizados (resgatado fica de fora)', nuBank?.investments.length === 2 && nuBank.investmentsTotal === 8200, nuBank?.investments);
check('total de investimentos', dSal.investmentsTotal === 8200, dSal.investmentsTotal);
check('banco sem permissão de investimentos não quebra a sincronização', dSal.banks.find((b) => b.label === 'Santander')?.investments.length === 0);
check('saldo por banco: conta corrente', nuBank?.bankBalance === 12480.5 && nuBank.cardOpen === 812.4, nuBank);

// ---- Conta paga à mão conta como saída (sem duplicar quando o lançamento aparece) ----
const base10 = (await get('/dashboard?month=2026-10')).json.expenses.total;
await post('/bills', { month: '2026-10', description: 'Dentista', amount: 200, dueDay: 25 });
const dentista = (await get('/bills?month=2026-10')).json.find((b) => b.description === 'Dentista');
check('conta em aberto não conta como saída', (await get('/dashboard?month=2026-10')).json.expenses.total === base10);
await patch(`/bills/${dentista.id}`, { paid: true });
const dPaid = (await get('/dashboard?month=2026-10')).json;
check('conta paga à mão soma nas saídas', Math.abs(dPaid.expenses.total - base10 - 200) < 0.01, { antes: base10, depois: dPaid.expenses.total });
check('aparece em "Cadastrado por você"', dPaid.expenses.manual.items.some((b) => b.description === 'Dentista' && b.amount === 200) && !dPaid.expenses.groups.some((g) => g.account_type === 'MANUAL'), dPaid.expenses.manual);
check('dashboard: bancos + por você = total', Math.abs(dPaid.expenses.bank + dPaid.expenses.manual.total - dPaid.expenses.total) < 0.01, dPaid.expenses);
check('dashboard: com banco conectado', dPaid.hasBanks === true);
const yPaid = (await get('/year?year=2026')).json.months[9];
check('entra no histórico do mês (por você)', yPaid.manual >= 200, yPaid);
await patch(`/bills/${dentista.id}`, { paid: false });
check('desmarcar tira das saídas', (await get('/dashboard?month=2026-10')).json.expenses.total === base10);
// Pago à mão antes de o lançamento existir; depois o banco sincroniza e o lançamento é ligado à conta.
await del('/connections/22222222-2222-4222-8222-222222222222');
const baseSemSan = (await get('/dashboard?month=2026-10')).json.expenses.total;
await post('/bills', { month: '2026-10', description: 'Academia', amount: 120, dueDay: 8, matchText: 'academia fit' });
const academia = (await get('/bills?month=2026-10')).json.find((b) => b.description === 'Academia');
check('sem o lançamento, a academia fica em aberto', !academia.paid_at, academia);
await patch(`/bills/${academia.id}`, { paid: true });
check('paga à mão conta 120', Math.abs((await get('/dashboard?month=2026-10')).json.expenses.total - baseSemSan - 120) < 0.01);
await post('/connections', { itemId: '22222222-2222-4222-8222-222222222222', label: 'Santander' });
await post('/sync');
const academia2 = (await get('/bills?month=2026-10')).json.find((b) => b.description === 'Academia');
const dLinked = (await get('/dashboard?month=2026-10')).json;
check('lançamento do banco é ligado à conta paga à mão', !!academia2.transaction_id, academia2);
check('conta traz data e conta do lançamento identificado', academia2.tx_date === '2026-10-08' && academia2.tx_account === 'Santander' && academia2.tx_account_type === 'BANK', academia2);
check('mantém a data em que foi marcada à mão', academia2.paid_at === '2026-10-31', academia2.paid_at);
check('e não soma duas vezes', !dLinked.expenses.manual.items.some((b) => b.description === 'Academia') && Math.abs(dLinked.expenses.total - baseSemSan - 120) < 0.01, { base: baseSemSan, total: dLinked.expenses.total });

// ---- Limite de 5 conexões ----
for (let i = 3; i <= 5; i++) await post('/connections', { itemId: `${i}${i}${i}${i}${i}${i}${i}${i}-${i}${i}${i}${i}-4${i}${i}${i}-8${i}${i}${i}-${String(i).repeat(12)}`, label: `B${i}` });
check('6ª conexão recusada', (await post('/connections', { itemId: '66666666-6666-4666-8666-666666666666', label: 'B6' })).status === 400);
const s1 = (await post('/sync')).json;
check('item desconhecido gera erro por banco', s1.ok === false && /B3/.test(s1.error));
for (let i = 3; i <= 5; i++) await del(`/connections/${i}${i}${i}${i}${i}${i}${i}${i}-${i}${i}${i}${i}-4${i}${i}${i}-8${i}${i}${i}-${String(i).repeat(12)}`);

// ---- Backup ----
const bk = (await get('/backup')).json;
check('backup tem todas as tabelas', ['settings', 'recurring_dismissed', 'connections', 'accounts', 'card_bills', 'transactions', 'incomes', 'bill_templates', 'bills'].every((t) => Array.isArray(bk.tables[t])));
await del('/connections/22222222-2222-4222-8222-222222222222');
const imp = await post('/backup', bk);
check('importar backup', imp.json.ok === true, imp.json);
check('importar restaura conta removida', (await get('/dashboard?month=2026-10')).json.accounts.length === 3);
check('backup inválido recusado', (await post('/backup', { format: 'x' })).status === 400);

// ---- Remover banco limpa as faturas dele ----
await del('/connections/11111111-1111-4111-8111-111111111111');
const orphan = (await get('/bills?month=2026-10')).json.filter((b) => b.card_account_id);
check('remover banco remove as faturas do cartão dele', orphan.length === 0, orphan);
await post('/backup', bk);

// ---- Sem banco conectado: tudo é cadastrado por você ----
const semBanco = structuredClone(bk);
for (const t of ['connections', 'accounts', 'investments', 'card_bills', 'transactions']) semBanco.tables[t] = [];
semBanco.tables.bills = bk.tables.bills.filter((b) => !b.card_account_id).map((b) => ({ ...b, transaction_id: null }));
check('importar backup sem bancos', (await post('/backup', semBanco)).json.ok === true);
const dSem = (await get('/dashboard?month=2026-10')).json;
check('sem banco: dashboard esconde a parte dos bancos', dSem.hasBanks === false && dSem.expenses.bank === 0 && dSem.expenses.groups.length === 0, dSem.expenses);
check('sem banco: saídas = contas pagas', dSem.expenses.total === dSem.expenses.manual.total && dSem.expenses.manual.items.length > 0, dSem.expenses.manual);
check('sem banco: resultado = entradas − contas pagas', Math.abs(dSem.result - (dSem.income.total - dSem.expenses.manual.total)) < 0.01);
const ySem = (await get('/year?year=2026')).json;
check('sem banco: histórico sem colunas dos bancos', ySem.hasBanks === false && ySem.totals.bank === 0 && ySem.totals.expenses === ySem.totals.manual, ySem.totals);
await post('/backup', bk);

// ---- Segurança: pedidos de outros sites ----
const csrf = await call('POST', '/sync', '{}', { 'Content-Type': 'text/plain' });
check('POST sem JSON (de outro site) é recusado', csrf.status === 415 || csrf.status === 403, csrf.status);
const evil = await call('POST', '/sync', '{}', { ...H, Origin: 'https://site-malicioso.com' });
check('POST de outra origem é recusado', evil.status === 403, evil.status);
// O fetch do Node não deixa trocar o Host; esse caso é testado com curl à parte.
const okLocal = await call('POST', '/sync', '{}', { ...H, Origin: BASE.replace('127.0.0.1', 'localhost') });
check('POST da própria origem funciona', okLocal.status === 200, okLocal.status);

console.log(`\n${pass} ok, ${fails.length} falha(s)`);
for (const f of fails) console.log('  ✗ ' + f);
process.exitCode = fails.length ? 1 : 0;
