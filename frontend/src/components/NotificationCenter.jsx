import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import { resolveNotificationDestination } from '../services/notificationNavigation';
import './NotificationCenter.css';
import formatNotificationTime from '../utils/formatNotificationTime';

export default function NotificationCenter() {
  const { user } = useAuth();
  return user ? <SignedInNotificationCenter key={user._id || user.id || user.email} /> : null;
}

function SignedInNotificationCenter() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const requestSequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingReadState, setSavingReadState] = useState(false);

  const refresh = useCallback(() => {
    const requestId = ++requestSequence.current;
    return listNotifications({ page: 1, pageSize: 5 }).then((data) => {
      if (requestId !== requestSequence.current) return;
      setItems(Array.isArray(data?.results) ? data.results : []);
      setUnreadCount(Number(data?.unread_count || 0));
      setError('');
    }).catch(() => {
      if (requestId === requestSequence.current) setError('Notifications are temporarily unavailable.');
    }).finally(() => {
      if (requestId === requestSequence.current) setLoading(false);
    });
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestSequence.current += 1; };
  }, [refresh]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (items.length === 0) setLoading(true);
      void refresh();
    };
    const interval = window.setInterval(refreshOnFocus, 60000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshOnFocus();
    };
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('notifications:read-state-changed', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('notifications:read-state-changed', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [items.length, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openNotification = async (notification) => {
    const destination = resolveNotificationDestination(notification.destination);
    if (!destination) {
      setError('This notification points to an unavailable section.');
      return;
    }

    if (!notification.is_read) {
      setSavingReadState(true);
      try {
        const updated = await markNotificationRead(notification.id);
        setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        setError('Could not mark the notification as read. It is still in your inbox.');
      } finally {
        setSavingReadState(false);
      }
    }

    setOpen(false);
    navigate(destination);
  };

  const markAllRead = async () => {
    setSavingReadState(true);
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })));
      setUnreadCount(0);
      setError('');
    } catch {
      setError('Could not mark notifications as read. Please try again.');
    } finally {
      setSavingReadState(false);
    }
  };

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            if (items.length === 0) setLoading(true);
            void refresh();
          }
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-panel" role="dialog" aria-label="Recent notifications">
          <header className="notification-panel-header">
            <div>
              <h2>Notifications</h2>
              <p>{unreadCount ? `${unreadCount} unread` : 'You are all caught up'}</p>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="notification-text-button" disabled={savingReadState} onClick={() => void markAllRead()}>
                Mark all read
              </button>
            )}
          </header>

          {error && <p className="notification-error" role="status">{error}</p>}
          {loading && items.length === 0 ? (
            <div className="notification-panel-empty" role="status">Loading notifications…</div>
          ) : items.length === 0 ? (
            <div className="notification-panel-empty">No notifications yet.</div>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item${item.is_read ? '' : ' is-unread'}`}
                    disabled={savingReadState}
                    onClick={() => void openNotification(item)}
                  >
                    <span className="notification-item-indicator" aria-hidden="true" />
                    <span className="notification-item-copy">
                      <span className="notification-item-title">{item.title}</span>
                      <span className="notification-item-message">{item.message}</span>
                      <time className="notification-item-time" dateTime={item.created_at}>{formatNotificationTime(item.created_at)}</time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="notification-panel-footer">
            <Link to="/notifications" onClick={() => setOpen(false)}>View all notifications</Link>
          </footer>
        </section>
      )}
    </div>
  );
}
