import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './src/config/db.js';
import bot from './src/bot/bot.js';
import { getAllMoviesLite } from './src/services/movieService.js';
import User from './src/models/User.js';
import Favorite from './src/models/Favorite.js';

dotenv.config();

const startBot = async () => {
    try {
        const app = express();
        const PORT = process.env.PORT || 3000;
        
        // Wait for DB Connection before starting bot
        try {
            await connectDB();
            console.log('✅ Database connected');
        } catch (err) {
            console.error('❌ Database connection failed:', err.message);
            console.error('⚠️ Bot will start but DB features may not work');
        }

        // Add Commands definition
        try {
            await bot.telegram.setMyCommands([
                { command: 'start', description: 'Bosh Menyu (Restart)' },
                { command: 'help', description: 'Yordam' }
            ]);
            console.log('✅ Commands menu updated successfully');
        } catch (e) {
            console.log('❌ Commands update error:', e.message);
        }

        app.get('/', (req, res) => {
            res.send('🎥 FilmXBot is running...');
        });

        app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date() });
        });

        app.use(express.json());

        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        app.use('/webapp', express.static('public', {
            maxAge: '1d',
            setHeaders: (res, pathStr) => {
                if (pathStr.endsWith('.html')) {
                    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
                }
            }
        }));

        // SPA Fallback for Web App (Express v5 compatible routing)
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        app.use('/webapp', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        app.get('/api/image/:fileId', async (req, res) => {
            try {
                const fileId = req.params.fileId;
                if (fileId.startsWith('http')) {
                    return res.redirect(fileId);
                }
                const link = await bot.telegram.getFileLink(fileId);
                
                const https = await import('https');
                https.get(link.href, (response) => {
                    if (response.statusCode !== 200) {
                        return res.status(404).send('Not found');
                    }
                    res.set('Content-Type', response.headers['content-type']);
                    res.set('Cache-Control', 'public, max-age=864000'); // Cache for 10 days
                    response.pipe(res);
                }).on('error', () => {
                    res.status(500).send('Proxy error');
                });
            } catch (e) {
                res.status(404).send('Image not found');
            }
        });

        app.get('/api/movies', async (req, res) => {
            try {
                const movies = await getAllMoviesLite();
                res.json(movies);
            } catch (e) {
                res.status(500).json({ error: 'Server error' });
            }
        });

        // ═══ FAVORITES SYNC API ═══
        app.get('/api/favorites/:telegramId', async (req, res) => {
            try {
                const user = await User.findOne({ telegramId: req.params.telegramId });
                if (!user) return res.json([]);
                const favs = await Favorite.find({ user: user._id }).populate('movie');
                res.json(favs.map(f => f.movie).filter(m => m));
            } catch (e) {
                console.error(e);
                res.status(500).json({ error: 'Server error' });
            }
        });

        app.post('/api/favorites/toggle', async (req, res) => {
            try {
                const { userId, movieId } = req.body;
                if (!userId || !movieId) return res.status(400).json({ error: 'Missing data' });
                
                const user = await User.findOne({ telegramId: userId });
                if (!user) return res.status(404).json({ error: 'User not found' });
                
                const exists = await Favorite.findOne({ user: user._id, movie: movieId });
                if (exists) {
                    await Favorite.findOneAndDelete({ user: user._id, movie: movieId });
                    res.json({ status: 'removed' });
                } else {
                    await Favorite.create({ user: user._id, movie: movieId });
                    res.json({ status: 'added' });
                }
            } catch (e) {
                console.error(e);
                res.status(500).json({ error: 'Server error' });
            }
        });

        const domain = process.env.RENDER_EXTERNAL_URL;
        
        if (domain) {
            const webhookPath = `/telegraf/${bot.secretPathComponent()}`;
            app.use(bot.webhookCallback(webhookPath));
            
            app.listen(PORT, async () => {
                console.log(`🌐 Server (Webhook) running on port ${PORT}`);
                try {
                    await bot.telegram.setWebhook(`${domain}${webhookPath}`);
                    console.log('🤖 Bot webhook configured successfully!');
                } catch (e) {
                    console.error('❌ Webhook setup failed:', e.message);
                }
            });
        } else {
            app.listen(PORT, () => {
                console.log(`🌐 Server (Polling) running on port ${PORT}`);
            });
            
            try {
                await bot.launch();
                console.log('🤖 Bot started successfully! (Long Polling)');
            } catch (err) {
                console.error('❌ Bot startup failed:', err.message);
            }
        }
        
    } catch (err) {
        console.error('❌ Startup failed:', err);
    }
};

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
