export default function formatNotificationTime(value) {
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
