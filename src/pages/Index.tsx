import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Music2, Sparkles, Loader2, Music } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import MusicCard from '@/components/MusicCard';
import FiltersModal, { MusicFilters } from '@/components/FiltersModal';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { spotifyService, Track } from '@/services/spotify';

const Index = () => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [usedTrackIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<MusicFilters>({
    yearRange: [1960, new Date().getFullYear()],
    market: 'US'
  });

  const getRandomTrack = async (maxRetries = 5) => {
    setIsLoading(true);
    
    try {
      let attempts = 0;
      let track: Track;
      
      do {
        track = await spotifyService.getRecommendations(filters);
        attempts++;
        
        if (attempts >= maxRetries) {
          // If we can't find a unique track, accept duplicates to avoid infinite loop
          break;
        }
      } while (usedTrackIds.has(track.id));
      
      // Add track to used tracks to prevent duplicates
      usedTrackIds.add(track.id);
      setCurrentTrack(track);
      
      // Scroll to song card after a short delay
      setTimeout(() => {
        const songCard = document.getElementById('current-song-card');
        if (songCard) {
          songCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
      
      toast({
        title: "🎵 New Song Discovered!",
        description: `Found "${track.name}" by ${track.artists.map(a => a.name).join(', ')}`,
      });
    } catch (error) {
      console.error('Error fetching track:', error);
      toast({
        title: "Oops! Something went wrong",
        description: "Failed to fetch a song recommendation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFiltersChange = (newFilters: MusicFilters) => {
    setFilters(newFilters);
    toast({
      title: "Filters Updated",
      description: "Your music preferences have been updated!",
    });
  };

  // Auto-fetch a song on first load
  useEffect(() => {
    getRandomTrack();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pulse-beat-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl pulse-beat-delayed" />
      
      {/* Floating Musical Notes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Note 1 - Top Left */}
        <div className="absolute top-20 left-10 md:top-32 md:left-20 float-note-1">
          <Music className="w-6 h-6 md:w-8 md:h-8 text-primary/30" />
        </div>
        {/* Note 2 - Top Right */}
        <div className="absolute top-24 right-16 md:top-40 md:right-32 float-note-2">
          <Music2 className="w-4 h-4 md:w-6 md:h-6 text-accent/40" />
        </div>
        {/* Note 3 - Left Side */}
        <div className="absolute top-1/2 left-8 md:left-16 float-note-3">
          <Music className="w-5 h-5 md:w-7 md:h-7 text-primary/25" />
        </div>
        {/* Note 4 - Right Side */}
        <div className="absolute top-1/3 right-8 md:right-20 float-note-4">
          <Music2 className="w-6 h-6 md:w-8 md:h-8 text-accent/35" />
        </div>
        {/* Note 5 - Bottom Left */}
        <div className="absolute bottom-32 left-12 md:bottom-40 md:left-24 float-note-1" style={{ animationDelay: '1s' }}>
          <Music className="w-4 h-4 md:w-6 md:h-6 text-primary/20" />
        </div>
        {/* Note 6 - Bottom Right */}
        <div className="absolute bottom-28 right-20 md:bottom-36 md:right-40 float-note-3" style={{ animationDelay: '2s' }}>
          <Music2 className="w-5 h-5 md:w-7 md:h-7 text-accent/30" />
        </div>
      </div>
      
      <Header onFiltersChange={handleFiltersChange} currentFilters={filters} />
      
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto">
          {/* Large Music Icon with enhanced styling */}
          <div className="mb-8">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6">
              <div className="absolute inset-0 bg-gradient-primary rounded-full blur-lg opacity-50 pulse-beat" />
              <div className="relative w-full h-full bg-gradient-primary rounded-full flex items-center justify-center vinyl-spin glow-primary pulse-beat">
                <Music2 className="w-3/5 h-3/5 text-primary-foreground" />
              </div>
            </div>
          </div>
          
          {/* Main Title with enhanced typography */}
          <div className="mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-heading font-black bg-gradient-primary bg-clip-text text-transparent mb-4 tracking-tight leading-none">
              MELOPICK
            </h1>
            <div className="w-24 h-1 bg-gradient-primary mx-auto rounded-full" />
          </div>
          
          {/* Enhanced Subtitle */}
          <div className="mb-12">
            <p className="text-foreground/90 text-lg sm:text-xl md:text-2xl mb-2 max-w-2xl mx-auto font-medium">
              Your next favorite song is just a click away
            </p>
          </div>
          
          {/* Enhanced CTA Button */}
          <div className="mb-12">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-gradient-primary rounded-xl blur-lg opacity-50 pulse-beat" />
              <Button
                onClick={() => getRandomTrack()}
                disabled={isLoading}
                className="relative btn-hero text-base sm:text-lg px-8 py-4 h-auto w-full sm:w-auto rounded-xl font-bold shadow-primary min-w-[240px] group"
              >
                {isLoading ? (
                  <>
                    {/* Sound Wave Visualization during loading */}
                    <div className="flex items-center gap-1 mr-3">
                      <div className="w-1 bg-primary-foreground/60 sound-bar-1 rounded-full"></div>
                      <div className="w-1 bg-primary-foreground/60 sound-bar-2 rounded-full"></div>
                      <div className="w-1 bg-primary-foreground/60 sound-bar-3 rounded-full"></div>
                      <div className="w-1 bg-primary-foreground/60 sound-bar-4 rounded-full"></div>
                      <div className="w-1 bg-primary-foreground/60 sound-bar-5 rounded-full"></div>
                    </div>
                  </>
                ) : (
                  <>
                    <Music2 className="w-5 h-5 mr-3 group-hover:pulse-beat-delayed" />
                  </>
                )}
                {isLoading ? 'Finding Perfect Song...' : 'Discover Music'}
              </Button>
            </div>
          </div>

          {/* Current Track Display */}
          {currentTrack && (
            <div id="current-song-card" className="max-w-3xl mx-auto px-2 animate-fade-in mb-8">
              <MusicCard track={currentTrack} />
            </div>
          )}

          {/* Enhanced Footer */}
          <div className="text-muted-foreground text-sm px-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span>Powered by Spotify</span>
              <span>•</span>
              <span>No repeats in your session</span>
            </div>
          </div>
        </div>
      </main>

      
      <Footer />
    </div>
  );
};

export default Index;
