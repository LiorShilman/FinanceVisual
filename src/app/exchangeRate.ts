// Frankfurter — free, no API key, CORS-enabled, ECB-sourced rates. No account/secret to manage,
// which matters here since this app has no backend to hide one behind.
// NOTE: the older frankfurter.app domain 301-redirects here, but that redirect response itself
// carries no CORS headers, so a browser fetch() gets blocked mid-redirect — must hit .dev directly.
const RATE_ENDPOINT = 'https://api.frankfurter.dev/v1/latest?from=USD&to=ILS';

/** ₪ per $1, or throws if the network/response is unavailable — callers decide the fallback. */
export async function fetchUsdToIlsRate(): Promise<number> {
  const res = await fetch(RATE_ENDPOINT);
  if (!res.ok) throw new Error(`שגיאה בטעינת השער (${res.status})`);
  const data = (await res.json()) as { rates?: { ILS?: number } };
  const rate = data.rates?.ILS;
  if (!rate || !Number.isFinite(rate)) throw new Error('תשובת שער לא תקינה');
  return rate;
}
