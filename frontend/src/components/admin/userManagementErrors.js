function toErrorText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map(toErrorText).filter(Boolean).join(' ');
  }
  if (value && typeof value === 'object') {
    return Object.values(value).map(toErrorText).filter(Boolean).join(' ');
  }
  return '';
}

function formatFieldName(name) {
  if (name === 'non_field_errors') return 'Error';
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatUserManagementError(error, fallback) {
  const data = error?.response?.data;

  if (typeof data === 'string') {
    const message = data.trim();
    if (message) return message;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of ['detail', 'message']) {
      const message = toErrorText(data[key]);
      if (message) return message;
    }

    const fieldMessages = Object.entries(data)
      .filter(([key]) => !['detail', 'message'].includes(key))
      .map(([key, value]) => {
        const message = toErrorText(value);
        return message ? `${formatFieldName(key)}: ${message}` : '';
      })
      .filter(Boolean);

    if (fieldMessages.length) return fieldMessages.join(' ');
  }

  return fallback;
}
