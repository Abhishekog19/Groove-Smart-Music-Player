/**
 * Retry logic for Songlink conversion with exponential backoff
 * Handles rate limiting (429) and timeouts gracefully
 */

export async function convertWithBackoff(
  fn,
  options = {}
) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 8000
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries}`);
      return await fn();
    } catch (error) {
      lastError = error;

      const is429 = 
        error?.code === 429 || 
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('rate limit') ||
        error?.message?.includes('Too Many Requests');

      const isTimeout = 
        error?.message?.includes('timeout') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.code === 'ETIMEDOUT';

      // Only retry on rate limit or timeout errors
      if (is429 || isTimeout) {
        if (attempt < maxRetries - 1) {
          // Calculate exponential backoff: 1s, 2s, 4s, 8s (capped)
          const delayMs = Math.min(
            initialDelayMs * Math.pow(2, attempt),
            maxDelayMs
          );
          
          const reason = is429 ? 'rate limited (429)' : 'timeout';
          console.warn(
            `[Retry] ${reason}. Retry ${attempt + 1}/${maxRetries} in ${delayMs}ms`
          );

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        // Don't retry for other errors (invalid track, not found, etc.)
        console.error('[Retry] Non-retryable error, failing immediately:', error);
        throw error;
      }
    }
  }

  console.error('[Retry] All retries exhausted');
  throw lastError || new Error('Conversion failed after all retries');
}
