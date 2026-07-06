import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Hash, X, Home, Compass, ArrowLeft, Heart, ArrowUp } from 'lucide-react';

const WebApp = window.Telegram.WebApp;

function App() {
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedCategory, setSelectedCategory] = useState('Barchasi');
  
  // Favs and Infinite Scroll
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('favs') || '[]'));
  const [visibleCount, setVisibleCount] = useState(15);
  const scrollObserver = useRef();
  
  // New UI states
  const [heroIndex, setHeroIndex] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  const userId = WebApp.initDataUnsafe?.user?.id;

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (WebApp.HapticFeedback) WebApp.HapticFeedback.impactOccurred('light');
  };

  useEffect(() => {
    localStorage.setItem('favs', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (e, movie) => {
    e.stopPropagation();
    if (WebApp.HapticFeedback) WebApp.HapticFeedback.impactOccurred('light');
    
    // Optimistic Update
    setFavorites(prev => {
      const isFav = prev.some(f => f.code === movie.code);
      if (isFav) return prev.filter(f => f.code !== movie.code);
      return [...prev, movie];
    });

    // API Sync
    if (userId && movie._id) {
      fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, movieId: movie._id })
      }).catch(err => console.error('Fav sync err:', err));
    }
  };

  const loadMoreRef = useCallback(node => {
    if (loading) return;
    if (scrollObserver.current) scrollObserver.current.disconnect();
    scrollObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + 15);
      }
    });
    if (node) scrollObserver.current.observe(node);
  }, [loading]);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    
    // Set minimal theme variables
    document.documentElement.style.setProperty('--tg-theme-bg-color', WebApp.themeParams.bg_color || '#000000');
    document.documentElement.style.setProperty('--tg-theme-text-color', WebApp.themeParams.text_color || '#ffffff');

    fetch('/api/movies')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMovies(data);
        } else {
          setMovies([]);
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });

    if (userId) {
      fetch(`/api/favorites/${userId}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setFavorites(data);
          }
        })
        .catch(e => console.error('Load favs error:', e));
    }
  }, [userId]);

  const handleSelect = (movie) => {
    if (WebApp.HapticFeedback) WebApp.HapticFeedback.impactOccurred('medium');
    setToast(`${movie.code}`);
    
    WebApp.sendData(JSON.stringify({
      action: 'play_movie',
      code: movie.code
    }));

    setTimeout(() => {
      setToast('');
      WebApp.close();
    }, 1200);
  };

  const filteredMovies = useMemo(() => {
    if (!search) return [];
    const term = search.toLowerCase();
    const results = movies.filter(m => m && (
      (m.title && m.title.toLowerCase().includes(term)) || 
      (m.code && m.code.toString().includes(term))
    ));
    return results.slice(0, 40); // 40 tadan ko'pini ko'rsatmaymiz (qotib qolmasligi uchun)
  }, [movies, search]);

  // Compute categories
  const newMovies = useMemo(() => [...movies].reverse().slice(0, 15), [movies]);
  const topMovies = useMemo(() => [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 15), [movies]);
  
  useEffect(() => {
    if (topMovies.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % Math.min(topMovies.length, 5));
    }, 5000);
    return () => clearInterval(interval);
  }, [topMovies]);
  
  const featuredMovie = useMemo(() => topMovies.length > 0 ? topMovies[heroIndex] : null, [topMovies, heroIndex]);

  // Dynamic Genres
  const genres = useMemo(() => {
    const genreSet = new Set();
    movies.forEach(m => {
      if (m.genre && m.genre.trim() !== '' && m.genre !== 'Noma\'lum') {
        const parts = m.genre.split(',').map(g => g.trim());
        parts.forEach(p => {
          if (p) genreSet.add(p);
        });
      }
    });
    return ['Barchasi', ...Array.from(genreSet)].slice(0, 15);
  }, [movies]);

  const getGenreEmoji = (genre) => {
    const g = genre.toLowerCase();
    if (g.includes('jangari') || g.includes('boevik')) return '💥';
    if (g.includes('komediya')) return '😂';
    if (g.includes('fantastika')) return '🛸';
    if (g.includes('qorqinchli') || g.includes('dahshat')) return '👻';
    if (g.includes('drama')) return '🎭';
    if (g.includes('melodrama')) return '💔';
    if (g.includes('multfilm') || g.includes('animatsiya')) return '🦁';
    if (g.includes('sarguzasht')) return '🗺️';
    if (g.includes('kriminal')) return '🕵️';
    if (g.includes('triller')) return '🔪';
    if (g.includes('tarixiy')) return '📜';
    return '🍿';
  };

  const categoryMovies = useMemo(() => {
    if (selectedCategory === 'Barchasi') return [];
    return movies.filter(m => m.genre && m.genre.includes(selectedCategory)).slice(0, 50);
  }, [movies, selectedCategory]);

  const featuredTitle = useMemo(() => {
    if (!featuredMovie) return '';
    return featuredMovie.title && !featuredMovie.title.startsWith('Kino #') 
      ? featuredMovie.title 
      : `Kino #${featuredMovie.code}`;
  }, [featuredMovie]);

  const getEpisodeNumber = (title) => {
    if (!title) return null;
    const match = title.match(/- (\d+)-qism/i);
    return match ? match[1] : null;
  };

  const renderMovieCard = (movie, index, isTop10 = false, rank = 0) => {
    const imgUrl = movie.poster && movie.poster.startsWith('http') ? movie.poster : `/api/image/${movie.poster}`;
    const episode = getEpisodeNumber(movie.title);
    
    const displayTitle = movie.title && !movie.title.startsWith('Kino #') ? movie.title : `Kino #${movie.code}`;
    const isFav = favorites.some(f => f.code === movie.code);
    
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
        whileTap={{ scale: 0.95 }}
        key={movie._id || movie.code} 
        className={`flex-none flex flex-col relative group cursor-pointer snap-start gap-1.5 ${isTop10 ? 'w-40 md:w-48 ml-4' : 'w-32 md:w-40'}`}
        onClick={() => handleSelect(movie)}
      >
        <div className="relative overflow-hidden rounded-2xl shadow-xl border border-white/10 bg-zinc-900 aspect-[2/3] w-full">
          <img src={imgUrl} alt="Movie" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
          
          {/* Favorite Button */}
          <button 
            onClick={(e) => toggleFavorite(e, movie)}
            className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 transition-transform active:scale-90 z-20"
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </button>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
            <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.6)] transform scale-75 group-hover:scale-100 transition-transform duration-300">
              <Play className="w-5 h-5 text-white ml-1" />
            </div>
          </div>
          {/* Top Badges */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end">
            <div className="bg-black/40 backdrop-blur-xl px-2 py-1 rounded-lg text-[10px] font-bold text-white/90 flex items-center gap-1 border border-white/20 shadow-lg">
              <Hash className="w-3 h-3 text-red-500" />
              {movie.code}
            </div>
            {episode && (
              <div className="bg-red-600/90 backdrop-blur-xl px-2.5 py-1 rounded-lg text-[10px] font-black text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] border border-red-400/30">
                {episode}-QISM
              </div>
            )}
          </div>
        </div>
        
        {/* Netflix Top 10 Number */}
        {isTop10 && (
          <span 
            className="absolute -left-6 -bottom-8 text-[120px] font-black italic z-20 text-black/80 tracking-tighter drop-shadow-2xl" 
            style={{ WebkitTextStroke: '3px rgba(255,255,255,0.9)' }}
          >
            {rank}
          </span>
        )}

        {/* Title below poster */}
        <div className={`px-1 pt-0.5 ${isTop10 ? 'pl-6' : ''}`}>
          <h3 className="text-gray-100 text-sm font-medium truncate w-full group-hover:text-red-400 transition-colors" title={displayTitle}>
            {displayTitle}
          </h3>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium mt-0.5">
            {movie.year && <span>{movie.year}</span>}
            {movie.year && movie.genre && movie.genre !== 'Noma\'lum' && <span>•</span>}
            {movie.genre && movie.genre !== 'Noma\'lum' && <span className="truncate">{movie.genre.split(',')[0]}</span>}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-600 pb-20">
      
      {/* Top Navigation */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${isSearchActive || search ? 'bg-black/90 backdrop-blur-md' : 'bg-gradient-to-b from-black/80 to-transparent'} p-4`}>
        <div className="flex justify-between items-center max-w-5xl mx-auto gap-4">
          {!isSearchActive && !search && (
            <h1 className="text-3xl font-extrabold text-red-600 tracking-tighter drop-shadow-md">FILMX</h1>
          )}
          
          <div className={`relative flex-1 ${isSearchActive || search ? 'flex' : 'hidden md:flex justify-end'}`}>
            <div className={`relative flex items-center w-full ${isSearchActive || search ? 'max-w-full' : 'max-w-[200px]'}`}>
              <Search className="absolute left-3 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="Kod yoki nom bilan izlang..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsSearchActive(true)}
                className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white text-sm rounded-2xl pl-10 pr-10 py-2.5 focus:outline-none focus:border-red-500/50 focus:bg-white/15 focus:ring-2 focus:ring-red-500/30 transition-all shadow-xl placeholder-gray-400"
              />
              {(search || isSearchActive) && (
                <button 
                  onClick={() => { setSearch(''); setIsSearchActive(false); }}
                  className="absolute right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4 text-white/80" />
                </button>
              )}
            </div>
          </div>
          
          {!isSearchActive && !search && (
            <button onClick={() => setIsSearchActive(true)} className="md:hidden p-2 bg-zinc-900/80 rounded-full border border-zinc-800">
              <Search className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      {loading ? (
        <main className="pb-24 pt-20 px-4 max-w-5xl mx-auto">
          {/* Skeleton Hero */}
          <div className="w-full h-[60vh] bg-zinc-900 animate-pulse rounded-[2rem] mb-8 border border-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
          </div>
          <div className="space-y-6">
            <div className="w-48 h-6 bg-zinc-900 animate-pulse rounded-full ml-4"></div>
            <div className="flex gap-4 overflow-hidden px-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex-none flex flex-col gap-2 w-32 md:w-40">
                  <div className="aspect-[2/3] w-full bg-zinc-900 animate-pulse rounded-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                  </div>
                  <div className="w-3/4 h-3 bg-zinc-900 animate-pulse rounded"></div>
                  <div className="w-1/2 h-2 bg-zinc-900 animate-pulse rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : activeTab === 'favorites' ? (
        <main className="pt-24 px-4 max-w-5xl mx-auto min-h-screen">
          <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" /> Sevimli Kinolarim
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pb-10">
            {favorites.length > 0 ? (
              favorites.map((movie, idx) => renderMovieCard(movie, idx))
            ) : (
              <div className="col-span-full py-20 text-center text-gray-500">
                <Heart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Hali hech narsa saqlamadingiz</p>
              </div>
            )}
          </div>
        </main>
      ) : search || isSearchActive ? (
        /* Search Results Grid */
        <main className="pt-24 px-4 max-w-5xl mx-auto min-h-screen">
          {search === '' ? (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">🔥 Trenddagi Izlashlar</h2>
              <div className="flex flex-wrap gap-2">
                {['💥 Jangari', '😂 Komediya', '🛸 Fantastika', '👻 Qo\'rqinchli', '2023', '2024'].map(tag => (
                  <button 
                    key={tag} 
                    onClick={() => {
                      const val = tag.replace(/[^a-zA-Z0-9' ]/g, '').trim(); 
                      setSearch(val);
                    }}
                    className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-sm font-bold text-gray-200 border border-white/10 active:scale-95 transition-all hover:bg-white/20"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-xl font-bold mb-4 text-gray-300">Natijalar: {filteredMovies.length} ta</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pb-10">
                {filteredMovies.slice(0, visibleCount).length > 0 ? (
                  filteredMovies.slice(0, visibleCount).map((movie, idx) => {
                    if (idx === filteredMovies.slice(0, visibleCount).length - 1) {
                      return <div ref={loadMoreRef} key={movie.code}>{renderMovieCard(movie, idx)}</div>
                    }
                    return renderMovieCard(movie, idx);
                  })
                ) : (
                  <div className="col-span-full py-20 text-center text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Hech narsa topilmadi</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      ) : (
        /* Netflix Home Layout */
        <main className="pb-10">
          {/* Hero Banner Carousel */}
          {featuredMovie && (
            <div className="relative w-full h-[60vh] md:h-[70vh] flex items-end overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={featuredMovie._id || featuredMovie.code}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-0"
                >
                  <img 
                    src={featuredMovie.poster && featuredMovie.poster.startsWith('http') ? featuredMovie.poster : `/api/image/${featuredMovie.poster}`} 
                    alt="Featured" 
                    className="w-full h-full object-cover object-center"
                  />
                  {/* Netflix Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent"></div>
                </motion.div>
              </AnimatePresence>
              
              <div className="relative z-10 p-6 md:p-12 w-full max-w-5xl mx-auto flex flex-col justify-end h-full">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-2 mb-3"
                >
                  <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded tracking-wider shadow-[0_0_10px_rgba(220,38,38,0.5)]">TOP TAVSIYA</span>
                </motion.div>
                
                <AnimatePresence mode="wait">
                  <motion.h1 
                    key={featuredMovie._id || featuredMovie.code}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-4xl md:text-6xl font-black text-white mb-6 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] leading-tight"
                  >
                    {featuredTitle}
                  </motion.h1>
                </AnimatePresence>
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex gap-3"
                >
                  <button 
                    onClick={() => handleSelect(featuredMovie)}
                    className="flex items-center justify-center gap-2 bg-white text-black px-8 py-3 rounded-full hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all font-bold text-sm md:text-base shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                  >
                    <Play className="w-5 h-5 fill-black" />
                    Tomosha qilish
                  </button>
                </motion.div>
              </div>
            </div>
          )}

          <div className="max-w-5xl mx-auto mt-4 space-y-6">
            {/* Category Filter Chips */}
            <div className="flex overflow-x-auto gap-2 px-4 pb-2 scrollbar-hide snap-x" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {genres.map(g => (
                <button
                  key={g}
                  onClick={() => setSelectedCategory(g)}
                  className={`snap-start whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] md:text-sm font-bold border transition-all ${selectedCategory === g ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.4)] scale-105' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'}`}
                >
                  {g === 'Barchasi' ? '🎯 Barchasi' : `${getGenreEmoji(g)} ${g}`}
                </button>
              ))}
            </div>

            {selectedCategory === 'Barchasi' ? (
              <>
                {/* Yangi Kinolar Row */}
                <section>
                  <h2 className="text-lg md:text-xl font-bold text-white px-4 mb-3">Yangi Qo'shilganlar</h2>
                  <div className="flex overflow-x-auto gap-3 px-4 pb-4 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {newMovies.map((movie, idx) => renderMovieCard(movie, idx))}
                  </div>
                </section>

                {/* Top Kinolar Row */}
                <section>
                  <h2 className="text-lg md:text-xl font-bold text-white px-4 mb-3">Top Kinolar (Trendda)</h2>
                  <div className="flex overflow-x-auto gap-3 px-4 pb-4 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {topMovies.map((movie, idx) => renderMovieCard(movie, idx, true, idx + 1))}
                  </div>
                </section>
              </>
            ) : (
              <section className="animate-in fade-in duration-300 min-h-screen">
                <h2 className="text-lg md:text-xl font-bold text-white px-4 mb-4">{selectedCategory} kinolar</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 px-4 pb-10">
                  {categoryMovies.length > 0 ? (
                    categoryMovies.slice(0, visibleCount).map((movie, idx) => {
                      if (idx === categoryMovies.slice(0, visibleCount).length - 1) {
                        return <div ref={loadMoreRef} key={movie.code}>{renderMovieCard(movie, idx)}</div>
                      }
                      return renderMovieCard(movie, idx);
                    })
                  ) : (
                    <div className="col-span-full text-center text-gray-500 py-10 text-sm">
                      Bu janrda hozircha kinolar yo'q
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      )}

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-24 right-4 z-50 p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full shadow-2xl hover:bg-white/20 active:scale-95 transition-all"
          >
            <ArrowUp className="w-5 h-5 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-white px-6 py-3 rounded-full shadow-2xl text-sm font-bold z-50 whitespace-nowrap flex items-center gap-2"
          >
            <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
                <Play className="w-3 h-3 fill-white" />
            </div>
            Kino tayyorlanmoqda...
          </motion.div>
        )}
      </AnimatePresence>
      {/* Bottom Navigation */}
      <div className="fixed bottom-0 w-full bg-black/80 backdrop-blur-xl border-t border-white/10 z-50 px-8 py-3 pb-safe flex justify-between items-center text-[10px] font-bold text-gray-400">
        <button onClick={() => { setActiveTab('home'); setIsSearchActive(false); setSearch(''); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' && !isSearchActive && !search ? 'text-red-500' : 'hover:text-gray-200'}`}>
          <Home className="w-6 h-6" />
          <span>ASOSIY</span>
        </button>
        <button onClick={() => { setActiveTab('search'); setIsSearchActive(true); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' || isSearchActive || search ? 'text-red-500' : 'hover:text-gray-200'}`}>
          <Compass className="w-6 h-6" />
          <span>QIDIRUV</span>
        </button>
        <button onClick={() => { setActiveTab('favorites'); setIsSearchActive(false); setSearch(''); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'favorites' ? 'text-red-500' : 'hover:text-gray-200'}`}>
          <Heart className="w-6 h-6" />
          <span>SEVIMLILAR</span>
        </button>
      </div>

      {/* Hide scrollbar globally for this app */}
      <style dangerouslySetInnerHTML={{__html: `
        ::-webkit-scrollbar { display: none; }
        body { padding-bottom: 80px; } /* Add padding for bottom nav */
      `}} />
    </div>
  );
}

export default App;
