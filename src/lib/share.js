export async function shareCurrentPage({ title = "", text = "" } = {}) {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return;
  }

  const shareUrl = window.location.href;

  if (typeof navigator.share === "function") {
    await navigator.share({
      title,
      text,
      url: shareUrl
    });
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(shareUrl);
  }
}
