var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { API_CONFIG, fetchWithCORS, selectApiTargetForRegion } from "./config.js";

// ── Audio stream proxy ────────────────────────────────────────────────────────
// TIDAL audio CDN URLs cannot be fetched directly from the browser (CORS).
// Route them through our local server's /api/audio-proxy endpoint instead.
const AUDIO_PROXY_ENDPOINT = '/api/audio-proxy';

function isTidalCdnUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return (
      h.endsWith('.tidal.com') ||
      h === 'tidal.com' ||
      h.includes('audio.tidal') ||
      h.includes('cf-hls-media')
    );
  } catch { return false; }
}

/**
 * Wraps a TIDAL CDN URL in the local audio-proxy endpoint.
 * The browser then fetches /api/audio-proxy?url=... from localhost,
 * and the server pipes the CDN audio bytes back.
 */
function proxyAudioUrl(url) {
  if (!isTidalCdnUrl(url)) return url; // non-CDN URLs are fetched as-is
  return `${AUDIO_PROXY_ENDPOINT}?url=${encodeURIComponent(url)}`;
}

// ─────────────────────────────────────────────────────────────────────────────

function deriveTrackQuality(track) {
  return track?.mediaMetadata?.tags?.includes("HIRES_LOSSLESS") ? "HI_RES_LOSSLESS" : null;
}
__name(deriveTrackQuality, "deriveTrackQuality");
function parseTidalUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.split("/").filter(Boolean);
    if (p[0] === "track" && p[1]) return { type: "track", trackId: Number(p[1]) };
    if (p[0] === "album" && p[1]) return { type: "album", albumId: Number(p[1]) };
    if (p[0] === "artist" && p[1]) return { type: "artist", artistId: Number(p[1]) };
    if (p[0] === "playlist" && p[1]) return { type: "playlist", playlistId: p[1] };
    return { type: "unknown" };
  } catch {
    return { type: "unknown" };
  }
}
__name(parseTidalUrl, "parseTidalUrl");
import { formatArtistsForMetadata } from "./utils.js";
const API_BASE = API_CONFIG.baseUrl;
const RATE_LIMIT_ERROR_MESSAGE = "Too Many Requests. Please wait a moment and try again.";
const DASH_MANIFEST_UNAVAILABLE_CODE = "DASH_MANIFEST_UNAVAILABLE";
class LosslessAPI {
  static {
    __name(this, "LosslessAPI");
  }
  baseUrl;
  metadataQueue = Promise.resolve();
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }
  resolveRegionalBase(region = "auto") {
    try {
      const target = selectApiTargetForRegion(region);
      if (target?.baseUrl) {
        return target.baseUrl;
      }
    } catch (error) {
      console.warn("Falling back to default API base URL for region selection", { region, error });
    }
    return this.baseUrl;
  }
  buildRegionalUrl(path, region = "auto") {
    const base = this.resolveRegionalBase(region).replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }
  normalizeSearchResponse(data, key) {
    const section = this.findSearchSection(data, key, /* @__PURE__ */ new Set());
    return this.buildSearchResponse(section);
  }
  buildSearchResponse(section) {
    const items = section?.items;
    const list = Array.isArray(items) ? items : [];
    const limit = typeof section?.limit === "number" ? section.limit : list.length;
    const offset = typeof section?.offset === "number" ? section.offset : 0;
    const total = typeof section?.totalNumberOfItems === "number" ? section.totalNumberOfItems : list.length;
    return {
      items: list,
      limit,
      offset,
      totalNumberOfItems: total
    };
  }
  findSearchSection(source, key, visited) {
    if (!source) {
      return void 0;
    }
    if (Array.isArray(source)) {
      for (const entry of source) {
        const found = this.findSearchSection(entry, key, visited);
        if (found) {
          return found;
        }
      }
      return void 0;
    }
    if (typeof source !== "object") {
      return void 0;
    }
    const objectRef = source;
    if (visited.has(objectRef)) {
      return void 0;
    }
    visited.add(objectRef);
    if (!Array.isArray(source) && "items" in objectRef && Array.isArray(objectRef.items)) {
      return objectRef;
    }
    if (key in objectRef) {
      const nested = objectRef[key];
      const fromKey = this.findSearchSection(nested, key, visited);
      if (fromKey) {
        return fromKey;
      }
    }
    for (const value of Object.values(objectRef)) {
      const found = this.findSearchSection(value, key, visited);
      if (found) {
        return found;
      }
    }
    return void 0;
  }
  prepareTrack(track) {
    let normalized = track;
    if (!track.artist && Array.isArray(track.artists) && track.artists.length > 0) {
      normalized = { ...track, artist: track.artists[0] };
    }
    const derivedQuality = deriveTrackQuality(normalized);
    if (derivedQuality && normalized.audioQuality !== derivedQuality) {
      normalized = { ...normalized, audioQuality: derivedQuality };
    }
    return normalized;
  }
  prepareAlbum(album) {
    if (!album.artist && Array.isArray(album.artists) && album.artists.length > 0) {
      return { ...album, artist: album.artists[0] };
    }
    return album;
  }
  prepareArtist(artist) {
    if (!artist.type && Array.isArray(artist.artistTypes) && artist.artistTypes.length > 0) {
      return { ...artist, type: artist.artistTypes[0] };
    }
    return artist;
  }
  ensureNotRateLimited(response) {
    if (response.status === 429) {
      throw new Error(RATE_LIMIT_ERROR_MESSAGE);
    }
  }
  async delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  parseTrackLookup(data) {
    const entries = Array.isArray(data) ? data : [data];
    let track;
    let info;
    let originalTrackUrl;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      if (!track && "album" in entry && "artist" in entry && "duration" in entry) {
        track = entry;
        continue;
      }
      if (!info && "manifest" in entry) {
        info = entry;
        continue;
      }
      if (!originalTrackUrl && "OriginalTrackUrl" in entry) {
        const candidate = entry.OriginalTrackUrl;
        if (typeof candidate === "string") {
          originalTrackUrl = candidate;
        }
      }
    }
    if (!track || !info) {
      throw new Error("Malformed track response");
    }
    return { track, info, originalTrackUrl };
  }
  extractStreamUrlFromManifest(manifest) {
    try {
      const decoded = this.decodeBase64Manifest(manifest);
      try {
        const parsed = JSON.parse(decoded);
        if (parsed && Array.isArray(parsed.urls) && parsed.urls.length > 0) {
          return parsed.urls[0] ?? null;
        }
      } catch (jsonError) {
        console.debug("Manifest JSON parse failed, falling back to pattern match", jsonError);
      }
      if (this.isSegmentedDashManifest(decoded)) {
        return null;
      }
      const mpdUrl = this.parseFlacUrlFromMpd(decoded);
      if (mpdUrl) {
        return mpdUrl;
      }
      const urlRegex = /https?:\/\/[\w\-.~:?#[\]@!$&'()*+,;=%/]+/g;
      let match;
      while ((match = urlRegex.exec(decoded)) !== null) {
        const url = match[0];
        if (url.includes("$Number$")) continue;
        if (/\/\d+\.mp4/.test(url)) continue;
        if (this.isValidMediaUrl(url)) {
          return url;
        }
      }
      return null;
    } catch (error) {
      console.error("Failed to decode manifest:", error);
      return null;
    }
  }
  isSegmentedDashManifest(decoded) {
    return /<SegmentTemplate/i.test(decoded);
  }
  isDashManifestPayload(payload, contentType) {
    const trimmed = payload.trim();
    if (!trimmed) {
      return false;
    }
    if (contentType && contentType.toLowerCase().includes("xml")) {
      return trimmed.startsWith("<");
    }
    return /^<\?xml/i.test(trimmed) || /^<MPD[\s>]/i.test(trimmed) || /^<\w+/i.test(trimmed);
  }
  parseJsonSafely(payload) {
    try {
      return JSON.parse(payload);
    } catch (error) {
      console.debug("Failed to parse JSON payload from DASH response", error);
      return null;
    }
  }
  createDashUnavailableError(message) {
    const error = new Error(message);
    error.code = DASH_MANIFEST_UNAVAILABLE_CODE;
    return error;
  }
  isXmlContentType(contentType) {
    if (!contentType) return false;
    return /(application|text)\/(?:.+\+)?xml/i.test(contentType) || /dash\+xml|mpd/i.test(contentType);
  }
  isJsonContentType(contentType) {
    if (!contentType) return false;
    return /json/i.test(contentType) || /application\/vnd\.tidal\.bts/i.test(contentType);
  }
  extractUrlsFromDashJsonPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return [];
    }
    const candidate = payload.urls;
    if (!Array.isArray(candidate)) {
      return [];
    }
    return candidate.map((entry) => typeof entry === "string" ? entry.trim() : "").filter((entry) => entry.length > 0);
  }
  isHiResQuality(quality) {
    return String(quality).toUpperCase() === "HI_RES_LOSSLESS";
  }
  isV2ApiContainer(payload) {
    return Boolean(
      payload && typeof payload === "object" && "version" in payload && String(payload.version).startsWith("2.")
    );
  }
  decodeBase64Manifest(manifest) {
    if (typeof manifest !== "string") return "";
    const trimmed = manifest.trim();
    if (!trimmed) return "";
    try {
      const normalized = (() => {
        let value = trimmed.replace(/-/g, "+").replace(/_/g, "/");
        const pad = value.length % 4;
        if (pad === 2) value += "==";
        if (pad === 3) value += "=";
        return value;
      })();
      const decoded = atob(normalized);
      return decoded || trimmed;
    } catch {
      return trimmed;
    }
  }
  extractTrackFromPayload(payload) {
    const candidates = [];
    if (!payload) return void 0;
    if (Array.isArray(payload)) {
      candidates.push(...payload);
    } else if (typeof payload === "object") {
      candidates.push(payload);
      for (const value of Object.values(payload)) {
        if (value && (typeof value === "object" || Array.isArray(value))) {
          candidates.push(value);
        }
      }
    }
    const isTrackLike = /* @__PURE__ */ __name((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry;
      return typeof record.id === "number" && typeof record.title === "string" && typeof record.duration === "number";
    }, "isTrackLike");
    for (const candidate of candidates) {
      if (isTrackLike(candidate)) {
        return candidate;
      }
    }
    return void 0;
  }
  async fetchTrackMetadata(trackId, apiVersion = "v2") {
    const response = await this.fetch(`${this.baseUrl}/info/?id=${trackId}`, { apiVersion });
    this.ensureNotRateLimited(response);
    if (!response.ok) {
      throw new Error("Failed to fetch track metadata");
    }
    const payload = await response.json();
    const data = this.isV2ApiContainer(payload) ? payload.data : payload;
    const track = this.extractTrackFromPayload(data);
    if (!track) {
      throw new Error("Track metadata not found");
    }
    return this.prepareTrack(track);
  }
  buildTrackInfoFromV2(data, fallbackTrackId) {
    const manifestMimeType = typeof data.manifestMimeType === "string" && data.manifestMimeType.trim().length > 0 ? data.manifestMimeType : "application/dash+xml";
    return {
      trackId: typeof data.trackId === "number" ? data.trackId : fallbackTrackId,
      audioMode: typeof data.audioMode === "string" ? data.audioMode : "STEREO",
      audioQuality: typeof data.audioQuality === "string" ? data.audioQuality : "LOSSLESS",
      manifest: typeof data.manifest === "string" ? data.manifest : "",
      manifestMimeType,
      manifestHash: typeof data.manifestHash === "string" ? data.manifestHash : void 0,
      assetPresentation: typeof data.assetPresentation === "string" ? data.assetPresentation : "FULL",
      albumReplayGain: typeof data.albumReplayGain === "number" ? data.albumReplayGain : void 0,
      albumPeakAmplitude: typeof data.albumPeakAmplitude === "number" ? data.albumPeakAmplitude : void 0,
      trackReplayGain: typeof data.trackReplayGain === "number" ? data.trackReplayGain : void 0,
      trackPeakAmplitude: typeof data.trackPeakAmplitude === "number" ? data.trackPeakAmplitude : void 0,
      bitDepth: typeof data.bitDepth === "number" ? data.bitDepth : void 0,
      sampleRate: typeof data.sampleRate === "number" ? data.sampleRate : void 0
    };
  }
  extractOriginalTrackUrl(payload) {
    const originalUrl = typeof payload.OriginalTrackUrl === "string" ? payload.OriginalTrackUrl : typeof payload.originalTrackUrl === "string" ? payload.originalTrackUrl : void 0;
    return originalUrl;
  }
  async parseTrackLookupV2(trackId, payload, apiVersion = "v2") {
    const container = payload?.data ?? payload;
    const trackInfo = this.buildTrackInfoFromV2(container, trackId);
    let track = this.extractTrackFromPayload(container) ?? null;
    if (!track) {
      track = await this.fetchTrackMetadata(trackId, apiVersion);
    }
    return {
      track: this.prepareTrack(track),
      info: trackInfo,
      originalTrackUrl: this.extractOriginalTrackUrl(container)
    };
  }
  buildDashManifestResult(payload, contentType) {
    const manifestText = this.decodeBase64Manifest(payload);
    if (this.isXmlContentType(contentType) || this.isDashManifestPayload(manifestText, contentType)) {
      return { kind: "dash", manifest: manifestText, contentType };
    }
    const trimmed = manifestText.trim();
    if (this.isJsonContentType(contentType) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed2 = this.parseJsonSafely(manifestText);
      if (parsed2 && typeof parsed2 === "object" && parsed2.detail && typeof parsed2.detail === "string" && parsed2.detail.toLowerCase() === "not found") {
        throw this.createDashUnavailableError("Dash manifest not found for track");
      }
      const urls2 = this.extractUrlsFromDashJsonPayload(parsed2);
      if (urls2.length > 0) {
        return { kind: "flac", manifestText, urls: urls2, contentType };
      }
    }
    if (this.isDashManifestPayload(manifestText, contentType)) {
      return { kind: "dash", manifest: manifestText, contentType };
    }
    const parsed = this.parseJsonSafely(manifestText);
    const urls = this.extractUrlsFromDashJsonPayload(parsed);
    if (urls.length > 0) {
      return { kind: "flac", manifestText, urls, contentType };
    }
    throw this.createDashUnavailableError("Received unexpected payload from dash endpoint.");
  }
  isValidMediaUrl(url) {
    if (!url) return false;
    const normalized = url.toLowerCase();
    if (normalized.includes("w3.org")) return false;
    if (normalized.includes("xmlschema")) return false;
    if (normalized.includes("xmlns")) return false;
    if (normalized.includes(".flac") || normalized.includes(".mp4") || normalized.includes(".m4a") || normalized.includes(".aac") || normalized.includes("token=") || normalized.includes("/audio/")) {
      return true;
    }
    if (/\/[^/]+\.[a-z0-9]{2,5}(\?|$)/i.test(url)) return true;
    if (/^[a-z0-9_-]+\//i.test(url)) return true;
    if (/\/[a-z0-9_-]+$/i.test(url)) return true;
    return false;
  }
  parseFlacUrlFromMpd(manifestText) {
    const trimmed = manifestText.trim();
    if (!trimmed) return null;
    const isValidMediaUrl = this.isValidMediaUrl.bind(this);
    const scoreUrl = /* @__PURE__ */ __name((url) => {
      if (!url) return -1;
      const normalized = url.toLowerCase();
      let score = 0;
      if (normalized.includes("flac")) score += 3;
      if (normalized.includes("hires")) score += 1;
      if (normalized.endsWith(".flac")) score += 4;
      if (normalized.includes("token=")) score += 1;
      return score;
    }, "scoreUrl");
    const pickBest = /* @__PURE__ */ __name((urls) => {
      const candidates = urls.map((u) => typeof u === "string" ? u.trim() : "").filter((u) => u.length > 0 && isValidMediaUrl(u));
      if (candidates.length === 0) return null;
      return candidates.sort((a, b) => scoreUrl(b) - scoreUrl(a))[0] ?? null;
    }, "pickBest");
    if (typeof DOMParser !== "undefined") {
      try {
        const doc = new DOMParser().parseFromString(trimmed, "application/xml");
        const baseUrls = Array.from(doc.getElementsByTagName("BaseURL")).map(
          (n) => n.textContent?.trim() ?? ""
        );
        if (baseUrls.length > 0) {
          const best = pickBest(baseUrls);
          if (best) return best;
        }
        const reps = Array.from(doc.getElementsByTagName("Representation"));
        for (const rep of reps) {
          const codecs = rep.getAttribute("codecs")?.toLowerCase() ?? "";
          const base = Array.from(rep.getElementsByTagName("BaseURL")).map(
            (n) => n.textContent?.trim() ?? ""
          );
          if (base.length > 0 && codecs.includes("flac")) {
            const best = pickBest(base);
            if (best) return best;
          }
        }
      } catch (error) {
        console.debug("Failed to parse MPD manifest via DOMParser", error);
      }
    }
    const baseUrlMatch = trimmed.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
    if (baseUrlMatch?.[1]) {
      const candidate = baseUrlMatch[1].trim();
      if (isValidMediaUrl(candidate)) {
        return candidate;
      }
    }
    return null;
  }
  parseMpdSegmentTemplate(manifestText) {
    const trimmed = manifestText.trim();
    if (!trimmed) return null;
    const parseWithDom = /* @__PURE__ */ __name(() => {
      if (typeof DOMParser === "undefined") return null;
      try {
        const doc = new DOMParser().parseFromString(trimmed, "application/xml");
        const rawBaseUrl = doc.getElementsByTagName("BaseURL")[0]?.textContent?.trim();
        const baseUrl = rawBaseUrl && this.isValidMediaUrl(rawBaseUrl) ? rawBaseUrl : void 0;
        let template = null;
        let codec;
        const representations = Array.from(doc.getElementsByTagName("Representation"));
        for (const rep of representations) {
          const candidateTemplate = rep.getElementsByTagName("SegmentTemplate")[0];
          if (!candidateTemplate) continue;
          const codecsAttr = rep.getAttribute("codecs")?.toLowerCase() ?? "";
          if (!template || codecsAttr.includes("flac")) {
            template = candidateTemplate;
            codec = codecsAttr || void 0;
            if (codecsAttr.includes("flac")) break;
          }
        }
        if (!template) {
          template = doc.getElementsByTagName("SegmentTemplate")[0] ?? null;
        }
        if (!template) return null;
        const initializationUrl = template.getAttribute("initialization")?.trim();
        const mediaUrlTemplate = template.getAttribute("media")?.trim();
        if (!initializationUrl || !mediaUrlTemplate) return null;
        const startNumber = Number.parseInt(template.getAttribute("startNumber") ?? "1", 10);
        const timelineParent = template.getElementsByTagName("SegmentTimeline")[0];
        const segmentTimeline = [];
        if (timelineParent) {
          const segments = timelineParent.getElementsByTagName("S");
          for (const seg of Array.from(segments)) {
            const duration = Number.parseInt(seg.getAttribute("d") ?? "0", 10);
            if (!Number.isFinite(duration) || duration <= 0) continue;
            const repeat = Number.parseInt(seg.getAttribute("r") ?? "0", 10);
            segmentTimeline.push({ duration, repeat: Number.isFinite(repeat) ? repeat : 0 });
          }
        }
        return {
          initializationUrl,
          mediaUrlTemplate,
          startNumber: Number.isFinite(startNumber) && startNumber > 0 ? startNumber : 1,
          segmentTimeline,
          baseUrl,
          codec
        };
      } catch (error) {
        console.debug("Failed to parse MPD manifest with DOMParser", error);
        return null;
      }
    }, "parseWithDom");
    const parseWithRegex = /* @__PURE__ */ __name(() => {
      const initializationUrl = /initialization="([^"]+)"/i.exec(trimmed)?.[1]?.trim();
      const mediaUrlTemplate = /media="([^"]+)"/i.exec(trimmed)?.[1]?.trim();
      if (!initializationUrl || !mediaUrlTemplate) return null;
      const startNumberMatch = /startNumber="(\d+)"/i.exec(trimmed);
      const startNumber = startNumberMatch ? Number.parseInt(startNumberMatch[1], 10) : 1;
      const segmentTimeline = [];
      const timelineRegex = /<S[^>]*\sd="(\d+)"(?:[^>]*\sr="(-?\d+)")?[^>]*\/?>/gi;
      let match;
      while ((match = timelineRegex.exec(trimmed)) !== null) {
        const duration = Number.parseInt(match[1], 10);
        const repeat = match[2] ? Number.parseInt(match[2], 10) : 0;
        if (Number.isFinite(duration) && duration > 0) {
          segmentTimeline.push({ duration, repeat: Number.isFinite(repeat) ? repeat : 0 });
        }
      }
      return {
        initializationUrl,
        mediaUrlTemplate,
        startNumber: Number.isFinite(startNumber) && startNumber > 0 ? startNumber : 1,
        segmentTimeline
      };
    }, "parseWithRegex");
    return parseWithDom() ?? parseWithRegex();
  }
  buildMpdSegmentUrls(template) {
    if (!template) return null;
    const resolveUrl = /* @__PURE__ */ __name((url) => {
      if (/^https?:\/\//i.test(url)) return url;
      if (template.baseUrl) {
        try {
          return new URL(url, template.baseUrl).toString();
        } catch {
          return `${template.baseUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
        }
      }
      return url;
    }, "resolveUrl");
    const initializationUrl = resolveUrl(template.initializationUrl);
    const segmentUrls = [];
    let segmentNumber = template.startNumber;
    const timeline = template.segmentTimeline.length > 0 ? template.segmentTimeline : [{ duration: 0, repeat: 0 }];
    for (const entry of timeline) {
      const repeat = Number.isFinite(entry.repeat) ? entry.repeat : 0;
      const count = Math.max(1, repeat + 1);
      for (let i = 0; i < count; i += 1) {
        const url = template.mediaUrlTemplate.replace("$Number$", `${segmentNumber}`);
        segmentUrls.push(resolveUrl(url));
        segmentNumber += 1;
      }
    }
    return { initializationUrl, segmentUrls };
  }
  async downloadFlacFromMpd(manifestText, options) {
    const template = this.parseMpdSegmentTemplate(manifestText);
    const segments = this.buildMpdSegmentUrls(template);
    if (!segments) return null;
    const urls = [segments.initializationUrl, ...segments.segmentUrls];
    const chunks = [];
    let receivedBytes = 0;
    for (const url of urls) {
      // Proxy CDN segment URLs through our server to bypass CORS
      const proxiedSegmentUrl = proxyAudioUrl(url);
      const response = await this.fetch(proxiedSegmentUrl, { signal: options?.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch DASH segment (status ${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const chunk = new Uint8Array(buffer);
      receivedBytes += chunk.byteLength;
      chunks.push(chunk);
      options?.onProgress?.({ stage: "downloading", receivedBytes, totalBytes: void 0 });
    }
    const totalBytes = chunks.reduce((total, current) => total + current.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { blob: new Blob([merged], { type: "audio/flac" }), mimeType: "audio/flac" };
  }
  async resolveHiResStreamFromDash(trackId) {
    const manifest = await this.getDashManifest(trackId, "HI_RES_LOSSLESS");
    if (manifest.kind === "flac") {
      const url = manifest.urls.find(
        (candidate) => typeof candidate === "string" && candidate.length > 0
      );
      if (url) {
        return url;
      }
      throw new Error("DASH manifest did not include any FLAC URLs.");
    }
    const directUrl = this.parseFlacUrlFromMpd(manifest.manifest);
    if (directUrl) {
      return directUrl;
    }
    throw new Error("Hi-res DASH manifest does not expose a direct FLAC URL.");
  }
  /**
   * Fetch wrapper with CORS handling
   */
  async fetch(url, options) {
    return fetchWithCORS(url, options);
  }
  /**
   * Search for tracks
   */
  async searchTracks(query, region = "auto") {
    const response = await this.fetch(
      this.buildRegionalUrl(`/search/?s=${encodeURIComponent(query)}`, region)
    );
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to search tracks");
    const data = await response.json();
    const normalized = this.normalizeSearchResponse(data, "tracks");
    return {
      ...normalized,
      items: normalized.items.map((track) => this.prepareTrack(track))
    };
  }
  /**
   * Search for artists
   */
  async searchArtists(query, region = "auto") {
    const response = await this.fetch(
      this.buildRegionalUrl(`/search/?a=${encodeURIComponent(query)}`, region)
    );
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to search artists");
    const data = await response.json();
    const normalized = this.normalizeSearchResponse(data, "artists");
    return {
      ...normalized,
      items: normalized.items.map((artist) => this.prepareArtist(artist))
    };
  }
  /**
   * Search for albums
   */
  async searchAlbums(query, region = "auto") {
    const response = await this.fetch(
      this.buildRegionalUrl(`/search/?al=${encodeURIComponent(query)}`, region)
    );
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to search albums");
    const data = await response.json();
    const normalized = this.normalizeSearchResponse(data, "albums");
    return {
      ...normalized,
      items: normalized.items.map((album) => this.prepareAlbum(album))
    };
  }
  /**
   * Search for playlists
   */
  async searchPlaylists(query, region = "auto") {
    const response = await this.fetch(
      this.buildRegionalUrl(`/search/?p=${encodeURIComponent(query)}`, region)
    );
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to search playlists");
    const data = await response.json();
    return this.normalizeSearchResponse(data, "playlists");
  }
  /**
   * Import content from a Tidal URL
   * Supports track, album, artist, and playlist URLs
   */
  async importFromUrl(url) {
    const parsed = parseTidalUrl(url);
    if (parsed.type === "unknown") {
      throw new Error(
        "Invalid Tidal URL. Please provide a valid track, album, artist, or playlist URL."
      );
    }
    switch (parsed.type) {
      case "track": {
        if (!parsed.trackId) {
          throw new Error("Could not extract track ID from URL");
        }
        const lookup = await this.getTrack(parsed.trackId);
        return {
          type: "track",
          data: this.prepareTrack(lookup.track)
        };
      }
      case "album": {
        if (!parsed.albumId) {
          throw new Error("Could not extract album ID from URL");
        }
        const { album } = await this.getAlbum(parsed.albumId);
        return {
          type: "album",
          data: this.prepareAlbum(album)
        };
      }
      case "artist": {
        if (!parsed.artistId) {
          throw new Error("Could not extract artist ID from URL");
        }
        const artist = await this.getArtist(parsed.artistId);
        return {
          type: "artist",
          data: this.prepareArtist(artist)
        };
      }
      case "playlist": {
        if (!parsed.playlistId) {
          throw new Error("Could not extract playlist ID from URL");
        }
        const { playlist, items } = await this.getPlaylist(parsed.playlistId);
        const tracks = items.map((item) => this.prepareTrack(item.item));
        return {
          type: "playlist",
          data: { playlist, tracks }
        };
      }
      default:
        throw new Error("Unsupported URL type");
    }
  }
  /**
   * Get track info and stream URL (with retries for quality fallback)
   */
  async getTrack(id, quality = "LOSSLESS") {
    const url = `${this.baseUrl}/track/?id=${id}&quality=${quality}`;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await this.fetch(url, {
        apiVersion: "v2",
        validateResponse: /* @__PURE__ */ __name(async (res) => {
          try {
            const data = await res.json();
            const container = data?.data ?? data;
            return container?.assetPresentation !== "PREVIEW";
          } catch {
            return true;
          }
        }, "validateResponse")
      });
      this.ensureNotRateLimited(response);
      if (response.ok) {
        const data = await response.json();
        if (this.isV2ApiContainer(data)) {
          return await this.parseTrackLookupV2(id, data, "v2");
        }
        return this.parseTrackLookup(data);
      }
      let detail;
      let userMessage;
      let subStatus;
      try {
        const errorData = await response.json();
        if (typeof errorData?.detail === "string") {
          detail = errorData.detail;
        }
        if (typeof errorData?.userMessage === "string") {
          userMessage = errorData.userMessage;
          if (!detail) {
            detail = errorData.userMessage;
          }
        }
        if (typeof errorData?.subStatus === "number") {
          subStatus = errorData.subStatus;
        }
      } catch {
      }
      const isTokenRetry = response.status === 401 && subStatus === 11002;
      const message = detail ?? `Failed to get track (status ${response.status})`;
      lastError = new Error(isTokenRetry ? userMessage ?? message : message);
      // Retry on: token errors, quality issues, server errors (5xx),
      // AND 403/404 (some API wrappers block requests — rotate to next server)
      const shouldRetry =
        isTokenRetry ||
        (detail ? /quality not found/i.test(detail) : response.status >= 500) ||
        response.status === 403 ||
        response.status === 404;
      if (attempt === 3 || !shouldRetry) {
        throw lastError;
      }
      await this.delay(200 * attempt);
    }
    throw lastError ?? new Error("Failed to get track");
  }
  async getRecommendations(trackId) {
    const response = await this.fetch(`${this.baseUrl}/recommendations/?id=${trackId}`);
    this.ensureNotRateLimited(response);
    if (!response.ok) {
      throw new Error("Failed to fetch track recommendations");
    }
    const payload = await response.json();
    if (!payload.data.items) {
      throw new Error("No recommendations found");
    }
    return payload.data.items.map((item) => item.track);
  }
  async getDashManifest(trackId, quality = "HI_RES_LOSSLESS") {
    const { result } = await this.getDashManifestWithMetadata(trackId, quality);
    return result;
  }
  async getDashManifestWithMetadata(trackId, quality = "HI_RES_LOSSLESS") {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const lookup = await this.getTrack(trackId, quality);
        const manifestPayload = lookup.info?.manifest ?? "";
        const contentType = lookup.info?.manifestMimeType ?? null;
        const result = this.buildDashManifestResult(manifestPayload, contentType);
        const trackInfo = {
          sampleRate: lookup.info?.sampleRate ?? null,
          bitDepth: lookup.info?.bitDepth ?? null,
          replayGain: lookup.info?.trackReplayGain ?? null
        };
        return { result, trackInfo };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      if (attempt < 3) {
        await this.delay(200 * attempt);
      }
    }
    throw lastError ?? this.createDashUnavailableError("Unable to load dash manifest for track");
  }
  /**
   * Get song with stream info
   */
  async getSong(query, quality = "LOSSLESS") {
    const response = await this.fetch(
      `${this.baseUrl}/song/?q=${encodeURIComponent(query)}&quality=${quality}`
    );
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to get song");
    return response.json();
  }
  /**
   * Get album details with track listing
   */
  async getAlbum(id) {
    const response = await this.fetch(`${this.baseUrl}/album/?id=${id}`);
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to get album");
    const data = await response.json();
    if (data && typeof data === "object" && "data" in data && "items" in data.data) {
      const items = data.data.items;
      if (Array.isArray(items) && items.length > 0) {
        const firstItem = items[0];
        const firstTrack = firstItem.item || firstItem;
        if (firstTrack && firstTrack.album) {
          let albumEntry2 = this.prepareAlbum(firstTrack.album);
          if (!albumEntry2.artist && firstTrack.artist) {
            albumEntry2 = { ...albumEntry2, artist: firstTrack.artist };
          }
          const tracks2 = items.map((i) => {
            if (!i || typeof i !== "object") return null;
            const itemObj = i;
            const t = itemObj.item || itemObj;
            if (!t) return null;
            return this.prepareTrack({ ...t, album: albumEntry2 });
          }).filter((t) => t !== null);
          return { album: albumEntry2, tracks: tracks2 };
        }
      }
    }
    const entries = Array.isArray(data) ? data : [data];
    let albumEntry;
    let trackCollection;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      if (!albumEntry && "title" in entry && "id" in entry && "cover" in entry) {
        albumEntry = this.prepareAlbum(entry);
        continue;
      }
      if (!trackCollection && "items" in entry && Array.isArray(entry.items)) {
        trackCollection = entry;
      }
    }
    if (!albumEntry) {
      throw new Error("Album not found");
    }
    const tracks = [];
    if (trackCollection?.items) {
      for (const rawItem of trackCollection.items) {
        if (!rawItem || typeof rawItem !== "object") continue;
        let trackCandidate;
        if ("item" in rawItem && rawItem.item && typeof rawItem.item === "object") {
          trackCandidate = rawItem.item;
        } else {
          trackCandidate = rawItem;
        }
        if (!trackCandidate) continue;
        const candidateWithAlbum = trackCandidate.album ? trackCandidate : { ...trackCandidate, album: albumEntry };
        tracks.push(this.prepareTrack(candidateWithAlbum));
      }
    }
    return { album: albumEntry, tracks };
  }
  /**
   * Get playlist details
   */
  async getPlaylist(uuid) {
    const response = await this.fetch(`${this.baseUrl}/playlist/?id=${uuid}`);
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to get playlist");
    const data = await response.json();
    if (data && typeof data === "object" && "playlist" in data && "items" in data) {
      return {
        playlist: data.playlist,
        items: data.items
      };
    }
    return {
      playlist: Array.isArray(data) ? data[0] : data,
      items: Array.isArray(data) && data[1] ? data[1].items : []
    };
  }
  /**
   * Get artist overview, including discography modules and top tracks
   */
  async getArtist(id) {
    const response = await this.fetch(`${this.baseUrl}/artist/?f=${id}`);
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to get artist");
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [data];
    const visited = /* @__PURE__ */ new Set();
    const albumMap = /* @__PURE__ */ new Map();
    const trackMap = /* @__PURE__ */ new Map();
    let artist;
    const isTrackLike = /* @__PURE__ */ __name((value) => {
      if (!value || typeof value !== "object") return false;
      const candidate = value;
      const albumCandidate = candidate.album;
      return typeof candidate.id === "number" && typeof candidate.title === "string" && typeof candidate.duration === "number" && "trackNumber" in candidate && albumCandidate !== void 0 && albumCandidate !== null && typeof albumCandidate === "object";
    }, "isTrackLike");
    const isAlbumLike = /* @__PURE__ */ __name((value) => {
      if (!value || typeof value !== "object") return false;
      const candidate = value;
      return typeof candidate.id === "number" && typeof candidate.title === "string" && "cover" in candidate;
    }, "isAlbumLike");
    const isArtistLike = /* @__PURE__ */ __name((value) => {
      if (!value || typeof value !== "object") return false;
      const candidate = value;
      return typeof candidate.id === "number" && typeof candidate.name === "string" && typeof candidate.type === "string" && ("artistRoles" in candidate || "artistTypes" in candidate || "url" in candidate);
    }, "isArtistLike");
    const recordArtist = /* @__PURE__ */ __name((candidate) => {
      if (!candidate) return;
      const normalized = this.prepareArtist(candidate);
      if (!artist || artist.id === normalized.id) {
        artist = normalized;
      }
    }, "recordArtist");
    const addAlbum = /* @__PURE__ */ __name((candidate) => {
      if (!candidate || typeof candidate.id !== "number") return;
      const normalized = this.prepareAlbum({ ...candidate });
      albumMap.set(normalized.id, normalized);
      recordArtist(normalized.artist ?? normalized.artists?.[0]);
    }, "addAlbum");
    const addTrack = /* @__PURE__ */ __name((candidate) => {
      if (!candidate || typeof candidate.id !== "number") return;
      const normalized = this.prepareTrack({ ...candidate });
      if (!normalized.album) {
        return;
      }
      addAlbum(normalized.album);
      const knownAlbum = albumMap.get(normalized.album.id);
      if (knownAlbum) {
        normalized.album = knownAlbum;
      }
      trackMap.set(normalized.id, normalized);
      recordArtist(normalized.artist);
    }, "addTrack");
    const parseModuleItems = /* @__PURE__ */ __name((items) => {
      if (!Array.isArray(items)) return;
      for (const entry of items) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const candidate = "item" in entry ? entry.item : entry;
        if (isAlbumLike(candidate)) {
          addAlbum(candidate);
          const normalizedAlbum = albumMap.get(candidate.id);
          recordArtist(normalizedAlbum?.artist ?? normalizedAlbum?.artists?.[0]);
          continue;
        }
        if (isTrackLike(candidate)) {
          addTrack(candidate);
          continue;
        }
        scanValue(candidate);
      }
    }, "parseModuleItems");
    const scanValue = /* @__PURE__ */ __name((value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        const trackCandidates = value.filter(isTrackLike);
        if (trackCandidates.length > 0) {
          for (const track of trackCandidates) {
            addTrack(track);
          }
          return;
        }
        for (const entry of value) {
          scanValue(entry);
        }
        return;
      }
      if (typeof value !== "object") {
        return;
      }
      const objectRef = value;
      if (visited.has(objectRef)) {
        return;
      }
      visited.add(objectRef);
      if (isArtistLike(objectRef)) {
        recordArtist(objectRef);
      }
      if ("modules" in objectRef && Array.isArray(objectRef.modules)) {
        for (const moduleEntry of objectRef.modules) {
          scanValue(moduleEntry);
        }
      }
      if ("pagedList" in objectRef && objectRef.pagedList && typeof objectRef.pagedList === "object") {
        const pagedList = objectRef.pagedList;
        parseModuleItems(pagedList.items);
      }
      if ("items" in objectRef && Array.isArray(objectRef.items)) {
        parseModuleItems(objectRef.items);
      }
      if ("rows" in objectRef && Array.isArray(objectRef.rows)) {
        parseModuleItems(objectRef.rows);
      }
      if ("listItems" in objectRef && Array.isArray(objectRef.listItems)) {
        parseModuleItems(objectRef.listItems);
      }
      for (const nested of Object.values(objectRef)) {
        scanValue(nested);
      }
    }, "scanValue");
    for (const entry of entries) {
      scanValue(entry);
    }
    if (!artist) {
      const trackPrimaryArtist = Array.from(trackMap.values()).map((track) => track.artist ?? track.artists?.[0]).find(Boolean);
      const albumPrimaryArtist = Array.from(albumMap.values()).map((album) => album.artist ?? album.artists?.[0]).find(Boolean);
      recordArtist(trackPrimaryArtist ?? albumPrimaryArtist);
    }
    if (!artist) {
      try {
        const fallbackResponse = await this.fetch(`${this.baseUrl}/artist/?id=${id}`);
        this.ensureNotRateLimited(fallbackResponse);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const baseArtist = Array.isArray(fallbackData) ? fallbackData[0] : fallbackData;
          if (baseArtist && typeof baseArtist === "object") {
            recordArtist(baseArtist);
          }
        }
      } catch (fallbackError) {
        console.warn("Failed to fetch base artist details:", fallbackError);
      }
    }
    if (!artist) {
      throw new Error("Artist not found");
    }
    const albums = Array.from(albumMap.values()).map((album) => {
      if (!album.artist && artist) {
        return { ...album, artist };
      }
      return album;
    });
    const albumById = new Map(albums.map((album) => [album.id, album]));
    const tracks = Array.from(trackMap.values()).map((track) => {
      const enrichedArtist = track.artist ?? artist;
      const album = track.album;
      const enrichedAlbum = album ? albumById.get(album.id) ?? (artist && !album.artist ? { ...album, artist } : album) : void 0;
      return {
        ...track,
        artist: enrichedArtist ?? track.artist,
        album: enrichedAlbum ?? album
      };
    });
    const parseDate = /* @__PURE__ */ __name((value) => {
      if (!value) return Number.NaN;
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? timestamp : Number.NaN;
    }, "parseDate");
    const sortedAlbums = albums.sort((a, b) => {
      const timeA = parseDate(a.releaseDate);
      const timeB = parseDate(b.releaseDate);
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) {
        return (b.popularity ?? 0) - (a.popularity ?? 0);
      }
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      return timeB - timeA;
    });
    const sortedTracks = tracks.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, 100);
    return {
      ...artist,
      albums: sortedAlbums,
      tracks: sortedTracks
    };
  }
  /**
   * Get cover image
   */
  async getCover(id, query) {
    let url = `${this.baseUrl}/cover/?`;
    if (id) url += `id=${id}`;
    if (query) url += `q=${encodeURIComponent(query)}`;
    const response = await this.fetch(url);
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to get cover");
    return response.json();
  }
  /**
   * Get lyrics for a track
   */
  async getLyrics(id) {
    const response = await this.fetch(`${this.baseUrl}/lyrics/?id=${id}`);
    this.ensureNotRateLimited(response);
    if (!response.ok) throw new Error("Failed to get lyrics");
    const data = await response.json();
    return Array.isArray(data) ? data[0] : data;
  }
  /**
   * Get stream data including URL and replay gain
   */
  async getStreamData(trackId, quality = "LOSSLESS") {
    let replayGain = null;
    let sampleRate = null;
    let bitDepth = null;
    if (this.isHiResQuality(quality)) {
      try {
        try {
          const lookup = await this.getTrack(trackId, quality);
          replayGain = lookup.info.trackReplayGain ?? null;
          sampleRate = lookup.info.sampleRate ?? null;
          bitDepth = lookup.info.bitDepth ?? null;
        } catch {
        }
        const url = await this.resolveHiResStreamFromDash(trackId);
        return { url, replayGain, sampleRate, bitDepth };
      } catch (error) {
        console.warn("Failed to resolve hi-res stream via DASH manifest", error);
        quality = "LOSSLESS";
      }
    }
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const lookup = await this.getTrack(trackId, quality);
        replayGain = lookup.info.trackReplayGain ?? null;
        sampleRate = lookup.info.sampleRate ?? null;
        bitDepth = lookup.info.bitDepth ?? null;
        if (lookup.originalTrackUrl) {
          return { url: lookup.originalTrackUrl, replayGain, sampleRate, bitDepth };
        }
        const manifestUrl = this.extractStreamUrlFromManifest(lookup.info.manifest);
        if (manifestUrl) {
          return { url: manifestUrl, replayGain, sampleRate, bitDepth };
        }
        lastError = new Error("Unable to resolve stream URL for track");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      if (attempt < 3) {
        await this.delay(200 * attempt);
      }
    }
    throw lastError ?? new Error("Unable to resolve stream URL for track");
  }
  /**
   * Get stream URL for a track
   */
  async getStreamUrl(trackId, quality = "LOSSLESS") {
    const data = await this.getStreamData(trackId, quality);
    return data.url;
  }
  /**
   * Attempt to embed metadata into a downloaded track using FFmpeg WASM
   */
  async embedMetadataIntoBlob(blob, lookup, filename, contentType, options, quality, convertToMp3) {
    const job = this.metadataQueue.then(
      () => this.runMetadataEmbedding(
        blob,
        lookup,
        filename,
        contentType ?? void 0,
        options,
        quality,
        convertToMp3
      )
    );
    this.metadataQueue = job.then(
      () => void 0,
      () => void 0
    );
    try {
      return await job;
    } catch (error) {
      console.warn("Metadata embedding failed", error);
      return null;
    }
  }
  inferExtensionFromFilename(filename) {
    const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(filename);
    return match ? match[1].toLowerCase() : null;
  }
  inferExtensionFromMime(mime) {
    if (!mime) return null;
    const normalized = mime.split(";")[0]?.trim().toLowerCase();
    switch (normalized) {
      case "audio/flac":
        return "flac";
      case "audio/x-flac":
        return "flac";
      case "audio/mpeg":
        return "mp3";
      case "audio/mp3":
        return "mp3";
      case "audio/mp4":
      case "audio/aac":
      case "audio/x-m4a":
        return "m4a";
      case "audio/wav":
      case "audio/x-wav":
        return "wav";
      case "audio/ogg":
        return "ogg";
      default:
        return null;
    }
  }
  inferMimeFromExtension(ext, fallbackType) {
    switch (ext) {
      case "flac":
        return "audio/flac";
      case "mp3":
        return "audio/mpeg";
      case "m4a":
      case "aac":
        return "audio/mp4";
      case "wav":
        return "audio/wav";
      case "ogg":
        return "audio/ogg";
      default:
        return fallbackType;
    }
  }
  validateImageData(data) {
    if (!data || data.length < 4) {
      return false;
    }
    if (data[0] === 255 && data[1] === 216 && data[2] === 255) {
      return true;
    }
    if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) {
      return true;
    }
    if (data.length >= 12 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
      return true;
    }
    return false;
  }
  detectImageFormat(data) {
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
  buildMetadataEntries(lookup) {
    const entries = [];
    const { track } = lookup;
    const album = track.album;
    const mainArtist = formatArtistsForMetadata(track.artists);
    const albumArtist = album?.artist?.name ?? (album?.artists && album.artists.length > 0 ? album.artists[0]?.name : void 0) ?? track.artists?.[0]?.name;
    if (track.title) entries.push(["title", track.title]);
    if (mainArtist) entries.push(["artist", mainArtist]);
    if (albumArtist) entries.push(["album_artist", albumArtist]);
    if (album?.title) entries.push(["album", album.title]);
    const trackNumber = Number(track.trackNumber);
    const totalTracks = Number(album?.numberOfTracks);
    if (Number.isFinite(trackNumber) && trackNumber > 0) {
      const value = Number.isFinite(totalTracks) && totalTracks > 0 ? `${trackNumber}/${totalTracks}` : `${trackNumber}`;
      entries.push(["track", value]);
    }
    const discNumber = Number(track.volumeNumber);
    const totalDiscs = Number(album?.numberOfVolumes);
    if (Number.isFinite(discNumber) && discNumber > 0) {
      const value = Number.isFinite(totalDiscs) && totalDiscs > 0 ? `${discNumber}/${totalDiscs}` : `${discNumber}`;
      entries.push(["disc", value]);
    }
    const releaseDate = album?.releaseDate ?? track.streamStartDate;
    if (releaseDate) {
      const yearMatch = /^(\d{4})/.exec(releaseDate);
      if (yearMatch?.[1]) {
        entries.push(["date", yearMatch[1]]);
        entries.push(["year", yearMatch[1]]);
      }
    }
    if (track.isrc) {
      entries.push(["ISRC", track.isrc]);
    }
    if (album?.copyright) {
      entries.push(["copyright", album.copyright]);
    }
    if (lookup.info) {
      const { trackReplayGain, trackPeakAmplitude, albumReplayGain, albumPeakAmplitude } = lookup.info;
      if (trackReplayGain !== void 0 && trackReplayGain !== null) {
        entries.push(["REPLAYGAIN_TRACK_GAIN", `${trackReplayGain} dB`]);
      }
      if (trackPeakAmplitude !== void 0 && trackPeakAmplitude !== null) {
        entries.push(["REPLAYGAIN_TRACK_PEAK", `${trackPeakAmplitude}`]);
      }
      if (albumReplayGain !== void 0 && albumReplayGain !== null) {
        entries.push(["REPLAYGAIN_ALBUM_GAIN", `${albumReplayGain} dB`]);
      }
      if (albumPeakAmplitude !== void 0 && albumPeakAmplitude !== null) {
        entries.push(["REPLAYGAIN_ALBUM_PEAK", `${albumPeakAmplitude}`]);
      }
    } else if (track.replayGain) {
      entries.push(["REPLAYGAIN_TRACK_GAIN", `${track.replayGain} dB`]);
      if (track.peak) {
        entries.push(["REPLAYGAIN_TRACK_PEAK", `${track.peak}`]);
      }
    }
    entries.push(["comment", "Downloaded from music.binimum.org/tidal.squid.wtf"]);
    return entries;
  }
  async runMetadataEmbedding(blob, lookup, filename, contentType, options, quality, convertToMp3) {
    if (typeof window === "undefined") {
      return null;
    }
    const extensionFromMime = this.inferExtensionFromMime(contentType);
    const extensionFromFilename = this.inferExtensionFromFilename(filename);
    const extension = extensionFromMime ?? extensionFromFilename;
    if (!extension) {
      return null;
    }
    const supportedExtensions = /* @__PURE__ */ new Set(["flac", "mp3", "m4a", "aac", "wav", "ogg"]);
    if (!supportedExtensions.has(extension)) {
      return null;
    }
    const convertibleExtensions = /* @__PURE__ */ new Set(["m4a", "aac", "mp4"]);
    const shouldConvertToMp3 = convertToMp3 && convertibleExtensions.has(extension);
    const outputExtension = shouldConvertToMp3 ? "mp3" : extension;
    const targetBitrate = quality === "LOW" ? "96k" : "320k";
    let ffmpegModule = null;
    try {
      ffmpegModule = await import("./ffmpegClient");
    } catch (error) {
      console.warn("Unable to load FFmpeg client module", error);
      options?.onFfmpegError?.(error);
      return null;
    }
    if (!ffmpegModule.isFFmpegSupported()) {
      return null;
    }
    if (options?.onFfmpegCountdown) {
      try {
        const estimatedBytes = await ffmpegModule.estimateFfmpegDownloadSize?.();
        options.onFfmpegCountdown({
          totalBytes: estimatedBytes,
          autoTriggered: options.ffmpegAutoTriggered ?? false
        });
      } catch (estimateError) {
        console.debug("Failed to estimate FFmpeg size", estimateError);
        options.onFfmpegCountdown({
          totalBytes: void 0,
          autoTriggered: options.ffmpegAutoTriggered ?? false
        });
      }
    }
    options?.onFfmpegStart?.();
    let ffmpeg;
    let progressHandler = null;
    try {
      const loadOptions = {
        signal: options?.signal,
        onProgress: /* @__PURE__ */ __name(({
          receivedBytes,
          totalBytes
        }) => {
          if (totalBytes && totalBytes > 0) {
            options?.onFfmpegProgress?.(Math.max(0, Math.min(1, receivedBytes / totalBytes)));
          } else if (receivedBytes > 0) {
            options?.onFfmpegProgress?.(0);
          }
        }, "onProgress")
      };
      ffmpeg = await ffmpegModule.getFFmpeg(loadOptions);
      progressHandler = /* @__PURE__ */ __name(({ progress }) => {
        if (options?.onProgress && progress >= 0) {
          options.onProgress({ stage: "embedding", progress: Math.min(1, progress) });
        }
      }, "progressHandler");
      ffmpeg.on("progress", progressHandler);
      options?.onFfmpegProgress?.(1);
      options?.onFfmpegComplete?.();
    } catch (loadError) {
      options?.onFfmpegError?.(loadError);
      throw loadError;
    }
    const uniqueSuffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const inputName = `source-${uniqueSuffix}.${extension}`;
    const outputName = `output-${uniqueSuffix}.${outputExtension}`;
    let coverWritten = false;
    let coverExtension = "jpg";
    try {
      if (options?.onProgress) {
        options.onProgress({ stage: "embedding", progress: 0 });
      }
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await ffmpeg.writeFile(inputName, uint8Array);
      const artworkId = lookup.track.album?.cover;
      if (artworkId) {
        const coverSizes = ["1280", "640", "320"];
        let coverFetchSuccess = false;
        for (const size of coverSizes) {
          if (coverFetchSuccess) break;
          const coverUrl = this.getCoverUrl(artworkId, size);
          const fetchStrategies = [
            {
              name: "with-headers",
              options: {
                method: "GET",
                headers: {
                  Accept: "image/jpeg,image/jpg,image/png,image/*",
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
            if (coverFetchSuccess) break;
            try {
              const coverResponse = await fetch(coverUrl, strategy.options);
              if (!coverResponse.ok) {
                continue;
              }
              const contentType2 = coverResponse.headers.get("Content-Type");
              const contentLength = coverResponse.headers.get("Content-Length");
              if (contentLength && parseInt(contentLength, 10) === 0) {
                continue;
              }
              if (contentType2 && !contentType2.startsWith("image/")) {
                continue;
              }
              let coverArrayBuffer;
              try {
                coverArrayBuffer = await coverResponse.arrayBuffer();
              } catch {
                continue;
              }
              if (!coverArrayBuffer || coverArrayBuffer.byteLength === 0) {
                continue;
              }
              const coverUint8Array = new Uint8Array(coverArrayBuffer);
              const imageFormat = this.detectImageFormat(coverUint8Array);
              if (!imageFormat) {
                continue;
              }
              coverExtension = imageFormat.extension;
              const finalCoverName = `cover-${uniqueSuffix}.${coverExtension}`;
              await ffmpeg.writeFile(finalCoverName, coverUint8Array);
              coverWritten = true;
              coverFetchSuccess = true;
              break;
            } catch {
            }
          }
        }
      }
      const args = ["-i", inputName];
      if (coverWritten) {
        const finalCoverName = `cover-${uniqueSuffix}.${coverExtension}`;
        args.push("-i", finalCoverName);
      }
      if (coverWritten) {
        args.push("-map", "0:a");
        args.push("-map", "1");
      } else {
        args.push("-map", "0:a");
      }
      if (shouldConvertToMp3) {
        args.push("-codec:a", "libmp3lame");
        args.push("-b:a", targetBitrate);
      } else {
        args.push("-codec", "copy");
      }
      for (const [key, value] of this.buildMetadataEntries(lookup)) {
        args.push("-metadata", `${key}=${value}`);
      }
      if (coverWritten) {
        args.push("-metadata:s:v", "title=Album cover");
        args.push("-metadata:s:v", "comment=Cover (front)");
        args.push("-disposition:v", "attached_pic");
      }
      if (shouldConvertToMp3) {
        args.push("-id3v2_version", "3");
        args.push("-write_xing", "0");
      }
      args.push(outputName);
      const timeoutMs = 50_000; // 50s — fail fast so the raw blob fallback kicks in
      const execPromise = ffmpeg.exec(args);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `FFmpeg execution timeout - processing took longer than 3 minutes. Try using "Download covers separately" option instead.`
            )
          );
        }, timeoutMs);
      });
      try {
        await Promise.race([execPromise, timeoutPromise]);
      } catch (execError) {
        const errorMessage = execError instanceof Error ? execError.message : String(execError);
        if (errorMessage.includes("timeout")) {
          throw new Error(
            'FFmpeg timeout: Processing took too long. Enable "Download covers separately" option for FLAC files.'
          );
        }
        if (errorMessage.includes("memory access out of bounds") || errorMessage.includes("RuntimeError") || errorMessage.includes("out of memory")) {
          throw new Error(
            "FFmpeg memory error: File may be too large for browser processing. Try a smaller file or download without metadata embedding."
          );
        }
        throw execError;
      }
      const outputData = await ffmpeg.readFile(outputName);
      if (options?.onProgress) {
        options.onProgress({ stage: "embedding", progress: 1 });
      }
      let outputArray;
      if (outputData instanceof Uint8Array) {
        outputArray = outputData;
      } else if (typeof outputData === "string") {
        outputArray = new TextEncoder().encode(outputData);
      } else {
        outputArray = new Uint8Array(outputData ?? new ArrayBuffer(0));
      }
      const blobArray = new Uint8Array(outputArray);
      const mimeType = this.inferMimeFromExtension(
        outputExtension,
        contentType ?? (blob.type && blob.type.length > 0 ? blob.type : void 0)
      );
      const resultBlob = new Blob([blobArray], { type: mimeType });
      return resultBlob;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("memory access out of bounds") || errorMessage.includes("RuntimeError") || errorMessage.includes("out of memory") || errorMessage.includes("memory error")) {
        options?.onFfmpegError?.(
          new Error("Memory error: File processed without metadata due to browser limitations")
        );
      } else {
        options?.onFfmpegError?.(error);
      }
      return null;
    } finally {
      if (progressHandler && ffmpeg) {
        ffmpeg.off("progress", progressHandler);
      }
      if (ffmpeg) {
        try {
          await ffmpeg.deleteFile(inputName);
        } catch (cleanupErr) {
          console.debug("Failed to delete FFmpeg input file", cleanupErr);
        }
        try {
          await ffmpeg.deleteFile(outputName);
        } catch (cleanupErr) {
          console.debug("Failed to delete FFmpeg output file", cleanupErr);
        }
        if (coverWritten) {
          try {
            const finalCoverName = `cover-${uniqueSuffix}.${coverExtension}`;
            await ffmpeg.deleteFile(finalCoverName);
          } catch (cleanupErr) {
            console.debug("Failed to delete FFmpeg cover file", cleanupErr);
          }
        }
      }
    }
  }
  async resolveTrackLookups(trackId, quality) {
    const manifestLookup = await this.getTrack(trackId, quality);
    const metadataLookup = manifestLookup;
    return { manifestLookup, metadataLookup, manifestQuality: quality };
  }
  async getPreferredTrackMetadata(trackId, quality = "LOSSLESS") {
    const { metadataLookup } = await this.resolveTrackLookups(trackId, quality);
    return metadataLookup;
  }
  async fetchTrackBlob(trackId, quality = "LOSSLESS", filename, options) {
    try {
      const {
        manifestLookup,
        metadataLookup: initialMetadataLookup,
        manifestQuality
      } = await this.resolveTrackLookups(trackId, quality);
      let metadataLookup = initialMetadataLookup;
      let response = null;
      let streamUrl = null;
      let downloadBlob = null;
      let contentType = null;
      let receivedBytes = 0;
      let totalBytes;
      streamUrl = manifestLookup.originalTrackUrl || null;
      if (streamUrl) {
        // Proxy CDN URL through our server to bypass browser CORS restrictions
        const proxiedUrl = proxyAudioUrl(streamUrl);
        response = await fetch(proxiedUrl, { signal: options?.signal });
        if (response.status === 429) {
          throw new Error(RATE_LIMIT_ERROR_MESSAGE);
        }
        if (!response.ok) {
          console.warn("OriginalTrackUrl download failed, falling back to manifest", {
            status: response.status
          });
          response = null;
        }
      }
      if (!response) {
        let manifestSource = manifestLookup;
        const decodedManifest = this.decodeBase64Manifest(manifestSource.info.manifest);
        if (this.isSegmentedDashManifest(decodedManifest)) {
          try {
            const mpdResult = await this.downloadFlacFromMpd(decodedManifest, options);
            if (mpdResult) {
              downloadBlob = mpdResult.blob;
              contentType = mpdResult.mimeType;
              receivedBytes = downloadBlob.size;
              totalBytes = downloadBlob.size;
              metadataLookup = manifestSource;
            }
          } catch (mpdError) {
            console.warn("Failed to download FLAC from MPD manifest", mpdError);
          }
          if (!downloadBlob) {
            throw new Error("Could not download segmented DASH content");
          }
        } else {
          let fallbackUrl = this.extractStreamUrlFromManifest(manifestSource.info.manifest);
          if (!fallbackUrl && manifestQuality !== "LOSSLESS") {
            try {
              const losslessLookup = await this.getTrack(trackId, "LOSSLESS");
              const candidateUrl = this.extractStreamUrlFromManifest(losslessLookup.info.manifest);
              if (candidateUrl) {
                fallbackUrl = candidateUrl;
                manifestSource = losslessLookup;
              }
            } catch (manifestError) {
              console.warn(
                "Failed to fetch lossless manifest for download fallback",
                manifestError
              );
            }
          }
          if (fallbackUrl) {
            streamUrl = fallbackUrl;
            // Proxy CDN URL through our server to bypass browser CORS restrictions
            const proxiedFallbackUrl = proxyAudioUrl(fallbackUrl);
            response = await fetch(proxiedFallbackUrl, { signal: options?.signal });
            if (response.status === 429) {
              throw new Error(RATE_LIMIT_ERROR_MESSAGE);
            }
            if (!response.ok) {
              throw new Error("Failed to fetch audio stream");
            }
            metadataLookup = manifestSource;
          } else {
            throw new Error("Could not extract stream URL from manifest");
          }
        }
      }
      if (response) {
        const totalHeader = Number(response.headers.get("Content-Length") ?? "0");
        totalBytes = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : void 0;
        if (!response.body) {
          downloadBlob = await response.blob();
          receivedBytes = downloadBlob.size;
          if (!totalBytes && receivedBytes > 0) {
            options?.onProgress?.({
              stage: "downloading",
              receivedBytes,
              totalBytes: receivedBytes
            });
          }
        } else {
          const reader = response.body.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              receivedBytes += value.byteLength;
              chunks.push(value);
              options?.onProgress?.({
                stage: "downloading",
                receivedBytes,
                totalBytes
              });
            }
          }
          downloadBlob = new Blob(chunks, {
            type: response.headers.get("Content-Type") ?? "application/octet-stream"
          });
          if (receivedBytes === 0) {
            receivedBytes = downloadBlob.size;
          }
        }
        contentType = response.headers.get("Content-Type");
      }
      options?.onProgress?.({
        stage: "downloading",
        receivedBytes,
        totalBytes: totalBytes ?? downloadBlob?.size
      });
      if (!downloadBlob) {
        throw new Error("Download failed to produce audio payload");
      }
      const shouldConvertToMp3 = options?.convertAacToMp3 === true && (quality === "HIGH" || quality === "LOW");
      let finalBlob = downloadBlob;
      if (!options?.skipEmbedding) {
        const processedBlob = await this.embedMetadataIntoBlob(
          downloadBlob,
          metadataLookup,
          filename,
          contentType,
          options,
          quality,
          shouldConvertToMp3
        );
        finalBlob = processedBlob ?? downloadBlob;
      }
      return { blob: finalBlob, mimeType: contentType ?? void 0 };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      if (error instanceof Error && error.message === RATE_LIMIT_ERROR_MESSAGE) {
        throw error;
      }
      throw new Error(
        "Download failed. The stream URL may require a proxy. Please try streaming instead."
      );
    }
  }
  async getTrackStreamUrl(trackId, quality = "LOSSLESS") {
    if (this.isHiResQuality(quality)) {
      quality = "LOSSLESS";
    }
    const lookup = await this.getTrack(trackId, quality);
    if (lookup.originalTrackUrl) {
      return lookup.originalTrackUrl;
    }
    const fallback = this.extractStreamUrlFromManifest(lookup.info.manifest);
    if (!fallback) {
      throw new Error("Could not resolve stream URL for track");
    }
    return fallback;
  }
  /**
   * Download a track
   * Fetches the audio stream and triggers a download
   */
  async downloadTrack(trackId, quality = "LOSSLESS", filename, options) {
    try {
      const { blob } = await this.fetchTrackBlob(trackId, quality, filename, options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (options?.downloadCoverSeperately) {
        try {
          const metadata = await this.getPreferredTrackMetadata(trackId, quality);
          const coverId = metadata.track.album?.cover;
          if (coverId) {
            console.log("[Cover Download] Fetching cover for separate download...");
            const coverSizes = ["1280", "640", "320"];
            let coverDownloadSuccess = false;
            for (const size of coverSizes) {
              if (coverDownloadSuccess) break;
              const coverUrl = this.getCoverUrl(coverId, size);
              console.log(`[Cover Download] Attempting size ${size}:`, coverUrl);
              const fetchStrategies = [
                {
                  name: "with-headers",
                  options: {
                    method: "GET",
                    headers: {
                      Accept: "image/jpeg,image/jpg,image/png,image/*",
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
                console.log(`[Cover Download] Trying strategy: ${strategy.name}`);
                try {
                  const coverResponse = await fetch(coverUrl, strategy.options);
                  console.log(
                    `[Cover Download] Response status: ${coverResponse.status}, Content-Length: ${coverResponse.headers.get("Content-Length")}`
                  );
                  if (!coverResponse.ok) {
                    console.warn(
                      `[Cover Download] Failed with status ${coverResponse.status} for size ${size}`
                    );
                    continue;
                  }
                  const contentType = coverResponse.headers.get("Content-Type");
                  const contentLength = coverResponse.headers.get("Content-Length");
                  if (contentLength && parseInt(contentLength, 10) === 0) {
                    console.warn(`[Cover Download] Content-Length is 0 for size ${size}`);
                    continue;
                  }
                  if (contentType && !contentType.startsWith("image/")) {
                    console.warn(`[Cover Download] Invalid content type: ${contentType}`);
                    continue;
                  }
                  const arrayBuffer = await coverResponse.arrayBuffer();
                  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                    console.warn(`[Cover Download] Empty array buffer for size ${size}`);
                    continue;
                  }
                  const uint8Array = new Uint8Array(arrayBuffer);
                  console.log(`[Cover Download] Received ${uint8Array.length} bytes`);
                  console.log(
                    `[Cover Download] First 16 bytes:`,
                    Array.from(uint8Array.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(" ")
                  );
                  if (!this.validateImageData(uint8Array)) {
                    console.warn(`[Cover Download] Invalid image data for size ${size}`);
                    continue;
                  }
                  const imageFormat = this.detectImageFormat(uint8Array);
                  if (!imageFormat) {
                    console.warn(`[Cover Download] Unknown image format for size ${size}`);
                    continue;
                  }
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
                  console.log(
                    `[Cover Download] Successfully downloaded (${size}x${size}, format: ${imageFormat.extension}, strategy: ${strategy.name})`
                  );
                  break;
                } catch (sizeError) {
                  console.warn(
                    `[Cover Download] Failed at size ${size} with strategy ${strategy.name}:`,
                    sizeError
                  );
                }
              }
            }
            if (!coverDownloadSuccess) {
              console.warn("[Cover Download] All attempts failed");
            }
          }
        } catch (coverError) {
          console.warn("Failed to download cover separately:", coverError);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      console.error("Download failed:", error);
      if (error instanceof Error && error.message === RATE_LIMIT_ERROR_MESSAGE) {
        throw error;
      }
      throw new Error(
        "Download failed. The stream URL may require a proxy. Please try streaming instead."
      );
    }
  }
  /**
   * Format duration from seconds to MM:SS
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  /**
   * Get cover URL
   */
  getCoverUrl(coverId, size = "640") {
    return `https://resources.tidal.com/images/${coverId.replace(/-/g, "/")}/${size}x${size}.jpg`;
  }
  /**
   * Get video cover URL
   */
  getVideoCoverUrl(videoCoverId, size = "640") {
    return `https://resources.tidal.com/videos/${videoCoverId.replace(/-/g, "/")}/${size}x${size}.mp4`;
  }
  /**
   * Get artist picture URL
   */
  getArtistPictureUrl(pictureId, size = "750") {
    return `https://resources.tidal.com/images/${pictureId.replace(/-/g, "/")}/${size}x${size}.jpg`;
  }
}
const losslessAPI = new LosslessAPI();
export {
  DASH_MANIFEST_UNAVAILABLE_CODE,
  losslessAPI
};
