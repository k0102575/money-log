const lifetime = 15_000;
const entries = new Map<string, { expires: number; value: unknown }>();
let generation = 0;

export function clearPageCache() {
  generation++;
  entries.clear();
}

let channel: BroadcastChannel | undefined;
if (typeof window !== "undefined") {
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("money-log-cache");
    channel.onmessage = clearPageCache;
  }
  window.addEventListener("focus", clearPageCache);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clearPageCache();
  });
}

export function invalidatePages() {
  clearPageCache();
  channel?.postMessage("invalidate");
}

export async function cachedPage<T>(
  request: Request,
  load: () => Promise<T>,
): Promise<T> {
  const url = new URL(request.url);
  url.searchParams.delete("edit");
  const key = url.pathname + url.search;
  const entry = entries.get(key);
  if (entry && entry.expires > Date.now()) return entry.value as T;
  const version = generation;
  const promise = load().then((value) => {
    if (version === generation && !request.signal.aborted) {
      if (entries.size >= 20) entries.delete(entries.keys().next().value!);
      entries.set(key, { value, expires: Date.now() + lifetime });
    }
    return value;
  });
  try {
    return await promise;
  } catch (error) {
    clearPageCache();
    throw error;
  }
}

export async function uncachedAction<T>(perform: () => Promise<T>) {
  invalidatePages();
  try {
    return await perform();
  } finally {
    invalidatePages();
  }
}
