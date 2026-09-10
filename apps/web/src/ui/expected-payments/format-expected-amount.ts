export function formatExpectedAmount(value: string) {
  const [whole, fraction] = value.split(".");
  const grouped = BigInt(whole).toLocaleString();
  return fraction ? `${grouped}.${fraction}` : grouped;
}
