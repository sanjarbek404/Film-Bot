import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Hash, X, Home, Compass, ArrowLeft } from 'lucide-react';

const WebApp = window.Telegram.WebApp;

function App() {
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

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
  }, []);

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
  const featuredMovie = useMemo(() => topMovies.length > 0 ? topMovies[0] : null, [topMovies]);

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

  const renderMovieCard = (movie, index) => {
    const imgUrl = movie.poster && movie.poster.startsWith('http') ? movie.poster : `/api/image/${movie.poster}`;
    const episode = getEpisodeNumber(movie.title);
    
    const displayTitle = movie.title && !movie.title.startsWith('Kino #') ? movie.title : `Kino #${movie.code}`;
    
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
        whileTap={{ scale: 0.95 }}
        key={movie._id || movie.code} 
        className="flex-none w-32 md:w-40 flex flex-col relative group cursor-pointer snap-start gap-1.5"
        onClick={() => handleSelect(movie)}
      >
        <div className="relative overflow-hidden rounded-2xl shadow-xl border border-white/10 bg-zinc-900 aspect-[2/3] w-full">
          <img src={imgUrl} alt="Movie" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
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
        
        {/* Title below poster */}
        <div className="px-1 pt-0.5">
          <h3 className="text-gray-100 text-sm font-medium truncate w-full group-hover:text-red-400 transition-colors" title={displayTitle}>
            {displayTitle}
          </h3>
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
          <div className="w-full h-[60vh] bg-zinc-900/50 animate-pulse rounded-[2rem] mb-8 border border-white/5"></div>
          <div className="space-y-4">
            <div className="w-48 h-6 bg-zinc-900/50 animate-pulse rounded-full ml-4"></div>
            <div className="flex gap-4 overflow-hidden px-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="w-32 md:w-40 aspect-[2/3] bg-zinc-900/50 animate-pulse rounded-2xl flex-none border border-white/5"></div>)}
            </div>
          </div>
        </main>
      ) : search || isSearchActive ? (
        /* Search Results Grid */
        <main className="pt-24 px-4 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold mb-4 text-gray-300">Qidiruv natijalari</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {filteredMovies.length > 0 ? (
              filteredMovies.map((movie, idx) => renderMovieCard(movie, idx))
            ) : (
              <div className="col-span-full py-20 text-center text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Hech narsa topilmadi</p>
              </div>
            )}
          </div>
        </main>
      ) : (
        /* Netflix Home Layout */
        <main className="pb-10">
          {/* Hero Banner */}
          {featuredMovie && (
            <div className="relative w-full h-[60vh] md:h-[70vh] flex items-end">
              <div className="absolute inset-0">
                <img 
                  src={featuredMovie.poster && featuredMovie.poster.startsWith('http') ? featuredMovie.poster : `/api/image/${featuredMovie.poster}`} 
                  alt="Featured" 
                  className="w-full h-full object-cover object-center"
                />
                {/* Netflix Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent"></div>
              </div>
              
              <div className="relative z-10 p-6 md:p-12 w-full max-w-5xl mx-auto flex flex-col justify-end h-full">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-2 mb-3"
                >
                  <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded tracking-wider shadow-[0_0_10px_rgba(220,38,38,0.5)]">TOP TAVSIYA</span>
                </motion.div>
                
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl md:text-6xl font-black text-white mb-6 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] leading-tight"
                >
                  {featuredTitle}
                </motion.h1>
                
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

          <div className="max-w-5xl mx-auto mt-6 space-y-8">
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
                {topMovies.map((movie, idx) => renderMovieCard(movie, idx))}
              </div>
            </section>
          </div>
        </main>
      )}

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
        <button onClick={() => { setActiveTab('home'); setIsSearchActive(false); setSearch(''); }} className={`flex flex-col items-center gap-1 transition-colors ${!isSearchActive && !search ? 'text-red-500' : 'hover:text-gray-200'}`}>
          <Home className="w-6 h-6" />
          <span>ASOSIY</span>
        </button>
        <button onClick={() => { setActiveTab('search'); setIsSearchActive(true); }} className={`flex flex-col items-center gap-1 transition-colors ${isSearchActive || search ? 'text-red-500' : 'hover:text-gray-200'}`}>
          <Compass className="w-6 h-6" />
          <span>QIDIRUV</span>
        </button>
        <button onClick={() => WebApp.close()} className="flex flex-col items-center gap-1 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-6 h-6" />
          <span>CHIQISH</span>
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
