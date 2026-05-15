export function buildArtworkProxyUrl(imageUrl, { apiBaseUrl = "" } = {}) {
  const normalizedImageUrl = String(imageUrl ?? "").trim();

  if (!normalizedImageUrl) {
    return "";
  }

  return `${apiBaseUrl}/api/image-proxy?url=${encodeURIComponent(normalizedImageUrl)}`;
}
