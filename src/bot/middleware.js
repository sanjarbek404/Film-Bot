import { findOrCreateUser } from '../services/userService.js';
import { checkSubscription } from '../services/subscriptionService.js';
import logger from '../utils/logger.js';
import { getTranslation } from '../utils/locales.js';
import { Markup } from 'telegraf';
import User from '../models/User.js';
import { isAdmin } from '../utils/adminHelper.js';
import NodeCache from 'node-cache';

// ═══════════════════════════════════════════════════════
// 🛡️ ANTI-SPAM: Yumshoqroq va adolatli tizim
// ═══════════════════════════════════════════════════════
const rateLimitCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
const strikesCache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
const subStatusCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 }); // 30 min cache

const SPAM_INTERVAL = 250;        // 250ms dan tez — spam hisoblanadi
const MAX_REQUESTS_PER_MIN = 40;  // Daqiqasiga 40 ta so'rov
const BAN_STRIKES = 6;            // 6 ta strike keyin ban
const TEMP_BAN_MINUTES = 10;      // 10 daqiqalik vaqtinchalik ban

// ═══════════════════════════════════════════════════════
// 💎 VIP Promo xabarlari
// ═══════════════════════════════════════════════════════
const vipPromoMessages = [
    "🚀 <b>Tezkor yuklab olishni xohlaysizmi?</b>\n\n💎 VIP obuna bo'ling va cheklovsiz tezlikda yuklang!",
    "⭐️ <b>Reklamalardan charchadingizmi?</b>\n\n💎 VIP status oling va reklamasiz botdan foydalaning!",
    "🎬 <b>Yangi kinolarni birinchilardan bo'lib ko'ring!</b>\n\n💎 VIP foydalanuvchilar uchun eksklyuziv imkoniyatlar.",
];

const globalAdminSet = new Set(); // Xotirada adminlarni saqlash uchun (Spam-filtrdan o'tkazmaslik uchun)

export const authMiddleware = async (ctx, next) => {
    if (!ctx.from) return next();

    const userId = ctx.from.id;
    const now = Date.now();

    // ══════════ ADMIN BYPASS — Admin tekshiruvlarni o'tkazib yuboradi ══════════
    if (isAdmin(userId) || globalAdminSet.has(userId)) {
        try {
            const user = await findOrCreateUser(ctx);
            if (user && (user.role === 'admin' || user.role === 'superadmin')) {
                globalAdminSet.add(userId);
            }
            if (!ctx.session) ctx.session = {};
            ctx.session.user = user;
            ctx.t = (key, params = {}) => getTranslation(user?.language || 'uz', key, params);
            ctx.isVip = () => true; // Admin = always VIP
            ctx.showVipPromo = async () => {};
        } catch (e) {
            ctx.t = (key, params = {}) => getTranslation('uz', key, params);
            ctx.isVip = () => true;
            ctx.showVipPromo = async () => {};
        }
        return next();
    }

    // ══════════ ANTI-SPAM TEKSHIRUV ══════════
    const userRate = rateLimitCache.get(userId) || { count: 0, resetTime: now + 60000, lastReq: 0 };

    // Tez-tez spam tekshiruvi
    if (now - userRate.lastReq < SPAM_INTERVAL) {
        const strikes = (strikesCache.get(userId) || 0) + 1;
        strikesCache.set(userId, strikes);

        if (strikes >= BAN_STRIKES) {
            // VAQTINCHALIK BAN — 10 daqiqa
            try {
                const bannedUntil = new Date(now + TEMP_BAN_MINUTES * 60 * 1000);
                await User.updateOne(
                    { telegramId: userId },
                    { isBanned: true, bannedUntil }
                );
                strikesCache.del(userId);
                rateLimitCache.del(userId);

                const unbanTime = new Date(bannedUntil).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
                return ctx.reply(
                    `⛔️ <b>Siz spam tufayli ${TEMP_BAN_MINUTES} daqiqaga bloklandingiz!</b>\n\n` +
                    `🕐 Blokdan chiqish vaqti: <b>${unbanTime}</b>`,
                    { parse_mode: 'HTML' }
                ).catch(() => {});
            } catch (e) {
                logger.error('Auto-ban error:', e);
            }
            return;
        }

        userRate.lastReq = now;
        rateLimitCache.set(userId, userRate);
        return; // Javob bermaslik (jimgina o'tkazib yuborish)
    }

    userRate.lastReq = now;

    if (now > userRate.resetTime) {
        userRate.count = 1;
        userRate.resetTime = now + 60000;
    } else {
        userRate.count++;
    }

    rateLimitCache.set(userId, userRate);

    if (userRate.count > MAX_REQUESTS_PER_MIN) {
        return ctx.reply('⚠️ Juda ko\'p so\'rov! Biroz kuting.').catch(() => {});
    }

    // ══════════ FOYDALANUVCHI TEKSHIRUV ══════════
    try {
        const user = await findOrCreateUser(ctx);

        if (user && (user.role === 'admin' || user.role === 'superadmin')) {
            globalAdminSet.add(userId);
        }

        // Bloklangan foydalanuvchi tekshiruvi (avtomatik blokdan chiqarish bilan)
        if (user && user.isBanned) {
            if (user.bannedUntil && new Date(user.bannedUntil) <= new Date() || globalAdminSet.has(userId)) {
                // Muddati tugagan (yoki u admin ekanligi aniqlangan) — avtomatik blokdan chiqarish
                user.isBanned = false;
                user.bannedUntil = null;
                await user.save();
            } else {
                const remaining = user.bannedUntil
                    ? `\n🕐 Blokdan chiqish: <b>${new Date(user.bannedUntil).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</b>`
                    : '';
                return ctx.reply(`🚫 <b>Siz botdan foydalana olmaysiz.</b>${remaining}`, { parse_mode: 'HTML' }).catch(() => {});
            }
        }

        // Session'ga saqlash
        if (!ctx.session) ctx.session = {};
        ctx.session.user = user;

        // i18n
        const lang = user?.language || 'uz';
        ctx.t = (key, params = {}) => getTranslation(lang, key, params);

        // VIP tekshirish helper
        ctx.isVip = () => {
            return user && user.vipUntil && new Date(user.vipUntil) > new Date();
        };

        // VIP promo helper
        ctx.showVipPromo = async () => {
            if (ctx.isVip()) return;
            const promo = vipPromoMessages[Math.floor(Math.random() * vipPromoMessages.length)];
            try {
                await ctx.reply(promo, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('💎 VIP Olish', 'vip_info')]])
                });
            } catch (e) {}
        };

        // ══════════ OBUNA TEKSHIRUV (CALLBACK QUERYLAR UCHUN O'TKAZISH) ══════════
        if (ctx.updateType === 'callback_query') {
            return next();
        }

        // Cache'dan tekshirish — 30 daqiqa davomida qayta tekshirmaslik
        if (subStatusCache.get(userId)) {
            return next();
        }

        try {
            const subStatus = await checkSubscription(ctx);

            if (subStatus !== true && Array.isArray(subStatus) && subStatus.length > 0) {
                const buttons = subStatus.map(ch => [
                    Markup.button.url(`📢 ${ch.name}`, ch.inviteLink.startsWith('http') ? ch.inviteLink : `https://${ch.inviteLink}`)
                ]);
                buttons.push([Markup.button.callback('✅ Tekshirish', 'check_subscription')]);

                await ctx.reply(ctx.t('sub_check_msg'), {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard(buttons)
                });
                return;
            }

            subStatusCache.set(userId, true);
        } catch (e) {
            logger.error('Subscription check error:', e);
            // Xatolikda foydalanuvchini to'smaslik
        }

        return next();
    } catch (e) {
        logger.error('Auth middleware error:', e);
        ctx.t = (key, params = {}) => getTranslation('uz', key, params);
        ctx.isVip = () => false;
        ctx.showVipPromo = async () => {};
        return next();
    }
};

export const adminMiddleware = (ctx, next) => {
    try {
        if (!isAdmin(ctx.from.id)) return;
        return next();
    } catch (err) {
        logger.error('Admin Middleware Error:', err.message);
    }
};
