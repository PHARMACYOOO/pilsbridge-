/** Accepts 0803…, 803… or +234803… and returns E.164 (+234XXXXXXXXXX), or null if it isn't a Nigerian mobile number. */
export function normalisePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('234')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^[789][01]\d{8}$/.test(d) ? `+234${d}` : null;
}
