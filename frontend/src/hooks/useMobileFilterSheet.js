import { useEffect, useState } from 'react';

export default function useMobileFilterSheet(role, section) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openForRole = (event) => {
      if (event.detail === role) setOpen(true);
    };
    const closeOnNavigate = (event) => {
      if (event.detail !== section) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('workspace:open-filters', openForRole);
    window.addEventListener('workspace:navigate', closeOnNavigate);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('workspace:open-filters', openForRole);
      window.removeEventListener('workspace:navigate', closeOnNavigate);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [role, section]);

  return [open, setOpen];
}
