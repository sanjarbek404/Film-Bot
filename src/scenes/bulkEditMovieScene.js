import { Scenes, Markup } from 'telegraf';
import logger from '../utils/logger.js';
import Movie from '../models/Movie.js';

const bulkEditMovieScene = new Scenes.WizardScene(
    'BULK_EDIT_MOVIE_SCENE',
    // Step 0: Start code
    async (ctx) => {
        await ctx.reply('📚 <b>Ommaviy Tahrirlash (Seriallar)</b>\n\nQaysi KOD dan boshlab tahrirlaymiz? (Masalan: 1001)', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Bekor qilish', 'cancel_bulk_edit')]
            ])
        });
        return ctx.wizard.next();
    },
    // Step 1: End code
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_bulk_edit') return;
        
        const startCode = parseInt(ctx.message?.text);
        if (isNaN(startCode)) return ctx.reply('⚠️ Iltimos, faqat raqam (kod) kiriting:');

        ctx.wizard.state.startCode = startCode;

        await ctx.reply(`Boshlang'ich kod: <b>${startCode}</b>\n\nEndi, qaysi KOD gacha tahrirlaymiz? (Masalan: 1020)`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Bekor qilish', 'cancel_bulk_edit')]
            ])
        });
        return ctx.wizard.next();
    },
    // Step 2: Ask for Title
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_bulk_edit') return;
        
        const endCode = parseInt(ctx.message?.text);
        if (isNaN(endCode)) return ctx.reply('⚠️ Iltimos, faqat raqam (kod) kiriting:');
        
        if (endCode < ctx.wizard.state.startCode) {
            return ctx.reply('⚠️ Oxirgi kod boshlang\'ich koddan katta bo\'lishi kerak! Qaytadan kiriting:');
        }

        ctx.wizard.state.endCode = endCode;

        await ctx.reply(
            `Tanlangan oraliq: <b>${ctx.wizard.state.startCode}</b> - <b>${endCode}</b>\n\n` +
            `📝 <b>Serial Nomini kiritasizmi?</b>\n` +
            `Agar nom kiritsangiz, men o'zim avtomatik ravishda "- 1-qism", "- 2-qism" deb qo'shib chiqaman!\n\n` +
            `<i>Agar nomni o'zgartirmasdan faqat rasmni o'zgartirmoqchi bo'lsangiz "O'tkazib yuborish" tugmasini bosing:</i>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⏩ O\'tkazib yuborish', 'skip_title')],
                [Markup.button.callback('❌ Bekor qilish', 'cancel_bulk_edit')]
            ])
        });
        return ctx.wizard.next();
    },
    // Step 3: Ask for Poster
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_bulk_edit') return;

        if (ctx.callbackQuery?.data === 'skip_title') {
            ctx.wizard.state.newTitle = null;
            await ctx.answerCbQuery('Nom o\'tkazib yuborildi');
        } else if (ctx.message?.text) {
            ctx.wizard.state.newTitle = ctx.message.text;
        } else {
            return ctx.reply('⚠️ Iltimos, matn kiriting yoki "O\'tkazib yuborish" tugmasini bosing:');
        }

        await ctx.reply('🖼 <b>Endi serial uchun yagona POSTER (rasm) yuboring:</b>\n\nUshbu rasm hamma qismlarga o\'rnatiladi.', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Bekor qilish', 'cancel_bulk_edit')]
            ])
        });
        return ctx.wizard.next();
    },
    // Step 4: Process and save
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_bulk_edit') return;

        if (!ctx.message?.photo) {
            return ctx.reply('⚠️ Iltimos, rasm (poster) yuboring:');
        }

        const posterFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const { startCode, endCode, newTitle } = ctx.wizard.state;

        await ctx.reply('⏳ <i>Kinolarni tahrirlash boshlandi. Iltimos kuting...</i>', { parse_mode: 'HTML' });

        try {
            // Kinolarni qidiramiz
            const movies = await Movie.find({ code: { $gte: startCode, $lte: endCode } }).sort({ code: 1 });
            
            if (movies.length === 0) {
                await ctx.reply('❌ Ushbu oraliqda hech qanday kino topilmadi.');
                return ctx.scene.leave();
            }

            let updatedCount = 0;
            let episode = 1;

            for (const movie of movies) {
                movie.poster = posterFileId;
                if (newTitle) {
                    movie.title = `${newTitle} - ${episode}-qism`;
                }
                await movie.save();
                updatedCount++;
                episode++;
            }

            await ctx.reply(`✅ <b>Ommaviy tahrirlash muvaffaqiyatli yakunlandi!</b>\n\n🔄 Tahrirlangan kinolar soni: <b>${updatedCount}</b> ta`, { parse_mode: 'HTML' });
            return ctx.scene.leave();

        } catch (e) {
            logger.error('Bulk edit error:', e);
            await ctx.reply('❌ Xatolik yuz berdi. Iltimos adminga murojaat qiling.');
            return ctx.scene.leave();
        }
    }
);

bulkEditMovieScene.action('cancel_bulk_edit', async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply('✅ Ommaviy tahrirlash bekor qilindi.');
    return ctx.scene.leave();
});

export default bulkEditMovieScene;
