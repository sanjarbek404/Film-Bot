import { Scenes, Markup } from 'telegraf';
import logger from '../utils/logger.js';
import { createMovie } from '../services/movieService.js';
import { searchMovie } from '../utils/movieFetcher.js';
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

            await ctx.reply(`🎬 <b>Kino qo'shish (Tezkor Rejim)</b>\n\nIltimos, avval kinoning <b>VIDEO</b> faylini yuboring:\n\n<i>Kino kodi: <code>${nextCode}</code></i>`, {
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
    // Step 1: Receive Video, Ask for Title
    async (ctx) => {
        try {
            if (ctx.message?.video) {
                ctx.wizard.state.fileId = ctx.message.video.file_id;
            } else if (ctx.message?.document) {
                ctx.wizard.state.fileId = ctx.message.document.file_id;
            } else {
                return ctx.reply('⚠️ Iltimos, faqat video fayl yuboring.');
            }

            await ctx.reply('📝 <b>Ajoyib!</b> Endi kinoning <b>aniq nomini</b> yozib yuboring (Ma\'lumotlarni avtomatik topish uchun).\n\n<i>Yoki qidirishni xohlamasangiz, to\'g\'ridan-to\'g\'ri kinoning <b>POSTERINI</b> (rasmini) yuboring.</i>', {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
                ])
            });
            return ctx.wizard.next();
        } catch (e) {
            logger.error('Add movie step 1 error:', e);
            return ctx.scene.leave();
        }
    },
    // Step 2: Receive Title (Fetch API) OR Receive Manual Poster
    async (ctx) => {
        try {
            if (ctx.message?.photo) {
                // User sent photo directly, bypassing title
                ctx.wizard.state.aiDetails = null;
                ctx.wizard.state.poster = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                
                await ctx.reply('🔒 <b>VIP Himoyasi:</b>\n\nBu kino barcha uchun ochiq (lekin saqlash faqat VIP uchun) bo\'lsinmi yoki umuman yopiq (qat\'iy himoya) bo\'lsinmi?', {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔓 Standart himoya', 'restrict_false')],
                        [Markup.button.callback('🔐 Qat\'iy himoya', 'restrict_true')],
                        [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
                    ])
                });
                return ctx.wizard.selectStep(4);
            }

            const title = ctx.message?.text;
            if (title) {
                const searchMsg = await ctx.reply('🔍 <i>Kino ma\'lumotlari qidirilmoqda...</i>', { parse_mode: 'HTML' });
                const movieDetails = await searchMovie(title);
                
                if (movieDetails && movieDetails.poster) {
                    ctx.wizard.state.aiDetails = movieDetails;
                    await ctx.telegram.deleteMessage(ctx.chat.id, searchMsg.message_id).catch(()=>{});
                    
                    const text = `🎯 <b>Kino topildi!</b>\n\n📌 <b>Nom:</b> ${movieDetails.title}\n📅 <b>Yil:</b> ${movieDetails.year || 'Noma\'lum'}\n🎭 <b>Janr:</b> ${movieDetails.genre}\n\nUshbu ma'lumotlarni saqlaysizmi?`;
                    
                    await ctx.replyWithPhoto(movieDetails.poster, {
                        caption: text,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('✅ Ha, saqlansin', 'ai_confirm')],
                            [Markup.button.callback('❌ Yo\'q, o\'zim kiritaman', 'ai_reject')]
                        ])
                    });
                    return ctx.wizard.next(); // Go to step 3 (Confirm AI)
                } else {
                    await ctx.telegram.deleteMessage(ctx.chat.id, searchMsg.message_id).catch(()=>{});
                    await ctx.reply('ℹ️ Kino bazadan topilmadi. Iltimos, kinoning <b>POSTERINI</b> (rasmini) qo\'lda yuboring:');
                    ctx.wizard.state.aiDetails = null;
                    return ctx.wizard.selectStep(3); // Go to step 3 (which will act as manual poster step if they upload photo)
                }
            }

            return ctx.reply('Iltimos, kino nomini yozing yoki rasm yuboring.');
        } catch (e) {
            logger.error('Add movie step 2 error:', e);
            return ctx.scene.leave();
        }
    },
    // Step 3: Handle AI Confirmation OR Receive Manual Poster
    async (ctx) => {
        try {
            if (ctx.message?.photo) {
                // If they are here, it means they skipped AI or rejected AI and sent a manual poster
                ctx.wizard.state.poster = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                
                await ctx.reply('🔒 <b>VIP Himoyasi:</b>\n\nBu kino barcha uchun ochiq (lekin saqlash faqat VIP uchun) bo\'lsinmi yoki umuman yopiq (qat\'iy himoya) bo\'lsinmi?', {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔓 Standart himoya', 'restrict_false')],
                        [Markup.button.callback('🔐 Qat\'iy himoya', 'restrict_true')],
                        [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
                    ])
                });
                return ctx.wizard.selectStep(4);
            }

            if (ctx.callbackQuery) {
                const data = ctx.callbackQuery.data;
                await ctx.answerCbQuery().catch(() => {});
                
                if (data === 'ai_confirm') {
                    // Use AI details
                    const ai = ctx.wizard.state.aiDetails;
                    ctx.wizard.state.poster = ai.poster;
                    ctx.wizard.state.title = ai.title;
                    ctx.wizard.state.year = ai.year;
                    ctx.wizard.state.genre = ai.genre;
                    ctx.wizard.state.description = ai.description;
                    
                    await ctx.reply('🔒 <b>VIP Himoyasi:</b>\n\nBu kino barcha uchun ochiq (lekin saqlash faqat VIP uchun) bo\'lsinmi yoki umuman yopiq (qat\'iy himoya) bo\'lsinmi?', {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔓 Standart himoya', 'restrict_false')],
                            [Markup.button.callback('🔐 Qat\'iy himoya', 'restrict_true')],
                            [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
                        ])
                    });
                    return ctx.wizard.selectStep(4);
                } else if (data === 'ai_reject') {
                    await ctx.reply('🖼️ Iltimos, kinoning <b>POSTERINI</b> (rasmini) yuboring:');
                    // Stay on Step 3, wait for photo
                    return;
                }
            }
            
            // If they just typed text instead of sending photo
            if (ctx.message?.text && !ctx.wizard.state.aiDetails) {
                return ctx.reply('⚠️ Iltimos, rasm yuboring.');
            }
        } catch (e) {
            logger.error('Add movie step 3 error:', e);
            return ctx.scene.leave();
        }
    },
    // Step 4: Save Movie
    async (ctx) => {
        try {
            if (ctx.callbackQuery) {
                ctx.wizard.state.isRestricted = ctx.callbackQuery.data === 'restrict_true';
                await ctx.answerCbQuery().catch(() => { });
            }

            const movieData = {
                title: ctx.wizard.state.title || `Kino #${ctx.wizard.state.autoCode}`,
                code: ctx.wizard.state.autoCode,
                year: ctx.wizard.state.year || new Date().getFullYear(),
                genre: ctx.wizard.state.genre || 'Kino',
                description: ctx.wizard.state.description || '',
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
        
        await ctx.reply(`🎬 <b>Kino qo'shish (Tezkor Rejim)</b>\n\nIltimos, avval kinoning <b>VIDEO</b> faylini yuboring:\n\n<i>Kino kodi: <code>${nextCode}</code></i>`, {
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
