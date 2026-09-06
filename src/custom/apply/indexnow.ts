// IndexNow: tell Bing (and the other participating engines) the moment a page
// actually changed, instead of waiting to be recrawled. Free, and one call.
const ENDPOINT = "https://api.indexnow.org/indexnow";

function keyFileUrl(host: string, key: string): string {
  return `https://${host}/${key}.txt`;
}

/** IndexNow only accepts a submission when the key file is reachable, so check
 *  before spending the call. */
export async function indexNowKeyIsLive(
  host: string,
  key: string,
): Promise<boolean> {
  try {
    const response = await fetch(keyFileUrl(host, key), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    return (await response.text()).trim() === key;
  } catch {
    return false;
  }
}

export async function pingIndexNow(input: {
  host: string;
  key: string;
  urls: string[];
}): Promise<{ ok: boolean; status: number }> {
  if (input.urls.length === 0) return { ok: false, status: 0 };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: input.host,
        key: input.key,
        keyLocation: keyFileUrl(input.host, input.key),
        urlList: input.urls,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
