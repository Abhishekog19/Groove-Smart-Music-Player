var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { losslessAPI } from "./api.js";
import { formatArtists } from "./utils.js";
import JSZip from "jszip";
function detectImageFormat(data) {
  if (!data || data.length < 4) {
    return null;
  }
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (data.length >= 12 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return null;
}
__name(detectImageFormat, "detectImageFormat");
function sanitizeForFilename(value) {
  if (!value) return "Unknown";
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}
__name(sanitizeForFilename, "sanitizeForFilename");
function getExtensionForQuality(quality, convertAacToMp3 = false) {
  switch (quality) {
    case "LOW":
    case "HIGH":
      return convertAacToMp3 ? "mp3" : "m4a";
    default:
      return "flac";
  }
}
__name(getExtensionForQuality, "getExtensionForQuality");
function buildTrackFilename(album, track, quality, artistName, convertAacToMp3 = false) {
  const extension = getExtensionForQuality(quality, convertAacToMp3);
  const volumeNumber = Number(track.volumeNumber);
  const trackNumber = Number(track.trackNumber);
  const isMultiVolume = album.numberOfVolumes && album.numberOfVolumes > 1 || Number.isFinite(volumeNumber);
  let trackPart;
  if (isMultiVolume) {
    const volumePadded = Number.isFinite(volumeNumber) && volumeNumber > 0 ? `${volumeNumber}`.padStart(2, "0") : "01";
    const trackPadded = Number.isFinite(trackNumber) && trackNumber > 0 ? `${trackNumber}`.padStart(2, "0") : "00";
    trackPart = `${volumePadded}-${trackPadded}`;
  } else {
    const trackPadded = Number.isFinite(trackNumber) && trackNumber > 0 ? `${trackNumber}`.padStart(2, "0") : "00";
    trackPart = trackPadded;
  }
  let title = track.title;
  if (track.version) {
    title = `${title} (${track.version})`;
  }
  const parts = [
    sanitizeForFilename(artistName ?? formatArtists(track.artists)),
    sanitizeForFilename(album.title ?? "Unknown Album"),
    `${trackPart} ${sanitizeForFilename(title)}`
  ];
  return `${parts.join(" - ")}.${extension}`;
}
__name(buildTrackFilename, "buildTrackFilename");
function escapeCsvValue(value) {
  const normalized = value.replace(/\r?\n|\r/g, " ");
  if (/[",]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
__name(escapeCsvValue, "escapeCsvValue");
async function buildTrackLinksCsv(tracks, quality) {
  const header = ["Index", "Title", "Artist", "Album", "Duration", "FLAC URL"];
  const rows = [];
  for (const [index, track] of tracks.entries()) {
    const streamUrl = await losslessAPI.getTrackStreamUrl(track.id, quality);
    rows.push([
      `${index + 1}`,
      track.title ?? "",
      formatArtists(track.artists),
      track.album?.title ?? "",
      losslessAPI.formatDuration(track.duration ?? 0),
      streamUrl
    ]);
  }
  return [header, ...rows].map((row) => row.map((value) => escapeCsvValue(String(value ?? ""))).join(",")).join("\n");
}
__name(buildTrackLinksCsv, "buildTrackLinksCsv");
async function downloadTrackWithRetry(trackId, quality, filename, track, callbacks, options) {
  const maxAttempts = 3;
  const baseDelay = 1e3;
  const trackTitle = track.title ?? "Unknown Track";
  const artistName = formatArtists(track.artists);
  console.log(`[Track Download] Starting: "${trackTitle}" by ${artistName} (ID: ${trackId}, Quality: ${quality})`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Track Download] Retry attempt ${attempt}/${maxAttempts} for "${trackTitle}"`);
      }

      // Step 1: Resolve stream URL via backend (uses live mirrors + quality fallback chain)
      const resolveUrl = `/api/tidal-download/resolve?title=${encodeURIComponent(track.title ?? "")}&artist=${encodeURIComponent(artistName)}&quality=${quality}`;
      const resolveRes = await fetch(resolveUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });

      if (!resolveRes.ok) {
        const errData = await resolveRes.json().catch(() => ({}));
        throw new Error(`Resolve failed (${resolveRes.status}): ${errData.details || errData.error || "unknown"}`);
      }

      const { streamUrl, format: resolvedFormat } = await resolveRes.json();
      if (!streamUrl) throw new Error("Backend returned no stream URL");

      // Step 2: Fetch audio blob via audio-proxy (handles CORS for TIDAL CDN URLs)
      const isTidalCdn = /\.tidal\.com|tidal\.com\/|audio\.tidal/i.test(streamUrl);
      const fetchUrl = isTidalCdn
        ? `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`
        : streamUrl;

      const audioRes = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(120000), // 2 min for large FLAC files
        headers: { "Accept": "audio/flac, audio/mp4, audio/*, */*" }
      });

      if (!audioRes.ok) throw new Error(`Audio fetch failed (${audioRes.status})`);

      const blob = await audioRes.blob();
      if (blob.size === 0) throw new Error("Downloaded file is empty");

      console.log(`[Track Download] \u2713 "${trackTitle}" — ${(blob.size / 1024 / 1024).toFixed(2)} MB via backend`);
      return { success: true, blob };

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Track Download] \u2717 Attempt ${attempt}/${maxAttempts} failed for "${trackTitle}": ${errorObj.message}`);
      callbacks?.onTrackFailed?.(track, errorObj, attempt);

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[Track Download] Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`[Track Download] \u2717\u2717\u2717 All ${maxAttempts} attempts failed for "${trackTitle}"`);
        return { success: false, error: errorObj };
      }
    }
  }
  return { success: false, error: new Error("Download failed after all retry attempts") };
}
__name(downloadTrackWithRetry, "downloadTrackWithRetry");
function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
__name(triggerFileDownload, "triggerFileDownload");
async function downloadAlbum(album, quality, callbacks, preferredArtistName, options) {
  const { album: fetchedAlbum, tracks } = await losslessAPI.getAlbum(album.id);
  const canonicalAlbum = fetchedAlbum ?? album;
  const total = tracks.length;
  callbacks?.onTotalResolved?.(total);
  const mode = options?.mode ?? "individual";
  const shouldZip = mode === "zip" && total > 1;
  const useCsv = mode === "csv";
  const convertAacToMp3 = options?.convertAacToMp3 ?? false;
  const downloadCoverSeperately = options?.downloadCoverSeperately ?? false;
  const artistName = sanitizeForFilename(
    preferredArtistName ?? canonicalAlbum.artist?.name ?? "Unknown Artist"
  );
  const albumTitle = sanitizeForFilename(canonicalAlbum.title ?? "Unknown Album");
  console.log(`[Album Download] \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  console.log(`[Album Download] Starting: "${albumTitle}" by ${artistName}`);
  console.log(`[Album Download] Tracks: ${total} | Quality: ${quality} | Mode: ${mode}`);
  console.log(`[Album Download] \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  if (useCsv) {
    let completed2 = 0;
    for (const track of tracks) {
      completed2 += 1;
      callbacks?.onTrackDownloaded?.(completed2, total, track);
    }
    const csvContent = await buildTrackLinksCsv(tracks, quality);
    const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    triggerFileDownload(csvBlob, `${artistName} - ${albumTitle}.csv`);
    return;
  }
  if (shouldZip) {
    const zip = new JSZip();
    let completed2 = 0;
    const failedTracks = [];
    if (downloadCoverSeperately && canonicalAlbum.cover) {
      try {
        console.log("[ZIP Cover Download] Fetching cover for album...");
        const coverSizes = ["1280", "640", "320"];
        let coverDownloadSuccess = false;
        for (const size of coverSizes) {
          if (coverDownloadSuccess) break;
          const coverUrl = losslessAPI.getCoverUrl(canonicalAlbum.cover, size);
          console.log(`[ZIP Cover Download] Attempting size ${size}:`, coverUrl);
          const fetchStrategies = [
            {
              name: "with-headers",
              options: {
                method: "GET",
                headers: {
                  "Accept": "image/jpeg,image/jpg,image/png,image/*",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                signal: AbortSignal.timeout(1e4)
              }
            },
            {
              name: "simple",
              options: {
                method: "GET",
                signal: AbortSignal.timeout(1e4)
              }
            }
          ];
          for (const strategy of fetchStrategies) {
            if (coverDownloadSuccess) break;
            console.log(`[ZIP Cover Download] Trying strategy: ${strategy.name}`);
            try {
              const coverResponse = await fetch(coverUrl, strategy.options);
              console.log(`[ZIP Cover Download] Response status: ${coverResponse.status}, Content-Length: ${coverResponse.headers.get("Content-Length")}`);
              if (!coverResponse.ok) {
                console.warn(`[ZIP Cover Download] Failed with status ${coverResponse.status} for size ${size}`);
                continue;
              }
              const contentType = coverResponse.headers.get("Content-Type");
              const contentLength = coverResponse.headers.get("Content-Length");
              if (contentLength && parseInt(contentLength, 10) === 0) {
                console.warn(`[ZIP Cover Download] Content-Length is 0 for size ${size}`);
                continue;
              }
              if (contentType && !contentType.startsWith("image/")) {
                console.warn(`[ZIP Cover Download] Invalid content type: ${contentType}`);
                continue;
              }
              const arrayBuffer = await coverResponse.arrayBuffer();
              if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                console.warn(`[ZIP Cover Download] Empty array buffer for size ${size}`);
                continue;
              }
              const uint8Array = new Uint8Array(arrayBuffer);
              console.log(`[ZIP Cover Download] Received ${uint8Array.length} bytes`);
              const imageFormat = detectImageFormat(uint8Array);
              if (!imageFormat) {
                console.warn(`[ZIP Cover Download] Unknown image format for size ${size}`);
                continue;
              }
              const coverFilename = `cover.${imageFormat.extension}`;
              zip.file(coverFilename, uint8Array, {
                binary: true,
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
              });
              coverDownloadSuccess = true;
              console.log(`[ZIP Cover Download] Successfully added cover to ZIP (${size}x${size}, format: ${imageFormat.extension}, strategy: ${strategy.name})`);
              break;
            } catch (sizeError) {
              console.warn(`[ZIP Cover Download] Failed at size ${size} with strategy ${strategy.name}:`, sizeError);
            }
          }
        }
        if (!coverDownloadSuccess) {
          console.warn("[ZIP Cover Download] All attempts failed");
        }
      } catch (coverError) {
        console.warn("Failed to download cover for ZIP:", coverError);
      }
    }
    for (const track of tracks) {
      const filename = buildTrackFilename(
        canonicalAlbum,
        track,
        quality,
        preferredArtistName,
        convertAacToMp3
      );
      const result = await downloadTrackWithRetry(
        track.id,
        quality,
        filename,
        track,
        callbacks,
        { convertAacToMp3 }
      );
      if (result.success && result.blob) {
        zip.file(filename, result.blob);
      } else {
        console.error(`[ZIP Download] Track failed: ${track.title}`, result.error);
        failedTracks.push({ track, error: result.error ?? new Error("Unknown error") });
      }
      completed2 += 1;
      callbacks?.onTrackDownloaded?.(completed2, total, track);
    }
    if (failedTracks.length > 0) {
      let errorReport = "DOWNLOAD ERRORS\n";
      errorReport += "===============\n\n";
      errorReport += "The following tracks failed to download after 3 attempts:\n\n";
      failedTracks.forEach((item, index) => {
        const { track, error } = item;
        const trackTitle = track.title ?? "Unknown Track";
        const artistName2 = formatArtists(track.artists);
        errorReport += `${index + 1}. ${trackTitle} - ${artistName2}
`;
        errorReport += `   Error: ${error.message}

`;
      });
      zip.file("_DOWNLOAD_ERRORS.txt", errorReport);
      console.log(`[ZIP Download] Added error report with ${failedTracks.length} failed track(s)`);
    }
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    const successCount2 = completed2 - failedTracks.length;
    console.log(`[Album Download] \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
    console.log(`[Album Download] ZIP Complete: "${albumTitle}"`);
    console.log(`[Album Download] \u2713 Success: ${successCount2}/${total} tracks | ZIP size: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);
    if (failedTracks.length > 0) {
      console.log(`[Album Download] \u2717 Failed: ${failedTracks.length} track(s) - see _DOWNLOAD_ERRORS.txt in ZIP`);
    }
    console.log(`[Album Download] \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
    triggerFileDownload(zipBlob, `${artistName} - ${albumTitle}.zip`);
    return;
  }
  let completed = 0;
  let failedCount = 0;
  for (const track of tracks) {
    const filename = buildTrackFilename(
      canonicalAlbum,
      track,
      quality,
      preferredArtistName,
      convertAacToMp3
    );
    const result = await downloadTrackWithRetry(
      track.id,
      quality,
      filename,
      track,
      callbacks,
      { convertAacToMp3, downloadCoverSeperately }
    );
    if (result.success && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (downloadCoverSeperately && track.album?.cover) {
        try {
          const coverId = track.album.cover;
          const coverSizes = ["1280", "640", "320"];
          let coverDownloadSuccess = false;
          for (const size of coverSizes) {
            if (coverDownloadSuccess) break;
            const coverUrl = losslessAPI.getCoverUrl(coverId, size);
            const fetchStrategies = [
              {
                name: "with-headers",
                options: {
                  method: "GET",
                  headers: {
                    "Accept": "image/jpeg,image/jpg,image/png,image/*",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                  },
                  signal: AbortSignal.timeout(1e4)
                }
              },
              {
                name: "simple",
                options: {
                  method: "GET",
                  signal: AbortSignal.timeout(1e4)
                }
              }
            ];
            for (const strategy of fetchStrategies) {
              if (coverDownloadSuccess) break;
              try {
                const coverResponse = await fetch(coverUrl, strategy.options);
                if (!coverResponse.ok) continue;
                const contentType = coverResponse.headers.get("Content-Type");
                const contentLength = coverResponse.headers.get("Content-Length");
                if (contentLength && parseInt(contentLength, 10) === 0) continue;
                if (contentType && !contentType.startsWith("image/")) continue;
                const arrayBuffer = await coverResponse.arrayBuffer();
                if (!arrayBuffer || arrayBuffer.byteLength === 0) continue;
                const uint8Array = new Uint8Array(arrayBuffer);
                const imageFormat = detectImageFormat(uint8Array);
                if (!imageFormat) continue;
                const coverBlob = new Blob([uint8Array], { type: imageFormat.mimeType });
                const coverObjectUrl = URL.createObjectURL(coverBlob);
                const coverLink = document.createElement("a");
                coverLink.href = coverObjectUrl;
                coverLink.download = `cover.${imageFormat.extension}`;
                document.body.appendChild(coverLink);
                coverLink.click();
                document.body.removeChild(coverLink);
                URL.revokeObjectURL(coverObjectUrl);
                coverDownloadSuccess = true;
                break;
              } catch {
              }
            }
          }
        } catch (coverError) {
          console.warn("Failed to download cover separately:", coverError);
        }
      }
    } else {
      console.error(`[Individual Download] Track failed: ${track.title}`, result.error);
      failedCount++;
    }
    completed += 1;
    callbacks?.onTrackDownloaded?.(completed, total, track);
  }
  const successCount = total - failedCount;
  console.log(`[Album Download] \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  console.log(`[Album Download] Individual Downloads Complete: "${albumTitle}"`);
  console.log(`[Album Download] \u2713 Success: ${successCount}/${total} tracks`);
  if (failedCount > 0) {
    console.log(`[Album Download] \u2717 Failed: ${failedCount} track(s)`);
  }
  console.log(`[Album Download] \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
}
__name(downloadAlbum, "downloadAlbum");
export {
  buildTrackFilename,
  buildTrackLinksCsv,
  downloadAlbum,
  getExtensionForQuality,
  sanitizeForFilename
};
