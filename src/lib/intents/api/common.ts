export function nearIntentsBaseUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const localHttpHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && localHttpHost)
    ) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
