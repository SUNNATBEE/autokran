import { Router } from 'express';
import { createRentalOrder } from '../lib/orders-store';
import { validateOrder } from '../lib/validate';
import { escapeHtml, sendTelegramMessage } from '../lib/telegram';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const submitLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  label: 'orders',
  message: 'Too many requests. Please wait a minute and try again.',
});

// POST /api/send-telegram — public rental order + Telegram notify
router.post('/', submitLimiter, async (req, res) => {
  try {
    const { ok, errors, data } = validateOrder(req.body);
    if (!ok) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const order = await createRentalOrder({
      name: data.name,
      phone: data.phone,
      location: data.location,
      craneModel: data.craneModel,
    });

    const text = [
      "🆕 <b>Yangi mijoz qo'shildi!</b>",
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 Ism: ${escapeHtml(order.name)}`,
      `📞 Telefon: ${escapeHtml(order.phone)}`,
      `📍 Manzil: ${escapeHtml(order.location)}`,
      `🏗️ Texnika: ${escapeHtml(order.craneModel || 'Tanlanmagan')}`,
      '━━━━━━━━━━━━━━━━━━━━',
      '#buyurtma #autokran',
    ].join('\n');

    const result = await sendTelegramMessage(text);

    return res.json({
      success: true,
      orderId: order.id,
      ...(result.ok || result.skipped
        ? {}
        : { warning: 'Saved, but Telegram notification failed' }),
    });
  } catch (error) {
    console.error('Order route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
