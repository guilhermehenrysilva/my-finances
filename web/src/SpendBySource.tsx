import { METHOD_LABELS, type Dashboard } from './api.ts';
import { money, shortDate } from './format.ts';
import { Icon, MethodBadge, SourceIcon } from './icons.tsx';

type Props = {
  data: Dashboard;
  /** Links "Ver lançamentos", "Abrir contas a pagar" e "Conectar". Sem eles, os links somem. */
  onOpen?: (page: 'lancamentos' | 'contas' | 'config') => void;
};

/** Barra fina com a parte dos bancos e a parte cadastrada por você. */
export function SourceSplit({ bank, manual, height = 8 }: { bank: number; manual: number; height?: number }) {
  const total = bank + manual;
  if (total <= 0) return null;
  return (
    <span className="source-split" style={{ height }} aria-hidden="true">
      {bank > 0 && <span className="src-bank-fill" style={{ flex: bank }} />}
      {manual > 0 && <span className="src-you-fill" style={{ flex: manual }} />}
    </span>
  );
}

/**
 * Saídas do mês separadas pela origem: o que veio dos bancos (Meu Pluggy) e as contas que você marcou
 * como pagas. O total sempre soma as duas partes. Sem banco conectado, a parte dos bancos vira um convite.
 */
export function SpendBySource({ data, onOpen }: Props) {
  const { bank, manual, groups, byMethod } = data.expenses;
  const maxGroup = Math.max(...groups.map((g) => g.total), 1);
  const maxManual = Math.max(...manual.items.map((b) => b.amount), 1);
  const methods = new Map(byMethod.map((m) => [m.method, m.total]));
  const total = data.expenses.total;
  const bankPct = total > 0 ? Math.round((bank / total) * 100) : 0;

  const bankPanel = data.hasBanks ? (
    <div className="source-panel">
      <div className="source-head">
        <SourceIcon source="bank" />
        <span className="grow">
          <h3>Dos bancos</h3>
          <small>Meu Pluggy · cartões, Pix e boletos</small>
        </span>
        <b className="num src-bank-text">{money(bank)}</b>
      </div>
      {groups.length === 0 ? <p className="muted">Nenhum gasto dos bancos neste mês.</p> : (
        <ul className="bars">
          {groups.map((g) => (
            <li key={`${g.account_id}-${g.method}`} title={`${g.count} lançamento(s)`}>
              <span className="bar-label" title={`${METHOD_LABELS[g.method]} ${g.account_label}`}>
                <MethodBadge method={g.method} size={28} />{METHOD_LABELS[g.method]} {g.account_label}
              </span>
              <span className="bar-track"><span className="bar-fill src-bank-fill" style={{ width: `${(Math.max(g.total, 0) / maxGroup) * 100}%` }} /></span>
              <span className="bar-value">{money(g.total)}</span>
            </li>
          ))}
        </ul>
      )}
      {byMethod.length > 1 && (
        <div className="totals-row">
          {byMethod.map((m) => <div key={m.method}><span>{METHOD_LABELS[m.method]}</span><b>{money(methods.get(m.method) ?? 0)}</b></div>)}
        </div>
      )}
      {onOpen && <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen('lancamentos')}>Ver lançamentos</button>}
    </div>
  ) : (
    <div className="source-panel source-empty">
      <div className="source-head">
        <span className="source-icon" style={{ width: 36, height: 36 }}><Icon name="bank" size={18} stroke={2.2} /></span>
        <span className="grow">
          <h3>Dos bancos <span className="tag">opcional</span></h3>
          <small>Nenhum banco conectado</small>
        </span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        O app funciona só com o que você cadastra. Se quiser, conecte o Meu Pluggy para trazer cartões e Pix sozinhos e dar baixa nas contas automaticamente.
      </p>
      {onOpen && <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen('config')}>Conectar em Configurações</button>}
    </div>
  );

  const manualPanel = (
    <div className="source-panel">
      <div className="source-head">
        <SourceIcon source="you" />
        <span className="grow">
          <h3>Cadastrado por você</h3>
          <small>Contas a pagar marcadas como pagas</small>
        </span>
        <b className="num src-you-text">{money(manual.total)}</b>
      </div>
      {manual.items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {data.hasBanks ? 'Nenhuma conta paga à mão neste mês.' : 'Nenhuma conta paga neste mês. Marque em Contas a pagar o que você já pagou.'}
        </p>
      ) : (
        <ul className="bars">
          {manual.items.map((b) => (
            <li key={b.id}>
              <span className="bar-label stacked">
                <b>{b.description}{b.repeat_total != null && ` · ${b.repeat_index}/${b.repeat_total}`}</b>
                <small>Paga em {shortDate(b.paid_at)}</small>
              </span>
              <span className="bar-track"><span className="bar-fill src-you-fill" style={{ width: `${(b.amount / maxManual) * 100}%` }} /></span>
              <span className="bar-value">{money(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {data.hasBanks && (
        <p className="source-note">
          <Icon name="info" size={16} stroke={2.2} />
          Se o pagamento aparecer depois no banco, a conta passa para “Dos bancos” sozinha e não conta duas vezes.
        </p>
      )}
      {onOpen && <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen('contas')}>Abrir contas a pagar</button>}
    </div>
  );

  return (
    <>
      {data.hasBanks && total > 0 && (
        <div className="source-bar" role="img" aria-label={`Dos bancos ${money(bank)} (${bankPct}%) e cadastrado por você ${money(manual.total)} (${100 - bankPct}%)`}>
          <SourceSplit bank={bank} manual={manual.total} height={14} />
          <div className="source-bar-legend"><span>{bankPct}% dos bancos</span><span>{100 - bankPct}% por você</span></div>
        </div>
      )}
      <div className="source-grid">
        {data.hasBanks ? <>{bankPanel}{manualPanel}</> : <>{manualPanel}{bankPanel}</>}
      </div>
      <div className="source-sum">
        {data.hasBanks ? (
          <>
            <span className="src-bank-text">Dos bancos {money(bank)}</span>
            <span className="muted">+</span>
            <span className="src-you-text">Por você {money(manual.total)}</span>
          </>
        ) : (
          <span className="muted">{manual.items.length} conta(s) paga(s)</span>
        )}
        <span className="muted">=</span>
        <b>{money(total)}</b>
      </div>
    </>
  );
}
