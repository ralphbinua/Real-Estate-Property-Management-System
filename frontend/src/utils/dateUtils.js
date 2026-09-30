export function addMonthsToDate(dateValue, months) {
  if (!dateValue) return '';
  const [year, month, day] = dateValue.split('-').map(Number);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + Number(months), 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return firstOfTarget.toISOString().slice(0, 10);
}
