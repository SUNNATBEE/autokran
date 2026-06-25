/**
 * Telegram notification helpers.
 *
 * User-supplied values are escaped for HTML parse mode so that special
 * characters (`<`, `>`, `&`) can never break the message or be used to inject
 * markup. We use HTML instead of Markdown because Markdown's escaping rules are
 * far more error-prone with arbitrary user input.
 */

const TELEGRAM_API = 'https://api.telegram.org';

/** Escape the five characters that matter for Telegram HTML parse mode. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface TelegramResult {
  ok: boolean;
  skipped?: boolean;
  error?: unknown;
}

/**
 * Send an HTML message to the configured chat. Returns a result object instead
 * of throwing so callers can decide how to degrade. Times out after 8s.
 */
export async function sendTelegramMessage(
  text: string
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      'Telegram not configured — notification skipped (data still saved).'
    );
    return { ok: false, skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Telegram API error:', errorData);
      return { ok: false, error: errorData };
    }
    return { ok: true };
  } catch (error) {
    console.error('Telegram request failed:', error);
    return { ok: false, error };
  } finally {
    clearTimeout(timeout);
  }
}
