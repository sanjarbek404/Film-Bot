import Movie from '../models/Movie.js';
import logger from '../utils/logger.js';
import myCache from '../utils/cache.js';

export const createMovie = async (movieData) => {
    try {
        myCache.del('new_movies');
        myCache.del('movie_count');
        myCache.keys().filter(k => k.startsWith('top_movies')).forEach(k => myCache.del(k));
        return await Movie.create(movieData);
    } catch (error) {
        logger.error('Create movie error:', error);
        throw error;
    }
};

export const getMovieByCode = async (code) => {
    try {
        const cacheKey = `movie_${code}`;
        let cached = myCache.get(cacheKey);
        if (cached) return cached;

        const movie = await Movie.findOne({ code }).lean();
        if (movie) myCache.set(cacheKey, movie, 300);
        return movie;
    } catch (error) {
        logger.error('Get movie by code error:', error);
        return null;
    }
};

export const searchMovies = async (query) => {
    try {
        const cacheKey = `search_${query.toLowerCase().substring(0, 30)}`;
        let cached = myCache.get(cacheKey);
        if (cached) return cached;

        let movies = await Movie.find(
            { $text: { $search: query } },
            { score: { $meta: "textScore" } }
        ).sort({ score: { $meta: "textScore" } }).limit(50).lean();

        if (!movies || movies.length === 0) {
            movies = await Movie.find({ title: { $regex: query, $options: 'i' } }).limit(50).lean();
        }

        if (movies && movies.length > 0) myCache.set(cacheKey, movies, 60);
        return movies || [];
    } catch (error) {
        try {
            return await Movie.find({ title: { $regex: query, $options: 'i' } }).limit(20).lean();
        } catch (e) {
            logger.error('Search movies error:', e);
            return [];
        }
    }
};

export const deleteMovie = async (code) => {
    try {
        myCache.del(`movie_${code}`);
        myCache.del('new_movies');
        myCache.del('movie_count');
        return await Movie.findOneAndDelete({ code });
    } catch (error) {
        logger.error('Delete movie error:', error);
        return null;
    }
};

export const getNewMovies = async (limit = 10) => {
    try {
        const cacheKey = 'new_movies';
        let cached = myCache.get(cacheKey);
        if (cached) return cached.slice(0, limit);

        const movies = await Movie.find().sort({ createdAt: -1 }).limit(20).lean();
        if (movies) myCache.set(cacheKey, movies, 120);
        return movies ? movies.slice(0, limit) : [];
    } catch (error) {
        logger.error('Get new movies error:', error);
        return [];
    }
};

export const getAllMovies = async () => {
    return getNewMovies(20);
};

export const countMovies = async () => {
    try {
        const cacheKey = 'movie_count';
        let cached = myCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const count = await Movie.estimatedDocumentCount();
        myCache.set(cacheKey, count, 300);
        return count;
    } catch (error) {
        logger.error('Count movies error:', error);
        return 0;
    }
};

export const getTopMovies = async (limit = 10) => {
    try {
        const cacheKey = `top_movies_${limit}`;
        let cached = myCache.get(cacheKey);
        if (cached) return cached;

        const movies = await Movie.find().sort({ views: -1 }).limit(limit).lean();
        if (movies) myCache.set(cacheKey, movies, 300);
        return movies;
    } catch (error) {
        logger.error('Get top movies error:', error);
        return [];
    }
};

export const getMoviesByGenre = async (genre) => {
    try {
        const cacheKey = `genre_${genre}`;
        let cached = myCache.get(cacheKey);
        if (cached) return cached;

        const movies = await Movie.find({ genre: { $regex: genre, $options: 'i' } }).lean();
        if (movies) myCache.set(cacheKey, movies, 300);
        return movies;
    } catch (error) {
        logger.error('Get movies by genre error:', error);
        return [];
    }
};

export const updateMovie = async (code, data) => {
    try {
        myCache.del(`movie_${code}`);
        return await Movie.findOneAndUpdate({ code }, data, { new: true });
    } catch (error) {
        logger.error('Update movie error:', error);
        return null;
    }
};
