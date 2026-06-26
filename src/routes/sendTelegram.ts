import { Router } from 'express';
import { createRentalOrder } from '../lib/orders-store';
import { validateOrder } from '../lib/validate';
import {
  escapeHtml,
  sendTelegramMessage,
  sendTelegramLocation,
  tashkentTime,
} from '../lib/telegram';
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

    // tel: link lets the operator tap the number to call straight away.
    const telHref = order.phone.replace(/[^\d+]/g, '');
    const hasCoords = data.lat != null && data.lng != null;
    const mapLink = hasCoords
      ? `https://maps.google.com/?q=${data.lat},${data.lng}`
      : null;

    const text = [
      '🏗️ <b>YANGI BUYURTMA</b> — AUTOKRAN.UZ',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>Mijoz:</b> ${escapeHtml(order.name)}`,
      `📞 <b>Telefon:</b> <a href="tel:${escapeHtml(telHref)}">${escapeHtml(order.phone)}</a>`,
      `🏗️ <b>Texnika:</b> ${escapeHtml(order.craneModel || "Aniqlanmagan (operator aniqlaydi)")}`,
      `📍 <b>Manzil:</b> ${escapeHtml(order.location)}`,
      ...(mapLink ? [`🗺️ <a href="${mapLink}">Xaritada ochish / Navigatsiya</a>`] : []),
      `🕒 <b>Vaqt:</b> ${tashkentTime()}`,
      '━━━━━━━━━━━━━━━━━━━━',
      '📌 Iltimos, mijozga 5 daqiqa ichida qo‘ng‘iroq qiling.',
      '#buyurtma #autokran',
    ].join('\n');

    const result = await sendTelegramMessage(text);

    // Native location pin (tappable → opens navigation) when coordinates exist.
    if (hasCoords) {
      await sendTelegramLocation(data.lat as number, data.lng as number);
    }

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
