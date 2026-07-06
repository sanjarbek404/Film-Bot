import https from 'https';

/**
 * Searches for movie metadata using the iTunes Search API (Free, no token, no limits)
 * @param {string} title - The movie title to search for
 * @returns {Promise<Object|null>}
 */
export const searchMovie = (title) => {
    return new Promise((resolve) => {
        if (!title || title.trim().length === 0) {
            return resolve(null);
        }

        const query = encodeURIComponent(title.trim());
        const url = `https://itunes.apple.com/search?term=${query}&entity=movie&limit=1`;

        https.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.resultCount > 0) {
                        const movie = json.results[0];
                        // iTunes returns small artwork (100x100), we can hack the URL to get a better resolution (e.g. 600x600)
                        const highResArtwork = movie.artworkUrl100 ? movie.artworkUrl100.replace('100x100bb', '600x900bb') : null;
                        
                        const releaseYear = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;
                        
                        // Map primaryGenreName to our simple genres if needed, or just use it directly
                        const genre = movie.primaryGenreName || 'Kino';

                        resolve({
                            title: movie.trackName,
                            year: releaseYear,
                            genre: genre,
                            poster: highResArtwork,
                            description: movie.longDescription || movie.shortDescription || ''
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    console.error('JSON parse error in movieFetcher:', e);
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error('iTunes API error:', err);
            resolve(null);
        });
    });
};
