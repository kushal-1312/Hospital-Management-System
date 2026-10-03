import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import useSocket from '../../hooks/useSocket';
import { operationsAPI } from '../../services/api';
import type { CommandCenterData } from '../../types/domain';

type IconName = 'pulse' | 'calendar' | 'team' | 'pharmacy' | 'arrow' | 'refresh';

const Icon = ({ name }: { name: IconName }) => {
  const paths: Record<IconName, React.ReactNode> = {
    pulse: <><path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" /><path d="M12 22C6.4 19.2 3 15.8 3 10.9A4.9 4.9 0 0 1 12 8a4.9 4.9 0 0 1 9 2.9c0 4.9-3.4 8.3-9 11.1Z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 17h3" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5.3a3 3 0 0 1 0 5.4M17 13a5 5 0 0 1 4 4.9V20" /></>,
    pharmacy: <><path d="M8 3h8v5a4 4 0 0 1-8 0V3Z" /><path d="M6 21v-8.5M18 21v-8.5M6 17h12M4 21h16" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

const number = new Intl.NumberFormat('en-IN');
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function CommandCenter() {
  const { user, hasRole } = useAuth();
  const { on } = useSocket();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await operationsAPI.getCommandCenter();
      setData(response.data.data);
      setError('');
    } catch {
      setError('The live operations feed is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => on('dashboard:refresh', () => load(true)), [load, on]);

  const cards = useMemo(() => data ? [
    { icon: 'pulse' as const, label: 'Patients in care', value: number.format(data.clinical.patientsInCare), detail: `${data.clinical.criticalPatients} critical`, tone: data.clinical.criticalPatients ? 'critical' : 'calm' },
    { icon: 'calendar' as const, label: "Today's patient flow", value: number.format(data.flow.appointmentsToday), detail: `${data.flow.completedToday} completed`, tone: 'blue' },
    { icon: 'team' as const, label: 'Clinical workforce', value: number.format(data.capacity.activeDoctors + data.capacity.activeNurses), detail: `${data.capacity.activeDoctors} doctors · ${data.capacity.activeNurses} nurses`, tone: 'violet' },
    { icon: 'pharmacy' as const, label: 'Pharmacy exceptions', value: number.format(data.pharmacy.lowStockItems + data.pharmacy.outOfStockItems), detail: `${data.pharmacy.outOfStockItems} out of stock`, tone: data.pharmacy.outOfStockItems ? 'warning' : 'calm' },
  ] : [], [data]);

  if (loading && !data) {
    return <div className="command-loading"><span className="spinner" /><span>Assembling the live hospital picture…</span></div>;
  }

  return (
    <div className="page-container command-center">
      <section className="command-hero">
        <div>
          <div className="eyebrow"><span className="live-dot" /> Live hospital operations</div>
          <h1>{getGreeting()}, {user?.name.split(' ')[0]}</h1>
          <p>{format(new Date(), 'EEEE, d MMMM yyyy')} · Here is what needs attention across the hospital.</p>
        </div>
        <button className="command-refresh" onClick={() => load()} disabled={loading} aria-label="Refresh command center">
          <Icon name="refresh" /> <span>{loading ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </section>

      {error && <div className="command-error" role="alert">{error} <button onClick={() => load()}>Retry</button></div>}

      <section className="command-grid" aria-label="Hospital operations summary">
        {cards.map((card) => (
          <article className={`command-card command-card--${card.tone}`} key={card.label}>
            <div className="command-card__icon"><Icon name={card.icon} /></div>
            <div className="command-card__value">{card.value}</div>
            <div className="command-card__label">{card.label}</div>
            <div className="command-card__detail">{card.detail}</div>
          </article>
        ))}
      </section>

      <div className="command-columns">
        <section className="command-panel">
          <div className="command-panel__header">
            <div><span className="section-kicker">Priority queue</span><h2>Attention needed now</h2></div>
            <span className="alert-count">{data?.alerts.length || 0} open</span>
          </div>
          <div className="attention-list">
            {data?.alerts.map((alert) => (
              <Link className="attention-item" to={alert.href} key={alert.id}>
                <span className={`attention-marker attention-marker--${alert.severity}`} />
                <span className="attention-copy"><strong>{alert.title}</strong><small>{alert.detail}</small></span>
                <span className="attention-arrow"><Icon name="arrow" /></span>
              </Link>
            ))}
            {!data?.alerts.length && (
              <div className="all-clear"><span>✓</span><div><strong>No critical exceptions</strong><small>Hospital operations are within configured thresholds.</small></div></div>
            )}
          </div>
        </section>

        <aside className="command-panel command-panel--brief">
          <span className="section-kicker">Shift brief</span>
          <h2>Operational pulse</h2>
          <dl className="pulse-list">
            <div><dt>Awaiting confirmation</dt><dd>{data?.flow.awaitingConfirmation ?? 0}</dd></div>
            <div><dt>Under observation</dt><dd>{data?.clinical.underObservation ?? 0}</dd></div>
            <div><dt>Expiring medicine batches</dt><dd>{data?.pharmacy.expiringBatches ?? 0}</dd></div>
            {data?.finance && <div><dt>Outstanding receivables</dt><dd>{currency.format(data.finance.outstandingAmount)}</dd></div>}
          </dl>
          <div className="command-actions">
            <Link to="/appointments">Manage flow <Icon name="arrow" /></Link>
            <Link to="/patients">Open patient registry <Icon name="arrow" /></Link>
            {hasRole('admin', 'doctor') && <Link to="/reports">View analytics <Icon name="arrow" /></Link>}
          </div>
          <p className="command-updated">Last synchronized {data ? format(new Date(data.generatedAt), 'HH:mm:ss') : '—'}</p>
        </aside>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
