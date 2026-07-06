import { Markup } from 'telegraf';
import logger from './logger.js';

export const sendMainMenu = async (ctx) => {
    try {
        // Session'dagi user'dan foydalanish — qo'shimcha DB so'rov YO'Q
        const user = ctx.session?.user;
        const isVip = user && user.vipUntil && new Date(user.vipUntil) > new Date();

        const webAppUrl = process.env.RENDER_EXTERNAL_URL 
            ? `${process.env.RENDER_EXTERNAL_URL}/webapp` 
            : 'https://film-bot-ce5b.onrender.com/webapp';
        
        let menu = [
            [Markup.button.webApp('🌐 Kinolar Katalogi', webAppUrl)],
            [ctx.t('menu_search'), ctx.t('menu_cabinet')],
            [ctx.t('menu_random'), ctx.t('menu_settings') || '⚙️ Sozlamalar']
        ];

        let welcomeMsg = ctx.t('welcome', { name: ctx.from.first_name });
        if (isVip) {
            const daysLeft = Math.ceil((new Date(user.vipUntil) - new Date()) / (1000 * 60 * 60 * 24));
            welcomeMsg += `\n\n💎 <b>VIP Status:</b> Aktiv (${daysLeft} kun qoldi)`;
        }

        await ctx.reply(welcomeMsg, {
            parse_mode: 'HTML',
            ...Markup.keyboard(menu).resize()
        });

        // Zamonaviy Inline Web App tugmasi
        await ctx.reply(`🎬 <b>Yangi avlod katalogi!</b>\n\nPastdagi tugmani bosib, eng so'nggi kinolarni qulay formatda tomosha qiling:`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🔥 KINOLAR KATALOGI', webAppUrl)]
            ])
        });
    } catch (error) {
        logger.error('Send Main Menu Error:', error);
        ctx.reply(ctx.t?.('error_general') || '❌ Xatolik yuz berdi.').catch(() => {});
    }
};
