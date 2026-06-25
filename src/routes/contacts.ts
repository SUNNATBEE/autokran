import { Router } from 'express';
import { createContactRequest } from '../lib/contacts-store';
import { validateContact } from '../lib/validate';
import { escapeHtml, sendTelegramMessage } from '../lib/telegram';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

// Throttle public submissions to curb spam/abuse.
const submitLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  label: 'contacts',
  message: 'Too many requests. Please wait a minute and try again.',
});

// POST /api/contacts — public contact request + Telegram notify
router.post('/', submitLimiter, async (req, res) => {
  try {
    const { ok, errors, data } = validateContact(req.body);
    if (!ok) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const contact = await createContactRequest({
      name: data.name,
      phone: data.phone,
    });

    const text = [
      "📞 <b>Yangi bog'lanish so'rovi!</b>",
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 Ism: ${escapeHtml(contact.name)}`,
      `📞 Telefon: ${escapeHtml(contact.phone)}`,
      '━━━━━━━━━━━━━━━━━━━━',
      '#boglanish #autokran',
    ].join('\n');

    const result = await sendTelegramMessage(text);

    return res.json({
      success: true,
      contactId: contact.id,
      ...(result.ok || result.skipped
        ? {}
        : { warning: 'Saved, but Telegram notification failed' }),
    });
  } catch (error) {
    console.error('Contact route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
