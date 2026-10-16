import { Button } from 'react-bootstrap';

export default function MobileFilterBar({ section, open, onClose, resultCount, resultLabel, children }) {
  return (
    <>
      {open && <div className="pm-filter-sheet-scrim" onClick={onClose} />}
      <div className={`pm-filterbar${open ? ' is-filter-sheet-open' : ''}`} data-workspace-section={section} role={open ? 'dialog' : undefined} aria-label={open ? `Search and filter ${resultLabel}` : undefined}>
        <div className="pm-filter-sheet-heading"><strong>Search and filters</strong><button type="button" aria-label="Close filters" onClick={onClose}>✕</button></div>
        {children}
        <Button type="button" className="pm-filter-sheet-done" onClick={onClose}>Show {resultCount} {resultLabel}</Button>
      </div>
    </>
  );
}
