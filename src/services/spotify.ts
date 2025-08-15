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
  artists: Array<{ 
    name: string;
    id: string;
  }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date: string;
    id: string;
  };
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
  explicit: boolean;
  language?: string;
  available_markets?: string[];
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

  // Enhanced method to get artist details including genres
  async getArtistDetails(artistId: string): Promise<any> {
    const cacheKey = this.getCacheKey('artist_details', { artistId });
    const cached = this.getFromCache<any>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const token = await this.getAccessToken();
    
    try {
      const response: any = await this.makeRequestWithRetry(
        `https://api.spotify.com/v1/artists/${artistId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      this.setCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Failed to get artist details:', error);
      return null;
    }
  }

  // Enhanced method to get album details including genres
  async getAlbumDetails(albumId: string): Promise<any> {
    const cacheKey = this.getCacheKey('album_details', { albumId });
    const cached = this.getFromCache<any>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const token = await this.getAccessToken();
    
    try {
      const response: any = await this.makeRequestWithRetry(
        `https://api.spotify.com/v1/albums/${albumId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      this.setCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Failed to get album details:', error);
      return null;
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
        // Enhanced language detection with API data
        tracks = await Promise.all(tracks.map(async (track: Track) => ({
          ...track,
          language: await this.detectLanguageEnhanced(track, filters.market || 'US')
        })));

        // Enhanced randomization and variance for both filtered and unfiltered requests
        if (!filters.language) {
          tracks = this.diversifyLanguages(tracks);
          // Additional randomization for no-filter cases
          tracks = this.addVarianceToNoFilterResults(tracks, filters);
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
      // Enhanced language detection with API data
      tracks = await Promise.all(tracks.map(async (track: Track) => ({
        ...track,
        language: await this.detectLanguageEnhanced(track, filters.market || 'US')
      })));

      // Enhanced variance for fallback tracks
      if (!filters.language) {
        tracks = this.diversifyLanguages(tracks);
        tracks = this.addVarianceToNoFilterResults(tracks, filters);
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
          tracks = await Promise.all(tracks.map(async (track: Track) => ({
            ...track,
            language: await this.detectLanguageEnhanced(track, 'IN', filters.language!)
          })));

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

  // Enhanced language detection using multiple data sources
  private async detectLanguageEnhanced(track: Track, market: string, targetLanguage?: string): Promise<string> {
    try {
      // Get additional data from Spotify API
      const [artistDetails, albumDetails] = await Promise.all([
        track.artists.length > 0 ? this.getArtistDetails(track.artists[0].id) : null,
        this.getAlbumDetails(track.album.id)
      ]);

      // Combine all available text for analysis
      const trackText = track.name.toLowerCase();
      const artistText = track.artists.map(a => a.name).join(' ').toLowerCase();
      const albumText = track.album.name.toLowerCase();
      const allText = `${trackText} ${artistText} ${albumText}`;

      // Priority detection using multiple sources
      let detectedLanguage = 'en'; // Default

      // 1. Use available markets for region-based detection
      if (track.available_markets && track.available_markets.length > 0) {
        const primaryMarket = track.available_markets[0];
        const marketLanguage = this.getLanguageFromMarket(primaryMarket);
        if (marketLanguage !== 'en' || track.available_markets.includes('IN')) {
          detectedLanguage = marketLanguage;
        }
      }

      // 2. Script-based detection (most reliable for non-Latin scripts)
      const scriptLanguage = this.detectLanguageByScript(allText);
      if (scriptLanguage !== 'en') {
        detectedLanguage = scriptLanguage;
      }

      // 3. Artist genre-based detection
      if (artistDetails && artistDetails.genres) {
        const genreLanguage = this.detectLanguageFromGenres(artistDetails.genres);
        if (genreLanguage !== 'en') {
          detectedLanguage = genreLanguage;
        }
      }

      // 4. Artist origin-based detection (if artist is from specific region)
      const artistLanguage = this.detectLanguageFromArtist(track.artists[0].name);
      if (artistLanguage !== 'en') {
        detectedLanguage = artistLanguage;
      }

      // 5. Enhanced text pattern matching
      const patternLanguage = this.detectLanguageByPatterns(allText);
      if (patternLanguage !== 'en') {
        detectedLanguage = patternLanguage;
      }

      // 6. Market-based fallback
      if (detectedLanguage === 'en') {
        detectedLanguage = this.getLanguageFromMarket(market);
      }

      return detectedLanguage;
    } catch (error) {
      console.error('Enhanced language detection failed:', error);
      // Fallback to basic detection
      return this.detectLanguage(track, market);
    }
  }

  private detectLanguageByScript(text: string): string {
    // Enhanced script detection with better patterns
    
    // Indian scripts (most specific patterns first)
    if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
    if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bengali/Assamese
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu'; // Gujarati
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'; // Kannada
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'; // Malayalam
    if (/[\u0A00-\u0A7F]/.test(text)) return 'pa'; // Punjabi
    if (/[\u0B00-\u0B7F]/.test(text)) return 'or'; // Odia
    
    // Arabic/Urdu
    if (/[\u0600-\u06FF]/.test(text)) {
      // Try to distinguish between Arabic and Urdu
      if (/[\u0627\u0628\u062A\u062B\u062C\u062D\u062E\u062F]/.test(text)) {
        return 'ar';
      }
      return 'ur';
    }
    
    // East Asian
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
    if (/[\u4E00-\u9FAF]/.test(text)) return 'zh';
    
    // Cyrillic
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    
    return 'en'; // Default for Latin scripts
  }

  private detectLanguageFromGenres(genres: string[]): string {
    const genreLanguageMap: { [key: string]: string } = {
      'bollywood': 'hi',
      'indian': 'hi',
      'tamil': 'ta',
      'telugu': 'te',
      'bengali': 'bn',
      'punjabi': 'pa',
      'gujarati': 'gu',
      'marathi': 'mr',
      'kannada': 'kn',
      'malayalam': 'ml',
      'urdu': 'ur',
      'k-pop': 'ko',
      'j-pop': 'ja',
      'french': 'fr',
      'spanish': 'es',
      'german': 'de',
      'italian': 'it',
      'russian': 'ru',
      'chinese': 'zh'
    };

    for (const genre of genres) {
      const lowerGenre = genre.toLowerCase();
      for (const [key, lang] of Object.entries(genreLanguageMap)) {
        if (lowerGenre.includes(key)) {
          return lang;
        }
      }
    }

    return 'en';
  }

  private detectLanguageFromArtist(artistName: string): string {
    const artistName_lower = artistName.toLowerCase();
    
    // Well-known artists and their languages
    const knownArtists: { [key: string]: string } = {
      'arijit singh': 'hi',
      'shreya ghoshal': 'hi',
      'lata mangeshkar': 'hi',
      'kishore kumar': 'hi',
      'ar rahman': 'hi',
      'yuvan shankar raja': 'ta',
      'anirudh': 'ta',
      'sid sriram': 'ta',
      'devi sri prasad': 'te',
      'ss thaman': 'te',
      'diljit dosanjh': 'pa',
      'sidhu moose wala': 'pa',
      'falguni pathak': 'gu',
      'shakira': 'es',
      'enrique iglesias': 'es',
      'celine dion': 'fr',
      'edith piaf': 'fr',
      'andrea bocelli': 'it',
      'bts': 'ko',
      'blackpink': 'ko',
      'yui': 'ja'
    };

    for (const [artist, lang] of Object.entries(knownArtists)) {
      if (artistName_lower.includes(artist)) {
        return lang;
      }
    }

    return 'en';
  }

  private detectLanguageByPatterns(text: string): string {
    // Enhanced pattern matching for better accuracy
    const patterns: { [key: string]: RegExp[] } = {
      'hi': [
        /\b(bollywood|hindi|bharat|film|gana|sangeet|pyaar|ishq|dil|jaan)\b/i,
        /\b(kumar|singh|sharma|agarwal|gupta|verma)\b/i
      ],
      'ta': [
        /\b(tamil|kollywood|chennai|madras|thalapathy|thala|anna)\b/i,
        /\b(raja|rajan|kumar|murugan|selvam)\b/i
      ],
      'te': [
        /\b(telugu|tollywood|hyderabad|andhra|telangana|cinema|paata)\b/i,
        /\b(reddy|rao|krishna|rama|sai|sri)\b/i
      ],
      'pa': [
        /\b(punjabi|punjab|bhangra|sikh|sardar|singh|kaur)\b/i,
        /\b(dil|pyaar|jatt|munda|kudi|gal)\b/i
      ],
      'bn': [
        /\b(bengali|bangla|kolkata|calcutta|tagore|rabindra)\b/i,
        /\b(da|babu|roy|sen|ghosh|mukherjee)\b/i
      ],
      'gu': [
        /\b(gujarati|gujarat|ahmedabad|surat|garba|dandiya)\b/i,
        /\b(patel|shah|dave|mehta|joshi)\b/i
      ],
      'kn': [
        /\b(kannada|karnataka|bangalore|bengaluru|sandalwood)\b/i,
        /\b(gowda|rao|kumar|hegde|shetty)\b/i
      ],
      'ml': [
        /\b(malayalam|kerala|kochi|trivandrum|mollywood)\b/i,
        /\b(nair|menon|pillai|kumar|das)\b/i
      ],
      'mr': [
        /\b(marathi|maharashtra|mumbai|pune|lavani)\b/i,
        /\b(patil|desai|joshi|kulkarni|bhosle)\b/i
      ],
      'ur': [
        /\b(urdu|ghazal|qawwali|nazm|shayari|pakistan)\b/i,
        /\b(khan|ali|hassan|ahmed|shah)\b/i
      ],
      'es': [
        /\b(spanish|espanol|latino|latina|amor|corazon|vida|mi|tu|el|la)\b/i,
        /\b(rodriguez|garcia|martinez|lopez|gonzalez)\b/i
      ],
      'fr': [
        /\b(french|francais|amour|mon|ma|le|la|avec|pour|dans)\b/i,
        /\b(martin|bernard|dubois|moreau|laurent)\b/i
      ],
      'de': [
        /\b(german|deutsch|liebe|mein|dein|und|mit|von|fur|auf)\b/i,
        /\b(mueller|schmidt|schneider|weber|meyer)\b/i
      ],
      'it': [
        /\b(italian|italiano|amore|mio|tuo|con|per|di|il|la)\b/i,
        /\b(rossi|russo|ferrari|esposito|bianchi)\b/i
      ],
      'ko': [
        /\b(korean|hangul|oppa|saranghae|fighting|k-pop|seoul)\b/i,
        /\b(kim|lee|park|choi|jung)\b/i
      ],
      'ja': [
        /\b(japanese|nihongo|arigato|sayonara|konnichiwa|j-pop|tokyo)\b/i,
        /\b(sato|suzuki|takahashi|tanaka|watanabe)\b/i
      ],
      'ru': [
        /\b(russian|russkiy|moscow|saint petersburg|bolshoy)\b/i,
        /\b(petrov|ivanov|sidorov|smirnov|kuznetsov)\b/i
      ],
      'zh': [
        /\b(chinese|mandarin|beijing|shanghai|guangzhou|c-pop)\b/i,
        /\b(wang|li|zhang|liu|chen)\b/i
      ],
      'ar': [
        /\b(arabic|arab|habibi|alhamdulillah|inshallah|wallah)\b/i,
        /\b(mohammed|ahmed|ali|hassan|omar)\b/i
      ]
    };

    for (const [lang, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        if (regex.test(text)) {
          return lang;
        }
      }
    }

    // Common English patterns
    if (/\b(the|and|or|but|with|from|for|of|in|on|at|to|by|is|are|was|were|love|you|me|my|your)\b/i.test(text)) {
      return 'en';
    }

    return 'en';
  }

  private getLanguageFromMarket(market: string): string {
    const marketLanguageMap: { [key: string]: string } = {
      'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en', 'NZ': 'en', 'IE': 'en',
      'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'CL': 'es', 'PE': 'es',
      'FR': 'fr', 'BE': 'fr', 'CH': 'fr',
      'DE': 'de', 'AT': 'de',
      'IT': 'it',
      'BR': 'pt', 'PT': 'pt',
      'JP': 'ja',
      'KR': 'ko',
      'CN': 'zh', 'HK': 'zh', 'TW': 'zh',
      'RU': 'ru',
      'IN': 'hi', // Default for India, but could be any Indian language
      'PK': 'ur',
      'BD': 'bn',
      'TR': 'tr',
      'SA': 'ar', 'AE': 'ar', 'EG': 'ar',
      'IL': 'he',
      'GR': 'el',
      'NL': 'nl',
      'SE': 'sv',
      'NO': 'no',
      'DK': 'da',
      'FI': 'fi',
      'PL': 'pl',
      'CZ': 'cs',
      'HU': 'hu'
    };

    return marketLanguageMap[market] || 'en';
  }

  private isTrackLikelyInLanguage(track: Track, language: string): boolean {
    const artistNames = track.artists.map(a => a.name.toLowerCase()).join(' ');
    const trackName = track.name.toLowerCase();
    const albumName = track.album.name.toLowerCase();
    const allText = `${trackName} ${artistNames} ${albumName}`;
    
    // Enhanced artist-based detection for Indian languages
    const languageArtists: { [key: string]: string[] } = {
      'hi': [
        'arijit singh', 'shreya ghoshal', 'kumar sanu', 'lata mangeshkar', 'kishore kumar', 
        'mohammad rafi', 'asha bhosle', 'udit narayan', 'alka yagnik', 'sonu nigam',
        'rahat fateh ali khan', 'armaan malik', 'tulsi kumar', 'neha kakkar', 'yo yo honey singh'
      ],
      'ta': [
        'yuvan shankar raja', 'anirudh', 'sid sriram', 'chinmayi', 'hariharan', 'unni krishnan',
        'karthik', 'shakthisree gopalan', 'haricharan', 'pradeep kumar', 'vijay yesudas'
      ],
      'te': [
        'devi sri prasad', 'ss thaman', 'mickey j meyer', 'keeravani', 'koti', 
        'anup rubens', 'gopi sundar', 'ravi basrur', 'vishal chandrasekhar'
      ],
      'bn': [
        'hemanta mukherjee', 'kishore kumar', 'lata mangeshkar', 'asha bhosle', 'manna dey',
        'sandhya mukherjee', 'shyamal mitra', 'nachiketa', 'srikanto acharya'
      ],
      'pa': [
        'diljit dosanjh', 'sidhu moose wala', 'amrit maan', 'hardy sandhu', 'gurdas maan',
        'kuldeep manak', 'amar singh chamkila', 'babbu maan', 'jazzy b'
      ],
      'gu': [
        'falguni pathak', 'kirtidan gadhvi', 'hemant chauhan', 'atul purohit', 'alka yagnik',
        'udit narayan', 'kavita krishnamurthy', 'mahesh kanodia'
      ],
      'kn': [
        'sonu nigam', 'shreya ghoshal', 'rajesh krishnan', 'hemanth kumar', 'k j yesudas',
        'p b sreenivas', 's janaki', 'vani jairam', 'chitra'
      ],
      'ml': [
        'yesudas', 'chithra', 'mg sreekumar', 'sujatha', 'unni menon', 'hariharan',
        'vineeth sreenivasan', 'job kurian', 'najim arshad'
      ],
      'mr': [
        'lata mangeshkar', 'asha bhosle', 'suresh wadkar', 'anuradha paudwal', 'usha mangeshkar',
        'mahendra kapoor', 'ajay atul', 'shankar mahadevan'
      ],
      'ur': [
        'mehdi hassan', 'ghulam ali', 'nusrat fateh ali khan', 'abida parveen', 'farida khanum',
        'iqbal bano', 'rahat fateh ali khan', 'atif aslam', 'rahat indori'
      ]
    };

    if (languageArtists[language]) {
      const matchFound = languageArtists[language].some(artist => {
        const artistWords = artist.split(' ');
        return artistWords.every(word => allText.includes(word.toLowerCase()));
      });
      
      if (matchFound) {
        return true;
      }
    }

    // Check for language-specific terms in track/album names
    const languageTerms: { [key: string]: string[] } = {
      'hi': ['bollywood', 'hindi', 'pyaar', 'ishq', 'dil', 'jaan', 'sanam', 'mohabbat', 'film'],
      'ta': ['tamil', 'kollywood', 'kadhal', 'anbu', 'uyir', 'vaazhkai', 'paadal'],
      'te': ['telugu', 'tollywood', 'prema', 'jeevitham', 'paata', 'cinema'],
      'pa': ['punjabi', 'bhangra', 'jatt', 'munda', 'kudi', 'gal', 'pyaar'],
      'bn': ['bengali', 'bangla', 'bhalobasha', 'gaan', 'jibon', 'mon'],
      'gu': ['gujarati', 'garba', 'dandiya', 'raas', 'lok'],
      'kn': ['kannada', 'sandalwood', 'prema', 'jeevana', 'haadu'],
      'ml': ['malayalam', 'mollywood', 'sneham', 'jeevitham', 'paattu'],
      'mr': ['marathi', 'lavani', 'natak', 'geet', 'jiwan'],
      'ur': ['urdu', 'ghazal', 'qawwali', 'nazm', 'shayari', 'ishq', 'mohabbat']
    };

    if (languageTerms[language]) {
      return languageTerms[language].some(term => allText.includes(term));
    }

    return false;
  }

  private detectLanguage(track: Track, market: string): string {
    // Fallback basic detection method
    const textToAnalyze = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
    
    // Script-based detection
    const scriptLanguage = this.detectLanguageByScript(textToAnalyze);
    if (scriptLanguage !== 'en') {
      return scriptLanguage;
    }
    
    // Pattern-based detection
    const patternLanguage = this.detectLanguageByPatterns(textToAnalyze);
    if (patternLanguage !== 'en') {
      return patternLanguage;
    }
    
    // Market-based fallback
    return this.getLanguageFromMarket(market);
  }

  private diversifyLanguages(tracks: Track[]): Track[] {
    // Enhanced diversity algorithm with weighted randomization
    const languageGroups: { [key: string]: Track[] } = {};
    const regionGroups: { [key: string]: Track[] } = {};
    const artistGroups: { [key: string]: Track[] } = {};
    
    tracks.forEach(track => {
      const lang = track.language || 'en';
      const region = this.getRegionFromLanguage(lang);
      const primaryArtist = track.artists[0]?.name || 'unknown';
      
      // Group by language
      if (!languageGroups[lang]) languageGroups[lang] = [];
      languageGroups[lang].push(track);
      
      // Group by region
      if (!regionGroups[region]) regionGroups[region] = [];
      regionGroups[region].push(track);
      
      // Group by artist to prevent same artist repetition
      if (!artistGroups[primaryArtist]) artistGroups[primaryArtist] = [];
      artistGroups[primaryArtist].push(track);
    });

    const availableLanguages = Object.keys(languageGroups);
    const availableRegions = Object.keys(regionGroups);
    
    // Enhanced diversification strategy
    if (availableLanguages.length > 1 || availableRegions.length > 1) {
      const diverseTracks: Track[] = [];
      const usedArtists = new Set<string>();
      const languageUsageCount: { [key: string]: number } = {};
      const regionUsageCount: { [key: string]: number } = {};
      
      // Initialize usage counters
      availableLanguages.forEach(lang => languageUsageCount[lang] = 0);
      availableRegions.forEach(region => regionUsageCount[region] = 0);
      
      // Advanced selection algorithm with multiple diversity factors
      const maxSelections = Math.min(tracks.length, 50);
      const attempts = maxSelections * 3; // More attempts for better diversity
      
      for (let i = 0; i < attempts && diverseTracks.length < maxSelections; i++) {
        // Weighted random selection favoring less-used languages/regions
        const selectedLanguage = this.selectWithWeights(availableLanguages, languageUsageCount, true);
        const selectedRegion = this.selectWithWeights(availableRegions, regionUsageCount, true);
        
        // Get candidate tracks from the selected language and region
        let candidateTracks = languageGroups[selectedLanguage] || [];
        
        // Filter to prevent artist repetition (allow max 1 track per artist)
        candidateTracks = candidateTracks.filter(track => {
          const artistName = track.artists[0]?.name;
          return !usedArtists.has(artistName);
        });
        
        // Add region preference
        const regionTracks = candidateTracks.filter(track => {
          const trackRegion = this.getRegionFromLanguage(track.language || 'en');
          return trackRegion === selectedRegion;
        });
        
        const finalCandidates = regionTracks.length > 0 ? regionTracks : candidateTracks;
        
        if (finalCandidates.length > 0) {
          // Random selection from candidates with popularity weighting
          const selectedTrack = this.selectTrackWithPopularityVariance(finalCandidates);
          
          if (!diverseTracks.some(t => t.id === selectedTrack.id)) {
            diverseTracks.push(selectedTrack);
            
            // Update usage counters
            languageUsageCount[selectedLanguage]++;
            regionUsageCount[selectedRegion]++;
            usedArtists.add(selectedTrack.artists[0]?.name || '');
          }
        }
      }
      
      // If we still don't have enough tracks, fill with remaining tracks
      if (diverseTracks.length < maxSelections) {
        const remainingTracks = tracks.filter(track => 
          !diverseTracks.some(dt => dt.id === track.id)
        );
        
        // Add remaining tracks with continued artist filtering
        for (const track of remainingTracks) {
          if (diverseTracks.length >= maxSelections) break;
          
          const artistName = track.artists[0]?.name;
          if (!usedArtists.has(artistName)) {
            diverseTracks.push(track);
            usedArtists.add(artistName);
          }
        }
      }
      
      // Final shuffle with variance in positioning
      return this.intelligentShuffle(diverseTracks);
    }
    
    // If only one language/region, still apply artist diversity and intelligent shuffle
    return this.applyArtistDiversityAndShuffle(tracks);
  }

  private getRegionFromLanguage(language: string): string {
    const languageToRegion: { [key: string]: string } = {
      'hi': 'south-asia', 'ur': 'south-asia', 'bn': 'south-asia', 'pa': 'south-asia',
      'ta': 'south-asia', 'te': 'south-asia', 'gu': 'south-asia', 'kn': 'south-asia',
      'ml': 'south-asia', 'mr': 'south-asia', 'or': 'south-asia', 'as': 'south-asia',
      'ko': 'east-asia', 'ja': 'east-asia', 'zh': 'east-asia',
      'es': 'latin', 'pt': 'latin',
      'fr': 'europe', 'de': 'europe', 'it': 'europe', 'ru': 'europe', 'nl': 'europe',
      'ar': 'middle-east', 'tr': 'middle-east', 'he': 'middle-east',
      'en': 'anglo', 'sv': 'nordic', 'no': 'nordic', 'da': 'nordic', 'fi': 'nordic'
    };
    
    return languageToRegion[language] || 'other';
  }

  private selectWithWeights(options: string[], usageCount: { [key: string]: number }, favorLessUsed: boolean = true): string {
    if (options.length === 0) return '';
    if (options.length === 1) return options[0];
    
    // Calculate weights (inverse of usage for diversity)
    const maxUsage = Math.max(...Object.values(usageCount));
    const weights = options.map(option => {
      const usage = usageCount[option] || 0;
      return favorLessUsed ? (maxUsage - usage + 1) : (usage + 1);
    });
    
    // Weighted random selection
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < options.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return options[i];
      }
    }
    
    return options[options.length - 1];
  }

  private selectTrackWithPopularityVariance(tracks: Track[]): Track {
    if (tracks.length === 1) return tracks[0];
    
    // Create popularity buckets for variance
    const sorted = [...tracks].sort((a, b) => b.popularity - a.popularity);
    const bucketSize = Math.ceil(tracks.length / 3);
    
    // 40% chance high popularity, 35% medium, 25% low
    const random = Math.random();
    let selectedBucket: Track[];
    
    if (random < 0.4) {
      selectedBucket = sorted.slice(0, bucketSize); // High popularity
    } else if (random < 0.75) {
      selectedBucket = sorted.slice(bucketSize, bucketSize * 2); // Medium popularity
    } else {
      selectedBucket = sorted.slice(bucketSize * 2); // Low popularity
    }
    
    // Random selection within the bucket
    return selectedBucket[Math.floor(Math.random() * selectedBucket.length)];
  }

  private intelligentShuffle(tracks: Track[]): Track[] {
    if (tracks.length <= 1) return tracks;
    
    const shuffled = [...tracks];
    
    // Fisher-Yates shuffle with intelligent spacing
    for (let i = shuffled.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      
      // Avoid placing tracks with same language consecutively
      const currentLang = shuffled[i].language;
      const swapLang = shuffled[j].language;
      
      if (i > 0 && currentLang === swapLang && currentLang === shuffled[i-1].language) {
        // Try to find a different language track to swap with
        for (let k = 0; k < i; k++) {
          if (shuffled[k].language !== currentLang) {
            j = k;
            break;
          }
        }
      }
      
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }

  private applyArtistDiversityAndShuffle(tracks: Track[]): Track[] {
    const usedArtists = new Set<string>();
    const diverseTracks: Track[] = [];
    
    // First pass: one track per artist
    for (const track of tracks) {
      const artistName = track.artists[0]?.name;
      if (!usedArtists.has(artistName)) {
        diverseTracks.push(track);
        usedArtists.add(artistName);
      }
    }
    
    // Second pass: fill remaining with duplicates if needed
    const remaining = tracks.filter(track => 
      !diverseTracks.some(dt => dt.id === track.id)
    );
    
    diverseTracks.push(...remaining);
    
    return this.intelligentShuffle(diverseTracks);
  }

  private addVarianceToNoFilterResults(tracks: Track[], filters: RecommendationFilters): Track[] {
    // Enhanced variance algorithm for when no specific filters are applied
    
    // 1. Create diverse genre buckets
    const genreGroups: { [key: string]: Track[] } = {};
    const eraGroups: { [key: string]: Track[] } = {};
    const popularityGroups: { [key: string]: Track[] } = {};
    
    tracks.forEach(track => {
      // Group by inferred genre or style
      const genre = this.inferTrackGenre(track);
      if (!genreGroups[genre]) genreGroups[genre] = [];
      genreGroups[genre].push(track);
      
      // Group by era (decade)
      const year = new Date(track.album.release_date).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      const era = decade >= 2020 ? 'modern' : decade >= 2010 ? '2010s' : decade >= 2000 ? '2000s' : decade >= 1990 ? '90s' : 'classic';
      if (!eraGroups[era]) eraGroups[era] = [];
      eraGroups[era].push(track);
      
      // Group by popularity level
      const popLevel = track.popularity >= 70 ? 'high' : track.popularity >= 40 ? 'medium' : 'low';
      if (!popularityGroups[popLevel]) popularityGroups[popLevel] = [];
      popularityGroups[popLevel].push(track);
    });
    
    // 2. Create diverse selection strategy
    const diverseSelection: Track[] = [];
    const maxTracks = Math.min(tracks.length, 50);
    const usedTrackIds = new Set<string>();
    
    // 3. Ensure representation from each major group
    const allGenres = Object.keys(genreGroups);
    const allEras = Object.keys(eraGroups);
    const allPopLevels = Object.keys(popularityGroups);
    
    // 4. Smart selection with maximum variance
    for (let attempt = 0; attempt < maxTracks * 2 && diverseSelection.length < maxTracks; attempt++) {
      // Random selection of variance factors
      const selectedGenre = allGenres[Math.floor(Math.random() * allGenres.length)];
      const selectedEra = allEras[Math.floor(Math.random() * allEras.length)];
      const selectedPopLevel = allPopLevels[Math.floor(Math.random() * allPopLevels.length)];
      
      // Find tracks that match multiple variance criteria
      const candidates = tracks.filter(track => {
        if (usedTrackIds.has(track.id)) return false;
        
        const trackGenre = this.inferTrackGenre(track);
        const year = new Date(track.album.release_date).getFullYear();
        const decade = Math.floor(year / 10) * 10;
        const era = decade >= 2020 ? 'modern' : decade >= 2010 ? '2010s' : decade >= 2000 ? '2000s' : decade >= 1990 ? '90s' : 'classic';
        const popLevel = track.popularity >= 70 ? 'high' : track.popularity >= 40 ? 'medium' : 'low';
        
        // Prefer tracks that match multiple criteria for better variance
        let score = 0;
        if (trackGenre === selectedGenre) score++;
        if (era === selectedEra) score++;
        if (popLevel === selectedPopLevel) score++;
        
        return score >= 1; // At least one match
      });
      
      if (candidates.length > 0) {
        // Select with weighted randomness
        const selectedTrack = this.selectTrackWithTemporalVariance(candidates);
        if (!usedTrackIds.has(selectedTrack.id)) {
          diverseSelection.push(selectedTrack);
          usedTrackIds.add(selectedTrack.id);
        }
      }
    }
    
    // 5. Fill remaining slots with truly random selections
    if (diverseSelection.length < maxTracks) {
      const remaining = tracks.filter(track => !usedTrackIds.has(track.id));
      const shuffledRemaining = remaining.sort(() => Math.random() - 0.5);
      
      for (let i = 0; i < Math.min(shuffledRemaining.length, maxTracks - diverseSelection.length); i++) {
        diverseSelection.push(shuffledRemaining[i]);
      }
    }
    
    // 6. Apply intelligent shuffle to prevent clustering
    return this.shuffleWithVarianceOptimization(diverseSelection);
  }

  private inferTrackGenre(track: Track): string {
    const trackText = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
    
    // Enhanced genre detection
    if (/bollywood|hindi|indian|bharat/i.test(trackText)) return 'bollywood';
    if (/rock|metal|punk|grunge/i.test(trackText)) return 'rock';
    if (/pop|chart|hit|radio/i.test(trackText)) return 'pop';
    if (/electronic|edm|techno|house|dance/i.test(trackText)) return 'electronic';
    if (/hip.hop|rap|trap|urban/i.test(trackText)) return 'hip-hop';
    if (/jazz|swing|blues|soul/i.test(trackText)) return 'jazz';
    if (/classical|symphony|orchestra|instrumental/i.test(trackText)) return 'classical';
    if (/(r&b|rnb)|rhythm/i.test(trackText)) return 'rnb';
    if (/country|folk|acoustic/i.test(trackText)) return 'country';
    if (/reggae|ska|dub/i.test(trackText)) return 'reggae';
    if (/latin|salsa|merengue|bachata/i.test(trackText)) return 'latin';
    if (/alternative|indie|underground/i.test(trackText)) return 'alternative';
    
    // Language-based genre inference
    if (track.language) {
      const langGenres: { [key: string]: string } = {
        'hi': 'bollywood', 'ta': 'tamil', 'te': 'telugu', 'pa': 'punjabi',
        'ko': 'k-pop', 'ja': 'j-pop', 'es': 'latin', 'fr': 'chanson'
      };
      if (langGenres[track.language]) return langGenres[track.language];
    }
    
    return 'popular';
  }

  private selectTrackWithTemporalVariance(tracks: Track[]): Track {
    if (tracks.length === 1) return tracks[0];
    
    // Add temporal variance based on release date
    const now = new Date();
    const tracksWithWeights = tracks.map(track => {
      const releaseDate = new Date(track.album.release_date);
      const ageInYears = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      
      // Weight factors
      let weight = 1;
      
      // Slightly prefer newer content but still allow classics
      if (ageInYears < 5) weight *= 1.3;
      else if (ageInYears < 10) weight *= 1.1;
      else if (ageInYears > 30) weight *= 1.2; // Vintage bonus
      
      // Popularity variance
      if (track.popularity > 80) weight *= 0.9; // Slightly reduce extremely popular
      else if (track.popularity < 30) weight *= 1.1; // Boost hidden gems
      
      return { track, weight };
    });
    
    // Weighted random selection
    const totalWeight = tracksWithWeights.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of tracksWithWeights) {
      random -= item.weight;
      if (random <= 0) {
        return item.track;
      }
    }
    
    return tracks[tracks.length - 1];
  }

  private shuffleWithVarianceOptimization(tracks: Track[]): Track[] {
    if (tracks.length <= 2) return tracks;
    
    const optimized = [...tracks];
    
    // Multi-pass optimization to prevent clustering
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < optimized.length - 1; i++) {
        const current = optimized[i];
        const next = optimized[i + 1];
        
        // Check for various clustering patterns
        const sameLanguage = current.language === next.language;
        const sameArtist = current.artists[0]?.name === next.artists[0]?.name;
        const sameGenre = this.inferTrackGenre(current) === this.inferTrackGenre(next);
        const similarPopularity = Math.abs(current.popularity - next.popularity) < 10;
        
        // If too similar, try to find a better position
        if ((sameLanguage && sameGenre) || sameArtist || (sameLanguage && similarPopularity)) {
          // Find a better swap candidate
          for (let j = i + 2; j < Math.min(i + 8, optimized.length); j++) {
            const candidate = optimized[j];
            
            // Check if swapping improves diversity
            const candidateLanguage = candidate.language !== current.language;
            const candidateArtist = candidate.artists[0]?.name !== current.artists[0]?.name;
            const candidateGenre = this.inferTrackGenre(candidate) !== this.inferTrackGenre(current);
            
            if (candidateLanguage || candidateArtist || candidateGenre) {
              // Perform swap
              [optimized[i + 1], optimized[j]] = [optimized[j], optimized[i + 1]];
              break;
            }
          }
        }
      }
    }
    
    return optimized;
  }
}

export const spotifyService = new SpotifyService();
export type { Track, RecommendationFilters };