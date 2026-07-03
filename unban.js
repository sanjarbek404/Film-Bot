import connectDB from './src/config/db.js';
import User from './src/models/User.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const unbanAll = async () => {
    try {
        await connectDB();
        const res = await User.updateMany({ isBanned: true }, { isBanned: false, bannedUntil: null });
        console.log('Unbanned users count:', res.modifiedCount);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

unbanAll();
