import { Scenes, Markup } from 'telegraf';
import logger from '../utils/logger.js';
import { createMovie } from '../services/movieService.js';
import Movie from '../models/Movie.js';
import Config from '../models/Config.js';

// Auto-generate unique movie code
const generateMovieCode = async () => {
    try {
        const lastMovie = await Movie.findOne().sort({ code: -1 });
        return lastMovie ? lastMovie.code + 1 : 1001;
    } catch (e) {
        return Math.floor(Math.random() * 9000) + 1000;
    }
};

const addMovieScene = new Scenes.WizardScene(
    'ADD_MOVIE_SCENE',
    // Step 0: Ask for Video
    async (ctx) => {
        try {
            const nextCode = await generateMovieCode();
            ctx.wizard.state.autoCode = nextCode;

            await ctx.reply(`🎬 <b>Kino qo'shish (Tezkor Rejim)</b>\n\nIltimos, kinoning <b>VIDEO</b> faylini yuboring:\n\n<i>Kino kodi: <code>${nextCode}</code></i>`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
                ])
            });
            return ctx.wizard.next();
        } catch (e) {
            logger.error('Add movie step 0 error:', e);
            await ctx.reply('❌ Xatolik yuz berdi.').catch(() => { });
            return ctx.scene.leave();
        }
    },
    // Step 1: Receive Video, Ask for Poster
    async (ctx) => {
        try {
            if (ctx.message?.video) {
                ctx.wizard.state.fileId = ctx.message.video.file_id;
            } else if (ctx.message?.document) {
                ctx.wizard.state.fileId = ctx.message.document.file_id;
            } else {
                return ctx.reply('⚠️ Iltimos, faqat video fayl yuboring.');
            }

            await ctx.reply('🖼️ Ajoyib! Endi kinoning <b>POSTERINI</b> (rasmini) yuboring:');
            return ctx.wizard.next();
        } catch (e) {
            logger.error('Add movie step 1 error:', e);
            return ctx.scene.leave();
        }
    },
    // Step 2: Receive Poster, Ask for VIP restriction
    async (ctx) => {
        try {
            if (!ctx.message?.photo) {
                return ctx.reply('⚠️ Iltimos, rasm yuboring.');
            }

            // Get highest resolution photo
            ctx.wizard.state.poster = ctx.message.photo[ctx.message.photo.length - 1].file_id;

            await ctx.reply('🔒 <b>VIP Himoyasi:</b>\n\nBu kino barcha uchun ochiq (lekin saqlash faqat VIP uchun) bo\'lsinmi yoki umuman yopiq (qat\'iy himoya) bo\'lsinmi?', {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔓 Standart himoya', 'restrict_false')],
                    [Markup.button.callback('🔐 Qat\'iy himoya', 'restrict_true')],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
                ])
            });
            return ctx.wizard.next();
        } catch (e) {
            logger.error('Add movie step 2 error:', e);
            return ctx.scene.leave();
        }
    },
    // Step 3: Save Movie
    async (ctx) => {
        try {
            if (ctx.callbackQuery) {
                ctx.wizard.state.isRestricted = ctx.callbackQuery.data === 'restrict_true';
                await ctx.answerCbQuery().catch(() => { });
            }

            const movieData = {
                title: `Kino #${ctx.wizard.state.autoCode}`, // Tushunarsiz nom o'rniga faqat KOD saqlanadi
                code: ctx.wizard.state.autoCode,
                year: new Date().getFullYear(),
                genre: 'Kino',
                description: '',
                fileId: ctx.wizard.state.fileId,
                link: '',
                poster: ctx.wizard.state.poster,
                isRestricted: ctx.wizard.state.isRestricted || false
            };

            const movie = await createMovie(movieData);

            await ctx.replyWithPhoto(movie.poster, {
                caption: `✅ <b>Kino muvaffaqiyatli saqlandi!</b>\n\n🎬 <b>Kino kodi:</b> <code>${movie.code}</code>\n🔒 VIP Himoya: ${movie.isRestricted ? "Qat'iy" : "Standart"}\n\n<i>Kino kanalga va barcha foydalanuvchilarga yuborilmoqda...</i>`,
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Yana Kino Qo\'shish', 'add_another_movie')],
                    [Markup.button.callback('🏠 Menyuga qaytish', 'cancel_add')]
                ])
            });

            // 🚀 AUTO BROADCAST TO ALL USERS
            const users = await import('../models/User.js').then(m => m.default.find({ isBanned: false }));
            if (users) {
                const userCaption = `✨ <b>Bazamizga yangi kino qo'shildi!</b>\n\n📥 <b>Kinoni ko'rish uchun quyidagi kodni botga yuboring:</b>\n\n👉 <code>${movie.code}</code>`;
                
                (async () => {
                    for (let i = 0; i < users.length; i++) {
                        const uid = users[i].telegramId;
                        try {
                            await ctx.telegram.sendPhoto(uid, movie.poster, {
                                caption: userCaption,
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard([[Markup.button.url('📥 Kinoni Ko\'rish', `https://t.me/${ctx.botInfo.username}?start=${movie.code}`)]])
                            });
                        } catch (e) { }
                        await new Promise(r => setTimeout(r, 40));
                    }
                })();
            }

            // 📡 AUTO POST TO CHANNEL
            const autoPostConfig = await Config.findOne({ key: 'AUTO_POST_ENABLED' });
            const channelIdConfig = await Config.findOne({ key: 'CHANNEL_ID' });

            const isAutoPostEnabled = autoPostConfig ? autoPostConfig.value : false;
            const targetChannelId = (channelIdConfig && channelIdConfig.value) ? channelIdConfig.value : process.env.CHANNEL_ID;

            if (isAutoPostEnabled && targetChannelId) {
                try {
                    const channelCaption = `🎬 <b>Yangi Kino qo'shildi!</b>\n\n📥 <b>Kino kodi:</b> <code>${movie.code}</code>\n\n🤖 <b>Bot orqali ko'rish:</b> @${ctx.botInfo.username}`;

                    await ctx.telegram.sendPhoto(targetChannelId, movie.poster, {
                        caption: channelCaption,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[Markup.button.url('📥 Kinoni Yuklash', `https://t.me/${ctx.botInfo.username}?start=${movie.code}`)]])
                    });
                    await ctx.reply('✅ <b>Kanalga avto-post joylandi!</b>', { parse_mode: 'HTML' });
                } catch (chErr) {
                    await ctx.reply('⚠️ Kanalga post joylashda xatolik: ' + chErr.message);
                }
            }

            return; // Wait for admin action
        } catch (err) {
            logger.error('Save movie error:', err);
            await ctx.reply('❌ Saqlashda xatolik yuz berdi.').catch(() => { });
            return ctx.scene.leave();
        }
    }
);

// Auto Add Another handler
addMovieScene.action('add_another_movie', async (ctx) => {
    try {
        await ctx.answerCbQuery().catch(()=>{});
        ctx.wizard.state = {}; // Tizimni tozalash
        
        let nextCode;
        try {
            const lastMovie = await import('../models/Movie.js').then(m => m.default.findOne().sort({ code: -1 }));
            nextCode = lastMovie ? lastMovie.code + 1 : 1001;
        } catch (e) {
            nextCode = Math.floor(Math.random() * 9000) + 1000;
        }
        ctx.wizard.state.autoCode = nextCode;
        
        await ctx.reply(`🎬 <b>Kino qo'shish (Tezkor Rejim)</b>\n\nIltimos, kinoning <b>VIDEO</b> faylini yuboring:\n\n<i>Kino kodi: <code>${nextCode}</code></i>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
            ])
        });
        
        ctx.wizard.selectStep(1); 
    } catch (e) {
        logger.error('add_another action:', e);
    }
});

addMovieScene.action('cancel_add', async (ctx) => {
    try {
        await ctx.editMessageText('❌ Kino qo\'shish bekor qilindi.');
        return ctx.scene.leave();
    } catch (e) {
        return ctx.scene.leave();
    }
});

addMovieScene.command('cancel', async (ctx) => {
    try {
        await ctx.reply('❌ Kino qo\'shish bekor qilindi.');
        return ctx.scene.leave();
    } catch (e) {
        return ctx.scene.leave();
    }
});

export default addMovieScene;
