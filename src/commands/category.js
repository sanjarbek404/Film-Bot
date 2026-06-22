import { Markup } from 'telegraf';
import logger from '../utils/logger.js';
import Category from '../models/Category.js';
import Movie from '../models/Movie.js';

export const setupCategoryCommands = (bot) => {};

// Inline Search Handler - KINO KODI or nomi orqali qidirish
export const setupInlineSearch = (bot) => {
    bot.on('inline_query', async (ctx) => {
        try {
            const query = ctx.inlineQuery?.query;

            if (!query || query.length < 1) {
                return ctx.answerInlineQuery([]);
            }

            let movies = [];

            // Agar faqat raqam kiritilsa, kod bo'yicha qidirish
            if (/^\d+$/.test(query)) {
                const movie = await Movie.findOne({ code: parseInt(query) });
                if (movie) movies = [movie];
            } else {
                // Nom bo'yicha ham qidirish (yordamchi)
                movies = await Movie.find({
                    title: { $regex: query, $options: 'i' }
                }).limit(20);
            }

            const results = movies.map((movie) => ({
                type: 'article',
                id: String(movie._id),
                title: movie.title || 'Nomi yo\'q',
                description: `📥 Kod: ${movie.code || 'N/A'} | 👁 ${movie.views || 0} marta ko'rilgan`,
                input_message_content: {
                    message_text: `🎬 <b>${movie.title || 'Film'}</b>\n\n📥 Kino kodi: <code>${movie.code}</code>\n\n<i>Kinoni to'liq ko'rish uchun pastdagi tugmani bosing!</i>`,
                    parse_mode: 'HTML'
                },
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.url('🎬 Kinoni botda ko\'rish', `https://t.me/${ctx.botInfo.username}?start=${movie.code}`)]
                ]).reply_markup
            }));

            await ctx.answerInlineQuery(results, { cache_time: 10 });
        } catch (e) {
            logger.error('Inline search error:', e);
            ctx.answerInlineQuery([]).catch(() => { });
        }
    });
};
