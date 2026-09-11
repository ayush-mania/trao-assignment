// Which URLs we are willing to fetch (Section 11). Private and loopback targets are refused unless
// explicitly allowed, because Trao's batch run serves company sites from localhost (Section 9).
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export interface UrlPolicy {
  /** Allow private / loopback / link-local targets. Only true for local runs. */
  allowPrivate: boolean;
  /** Injectable for tests. */
  resolve?: (hostname: string) => Promise<string[]>;
}

export type UrlRejection =
  'invalid_url' | 'unsupported_scheme' | 'private_address' | 'unresolvable_host';

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: UrlRejection };

export async function checkUrl(input: string, policy: UrlPolicy): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_scheme' };
  }
  url.hash = '';
  url.username = '';
  url.password = '';
  if (policy.allowPrivate) return { ok: true, url };

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, reason: 'private_address' };
  }
  const addresses = isIP(host) ? [host] : await resolveHost(host, policy.resolve);
  if (addresses.length === 0) return { ok: false, reason: 'unresolvable_host' };
  if (addresses.some(isPrivateAddress)) return { ok: false, reason: 'private_address' };
  return { ok: true, url };
}

async function resolveHost(
  host: string,
  resolve: UrlPolicy['resolve'] = defaultResolve,
): Promise<string[]> {
  try {
    return await resolve(host);
  } catch {
    return [];
  }
}

async function defaultResolve(host: string): Promise<string[]> {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
}

/** RFC1918, loopback, link-local, CGNAT, unspecified, and their IPv6 equivalents / v4-mapped forms. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = unmapV4(ip);
  if (v4 && isIP(v4) === 4) {
    const [a = 0, b = 0] = v4.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80')
  );
}

/** `::ffff:1.2.3.4` and its hex form `::ffff:102:304` (how WHATWG URL serialises it) → `1.2.3.4`. */
function unmapV4(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (!lower.startsWith('::ffff:')) return isIP(ip) === 4 ? ip : null;
  const rest = lower.slice(7);
  if (isIP(rest) === 4) return rest;
  const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
  if (!m) return null;
  const hi = parseInt(m[1]!, 16);
  const lo = parseInt(m[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}
