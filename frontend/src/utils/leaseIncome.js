export default function sumActiveLeaseIncome(contracts) {
  const cents = contracts
    .filter((contract) => contract.status?.toLowerCase() === 'active')
    .reduce((sum, contract) => sum + Math.round(Number(contract.rentAmount || 0) * 100), 0);
  return cents / 100;
}

export function resolveMonthlyIncome(summary, contracts, collectionCount) {
  if (summary?.totalMonthlyIncome != null) return Number(summary.totalMonthlyIncome);
  if (!Number.isInteger(collectionCount) || collectionCount !== contracts.length) return null;
  return sumActiveLeaseIncome(contracts);
}
