import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Hash, Info, X } from 'lucide-react';

const WebApp = window.Telegram.WebApp;

function App() {
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

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

  const filteredMovies = movies.filter(m => m && (
    (m.title && m.title.toLowerCase().includes(search.toLowerCase())) || 
    (m.code && m.code.toString().includes(search))
  ));

  // Compute categories
  const newMovies = useMemo(() => [...movies].reverse().slice(0, 15), [movies]);
  const topMovies = useMemo(() => [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 15), [movies]);
  const featuredMovie = useMemo(() => topMovies.length > 0 ? topMovies[0] : null, [topMovies]);

  const renderMovieCard = (movie, index) => {
    const imgUrl = movie.poster && movie.poster.startsWith('http') ? movie.poster : `/api/image/${movie.poster}`;
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
        whileTap={{ scale: 0.95 }}
        key={movie._id || movie.code} 
        className="flex-none w-32 md:w-40 flex flex-col relative group cursor-pointer snap-start"
        onClick={() => handleSelect(movie)}
      >
        <div className="relative overflow-hidden rounded-xl shadow-lg border border-white/5 bg-gray-900 aspect-[2/3]">
          <img src={imgUrl} alt="Movie" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Play className="w-10 h-10 text-white opacity-80" />
          </div>
          {/* Top Badges */}
          <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1 border border-white/10">
            <Hash className="w-3 h-3 text-red-500" />
            {movie.code}
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
                placeholder="Kod yoki nom bilan qidiring..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsSearchActive(true)}
                className="w-full bg-zinc-900/80 border border-zinc-700 text-white text-sm rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:border-gray-500 focus:bg-zinc-800 transition-all"
              />
              {(search || isSearchActive) && (
                <button 
                  onClick={() => { setSearch(''); setIsSearchActive(false); }}
                  className="absolute right-3 p-1 rounded-full bg-zinc-700/50 hover:bg-zinc-600"
                >
                  <X className="w-4 h-4 text-gray-300" />
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
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-12 h-12 border-4 border-zinc-800 border-t-red-600 rounded-full animate-spin"></div>
        </div>
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
              
              <div className="relative z-10 p-6 md:p-12 w-full max-w-5xl mx-auto">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm">TOP</span>
                  <span className="text-xs text-gray-300">Eng ko'p ko'rilgan</span>
                </div>
                <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
                  Kino #{featuredMovie.code}
                </h1>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleSelect(featuredMovie)}
                    className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded hover:bg-gray-200 transition font-bold"
                  >
                    <Play className="w-5 h-5 fill-black" />
                    Tomosha qilish
                  </button>
                </div>
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
      
      {/* Hide scrollbar globally for this app */}
      <style dangerouslySetInnerHTML={{__html: `
        ::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
}

export default App;
