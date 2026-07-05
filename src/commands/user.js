import { Markup } from 'telegraf';
import logger from '../utils/logger.js';
import { getMovieByCode, searchMovies, getNewMovies, getTopMovies } from '../services/movieService.js';
import Favorite from '../models/Favorite.js';
import Movie from '../models/Movie.js';
import User from '../models/User.js';
import AdminLog from '../models/AdminLog.js';
import { sendMainMenu } from '../utils/menuUtils.js';
import { getSmartRecommendations } from '../services/recommendationService.js';

// ═══════════════════════════════════════════════════════
// 🎬 KINO YUBORISH (ASOSIY FUNKSIYA)
// ═══════════════════════════════════════════════════════
export const sendMovie = async (ctx, movie, dbUser) => {
    try {
        const isVip = dbUser && dbUser.vipUntil && new Date(dbUser.vipUntil) > new Date();

        // Ko'rishlar sonini oshirish (fire-and-forget)
        if (movie._id) {
            Movie.updateOne({ _id: movie._id }, { $inc: { views: 1 } }).catch(() => {});
        }

        // Ko'rilgan kinolar sonini oshirish
        if (dbUser && dbUser._id) {
            User.updateOne(
                { _id: dbUser._id },
                { $inc: { moviesWatched: 1 } }
            ).catch(() => {});
        }

        const views = (movie.views || 0) + 1;

        const escapeHTML = (str) => {
            if (!str) return '';
            return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };

        let caption = '';
        if (movie.title && !movie.title.startsWith('Kino #')) {
            caption += `🎬 <b>${escapeHTML(movie.title)}</b>\n\n`;
        }
        caption += `🔢 <b>Kino kodi:</b> ${movie.code}\n👁 <b>Ko'rishlar:</b> ${views}`;

        let buttons = [];
        if (movie._id) {
            buttons.push([Markup.button.callback('❤️ Saqlash', `fav_${movie._id}`)]);
        }

        // 💎 VIP HIMOYA: Faqat VIP foydalanuvchilar yuklab olishi/uzatishi mumkin
        if (!isVip) {
            caption += `\n\n🔒 <i>Kinoni saqlash va uzatish faqat VIP obunachilar uchun.</i>`;
            buttons.push([Markup.button.callback('💎 VIP Olish', 'vip_info')]);
        }

        // Video yuborish
        if (movie.fileId) {
            try {
                await ctx.replyWithVideo(movie.fileId, {
                    caption,
                    parse_mode: 'HTML',
                    protect_content: !isVip, // VIP bo'lmasa — yuklab olib bo'lmaydi
                    ...Markup.inlineKeyboard(buttons)
                });

                // Har 5-kinoda VIP promo
                if (!isVip && dbUser && (dbUser.moviesWatched || 0) % 5 === 0) {
                    setTimeout(() => ctx.showVipPromo?.(), 2000);
                }
                return true;
            } catch (e) {
                logger.error('Video send error:', e);
                throw e;
            }
        }

        // Link bor — faqat VIP uchun
        if (movie.link && isVip && !movie.isRestricted) {
            buttons.unshift([Markup.button.url('📥 Download', movie.link)]);
        }

        if (movie.poster) {
            try {
                await ctx.replyWithPhoto(movie.poster, {
                    caption,
                    parse_mode: 'HTML',
                    protect_content: !isVip,
                    ...Markup.inlineKeyboard(buttons)
                });
                return true;
            } catch (e) {
                logger.error('Photo send error:', e);
            }
        }

        await ctx.replyWithHTML(caption, Markup.inlineKeyboard(buttons));
        return true;
    } catch (error) {
        logger.error('sendMovie error:', error);
        await ctx.reply(`⚠️ <b>Ushbu kinoning fayli eskirgan yoki o'chirilgan!</b>`, { parse_mode: 'HTML' }).catch(() => {});
        return false;
    }
};

// ═══════════════════════════════════════════════════════
// 👤 FOYDALANUVCHI BUYRUQLARI
// ═══════════════════════════════════════════════════════
export const setupUserCommands = (bot) => {

    // ═══ KINO QIDIRISH ═══
    bot.hears(['🔍 Kino qidirish', '🔍 Qidirish', '🔍 Поиск фильмов', '🔍 Search Movies'], (ctx) => {
        ctx.reply(ctx.t('search_prompt'), { parse_mode: 'HTML' }).catch(() => {});
    });

    // ═══ YANGI KINOLAR ═══
    bot.hears(['🆕 Yangi kinolar', '🆕 Новинки', '🆕 New Movies'], async (ctx) => {
        try {
            const movies = await getNewMovies(10);
            if (!movies || movies.length === 0) return ctx.reply(ctx.t('not_found'));

            let message = '🆕 <b>Yangi kinolar:</b>\n\n';
            movies.forEach((m, i) => {
                message += `${i + 1}. 🎬 ${m.title} — <code>${m.code}</code>\n`;
            });
            message += '\n<i>Kodni yuboring!</i>';

            const buttons = [];
            if (!ctx.isVip()) {
                buttons.push([Markup.button.callback('💎 VIP Olish', 'vip_info')]);
            }

            await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
        } catch (e) {
            logger.error('New movies error:', e);
            ctx.reply(ctx.t('error_general')).catch(() => {});
        }
    });

    // ═══ TOP KINOLAR ═══
    bot.hears(['🔥 Top kinolar', '🔥 Топ фильмы', '🔥 Top Movies'], async (ctx) => {
        try {
            const movies = await getTopMovies(10);
            if (!movies || movies.length === 0) return ctx.reply(ctx.t('not_found'));

            let message = ctx.t('menu_top') + ':\n\n';
            movies.forEach((m, i) => {
                message += `${i + 1}. 🎬 ${m.title} — 👁 ${m.views}\nCode: <code>${m.code}</code>\n\n`;
            });

            const buttons = [];
            if (!ctx.isVip()) {
                buttons.push([Markup.button.callback('💎 VIP Olish', 'vip_info')]);
            }

            await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
        } catch (e) {
            logger.error('Top movies error:', e);
            ctx.reply(ctx.t('error_general')).catch(() => {});
        }
    });

    // ═══ TASODIFIY KINO ═══
    bot.hears(['🎲 Tasodifiy kino', '🎲 Случайный фильм', '🎲 Random Movie', '🎲 Kino Tavsiya'], async (ctx) => {
        try {
            const movies = await Movie.aggregate([{ $sample: { size: 1 } }]);
            if (!movies || movies.length === 0) return ctx.reply(ctx.t('not_found'));
            
            await ctx.reply('🎲 <b>Tasodifiy tanlandi!</b>', { parse_mode: 'HTML' });
            await sendMovie(ctx, movies[0], ctx.session?.user);
        } catch (e) {
            logger.error('Random movie error:', e);
            ctx.reply(ctx.t('error_general')).catch(() => {});
        }
    });

    // ═══ SHAXSIY KABINET ═══
    bot.hears(['👤 Shaxsiy Kabinet', '👤 Личный кабинет', '👤 My Cabinet'], async (ctx) => {
        try {
            const user = ctx.session?.user;
            if (!user) return;
            const isVip = ctx.isVip();
            
            let msg = `👤 <b>${ctx.t('menu_cabinet') || 'Shaxsiy Kabinet'}</b>\n\n`;
            msg += `ID: <code>${ctx.from.id}</code>\n`;
            if (isVip) {
                const daysLeft = Math.ceil((new Date(user.vipUntil) - new Date()) / (1000 * 60 * 60 * 24));
                msg += `💎 <b>Status:</b> VIP (${daysLeft} kun qoldi)\n`;
            } else {
                msg += `💎 <b>Status:</b> Oddiy (VIP emassiz)\n`;
            }
            
            const buttons = [
                [Markup.button.callback('❤️ Sevimli kinolarim', 'cb_fav')],
                [Markup.button.callback('📜 Ko\'rishlar tarixim', 'cb_history')],
                [Markup.button.callback(isVip ? '👑 VIP Aktiv (Holat)' : '💎 VIP Olish', isVip ? 'cb_vip' : 'cb_shop'), Markup.button.callback('🎲 Tasodifiy kino', 'cb_random_cabinet')]
            ];

            await ctx.reply(msg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(buttons)
            });
        } catch (e) {
            logger.error('Cabinet error:', e);
            ctx.reply(ctx.t('error_general')).catch(() => {});
        }
    });

    // ═══════════════════════════════════════════════════════
    // KABINET INLINE TUGMALARI
    // ═══════════════════════════════════════════════════════



    bot.action('cb_random_cabinet', async (ctx) => {
        try {
            await ctx.answerCbQuery('🎰 Tasodifiy kino...').catch(() => {});
            const movies = await Movie.aggregate([{ $sample: { size: 1 } }]);
            if (!movies || movies.length === 0) return ctx.reply('📭 Kinolar yo\'q.');
            await sendMovie(ctx, movies[0], ctx.session?.user);
        } catch (e) {}
    });

    bot.action(['cb_shop', 'vip_info'], async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {});
            
            await ctx.reply(
                `⭐️ <b>Telegram Yulduzlari orqali VIP xarid qilish!</b>\n\n` +
                `VIP bo'lish orqali barcha kinolarni cheklovlarsiz yuklab olishingiz mumkin.\n\n` +
                `<i>Iltimos, VIP muddatini tanlang:</i>`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⭐️ 1 Oylik VIP (50 ⭐)', 'buy_stars_30')],
                        [Markup.button.callback('⭐️ 1 Yillik VIP (300 ⭐)', 'buy_stars_365')],
                        [Markup.button.callback('❌ Bekor qilish', 'cancel_pay')]
                    ])
                }
            );
        } catch (e) {}
    });

    bot.action(/^buy_stars_(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {});
            const days = parseInt(ctx.match[1]);
            let amount = days === 30 ? 50 : 300;
            let title = days === 30 ? '1 Oylik VIP' : '1 Yillik VIP';
            
            await ctx.replyWithInvoice({
                title,
                description: `Kino bot uchun ${title} obunasi.`,
                payload: `vip_stars_${days}_${ctx.from.id}`,
                provider_token: "",
                currency: "XTR",
                prices: [{ label: title, amount }]
            });
        } catch (e) {
            logger.error('Stars invoice err:', e);
        }
    });

    bot.action('cancel_pay', async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {});
            await ctx.deleteMessage().catch(() => {});
        } catch (e) {}
    });

    bot.on('pre_checkout_query', async (ctx) => {
        try {
            await ctx.answerPreCheckoutQuery(true).catch(() => {});
        } catch (e) {}
    });

    bot.on('successful_payment', async (ctx) => {
        try {
            const payload = ctx.message.successful_payment.invoice_payload;
            if (payload && payload.startsWith('vip_stars_')) {
                const parts = payload.split('_');
                const days = parseInt(parts[2]);
                const targetId = parseInt(parts[3]);
                
                if (ctx.from.id === targetId) {
                    const user = await User.findOne({ telegramId: targetId });
                    if (user) {
                        const currentVip = user.vipUntil && new Date(user.vipUntil) > new Date() ? new Date(user.vipUntil) : new Date();
                        currentVip.setDate(currentVip.getDate() + days);
                        user.vipUntil = currentVip;
                        user.vipNotified = false;
                        await user.save();
                        
                        // Session yangilash
                        if (ctx.session) ctx.session.user = user;
                        
                        await ctx.reply(
                            `🎉 <b>Tabriklaymiz! To'lov Muvaffaqiyatli!</b>\n\n` +
                            `💎 VIP ${currentVip.toISOString().split('T')[0]} gacha amal qiladi.`,
                            { parse_mode: 'HTML' }
                        );
                        setTimeout(() => sendMainMenu(ctx), 500);
                    }
                }
            }
        } catch (e) {
            logger.error('successful_payment err:', e);
        }
    });



    bot.action('cb_fav', async (ctx) => {
        try {
            
            await ctx.answerCbQuery().catch(() => {});
            const user = ctx.session?.user;
            const favorites = await Favorite.find({ user: user._id }).populate('movie');
            if (!favorites || favorites.length === 0) return ctx.reply('📭 <b>Bo\'sh</b>', { parse_mode: 'HTML' });

            let msg = '⭐ <b>Sevimlilar ro\'yxati:</b>\n\n';
            favorites.forEach((f, i) => {
                if (f.movie) msg += `${i + 1}. 🎬 ${f.movie.title} — <code>${f.movie.code}</code>\n`;
            });
            await ctx.replyWithHTML(msg);
        } catch (e) {}
    });

    bot.action('cb_history', async (ctx) => {
        try {
            if (!ctx.isVip()) return ctx.answerCbQuery(ctx.t('vip_restricted'), { show_alert: true });
            
            await ctx.answerCbQuery().catch(() => {});
            const dbUser = await User.findOne({ telegramId: ctx.from.id }).populate({ path: 'watchHistory.movie', select: 'title code' });
            if (!dbUser || !dbUser.watchHistory || dbUser.watchHistory.length === 0) return ctx.reply('📭 Bo\'sh');

            const history = dbUser.watchHistory.slice().reverse().slice(0, 20);
            let msg = '📜 <b>Mening Tarixim</b>\n\n';
            history.forEach((h, i) => {
                if (h.movie) msg += `${i + 1}. 🎬 ${h.movie.title} — <code>${h.movie.code}</code>\n`;
            });
            await ctx.replyWithHTML(msg);
        } catch (e) {}
    });

    bot.action('cb_vip', async (ctx) => {
        try {
            const user = ctx.session?.user;
            if (user && user.vipUntil && new Date(user.vipUntil) > new Date()) {
                const diff = new Date(user.vipUntil) - new Date();
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                ctx.answerCbQuery(`⏳ VIP: ${days} kun, ${hours} soat qoldi`, { show_alert: true });
            } else {
                ctx.answerCbQuery('Muddati tugagan', { show_alert: true });
            }
        } catch (e) {}
    });

    // ═══ WEB APP DATA ═══
    bot.on('web_app_data', async (ctx) => {
        try {
            const data = JSON.parse(ctx.message.web_app_data.data);
            if (data.action === 'play_movie' && data.code) {
                const movie = await getMovieByCode(parseInt(data.code));
                if (movie) await sendMovie(ctx, movie, ctx.session?.user);
            }
        } catch (e) {
            logger.error('Web app data error:', e);
        }
    });

    // ═══ MATN HANDLER (Qidirish yoki Kod) ═══
    bot.on('text', async (ctx, next) => {
        try {
            if (ctx.scene?.current) return next();

            const buttonTexts = [
                '🔍 Search Movies', '🔍 Qidirish', '🔍 Поиск фильмов', '📂 Categories',
                '🆕 New Movies', '🔥 Top Movies', '🎲 Random Movie', '🎲 Kino Tavsiya',
                '👤 My Cabinet', '⚙️ Settings',
                '🇺🇿 O\'zbekcha', '🇷🇺 Русский', '🇬🇧 English',
                '🏠 Bosh menyu', '🏠 Главное меню', '🏠 Main Menu'
            ];

            if (!ctx.message?.text || ctx.message.text.startsWith('/') || buttonTexts.includes(ctx.message.text)) {
                return next();
            }

            const text = ctx.message.text.trim();
            try { await ctx.deleteMessage(); } catch (e) {}

            if (/^\d+$/.test(text)) {
                const code = parseInt(text);
                const movie = await getMovieByCode(code);
                if (movie) {
                    await sendMovie(ctx, movie, ctx.session?.user);
                } else {
                    ctx.reply(ctx.t('not_found')).catch(() => {});
                }
            } else {
                const limit = 10;
                const movies = await searchMovies(text);
                if (!movies || movies.length === 0) {
                    return ctx.reply(ctx.t('not_found'), { parse_mode: 'HTML' });
                }

                let msg = `🔎 <b>"${text}"</b> natijalari:\n\n`;
                movies.slice(0, limit).forEach((m, i) => {
                    msg += `${i + 1}. 🎬 ${m.title} — <code>${m.code}</code>\n`;
                });
                msg += '\n<i>Kodni yuboring!</i>';

                const totalPages = Math.ceil(movies.length / limit);
                const buttons = [];
                if (totalPages > 1) {
                    buttons.push([
                        Markup.button.callback('1/' + totalPages, 'noop'),
                        Markup.button.callback('Keyingi ➡️', `search_2_${text.substring(0, 30)}`)
                    ]);
                }

                if (!ctx.isVip()) {
                    buttons.push([Markup.button.callback('💎 VIP Olish', 'vip_info')]);
                }

                await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
            }
        } catch (error) {
            logger.error('Text handler error:', error);
        }
    });

    // ═══ SAHIFALASH ═══
    bot.action(/search_(\d+)_(.+)/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const query = ctx.match[2];
            const limit = 10;
            const movies = await searchMovies(query);
            
            if (!movies || movies.length === 0) return ctx.answerCbQuery('Topilmadi', { show_alert: true });
            
            const totalPages = Math.ceil(movies.length / limit);
            if (page > totalPages || page < 1) return ctx.answerCbQuery('Xato sahifa', { show_alert: true });

            const skip = (page - 1) * limit;
            const pageMovies = movies.slice(skip, skip + limit);

            let msg = `🔎 <b>"${query}"</b> ${ctx.t('page_info', { page })}:\n\n`;
            pageMovies.forEach((m, i) => {
                msg += `${skip + i + 1}. 🎬 ${m.title} — <code>${m.code}</code>\n`;
            });
            msg += '\n<i>Kodni yuboring!</i>';

            const buttons = [];
            const nav = [];
            if (page > 1) nav.push(Markup.button.callback(ctx.t('page_prev'), `search_${page - 1}_${query.substring(0, 30)}`));
            nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
            if (page < totalPages) nav.push(Markup.button.callback(ctx.t('page_next'), `search_${page + 1}_${query.substring(0, 30)}`));
            buttons.push(nav);

            if (!ctx.isVip()) {
                buttons.push([Markup.button.callback('💎 VIP Olish', 'vip_info')]);
            }

            await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
            ctx.answerCbQuery().catch(() => {});
        } catch (e) {
            ctx.answerCbQuery('Xatolik').catch(() => {});
        }
    });

    // ═══ SEVIMLILAR ═══
    bot.action(/fav_(.+)/, async (ctx) => {
        try {

            const movieId = ctx.match[1];
            const user = ctx.session?.user;
            if (!user) return ctx.answerCbQuery('❌');

            const exists = await Favorite.findOne({ user: user._id, movie: movieId });
            if (exists) {
                await Favorite.findOneAndDelete({ user: user._id, movie: movieId });
                return ctx.answerCbQuery('💔');
            } else {
                await Favorite.create({ user: user._id, movie: movieId });
                return ctx.answerCbQuery('❤️');
            }
        } catch (e) {
            ctx.answerCbQuery('❌').catch(() => {});
        }
    });

    // ═══ ULASHISH ═══
    bot.action(/share_(.+)/, async (ctx) => {
        try {
            const code = ctx.match[1];
            const shareUrl = `https://t.me/${ctx.botInfo?.username}?start=${code}`;
            await ctx.reply(`📤 <b>Link:</b>\n\n<code>${shareUrl}</code>`, { parse_mode: 'HTML' });
            ctx.answerCbQuery('📤').catch(() => {});
        } catch (e) {
            ctx.answerCbQuery('❌').catch(() => {});
        }
    });

    // ═══ SHARH ═══
    bot.action(/review_(\d+)/, async (ctx) => {
        try {
            if (!ctx.isVip()) return ctx.answerCbQuery(ctx.t('vip_only_comment'), { show_alert: true });
            const code = parseInt(ctx.match[1]);
            ctx.scene.enter('REVIEW_SCENE', { movieCode: code });
            ctx.answerCbQuery();
        } catch (e) {
            logger.error('Review entering error:', e);
        }
    });

    bot.action(/read_reviews_(\d+)/, async (ctx) => {
        try {
            if (!ctx.isVip()) return ctx.answerCbQuery(ctx.t('vip_restricted_review'), { show_alert: true });

            const code = parseInt(ctx.match[1]);
            const movie = await getMovieByCode(code);
            if (!movie || !movie.reviews || movie.reviews.length === 0) {
                return ctx.answerCbQuery(ctx.t('not_found'), { show_alert: true });
            }

            const reviews = movie.reviews.slice(-5).reverse();
            let msg = `💬 <b>"${movie.title}" reviews:</b>\n\n`;
            reviews.forEach(r => {
                const stars = '⭐️'.repeat(r.rating || 0);
                msg += `👤 <b>${r.userName}</b> (${stars})\n📝 <i>${r.comment}</i>\n\n`;
            });

            await ctx.replyWithHTML(msg);
            ctx.answerCbQuery();
        } catch (e) {
            ctx.answerCbQuery('❌');
        }
    });

    // ═══ TAKLIF QO'SHISH ═══
    bot.action('cb_invite', async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {});
            const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
            await ctx.replyWithHTML(ctx.t('referral_promo', { link }), { disable_web_page_preview: true });
        } catch (e) {}
    });

    // ═══ SHIKOYAT ═══
    bot.action(/report_(\d+)/, async (ctx) => {
        try {
            if (!ctx.isVip()) return ctx.answerCbQuery('⚠️ Faqat VIP uchun!', { show_alert: true });
            const code = ctx.match[1];
            await ctx.answerCbQuery('📝 Shikoyat yozing...');
            return ctx.scene.enter('REPORT_SCENE', { movieCode: code });
        } catch (e) {
            logger.error('Report error:', e);
        }
    });

    bot.action('cb_bonus', async (ctx) => {
        try {
            const user = ctx.session?.user;
            if (!user) return ctx.answerCbQuery('❌', { show_alert: true });
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (user.lastDailyBonus && new Date(user.lastDailyBonus) >= today) {
                return ctx.answerCbQuery('⏳ Bugungi bonus oligan! Ertaga keling.', { show_alert: true });
            }
            
            await User.updateOne({ telegramId: ctx.from.id }, { $inc: { points: 25 }, lastDailyBonus: new Date() });
            if (ctx.session?.user) ctx.session.user.points = (ctx.session.user.points || 0) + 25;
            
            await ctx.answerCbQuery('🎁 +25 ball qo\'shildi!', { show_alert: true });
        } catch (e) {}
    });
};
