import { Markup } from 'telegraf';
import Movie from '../models/Movie.js';
import User from '../models/User.js';
import Config from '../models/Config.js';
import Favorite from '../models/Favorite.js';
import { getTranslation } from '../utils/locales.js';
import { sendMainMenu } from '../utils/menuUtils.js';
import { checkSubscription } from '../services/subscriptionService.js';
import logger from '../utils/logger.js';
import { sendMovie } from './user.js';
import NodeCache from 'node-cache';

// Config cache — START_GIF va GLOBAL_VIP uchun (5 daqiqa)
const configCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export const setupStartCommand = (bot) => {

    bot.command('help', async (ctx) => {
        try {
            if (ctx.scene?.current) await ctx.scene.leave().catch(() => {});
            await ctx.reply(
                `ℹ️ <b>Yordam va Buyruqlar</b>\n\n` +
                `🔹 /start — Botni yangilash\n` +
                `🔹 /help — Yordam olish\n` +
                `🔹 /support — Adminga yozish\n\n` +
                `🎯 <i>Kino topish uchun shunchaki kodini yoki nomini yuboring.</i>`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            logger.error('Help command error:', e);
        }
    });

    bot.command('support', async (ctx) => {
        try {
            if (ctx.scene?.current) await ctx.scene.leave().catch(() => {});
            await ctx.reply(
                `📞 <b>Qo'llab-quvvatlash</b>\n\nSavol yoki muammo bo'lsa adminga yozing:\n- @sanjarbek_404`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.url('📞 Adminga yozish', 'https://t.me/sanjarbek_404')]])
                }
            );
        } catch (e) {
            logger.error('Support command error:', e);
        }
    });

    bot.start(async (ctx) => {
        try {
            const startPayload = ctx.message?.text?.split(' ')[1];
            let pendingMovieCode = null;
            let referrerId = null;

            if (startPayload && /^\d+$/.test(startPayload)) {
                if (startPayload.length >= 7) {
                    referrerId = startPayload;
                } else {
                    pendingMovieCode = parseInt(startPayload);
                }
            }

            // ═══ SESSION'DAGI USER'DAN FOYDALANISH (middleware allaqachon topgan!) ═══
            let user = ctx.session?.user;

            // Agar yangi foydalanuvchi bo'lsa — yaratish
            if (!user || !user.telegramId) {
                user = await User.findOne({ telegramId: ctx.from.id });
            }

            if (!user) {
                try {
                    user = await User.create({
                        telegramId: ctx.from.id,
                        firstName: ctx.from.first_name,
                        username: ctx.from.username,
                        language: 'uz',
                        invitedBy: (referrerId && referrerId !== ctx.from.id.toString()) ? referrerId : null
                    });

                    // Aksiya VIP tekshiruvi (CACHE'DAN)
                    try {
                        let actionConfig = configCache.get('LATEST_GLOBAL_VIP');
                        if (actionConfig === undefined) {
                            const dbConfig = await Config.findOne({ key: 'LATEST_GLOBAL_VIP' }).lean();
                            actionConfig = dbConfig?.value || null;
                            configCache.set('LATEST_GLOBAL_VIP', actionConfig);
                        }
                        if (actionConfig) {
                            const actionData = JSON.parse(actionConfig);
                            if (actionData.targetDate > Date.now()) {
                                user.vipUntil = new Date(actionData.targetDate);
                                await user.save();
                            }
                        }
                    } catch (e) {
                        logger.error('Welcome VIP auto-gift error', e);
                    }

                    // Referral tizimi
                    if (user.invitedBy) {
                        try {
                            const referrer = await User.findOne({ telegramId: parseInt(user.invitedBy) });
                            if (referrer) {
                                referrer.referralCount = (referrer.referralCount || 0) + 1;
                                if (referrer.referralCount % 10 === 0) {
                                    let currentVip = referrer.vipUntil && new Date(referrer.vipUntil) > new Date() ? new Date(referrer.vipUntil) : new Date();
                                    referrer.vipUntil = new Date(currentVip.getTime() + 24 * 60 * 60 * 1000);
                                    ctx.telegram.sendMessage(referrer.telegramId, ctx.t('referral_milestone'), { parse_mode: 'HTML' }).catch(() => {});
                                } else {
                                    const left = 10 - (referrer.referralCount % 10);
                                    ctx.telegram.sendMessage(referrer.telegramId, ctx.t('referral_progress', { count: referrer.referralCount, left }), { parse_mode: 'HTML' }).catch(() => {});
                                }
                                await referrer.save();
                            }
                        } catch (e) {}
                    }
                } catch (e) {
                    user = await User.findOne({ telegramId: ctx.from.id });
                }
            } else if (!user.language) {
                user.language = 'uz';
                await User.updateOne({ telegramId: ctx.from.id }, { language: 'uz' });
            }

            // Session'ni yangilash
            if (!ctx.session) ctx.session = {};
            ctx.session.user = user;
            ctx.t = (key, params) => getTranslation(user?.language || 'uz', key, params);

            // ═══ OBUNA TEKSHIRUV (middleware cache'dan o'tsa — bu yerda o'tkazmaslik) ═══
            // Middleware allaqachon callback_query va cache'langan holatlarda next() qilgan.
            // Start buyrug'i uchun yangi tekshirish kerak (deeplink bilan kelishi mumkin)
            const subStatus = await checkSubscription(ctx);
            if (subStatus !== true && Array.isArray(subStatus) && subStatus.length > 0) {
                if (pendingMovieCode) {
                    ctx.session.pendingMovieCode = pendingMovieCode;
                }
                const buttons = subStatus.map(ch => [Markup.button.url(`➕ ${ch.name}`, ch.inviteLink)]);
                buttons.push([Markup.button.callback(ctx.t('sub_btn_check'), 'check_subscription')]);
                return ctx.reply(ctx.t('sub_check_msg'), {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard(buttons)
                });
            }

            // ═══ KINO YUBORISH (deeplink) ═══
            if (pendingMovieCode) {
                const movie = await Movie.findOne({ code: pendingMovieCode }).lean();
                if (movie) {
                    await sendMovie(ctx, movie, user);
                    return;
                } else {
                    await ctx.reply(ctx.t('not_found')).catch(() => {});
                }
            }

            // ═══ START GIF/TEXT (CACHE'DAN) ═══
            try {
                let startGifData = configCache.get('START_GIF');
                if (startGifData === undefined) {
                    const dbConfig = await Config.findOne({ key: 'START_GIF' }).lean();
                    startGifData = dbConfig?.value || null;
                    configCache.set('START_GIF', startGifData);
                }

                let customSent = false;
                if (startGifData) {
                    const data = JSON.parse(startGifData);
                    const caption = data.caption || `🎬 <b>FilmXBotga Xush kelibsiz!</b>\n\n🔍 Kino kodini yoki nomini yuboring.`;
                    
                    try {
                        if (data.type === 'animation') {
                            await ctx.replyWithAnimation(data.fileId, { caption, parse_mode: 'HTML' });
                            customSent = true;
                        } else if (data.type === 'photo') {
                            await ctx.replyWithPhoto(data.fileId, { caption, parse_mode: 'HTML' });
                            customSent = true;
                        } else if (data.type === 'video') {
                            await ctx.replyWithVideo(data.fileId, { caption, parse_mode: 'HTML' });
                            customSent = true;
                        }
                    } catch (e) {}
                }

                if (!customSent) {
                    await ctx.reply(
                        `🎬 <b>FilmXBot - Eng sara kinolar!</b>\n\n` +
                        `🔍 <b>Kino qidirish judayam oson:</b>\n` +
                        `1️⃣ Kino nomini yozing (masalan: <i>Venom</i>)\n` +
                        `2️⃣ Yoki kino kodini yuboring (masalan: <i>125</i>)\n\n` +
                        `🚀 Qo'shimcha imkoniyatlarni pastki menyu orqali boshqaring.`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
            } catch (err) {
                logger.error('Start GIF send error:', err);
                await ctx.reply(`🎬 <b>FilmXBot</b>\n\n🔍 Kino nomini yoki kodini yuboring.`, { parse_mode: 'HTML' }).catch(() => {});
            }

            sendMainMenu(ctx);
        } catch (error) {
            logger.error('Start command error:', error);
        }
    });

    // ═══ TIL TANLASH ═══
    bot.hears(['🇺🇿 O\'zbekcha', '🇷🇺 Русский', '🇬🇧 English'], async (ctx) => {
        let lang = 'uz';
        if (ctx.message.text.includes('Русский')) lang = 'ru';
        else if (ctx.message.text.includes('English')) lang = 'en';

        try {
            await User.updateOne({ telegramId: ctx.from.id }, { language: lang });
            if (ctx.session?.user) ctx.session.user.language = lang;
            ctx.t = (key, params) => getTranslation(lang, key, params);
            await ctx.reply(ctx.t('lang_changed'), Markup.removeKeyboard());
            sendMainMenu(ctx);
        } catch (e) {
            logger.error('Language change error:', e);
        }
    });

    // ═══ SOZLAMALAR ═══
    bot.hears(['⚙️ Sozlamalar', '⚙️ Настройки', '⚙️ Settings'], (ctx) => {
        ctx.reply(ctx.t('settings_title'), {
            ...Markup.keyboard([
                ['🇺🇿 O\'zbekcha', '🇷🇺 Русский', '🇬🇧 English'],
                [ctx.t('menu_main')]
            ]).resize()
        });
    });

    // ═══ BOSH MENYU ═══
    bot.hears(['🏠 Bosh menyu', '🏠 Главное меню', '🏠 Main Menu'], (ctx) => sendMainMenu(ctx));

    // ═══ STATISTIKA ═══
    bot.hears(['📊 Mening statistikam', '📊 Моя статистика', '📊 My Stats'], async (ctx) => {
        try {
            const user = ctx.session?.user;
            if (!user) return;
            const isVip = user.vipUntil && new Date(user.vipUntil) > new Date();
            const favCount = await Favorite.countDocuments({ user: user._id }).catch(() => 0);

            let msg = `📊 <b>${ctx.t('menu_stats')}</b>\n\n`;
            msg += `👤 <b>Ism:</b> ${user.firstName}\n`;
            msg += `❤️ <b>Sevimlilar:</b> ${favCount} ta\n`;
            msg += `🎬 <b>Ko'rilgan kinolar:</b> ${user.moviesWatched || 0} ta\n\n`;

            if (isVip) {
                const daysLeft = Math.ceil((new Date(user.vipUntil) - new Date()) / (1000 * 60 * 60 * 24));
                msg += `💎 <b>VIP Status:</b> ✅ AKTIV\n📅 <b>Qolgan kunlar:</b> ${daysLeft} kun\n`;
            } else {
                msg += `👤 <b>Status:</b> Oddiy foydalanuvchi\n\n💎 <i>VIP bo'ling va ko'proq imkoniyatlarga ega bo'ling!</i>`;
            }

            const buttons = [];
            if (!isVip) buttons.push([Markup.button.callback('💎 VIP Olish', 'vip_info')]);

            await ctx.reply(msg, {
                parse_mode: 'HTML',
                ...(buttons.length > 0 ? Markup.inlineKeyboard(buttons) : {})
            });
        } catch (e) {
            logger.error('Stats error:', e);
        }
    });

    // ═══ OVOZ BERISH ═══
    bot.hears(['🗳 Ovoz berish', '🗳 Голосование', '🗳 Vote'], async (ctx) => {
        try {
            if (!ctx.isVip()) return ctx.reply(ctx.t('vip_restricted'));
            ctx.scene.enter('REQUEST_SCENE');
        } catch (e) {
            logger.error('Vote handler error:', e);
        }
    });

    // ═══ OBUNA TEKSHIRUV CALLBACK ═══
    bot.action('check_subscription', async (ctx) => {
        try {
            const subStatus = await checkSubscription(ctx);
            if (subStatus === true) {
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply(ctx.t('sub_success'), { parse_mode: 'HTML' });
                
                if (ctx.session?.pendingMovieCode) {
                    const code = ctx.session.pendingMovieCode;
                    ctx.session.pendingMovieCode = null;
                    
                    const movie = await Movie.findOne({ code }).lean();
                    const user = ctx.session?.user;
                    if (movie && user) {
                        await sendMovie(ctx, movie, user);
                        return;
                    }
                }
                sendMainMenu(ctx);
            } else {
                await ctx.answerCbQuery(ctx.t('sub_fail'), { show_alert: true });
            }
        } catch (e) {
            ctx.answerCbQuery('Error').catch(() => {});
        }
    });
};
