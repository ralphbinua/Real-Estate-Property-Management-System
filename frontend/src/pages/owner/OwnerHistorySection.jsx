import { Form } from 'react-bootstrap';

export default function OwnerHistorySection({ events, filter, onFilterChange }) {
  const visibleEvents = filter === 'all'
    ? events
    : events.filter((event) => event.category === filter);

  return (
    <section className="pm-owner-history" aria-label="Portfolio history">
      <div className="pm-owner-history-header">
        <div>
          <h3>Portfolio history</h3>
          <p>Application review, manager permissions, and lease changes are recorded here.</p>
        </div>
        <div className="pm-owner-history-filter">
          <Form.Label htmlFor="owner-history-filter">Show</Form.Label>
          <Form.Select
            id="owner-history-filter"
            size="sm"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            <option value="all">All activity</option>
            <option value="approval">Application approval</option>
            <option value="authority">Manager permissions</option>
            <option value="pricing">Rent changes</option>
            <option value="lease">Lease activity</option>
          </Form.Select>
        </div>
      </div>
      <div className="pm-owner-history-summary" aria-live="polite">
        Showing {visibleEvents.length} of {events.length} {events.length === 1 ? 'record' : 'records'}
      </div>
      {visibleEvents.length > 0 ? (
        <ol className="pm-owner-history-timeline">
          {visibleEvents.map((event) => {
            const createdAt = event.createdAt ? new Date(event.createdAt) : null;
            const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
              ? createdAt.toLocaleString()
              : 'Date unavailable';
            return (
              <li className="pm-owner-history-item" key={event.id}>
                <span className={`pm-owner-history-marker is-${event.category}`} aria-hidden="true" />
                <article className="pm-owner-history-card">
                  <div className="pm-owner-history-card-top">
                    <span className={`pm-owner-history-category is-${event.category}`}>{event.categoryLabel}</span>
                    <time dateTime={createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : undefined}>
                      {dateLabel}
                    </time>
                  </div>
                  <h4>{event.title}</h4>
                  {event.summary && <p className="pm-owner-history-description">{event.summary}</p>}
                  <div className="pm-owner-history-actor">Recorded by {event.actor || 'System'}</div>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="pm-owner-history-empty">
          <strong>{events.length === 0 ? 'No history yet' : 'No matching activity'}</strong>
          <span>{events.length === 0 ? 'Updates to approval rules, manager permissions, and leases will appear here.' : 'Choose another filter to see more portfolio records.'}</span>
        </div>
      )}
    </section>
  );
}
