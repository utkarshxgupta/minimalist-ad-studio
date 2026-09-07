/**
 * Stage 1: get the bytes.
 *
 * Runs server-side in a route handler, which is what sidesteps the CORS problem
 * the brief warns about. Nothing here interprets the page; interpretation is
 * `extract.ts`'s job and is kept separate so it can be tested without a network.
 */

export const ALLOWED_HOSTS = new Set(["beminimalist.co", "www.beminimalist.co"]);

const TIMEOUT_MS = 15_000;

/**
 * Honest user agent, verified to receive HTTP 200 from the storefront. If it
 * ever starts getting blocked, the answer is to ask the brand for access, not
 * to impersonate a browser: this tool exists to be auditable by the company
 * whose site it reads.
 */
const USER_AGENT = "MinimalistAdStudio/0.1 (internal prototype)";

/** The subset of Shopify's product JSON this pipeline reads. */
export interface ShopifyProduct {
  title: string;
  handle: string;
  description: string;
  images: string[];
  featured_image: string | null;
  tags: string[];
  url: string;
}

export interface PageBundle {
  url: string;
  handle: string;
  html: string;
  /** Null when the .js endpoint failed but the page itself loaded. */
  product: ShopifyProduct | null;
  fetchedAt: string;
}

export class FetchError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * A server-side fetcher pointed at a user-supplied URL is an SSRF primitive: a
 * reviewer typing an internal address would have the server fetch it and hand
 * back the body. Allowlist the one storefront this tool is for. A blocklist of
 * private ranges would be the weaker version of this control, since it has to
 * be complete to work and an allowlist does not.
 */
export function parseProductUrl(input: string): { url: string; handle: string; origin: string } {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new FetchError(`Not a URL: ${input}`);
  }

  if (parsed.protocol !== "https:") {
    throw new FetchError(`Only https is accepted, got ${parsed.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new FetchError(
      `This tool only reads beminimalist.co product pages. Got ${parsed.hostname}.`
    );
  }

  const match = parsed.pathname.match(/\/products\/([a-z0-9-]+)/i);
  if (!match) {
    throw new FetchError(`Not a product page URL: ${parsed.pathname}`);
  }

  return {
    url: `${parsed.origin}${parsed.pathname}`,
    handle: match[1],
    origin: parsed.origin,
  };
}

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
}

/**
 * Two requests in parallel. The page carries the marketing copy, and Shopify's
 * `.js` endpoint carries clean structured product data. Neither is sufficient:
 * the JSON has no benefit copy, the HTML has no canonical image list.
 *
 * The page is required. The JSON is not, because a product page that renders is
 * enough to extract from and losing the JSON only costs us the image list.
 */
export async function fetchProductPage(input: string): Promise<PageBundle> {
  const { url, handle, origin } = parseProductUrl(input);

  const [pageResult, jsonResult] = await Promise.allSettled([
    get(url),
    get(`${origin}/products/${handle}.js`),
  ]);

  if (pageResult.status === "rejected") {
    throw new FetchError(`Could not reach ${url}`, pageResult.reason);
  }
  if (!pageResult.value.ok) {
    throw new FetchError(`${url} returned HTTP ${pageResult.value.status}`);
  }

  const html = await pageResult.value.text();

  let product: ShopifyProduct | null = null;
  if (jsonResult.status === "fulfilled" && jsonResult.value.ok) {
    try {
      product = normaliseShopifyProduct(await jsonResult.value.json());
    } catch {
      product = null;
    }
  }

  return { url, handle, html, product, fetchedAt: new Date().toISOString() };
}

function normaliseShopifyProduct(raw: unknown): ShopifyProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string" || typeof r.handle !== "string") return null;

  return {
    title: r.title,
    handle: r.handle,
    description: typeof r.description === "string" ? r.description : "",
    images: Array.isArray(r.images) ? r.images.filter((i): i is string => typeof i === "string") : [],
    featured_image: typeof r.featured_image === "string" ? r.featured_image : null,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    url: typeof r.url === "string" ? r.url : "",
  };
}

/** Shopify emits protocol-relative CDN URLs. Canvas export needs absolute ones. */
export function absoluteImageUrl(src: string | null): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("http")) return src;
  return undefined;
}
