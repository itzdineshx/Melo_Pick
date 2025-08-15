import { Music, Play, ExternalLink, Clock, Calendar, Star, Heart, Headphones, Volume2, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';

interface Track {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date: string;
  };
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
  explicit: boolean;
  language?: string;
}

interface MusicCardProps {
  track: Track;
}

export default function MusicCard({ track }: MusicCardProps) {
  const { toggleFavorite, isFavorite } = useFavorites();
  const isTrackFavorite = isFavorite(track.id);

  const handleToggleFavorite = () => {
    const wasAdded = toggleFavorite(track);
    
    toast({
      title: wasAdded ? "💖 Added to Favorites" : "💔 Removed from Favorites",
      description: wasAdded 
        ? `"${track.name}" saved to your favorites`
        : `"${track.name}" removed from favorites`,
    });
  };

  const getStreamingLinks = () => {
    const artistNames = track.artists.map(a => a.name).join(' ');
    const searchQuery = encodeURIComponent(`${artistNames} ${track.name}`);
    const cleanQuery = encodeURIComponent(`${track.name} ${artistNames}`);
    
    return {
      spotify: track.external_urls.spotify,
      youtubeMusic: `https://music.youtube.com/search?q=${searchQuery}`,
      appleMusic: `https://music.apple.com/search?term=${cleanQuery}`,
    };
  };
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${parseInt(seconds) < 10 ? '0' : ''}${seconds}`;
  };

  const formatYear = (dateString: string) => {
    return new Date(dateString).getFullYear();
  };

  const getCoverImage = () => {
    if (track.album.images && track.album.images.length > 0) {
      return track.album.images[0].url;
    }
    return '/placeholder.svg';
  };

  const getLanguageName = (code?: string) => {
    const languageMap: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'ta': 'Tamil',
      'te': 'Telugu',
      'bn': 'Bengali',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi',
      'or': 'Odia',
      'as': 'Assamese',
      'ur': 'Urdu',
      'ru': 'Russian'
    };
    return languageMap[code || 'en'] || 'Unknown';
  };

  return (
    <div className="music-card bg-gradient-card backdrop-blur-sm rounded-2xl border border-border/50 animate-fade-in overflow-hidden shadow-card glow-accent hover:glow-primary transition-all duration-500">
      <div className="flex flex-col md:flex-row min-h-[400px]">
        {/* Enhanced Album Cover */}
        <div className="flex-shrink-0 relative md:w-80 lg:w-96">
          <div className="relative group overflow-hidden h-full min-h-[300px] md:min-h-[400px]">
            <div className="absolute inset-0 bg-gradient-primary opacity-20 blur-sm" />
            <img 
              src={getCoverImage()} 
              alt={`${track.album.name} cover`}
              className="w-full h-full object-cover relative z-10 group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 z-20" />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-30">
              <div className="bg-primary/90 backdrop-blur-sm rounded-full p-4 vinyl-spin">
                <Music className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            {/* Floating music notes */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Track Details */}
        <div className="flex-1 p-6 md:p-8 lg:p-10 flex flex-col justify-between bg-gradient-to-br from-card/20 to-transparent min-h-[400px]">
          {/* Enhanced Title Section */}
          <div className="mb-6">
            <div className="mb-6">
              <h2 className="text-2xl lg:text-4xl font-heading font-black bg-gradient-primary bg-clip-text text-transparent mb-4 leading-tight tracking-tight">
                {track.name.toUpperCase()}
              </h2>
              <div className="w-16 h-1 bg-gradient-accent rounded-full mb-6" />
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <span className="text-muted-foreground text-sm uppercase tracking-wider">Artist</span>
                  <p className="text-foreground font-semibold text-lg">{track.artists.map(a => a.name).join(', ')}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-accent rounded-lg flex items-center justify-center flex-shrink-0">
                  <Music className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <span className="text-muted-foreground text-sm uppercase tracking-wider">Album</span>
                  <p className="text-foreground font-semibold text-lg">{track.album.name}</p>
                </div>
              </div>
            </div>

            {/* Enhanced Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-lg p-3 text-center hover:bg-card/70 transition-colors">
                <Calendar className="w-4 h-4 text-primary mx-auto mb-1" />
                <span className="text-muted-foreground text-xs uppercase tracking-wider block">Year</span>
                <span className="text-primary font-bold text-sm">{formatYear(track.album.release_date)}</span>
              </div>
              
              <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-lg p-3 text-center hover:bg-card/70 transition-colors">
                <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                <span className="text-muted-foreground text-xs uppercase tracking-wider block">Duration</span>
                <span className="text-primary font-bold text-sm">{formatDuration(track.duration_ms)}</span>
              </div>
              
              <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-lg p-3 text-center hover:bg-card/70 transition-colors">
                <Volume2 className="w-4 h-4 text-primary mx-auto mb-1" />
                <span className="text-muted-foreground text-xs uppercase tracking-wider block">Popularity</span>
                <span className="text-primary font-bold text-sm">{track.popularity}/100</span>
              </div>
              
              <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-lg p-3 text-center hover:bg-card/70 transition-colors">
                <Headphones className="w-4 h-4 text-primary mx-auto mb-1" />
                <span className="text-muted-foreground text-xs uppercase tracking-wider block">Content</span>
                <span className="text-primary font-bold text-sm">{track.explicit ? 'Explicit' : 'Clean'}</span>
              </div>

              <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-lg p-3 text-center hover:bg-card/70 transition-colors">
                <Languages className="w-4 h-4 text-primary mx-auto mb-1" />
                <span className="text-muted-foreground text-xs uppercase tracking-wider block">Language</span>
                <span className="text-primary font-bold text-sm">{getLanguageName(track.language)}</span>
              </div>
            </div>
          </div>

          {/* Enhanced Audio Preview */}
          {track.preview_url && (
            <div className="mb-6">
              <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="w-4 h-4 text-primary" />
                  <span className="text-foreground font-medium text-sm">Preview Track</span>
                </div>
                <audio 
                  controls 
                  className="w-full h-10 rounded-lg"
                  preload="none"
                >
                  <source src={track.preview_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            </div>
          )}

          {/* Enhanced Listen On Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <ExternalLink className="w-4 h-4 text-primary" />
              <p className="text-foreground font-semibold">Stream Now</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button 
                variant="outline" 
                size="sm"
                className="border-green-500/50 text-green-400 hover:bg-green-500 hover:text-white flex items-center gap-3 px-4 py-3 h-auto backdrop-blur-sm bg-card/30 hover:shadow-lg transition-all group"
                onClick={() => window.open(getStreamingLinks().spotify, '_blank')}
              >
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-xs font-bold text-white">S</span>
                </div>
                <span className="font-medium">Spotify</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                className="border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white flex items-center gap-3 px-4 py-3 h-auto backdrop-blur-sm bg-card/30 hover:shadow-lg transition-all group"
                onClick={() => window.open(getStreamingLinks().youtubeMusic, '_blank')}
              >
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-xs font-bold text-white">Y</span>
                </div>
                <span className="font-medium">YouTube</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                className="border-gray-400/50 text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-3 px-4 py-3 h-auto backdrop-blur-sm bg-card/30 hover:shadow-lg transition-all group"
                onClick={() => window.open(getStreamingLinks().appleMusic, '_blank')}
              >
                <div className="w-6 h-6 rounded-full bg-black border border-gray-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-xs font-bold text-white">A</span>
                </div>
                <span className="font-medium">Apple</span>
              </Button>
            </div>
          </div>

          {/* Enhanced Action Buttons */}
          <div className="flex gap-4 mt-auto">
            {track.preview_url && (
              <Button className="btn-hero flex-1 h-12 text-sm font-bold rounded-lg shadow-primary hover:shadow-lg transition-all group">
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                Play Preview
              </Button>
            )}
            <Button
              variant={isTrackFavorite ? "default" : "outline"}
              className={`${track.preview_url ? 'flex-1' : 'w-full'} h-12 text-sm font-bold rounded-lg transition-all group ${
                isTrackFavorite 
                  ? 'bg-gradient-primary text-primary-foreground shadow-primary hover:shadow-lg' 
                  : 'border-primary/50 text-primary hover:bg-gradient-primary hover:text-primary-foreground backdrop-blur-sm bg-card/30'
              }`}
              onClick={handleToggleFavorite}
            >
              <Heart className={`w-5 h-5 mr-2 group-hover:scale-110 transition-transform ${isTrackFavorite ? 'fill-current' : ''}`} />
              {isTrackFavorite ? 'Remove Favorite' : 'Add to Favorites'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}