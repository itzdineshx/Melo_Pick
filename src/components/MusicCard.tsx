import { Music, Play, ExternalLink, Clock, Calendar, Star, Heart, Headphones, Volume2, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { franc } from 'franc-min';

interface Track {
  id: string;
  name: string;
  artists: Array<{ 
    name: string;
    id: string;  // Added required id field
    genres?: string[];
  }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date: string;
    id: string;
    genres?: string[];
  };
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
  explicit: boolean;
  genres?: string[];
  language?: string;  // Added optional language field
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

  const getGenre = () => {
    // Priority: track genres > artist genres > album genres > fallback based on other data
    if (track.genres && track.genres.length > 0) {
      return formatGenre(track.genres[0]);
    }
    
    if (track.artists && track.artists.length > 0 && track.artists[0].genres && track.artists[0].genres.length > 0) {
      return formatGenre(track.artists[0].genres[0]);
    }
    
    if (track.album.genres && track.album.genres.length > 0) {
      return formatGenre(track.album.genres[0]);
    }
    
    // Fallback: try to infer genre from context
    return inferGenreFromContext();
  };

  const formatGenre = (genre: string) => {
    // Clean up genre names for display
    const genreMap: { [key: string]: string } = {
      'bollywood': 'Bollywood',
      'indian': 'Indian',
      'tamil': 'Tamil',
      'telugu': 'Telugu',
      'punjabi': 'Punjabi',
      'bengali': 'Bengali',
      'hindi': 'Hindi',
      'k-pop': 'K-Pop',
      'j-pop': 'J-Pop',
      'r-n-b': 'R&B',
      'hip-hop': 'Hip-Hop',
      'rock': 'Rock',
      'pop': 'Pop',
      'electronic': 'Electronic',
      'classical': 'Classical',
      'jazz': 'Jazz',
      'country': 'Country',
      'folk': 'Folk',
      'reggae': 'Reggae',
      'blues': 'Blues',
      'metal': 'Metal',
      'punk': 'Punk',
      'indie': 'Indie',
      'alternative': 'Alternative',
      'dance': 'Dance',
      'house': 'House',
      'techno': 'Techno',
      'ambient': 'Ambient',
      'soul': 'Soul',
      'gospel': 'Gospel',
      'funk': 'Funk',
      'disco': 'Disco'
    };
    
    const lowerGenre = genre.toLowerCase();
    return genreMap[lowerGenre] || genre.charAt(0).toUpperCase() + genre.slice(1).toLowerCase();
  };

  const inferGenreFromContext = () => {
    const trackText = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
    
    // Language-based genre inference - check if language exists
    if (track.language) {
      const languageGenreMap: { [key: string]: string } = {
        'hi': 'Bollywood',
        'ta': 'Tamil Cinema',
        'te': 'Telugu Cinema', 
        'pa': 'Punjabi',
        'bn': 'Bengali',
        'gu': 'Gujarati',
        'kn': 'Kannada',
        'ml': 'Malayalam',
        'mr': 'Marathi',
        'ur': 'Ghazal',
        'ko': 'K-Pop',
        'ja': 'J-Pop',
        'es': 'Latin',
        'fr': 'French Pop',
        'de': 'German Pop',
        'it': 'Italian Pop',
        'pt': 'Brazilian',
        'ar': 'Arabic Pop',
        'ru': 'Russian Pop',
        'zh': 'C-Pop'
      };
      
      if (languageGenreMap[track.language]) {
        return languageGenreMap[track.language];
      }
    }
    
    // Pattern-based inference
    if (/bollywood|hindi|bharat/i.test(trackText)) return 'Bollywood';
    if (/tamil|kollywood/i.test(trackText)) return 'Tamil Cinema';
    if (/telugu|tollywood/i.test(trackText)) return 'Telugu Cinema';
    if (/punjabi|bhangra/i.test(trackText)) return 'Punjabi';
    if (/bengali|rabindra/i.test(trackText)) return 'Bengali';
    if (/classical|symphony|orchestra/i.test(trackText)) return 'Classical';
    if (/jazz|swing/i.test(trackText)) return 'Jazz';
    if (/rock|metal|punk/i.test(trackText)) return 'Rock';
    if (/electronic|techno|house|edm/i.test(trackText)) return 'Electronic';
    if (/country|folk/i.test(trackText)) return 'Country';
    if (/hip.hop|rap|trap/i.test(trackText)) return 'Hip-Hop';
    if (/reggae|ska/i.test(trackText)) return 'Reggae';
    
    // Default fallback
    return 'Popular Music';
  };

  const detectLanguage = () => {
    // Use the enhanced language detection if available from the service
    if (track.language) {
      return track.language;
    }
    
    // Fallback: basic detection using franc-min with more text
    const textToAnalyze = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`;
    
    // Only use franc if we have enough text (at least 10 characters)
    if (textToAnalyze.length >= 10) {
      try {
        const detectedLang = franc(textToAnalyze);
        
        // Convert franc-min codes to our standard codes
        const francToStandard: { [key: string]: string } = {
          'eng': 'en',
          'spa': 'es', 
          'fra': 'fr',
          'deu': 'de',
          'ita': 'it',
          'por': 'pt',
          'jpn': 'ja',
          'kor': 'ko',
          'cmn': 'zh',
          'arb': 'ar',
          'hin': 'hi',
          'tam': 'ta',
          'tel': 'te',
          'ben': 'bn',
          'mar': 'mr',
          'guj': 'gu',
          'kan': 'kn',
          'mal': 'ml',
          'pan': 'pa',
          'ori': 'or',
          'asm': 'as',
          'urd': 'ur',
          'rus': 'ru'
        };
        
        return francToStandard[detectedLang] || 'en';
      } catch (error) {
        console.warn('Language detection failed:', error);
      }
    }
    
    // Final fallback based on script detection
    return detectLanguageByScript(textToAnalyze) || 'en';
  };

  const detectLanguageByScript = (text: string): string | null => {
    // Script-based detection for non-Latin scripts
    if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
    if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bengali
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu'; // Gujarati
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'; // Kannada
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'; // Malayalam
    if (/[\u0A00-\u0A7F]/.test(text)) return 'pa'; // Punjabi
    if (/[\u0B00-\u0B7F]/.test(text)) return 'or'; // Odia
    if (/[\u0600-\u06FF]/.test(text)) return 'ur'; // Arabic script (could be Urdu)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Japanese
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'; // Korean
    if (/[\u4E00-\u9FAF]/.test(text)) return 'zh'; // Chinese
    if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
    
    return null; // No non-Latin script detected
  };

  const getLanguageName = (code?: string) => {
    const detectedCode = code || detectLanguage();
    
    const languageMap: { [key: string]: string } = {
      'eng': 'English',
      'spa': 'Spanish',  
      'fra': 'French',
      'deu': 'German',
      'ita': 'Italian',
      'por': 'Portuguese',
      'jpn': 'Japanese',
      'kor': 'Korean',
      'cmn': 'Chinese',
      'arb': 'Arabic',
      'hin': 'Hindi',
      'tam': 'Tamil',
      'tel': 'Telugu',
      'ben': 'Bengali',
      'mar': 'Marathi',
      'guj': 'Gujarati',
      'kan': 'Kannada',
      'mal': 'Malayalam',
      'pan': 'Punjabi',
      'ori': 'Odia',
      'asm': 'Assamese',
      'urd': 'Urdu',
      'rus': 'Russian',
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
    
    return languageMap[detectedCode] || 'English';
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

            {/* Compact Stats Grid - Horizontal Layout */}
            <div className="bg-card/30 backdrop-blur-sm border border-border/20 rounded-xl p-4">
              <div className="grid grid-cols-5 gap-4 text-center">
                <div>
                  <Calendar className="w-4 h-4 text-primary mx-auto mb-1" />
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block">YEAR</span>
                  <span className="text-primary font-bold text-sm">{formatYear(track.album.release_date)}</span>
                </div>
                
                <div>
                  <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block">DURATION</span>
                  <span className="text-primary font-bold text-sm">{formatDuration(track.duration_ms)}</span>
                </div>
                
                <div>
                  <Volume2 className="w-4 h-4 text-primary mx-auto mb-1" />
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block">POPULARITY</span>
                  <span className="text-primary font-bold text-sm">{track.popularity}/100</span>
                </div>
                
                <div>
                  <Music className="w-4 h-4 text-primary mx-auto mb-1" />
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block">GENRE</span>
                  <span className="text-primary font-bold text-sm">{getGenre()}</span>
                </div>

                <div>
                  <Languages className="w-4 h-4 text-primary mx-auto mb-1" />
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block">LANGUAGE</span>
                  <span className="text-primary font-bold text-sm">{getLanguageName()}</span>
                </div>
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