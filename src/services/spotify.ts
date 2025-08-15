import axios from 'axios';

const CLIENT_ID = 'cf9dbb3b82bd4d63befc40abc726cc16';
const CLIENT_SECRET = '8f98d6828f424167a952af3a76506740';

interface SpotifyAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

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

interface RecommendationFilters {
  genre?: string;
  yearRange?: [number, number];
  artist?: string;
  market?: string;
  language?: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  popularity?: number;
}

class SpotifyService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private async makeRequestWithRetry<T>(
    url: string,
    config: any,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<T>(url, config);
        return response.data;
      } catch (error: any) {
        if (attempt === maxRetries) throw error;
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '1');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else {
          // Exponential backoff for other errors
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  private getCacheKey(method: string, params: any): string {
    return `${method}_${JSON.stringify(params)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post<SpotifyAuthResponse>(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
      
      return this.accessToken;
    } catch (error) {
      console.error('Failed to get Spotify access token:', error);
      throw new Error('Failed to authenticate with Spotify');
    }
  }

  async getRecommendations(filters: RecommendationFilters = {}): Promise<Track> {
    const cacheKey = this.getCacheKey('recommendations', filters);
    const cached = this.getFromCache<Track[]>(cacheKey);
    
    if (cached && cached.length > 0) {
      const randomIndex = Math.floor(Math.random() * cached.length);
      return cached[randomIndex];
    }

    const token = await this.getAccessToken();
    
    try {
      // For Indian languages, use targeted search instead of generic recommendations
      if (filters.language && this.isIndianLanguage(filters.language)) {
        return await this.getIndianLanguageTrack(filters, token);
      }

      // If artist is specified, search for them first to get their ID
      let seedArtists: string | undefined;
      if (filters.artist) {
        const artistSearchResponse: any = await this.makeRequestWithRetry(
          'https://api.spotify.com/v1/search',
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              q: filters.artist,
              type: 'artist',
              limit: 1,
              market: filters.market || 'US',
            },
          }
        );

        if (artistSearchResponse.artists.items.length > 0) {
          seedArtists = artistSearchResponse.artists.items[0].id;
        }
      }

      // Build recommendation parameters
      const params: any = {
        limit: 50, // Get more for better variety
        market: filters.market || 'US',
      };

      // Add seeds (at least one is required) - Spotify requires exactly 5 seeds total
      let seedCount = 0;
      if (seedArtists) {
        params.seed_artists = seedArtists;
        seedCount++;
      }
      if (filters.genre && seedCount < 5) {
        params.seed_genres = filters.genre;
        seedCount++;
      }
      
      // Fill remaining slots with default genres if needed
      if (seedCount === 0) {
        const defaultGenres = ['pop', 'rock', 'electronic', 'indie', 'alternative'];
        params.seed_genres = defaultGenres[Math.floor(Math.random() * defaultGenres.length)];
      }

      // Add year range filter if specified
      if (filters.yearRange) {
        const [minYear, maxYear] = filters.yearRange;
        if (minYear > 1960) {
          params.min_release_date = `${minYear}-01-01`;
        }
        if (maxYear < new Date().getFullYear()) {
          params.max_release_date = `${maxYear}-12-31`;
        }
      }

      // Add audio feature filters
      if (filters.energy !== undefined) {
        params.target_energy = filters.energy / 100;
      }
      if (filters.danceability !== undefined) {
        params.target_danceability = filters.danceability / 100;
      }
      if (filters.valence !== undefined) {
        params.target_valence = filters.valence / 100;
      }
      if (filters.acousticness !== undefined) {
        params.target_acousticness = filters.acousticness / 100;
      }
      if (filters.instrumentalness !== undefined) {
        params.target_instrumentalness = filters.instrumentalness / 100;
      }
      if (filters.popularity !== undefined) {
        params.target_popularity = filters.popularity;
      }

      const response: any = await this.makeRequestWithRetry(
        'https://api.spotify.com/v1/recommendations',
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }
      );

      let tracks = response.tracks;
      if (tracks && tracks.length > 0) {
        // Add language detection based on market or track data
        tracks = tracks.map((track: Track) => ({
          ...track,
          language: this.detectLanguage(track, filters.market || 'US')
        }));

        // If no language filter is specified, randomize language selection for variety
        if (!filters.language) {
          tracks = this.diversifyLanguages(tracks);
        } else {
          // Filter by language if specified
          const filteredTracks = tracks.filter((track: Track) => track.language === filters.language);
          if (filteredTracks.length > 0) {
            tracks = filteredTracks;
          } else {
            // If no tracks match, try fallback search with language-specific terms
            return await this.getFallbackTrack(filters, token);
          }
        }

        // Cache the results
        this.setCache(cacheKey, tracks);
        
        // Return a random track from the recommendations
        const randomIndex = Math.floor(Math.random() * tracks.length);
        return tracks[randomIndex];
      } else {
        throw new Error('No recommendations found');
      }
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      
      // Fallback: try a simpler search if recommendations fail
      try {
        return await this.getFallbackTrack(filters, token);
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
        throw new Error('Failed to fetch song recommendations');
      }
    }
  }

  private async getFallbackTrack(filters: RecommendationFilters, token: string): Promise<Track> {
    // Fallback search with popular tracks
    const searchTerms = [];
    
    if (filters.artist) {
      searchTerms.push(filters.artist);
    } else if (filters.genre) {
      searchTerms.push(`genre:${filters.genre}`);
    } else {
      // Random popular search terms
      const popularTerms = ['hits', 'popular', 'best', 'top', 'classic'];
      searchTerms.push(popularTerms[Math.floor(Math.random() * popularTerms.length)]);
    }

    let yearFilter = '';
    if (filters.yearRange) {
      const [minYear, maxYear] = filters.yearRange;
      yearFilter = ` year:${minYear}-${maxYear}`;
    }

    const searchQuery = searchTerms.join(' ') + yearFilter;

    const response: any = await this.makeRequestWithRetry(
      'https://api.spotify.com/v1/search',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: searchQuery,
          type: 'track',
          limit: 50,
          market: filters.market || 'US',
        },
      }
    );

    let tracks = response.tracks.items;
    if (tracks && tracks.length > 0) {
      // Add language detection
      tracks = tracks.map((track: Track) => ({
        ...track,
        language: this.detectLanguage(track, filters.market || 'US')
      }));

      // If no language filter is specified, diversify languages for variety
      if (!filters.language) {
        tracks = this.diversifyLanguages(tracks);
      } else {
        // Filter by language if specified
        const filteredTracks = tracks.filter((track: Track) => track.language === filters.language);
        if (filteredTracks.length > 0) {
          tracks = filteredTracks;
        }
        // If no tracks match the language filter, continue with all tracks
      }

      const randomIndex = Math.floor(Math.random() * tracks.length);
      return tracks[randomIndex];
    } else {
      throw new Error('No tracks found');
    }
  }

  async searchArtists(query: string, market: string = 'US'): Promise<any[]> {
    const cacheKey = this.getCacheKey('artists', { query, market });
    const cached = this.getFromCache<any[]>(cacheKey);
    
    if (cached) {
      return cached;
    }
    const token = await this.getAccessToken();
    
    try {
      const response: any = await this.makeRequestWithRetry(
        'https://api.spotify.com/v1/search',
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            q: query,
            type: 'artist',
            limit: 20,
            market,
          },
        }
      );

      const artists = response.artists.items;
      this.setCache(cacheKey, artists);
      return artists;
    } catch (error) {
      console.error('Failed to search artists:', error);
      return [];
    }
  }

  async getGenres(): Promise<string[]> {
    const cacheKey = this.getCacheKey('genres', {});
    const cached = this.getFromCache<string[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const token = await this.getAccessToken();
    
    try {
      const response: any = await this.makeRequestWithRetry(
        'https://api.spotify.com/v1/recommendations/available-genre-seeds',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const genres = response.genres;
      this.setCache(cacheKey, genres);
      return genres;
    } catch (error) {
      console.error('Failed to get genres:', error);
      // Return fallback genres (Spotify-compatible names)
      return [
        'pop', 'rock', 'hip-hop', 'electronic', 'country', 'jazz', 'classical',
        'r-n-b', 'indie', 'alternative', 'metal', 'reggae', 'blues', 'folk',
        'punk', 'funk', 'disco', 'house', 'techno', 'ambient', 'soul', 'gospel'
      ];
    }
  }

  private isIndianLanguage(language: string): boolean {
    const indianLanguages = ['hi', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa', 'or', 'ur', 'mr', 'as'];
    return indianLanguages.includes(language);
  }

  private async getIndianLanguageTrack(filters: RecommendationFilters, token: string): Promise<Track> {
    // Language-specific search terms for better accuracy
    const languageSearchTerms: { [key: string]: string[] } = {
      'hi': ['bollywood', 'hindi', 'भारतीय', 'फिल्म', 'गाना', 'संगीत', 'arijit singh', 'shreya ghoshal', 'kumar sanu', 'lata mangeshkar'],
      'ta': ['tamil', 'kollywood', 'தமிழ்', 'படல்', 'இசை', 'yuvan shankar raja', 'anirudh', 'ar rahman', 'sid sriram'],
      'te': ['telugu', 'tollywood', 'తెలుగు', 'సినిమా', 'పాట', 'devi sri prasad', 'ss thaman', 'mickey j meyer'],
      'bn': ['bengali', 'বাংলা', 'গান', 'সংগীত', 'rabindra sangeet', 'nazrul geeti', 'modern bengali'],
      'gu': ['gujarati', 'ગુજરાતી', 'ગીત', 'લોકગીત', 'garba', 'dandiya', 'falguni pathak'],
      'kn': ['kannada', 'ಕನ್ನಡ', 'ಹಾಡು', 'ಸಂಗೀತ', 'sandalwood', 'v harikrishna', 'raghu dixit'],
      'ml': ['malayalam', 'മലയാളം', 'പാട്ട്', 'സംഗീതം', 'mollywood', 'gopi sundar', 'bijibal'],
      'pa': ['punjabi', 'ਪੰਜਾਬੀ', 'ਗੀਤ', 'ਸੰਗੀਤ', 'bhangra', 'sidhu moose wala', 'diljit dosanjh'],
      'or': ['odia', 'ଓଡ଼ିଆ', 'ଗୀତ', 'ସଙ୍ଗୀତ', 'ollywood', 'humane sagar', 'asima panda'],
      'ur': ['urdu', 'اردو', 'غزل', 'قوالی', 'ghazal', 'qawwali', 'mehdi hassan', 'ghulam ali'],
      'mr': ['marathi', 'मराठी', 'गाणे', 'संगीत', 'ajay atul', 'shankar mahadevan', 'asha bhosle'],
      'as': ['assamese', 'অসমীয়া', 'গীত', 'সংগীত', 'bhupen hazarika', 'papon', 'zubeen garg']
    };

    const searchTerms = languageSearchTerms[filters.language!] || ['indian', 'music', filters.language];
    
    // Add artist filter if specified
    if (filters.artist) {
      searchTerms.unshift(filters.artist);
    }

    // Add genre if specified
    if (filters.genre) {
      searchTerms.push(filters.genre);
    }

    let yearFilter = '';
    if (filters.yearRange) {
      const [minYear, maxYear] = filters.yearRange;
      yearFilter = ` year:${minYear}-${maxYear}`;
    }

    // Try multiple search combinations for better results
    const searchCombinations = [
      searchTerms.slice(0, 3).join(' ') + yearFilter,
      searchTerms.slice(1, 4).join(' ') + yearFilter,
      (searchTerms[0] + ' ' + filters.language + ' music') + yearFilter,
    ];

    for (const searchQuery of searchCombinations) {
      try {
        const response: any = await this.makeRequestWithRetry(
          'https://api.spotify.com/v1/search',
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              q: searchQuery,
              type: 'track',
              limit: 50,
              market: 'IN', // Force Indian market for better language results
            },
          }
        );

        let tracks = response.tracks.items;
        if (tracks && tracks.length > 0) {
          // Enhanced language detection for Indian languages
          tracks = tracks.map((track: Track) => ({
            ...track,
            language: this.detectLanguageEnhanced(track, filters.language!)
          }));

          // Strict filtering for Indian languages
          const filteredTracks = tracks.filter((track: Track) => {
            const detectedLang = track.language;
            // Accept exact match or closely related languages
            return detectedLang === filters.language || 
                   (filters.language === 'hi' && ['ur', 'mr'].includes(detectedLang!)) ||
                   (filters.language === 'bn' && detectedLang === 'as') ||
                   this.isTrackLikelyInLanguage(track, filters.language!);
          });

          if (filteredTracks.length > 0) {
            const randomIndex = Math.floor(Math.random() * filteredTracks.length);
            return filteredTracks[randomIndex];
          }
        }
      } catch (error) {
        console.error(`Search failed for query: ${searchQuery}`, error);
        continue; // Try next search combination
      }
    }

    // Final fallback: return any Indian track if available
    throw new Error(`No ${filters.language} tracks found`);
  }

  private detectLanguageEnhanced(track: Track, targetLanguage: string): string {
    const textToAnalyze = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
    
    // Enhanced detection for target language
    const languagePatterns: { [key: string]: RegExp[] } = {
      'hi': [/[\u0900-\u097F]/, /\b(hindi|bollywood|भारतीय|फिल्म)\b/i],
      'ta': [/[\u0B80-\u0BFF]/, /\b(tamil|kollywood|தமிழ்)\b/i],
      'te': [/[\u0C00-\u0C7F]/, /\b(telugu|tollywood|తెలుగు)\b/i],
      'bn': [/[\u0980-\u09FF]/, /\b(bengali|বাংলা)\b/i],
      'gu': [/[\u0A80-\u0AFF]/, /\b(gujarati|ગુજરાતી)\b/i],
      'kn': [/[\u0C80-\u0CFF]/, /\b(kannada|ಕನ್ನಡ)\b/i],
      'ml': [/[\u0D00-\u0D7F]/, /\b(malayalam|മലയാളം)\b/i],
      'pa': [/[\u0A00-\u0A7F]/, /\b(punjabi|ਪੰਜਾਬੀ)\b/i],
      'or': [/[\u0B00-\u0B7F]/, /\b(odia|ଓଡ଼ିଆ)\b/i],
      'ur': [/[\u0600-\u06FF]/, /\b(urdu|اردو|ghazal|qawwali)\b/i],
    };

    if (languagePatterns[targetLanguage]) {
      for (const pattern of languagePatterns[targetLanguage]) {
        if (pattern.test(textToAnalyze)) {
          return targetLanguage;
        }
      }
    }

    // Fallback to original detection
    return this.detectLanguage(track, 'IN');
  }

  private isTrackLikelyInLanguage(track: Track, language: string): boolean {
    const artistNames = track.artists.map(a => a.name.toLowerCase()).join(' ');
    const trackName = track.name.toLowerCase();
    
    // Artist-based detection for Indian languages
    const languageArtists: { [key: string]: string[] } = {
      'hi': ['arijit singh', 'shreya ghoshal', 'kumar sanu', 'lata mangeshkar', 'kishore kumar', 'mohammad rafi', 'asha bhosle'],
      'ta': ['yuvan shankar raja', 'anirudh', 'sid sriram', 'chinmayi', 'hariharan', 'unni krishnan'],
      'te': ['devi sri prasad', 'ss thaman', 'mickey j meyer', 'keeravani', 'koti'],
      'bn': ['hemanta mukherjee', 'kishore kumar', 'lata mangeshkar', 'asha bhosle'],
      'pa': ['diljit dosanjh', 'sidhu moose wala', 'amrit maan', 'hardy sandhu'],
      'ml': ['yesudas', 'chithra', 'mg sreekumar', 'sujatha'],
      'kn': ['sonu nigam', 'shreya ghoshal', 'rajesh krishnan'],
      'gu': ['falguni pathak', 'kirtidan gadhvi', 'hemant chauhan'],
    };

    if (languageArtists[language]) {
      return languageArtists[language].some(artist => 
        artistNames.includes(artist) || trackName.includes(artist)
      );
    }

    return false;
  }

  private detectLanguage(track: Track, market: string): string {
    // Market-based language detection with improved accuracy
    const marketLanguageMap: { [key: string]: string } = {
      'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en',
      'ES': 'es', 'MX': 'es', 'AR': 'es',
      'FR': 'fr',
      'DE': 'de',
      'IT': 'it',
      'BR': 'pt', 'PT': 'pt',
      'JP': 'ja',
      'KR': 'ko',
      'CN': 'zh',
      'RU': 'ru',
      'IN': 'hi'
    };

    // Analyze track name, artist name, and album name for better detection
    const textToAnalyze = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
    
    // Enhanced script-based detection with priority order
    
    // Check for Indian scripts first (most specific)
    if (/[\u0900-\u097F]/.test(textToAnalyze)) return 'hi'; // Devanagari (Hindi, Marathi)
    if (/[\u0B80-\u0BFF]/.test(textToAnalyze)) return 'ta'; // Tamil
    if (/[\u0C00-\u0C7F]/.test(textToAnalyze)) return 'te'; // Telugu
    if (/[\u0980-\u09FF]/.test(textToAnalyze)) return 'bn'; // Bengali/Assamese
    if (/[\u0A80-\u0AFF]/.test(textToAnalyze)) return 'gu'; // Gujarati
    if (/[\u0C80-\u0CFF]/.test(textToAnalyze)) return 'kn'; // Kannada
    if (/[\u0D00-\u0D7F]/.test(textToAnalyze)) return 'ml'; // Malayalam
    if (/[\u0A00-\u0A7F]/.test(textToAnalyze)) return 'pa'; // Gurmukhi (Punjabi)
    if (/[\u0B00-\u0B7F]/.test(textToAnalyze)) return 'or'; // Odia
    
    // Arabic script (could be Arabic or Urdu)
    if (/[\u0600-\u06FF]/.test(textToAnalyze)) {
      // If market is India or Pakistan-adjacent, likely Urdu
      if (market === 'IN') return 'ur';
      return 'ar';
    }
    
    // East Asian scripts
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(textToAnalyze)) return 'ja'; // Hiragana/Katakana
    if (/[\uAC00-\uD7AF]/.test(textToAnalyze)) return 'ko'; // Korean
    if (/[\u4E00-\u9FAF]/.test(textToAnalyze)) return 'zh'; // Chinese characters
    
    // Cyrillic
    if (/[\u0400-\u04FF]/.test(textToAnalyze)) return 'ru';
    
    // European language diacritics with better specificity
    if (/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(textToAnalyze)) {
      // French specific patterns
      if (/[çæœù]/i.test(textToAnalyze) || /\b(le|la|les|un|une|des|du|de|et|à|avec)\b/i.test(textToAnalyze)) return 'fr';
      
      // Spanish specific patterns  
      if (/[ñ]/i.test(textToAnalyze) || /\b(el|la|los|las|un|una|y|con|de|del|en)\b/i.test(textToAnalyze)) return 'es';
      
      // Portuguese specific patterns
      if (/[ãõç]/i.test(textToAnalyze) || /\b(o|a|os|as|um|uma|e|com|de|do|da|em)\b/i.test(textToAnalyze)) return 'pt';
      
      // German specific patterns
      if (/[äöüß]/i.test(textToAnalyze) || /\b(der|die|das|ein|eine|und|mit|von|für|auf)\b/i.test(textToAnalyze)) return 'de';
      
      // Italian specific patterns
      if (/\b(il|la|lo|gli|le|un|una|e|con|di|del|della|in)\b/i.test(textToAnalyze)) return 'it';
    }
    
    // Enhanced English detection patterns
    if (/\b(the|and|or|but|with|from|for|of|in|on|at|to|by|is|are|was|were)\b/i.test(textToAnalyze)) {
      return 'en';
    }

    // Market-based fallback with Indian market handling
    if (market === 'IN') {
      // For Indian market, prefer Hindi as default but could be any Indian language
      return 'hi';
    }
    
    return marketLanguageMap[market] || 'en';
  }

  private diversifyLanguages(tracks: Track[]): Track[] {
    // Group tracks by language
    const languageGroups: { [key: string]: Track[] } = {};
    tracks.forEach(track => {
      const lang = track.language || 'en';
      if (!languageGroups[lang]) {
        languageGroups[lang] = [];
      }
      languageGroups[lang].push(track);
    });

    // Get all available languages
    const availableLanguages = Object.keys(languageGroups);
    
    // If we have multiple languages, create a more diverse selection
    if (availableLanguages.length > 1) {
      const diverseTracks: Track[] = [];
      const maxTracksPerLanguage = Math.ceil(tracks.length / availableLanguages.length);
      
      // Add tracks from each language group, prioritizing variety
      availableLanguages.forEach(lang => {
        const langTracks = languageGroups[lang];
        // Shuffle tracks within each language group
        const shuffledTracks = langTracks.sort(() => Math.random() - 0.5);
        // Take up to maxTracksPerLanguage from each language
        diverseTracks.push(...shuffledTracks.slice(0, maxTracksPerLanguage));
      });
      
      // Shuffle the final diverse selection
      return diverseTracks.sort(() => Math.random() - 0.5);
    }
    
    // If only one language available, just shuffle
    return tracks.sort(() => Math.random() - 0.5);
  }
}

export const spotifyService = new SpotifyService();
export type { Track, RecommendationFilters };