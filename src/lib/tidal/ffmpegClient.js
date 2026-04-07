// FFmpeg WASM Client — converted from SvelteKit to React
// Replaced: import { browser } from '$app/environment'
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

const CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm`;

const CORE_JS_NAME = 'ffmpeg-core.js';
const CORE_WASM_NAME = 'ffmpeg-core.wasm';

let ffmpegInstance = null;
let loadPromise = null;
let fetchFileFn = null;
let assetsPromise = null;
let estimatedSizePromise = null;

async function ensureFFmpegClass() {
  const module = await import('@ffmpeg/ffmpeg');
  return module.FFmpeg;
}

async function ensureFetchFile() {
  if (fetchFileFn) return fetchFileFn;
  const module = await import('@ffmpeg/util');
  fetchFileFn = module.fetchFile;
  return fetchFileFn;
}

async function fetchHeadSize(path) {
  try {
    const response = await fetch(`${CORE_BASE_URL}/${path}`, { method: 'HEAD' });
    if (!response.ok) return undefined;
    const length = response.headers.get('Content-Length');
    if (!length) return undefined;
    const numeric = Number(length);
    return Number.isFinite(numeric) ? numeric : undefined;
  } catch (error) {
    console.debug('Failed to probe FFmpeg asset size', error);
    return undefined;
  }
}

async function streamAsset(path, options, context) {
  const response = await fetch(`${CORE_BASE_URL}/${path}`, {
    signal: options?.signal
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`);
  }

  const totalBytes = Number(response.headers.get('Content-Length') ?? '0');
  const resolvedTotal =
    Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : context?.zTotalKnown;

  if (!response.body) {
    const blob = await response.blob();
    const size = blob.size > 0 ? blob.size : resolvedTotal;
    return { url: URL.createObjectURL(blob), size };
  }

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      context?.onChunk?.(value.byteLength);
    }
  }

  const blob = new Blob(chunks, {
    type: response.headers.get('Content-Type') ?? 'application/octet-stream'
  });
  return {
    url: URL.createObjectURL(blob),
    size: blob.size > 0 ? blob.size : resolvedTotal
  };
}

async function ensureAssets(options) {
  if (assetsPromise) return assetsPromise;

  assetsPromise = (async () => {
    const [jsSize, wasmSize] = await Promise.all([
      fetchHeadSize(CORE_JS_NAME),
      fetchHeadSize(CORE_WASM_NAME)
    ]);
    const totalKnown = [jsSize, wasmSize]
      .map((v) => (Number.isFinite(v ?? NaN) ? Number(v) : 0))
      .reduce((sum, v) => sum + v, 0);

    let cumulative = 0;
    const notify = (bytes) => {
      cumulative += bytes;
      if (options?.onProgress) {
        options.onProgress({
          receivedBytes: cumulative,
          totalBytes: totalKnown > 0 ? totalKnown : undefined
        });
      }
    };

    const { url: coreUrl, size: fetchedJsSize } = await streamAsset(CORE_JS_NAME, options, {
      zTotalKnown: totalKnown > 0 ? totalKnown : undefined,
      onChunk: notify
    });
    const { url: wasmUrl, size: fetchedWasmSize } = await streamAsset(CORE_WASM_NAME, options, {
      zTotalKnown: totalKnown > 0 ? totalKnown : undefined,
      onChunk: notify
    });

    const totalBytesResult = [jsSize ?? fetchedJsSize, wasmSize ?? fetchedWasmSize]
      .filter((v) => Number.isFinite(v ?? NaN))
      .reduce((sum, v) => sum + v, 0);

    return {
      coreUrl,
      wasmUrl,
      totalBytes: totalBytesResult > 0 ? totalBytesResult : undefined
    };
  })().catch((error) => {
    assetsPromise = null;
    throw error;
  });

  return assetsPromise;
}

export async function estimateFfmpegDownloadSize() {
  if (!estimatedSizePromise) {
    estimatedSizePromise = (async () => {
      const [jsSize, wasmSize] = await Promise.all([
        fetchHeadSize(CORE_JS_NAME),
        fetchHeadSize(CORE_WASM_NAME)
      ]);
      const total = [jsSize, wasmSize]
        .filter((v) => Number.isFinite(v ?? NaN))
        .reduce((sum, v) => sum + v, 0);
      return total > 0 ? total : undefined;
    })();
  }
  return estimatedSizePromise ?? Promise.resolve(undefined);
}

export function isFFmpegSupported() {
  return isBrowser && typeof ReadableStream !== 'undefined' && typeof WebAssembly !== 'undefined';
}

export async function getFFmpeg(options) {
  if (!isFFmpegSupported()) {
    throw new Error('FFmpeg is not supported in this environment.');
  }

  if (ffmpegInstance) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      const FFmpegConstructor = await ensureFFmpegClass();
      const instance = new FFmpegConstructor();
      const assets = await ensureAssets(options);

      await instance.load({
        coreURL: assets.coreUrl,
        wasmURL: assets.wasmUrl
      });

      ffmpegInstance = instance;
      URL.revokeObjectURL(assets.coreUrl);
      URL.revokeObjectURL(assets.wasmUrl);
      return instance;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  return loadPromise;
}

export async function fetchFile(input) {
  const fn = await ensureFetchFile();
  return fn(input);
}
