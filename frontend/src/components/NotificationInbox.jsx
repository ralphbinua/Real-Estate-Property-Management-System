import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CollectionPagination from './CollectionPagination';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import { resolveNotificationDestination } from '../services/notificationNavigation';
import './NotificationCenter.css';

const PAGE_SIZE = 20;

function formatNotificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const [unit, amount] = absoluteSeconds < 60
    ? ['second', seconds]
    : absoluteSeconds < 3600
      ? ['minute', Math.round(seconds / 60)]
      : absoluteSeconds < 86400
        ? ['hour', Math.round(seconds / 3600)]
        : absoluteSeconds < 604800
          ? ['day', Math.round(seconds / 86400)]
          : absoluteSeconds < 2629800
            ? ['week', Math.round(seconds / 604800)]
            : absoluteSeconds < 31557600
              ? ['month', Math.round(seconds / 2629800)]
              : ['year', Math.round(seconds / 31557600)];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(amount, unit);
}

export default function NotificationInbox() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, unread_count: 0, results: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingReadState, setSavingReadState] = useState(false);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listNotifications({ page, pageSize: PAGE_SIZE });
      setData({
        count: Number(result?.count || 0),
        unread_count: Number(result?.unread_count || 0),
        results: Array.isArray(result?.results) ? result.results : [],
      });
      setError('');
    } catch {
      setError('Notifications could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const openNotification = async (notification) => {
    const destination = resolveNotificationDestination(notification.destination);
    if (!destination) {
      setError('This notification points to an unavailable section.');
      return;
    }
    if (!notification.is_read) {
      setSavingReadState(true);
      try {
        await markNotificationRead(notification.id);
        setData((current) => ({
          ...current,
          unread_count: Math.max(0, current.unread_count - 1),
          results: current.results.map((item) => item.id === notification.id
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item),
        }));
        window.dispatchEvent(new Event('notifications:read-state-changed'));
      } catch {
        setError('Could not mark the notification as read. It is still in your inbox.');
      } finally {
        setSavingReadState(false);
      }
    }
    navigate(destination);
  };

  const markAllRead = async () => {
    setSavingReadState(true);
    try {
      await markAllNotificationsRead();
      setData((current) => ({
        ...current,
        unread_count: 0,
        results: current.results.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })),
      }));
      window.dispatchEvent(new Event('notifications:read-state-changed'));
      setError('');
    } catch {
      setError('Could not mark notifications as read. Please try again.');
    } finally {
      setSavingReadState(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(data.count / PAGE_SIZE));

  return (
    <div className="notification-inbox-page">
      <div className="notification-inbox-heading">
        <div>
          <p className="notification-eyebrow">WORKSPACE</p>
          <h1>Notifications</h1>
          <p className="notification-inbox-subtitle">Updates about the properties and work connected to your account.</p>
        </div>
        {data.unread_count > 0 && (
          <button type="button" className="notification-secondary-button" disabled={savingReadState} onClick={() => void markAllRead()}>
            Mark all as read
          </button>
        )}
      </div>

      <section className="notification-inbox-card" aria-label="All notifications">
        <div className="notification-inbox-card-header">
          <div>
            <h2>All updates</h2>
            <span>{data.unread_count ? `${data.unread_count} unread` : 'No unread updates'}</span>
          </div>
          <span className="notification-total-count">{data.count} total</span>
        </div>

        {error && <div className="notification-error notification-inbox-error" role="alert">{error}</div>}
        {loading ? (
          <div className="notification-inbox-empty" role="status">Loading notifications…</div>
        ) : data.results.length === 0 ? (
          <div className="notification-inbox-empty">
            <span className="notification-empty-icon" aria-hidden="true">✓</span>
            <h3>You’re all caught up</h3>
            <p>Important updates will appear here.</p>
          </div>
        ) : (
          <ul className="notification-inbox-list">
            {data.results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`notification-inbox-item${item.is_read ? '' : ' is-unread'}`}
                  disabled={savingReadState}
                  onClick={() => void openNotification(item)}
                >
                  <span className="notification-inbox-indicator" aria-hidden="true" />
                  <span className="notification-inbox-item-copy">
                    <span className="notification-inbox-item-topline">
                      <span className="notification-inbox-item-title">{item.title}</span>
                      <time dateTime={item.created_at}>{formatNotificationTime(item.created_at)}</time>
                    </span>
                    <span className="notification-inbox-item-message">{item.message}</span>
                    <span className="notification-inbox-item-link">Open related section <span aria-hidden="true">→</span></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && data.count > PAGE_SIZE && (
          <div className="notification-inbox-pagination">
            <CollectionPagination
              count={data.count}
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>
    </div>
  );
}
