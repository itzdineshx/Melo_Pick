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
    // Add randomization to cache key for language-specific searches
    if (params.language && this.isIndianLanguage(params.language)) {
      const timeBasedSeed = Math.floor(Date.now() / (1000 * 60 * 30)); // Changes every 30 minutes
      return `${method}_${JSON.stringify(params)}_${timeBasedSeed}`;
    }
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

    // Reduce cache hit rate for language searches to increase variety
    const shouldUseCache = cached && cached.length > 0 && 
      (!filters.language || Math.random() > 0.7); // 30% cache hit rate for language searches

    if (shouldUseCache) {
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
    // Enhanced search strategy with maximum variety covering trending hits, underrated gems, and everything in between
    const languageSearchStrategies: { [key: string]: string[][] } = {
      'hi': [
        // Strategy 1: Trending & Popular hits
        ['bollywood hits 2024', 'hindi trending songs', 'bollywood chart toppers'],
        ['arijit singh hits', 'shreya ghoshal popular', 'armaan malik trending'],
        ['hindi viral songs', 'bollywood dance hits', 'latest hindi songs'],
        
        // Strategy 2: Classic hits from different eras
        ['90s bollywood hits', '2000s hindi songs', '80s bollywood classics'],
        ['kishore kumar hits', 'lata mangeshkar classics', 'mohammed rafi songs'],
        ['kumar sanu romantic', 'udit narayan hits', 'alka yagnik songs'],
        
        // Strategy 3: Underrated & Independent
        ['hindi indie songs', 'independent hindi artist', 'non film hindi'],
        ['underground hindi', 'hindi band music', 'indie bollywood'],
        ['regional hindi', 'folk hindi fusion', 'classical hindi modern'],
        
        // Strategy 4: Album deep cuts & variety
        ['bollywood album songs', 'hindi soundtrack deep cuts', 'film music compilation'],
        ['sufi hindi', 'qawwali modern', 'ghazal contemporary'],
        ['devotional hindi', 'bhajan modern', 'spiritual hindi'],
        
        // Strategy 5: Genre variety
        ['hindi rock', 'bollywood electronic', 'hindi jazz fusion'],
        ['punjabi hindi fusion', 'haryanvi bollywood', 'rajasthani hindi']
      ],
      'ta': [
        // Strategy 1: Current trending & hits
        ['tamil hits 2024', 'kollywood trending', 'tamil viral songs'],
        ['anirudh latest hits', 'ar rahman trending', 'yuvan new songs'],
        ['sid sriram popular', 'tamil dance hits', 'kollywood chart'],
        
        // Strategy 2: Classic & Golden era
        ['90s tamil hits', 'ilayaraja classics', 'ar rahman 90s'],
        ['spb hits', 'kj yesudas tamil', 'janaki tamil songs'],
        ['harris jayaraj hits', 'vidyasagar classics', 'deva hits'],
        
        // Strategy 3: Independent & underrated
        ['tamil indie music', 'independent tamil artist', 'tamil band'],
        ['chennai indie scene', 'tamil underground', 'non film tamil'],
        ['tamil folk fusion', 'gaana independent', 'kuthu underground'],
        
        // Strategy 4: Album tracks & deep cuts
        ['tamil album songs', 'kollywood soundtrack', 'tamil compilation'],
        ['carnatic fusion tamil', 'devotional tamil modern', 'bhajan tamil'],
        ['murugan songs modern', 'temple music contemporary'],
        
        // Strategy 5: Regional & genre variety
        ['kongu tamil songs', 'madras tamil music', 'salem tamil'],
        ['tamil rock', 'tamil electronic', 'tamil jazz']
      ],
      'te': [
        // Trending & Popular
        ['telugu hits 2024', 'tollywood trending', 'telugu viral songs'],
        ['devi sri prasad hits', 'thaman popular', 'telugu dance numbers'],
        
        // Classic hits
        ['90s telugu hits', 'keeravani classics', 'spb telugu hits'],
        ['ilayaraja telugu', 'telugu golden hits', 'old telugu songs'],
        
        // Independent & underrated
        ['telugu indie music', 'independent telugu', 'telugu band'],
        ['hyderabad indie', 'telugu underground', 'non film telugu'],
        
        // Albums & variety
        ['telugu album songs', 'devotional telugu', 'folk telugu'],
        ['carnatic telugu', 'classical telugu modern', 'fusion telugu']
      ],
      'pa': [
        // Trending
        ['punjabi hits 2024', 'punjabi trending', 'punjabi viral'],
        ['sidhu moose wala', 'diljit dosanjh hits', 'punjabi chart'],
        
        // Classic & traditional
        ['punjabi folk songs', 'gurbani modern', 'sufi punjabi'],
        ['bhangra traditional', 'punjabi devotional', 'classical punjabi'],
        
        // Independent
        ['punjabi indie', 'underground punjabi', 'punjabi band'],
        ['new punjabi artist', 'independent punjabi singer'],
        
        // Variety
        ['punjabi album songs', 'punjabi fusion', 'punjabi rock']
      ],
      'bn': [
        // Trending & popular
        ['bengali hits 2024', 'bangla trending', 'bengali viral'],
        ['arijit singh bengali', 'shreya ghoshal bengali', 'bengali chart'],
        
        // Classical & traditional
        ['rabindra sangeet', 'nazrul geeti', 'adhunik bengali'],
        ['baul songs modern', 'bengali classical', 'devotional bengali'],
        
        // Independent
        ['bengali indie', 'kolkata band', 'bengali underground'],
        ['independent bengali', 'new bengali artist'],
        
        // Variety
        ['bengali album songs', 'bengali folk fusion', 'bengali rock']
      ],
      'gu': [
        ['gujarati hits 2024', 'gujarati trending', 'garba songs'],
        ['dandiya hits', 'navratri songs', 'gujarati devotional'],
        ['gujarati indie', 'gujarati folk', 'gujarati band'],
        ['gujarati album songs', 'gujarati classical', 'bhajan gujarati']
      ],
      'kn': [
        ['kannada hits 2024', 'sandalwood trending', 'kannada viral'],
        ['kannada classical', 'bhavageete', 'sugama sangeetha'],
        ['kannada indie', 'bangalore band', 'independent kannada'],
        ['kannada album songs', 'devotional kannada', 'folk kannada']
      ],
      'ml': [
        ['malayalam hits 2024', 'mollywood trending', 'malayalam viral'],
        ['malayalam classical', 'carnatic malayalam', 'devotional malayalam'],
        ['malayalam indie', 'kochi band', 'independent malayalam'],
        ['malayalam album songs', 'mappilapattu', 'kerala folk']
      ],
      'mr': [
        ['marathi hits 2024', 'marathi trending', 'lavani songs'],
        ['marathi classical', 'abhang', 'powada'],
        ['marathi indie', 'pune band', 'independent marathi'],
        ['marathi album songs', 'devotional marathi', 'folk marathi']
      ],
      'ur': [
        ['urdu hits 2024', 'urdu trending', 'ghazal modern'],
        ['qawwali contemporary', 'urdu classical', 'nazm modern'],
        ['urdu indie', 'independent urdu', 'urdu band'],
        ['urdu album songs', 'sufi urdu', 'devotional urdu']
      ],
      'or': [
        ['odia hits 2024', 'ollywood trending', 'odia viral'],
        ['odia classical', 'jagannath bhajan', 'devotional odia'],
        ['odia indie', 'bhubaneswar band', 'independent odia'],
        ['odia album songs', 'folk odia', 'tribal odia']
      ],
      'as': [
        ['assamese hits 2024', 'assamese trending', 'bihu songs'],
        ['borgeet', 'assamese classical', 'devotional assamese'],
        ['assamese indie', 'guwahati band', 'northeast music'],
        ['assamese album songs', 'folk assamese', 'tribal assam']
      ]
    };

    const searchStrategies = languageSearchStrategies[filters.language!] || [
      [`${filters.language} music trending`, `${filters.language} songs popular`, `${filters.language} hits`]
    ];

    // Enhanced search with maximum variety - mix of trending, classic, and underrated
    const allCandidates: Track[] = [];
    const usedArtists = new Set<string>();
    const usedAlbums = new Set<string>();
    const usedTracks = new Set<string>();

    // Shuffle strategies to get random mix each time
    const shuffledStrategies = [...searchStrategies].sort(() => Math.random() - 0.5);

    // Try multiple search strategies with different approaches
    for (const strategy of shuffledStrategies) {
      for (const searchTerm of strategy) {
        try {
          // Use different search parameters for each attempt
          const searchParams: any = {
            q: searchTerm,
            type: 'track',
            limit: 50,
            market: 'IN',
            offset: Math.floor(Math.random() * 300) // Random offset for maximum variety
          };

          const response: any = await this.makeRequestWithRetry(
            'https://api.spotify.com/v1/search',
            {
              headers: { Authorization: `Bearer ${token}` },
              params: searchParams,
            }
          );

          if (response.tracks?.items?.length > 0) {
            // Filter tracks immediately for maximum diversity
            const newTracks = response.tracks.items.filter((track: Track) => {
              const artistName = track.artists[0]?.name;
              const albumName = track.album.name;
              const trackKey = `${track.name}-${artistName}`;
              
              // Skip if we already have this track, artist, or album
              return !usedTracks.has(trackKey) && 
                     !usedArtists.has(artistName) && 
                     !usedAlbums.has(albumName);
            });

            // Add language detection
            const tracksWithLanguage = await Promise.all(
              newTracks.slice(0, 8).map(async (track: Track) => ({
                ...track,
                language: await this.detectLanguageEnhanced(track, 'IN', filters.language!)
              }))
            );

            // Filter by target language
            const languageFilteredTracks = tracksWithLanguage.filter(track => 
              this.isTrackInTargetLanguage(track, filters.language!)
            );

            // Add to candidates and update used sets
            languageFilteredTracks.forEach(track => {
              allCandidates.push(track);
              const trackKey = `${track.name}-${track.artists[0]?.name}`;
              usedTracks.add(trackKey);
              usedArtists.add(track.artists[0]?.name);
              usedAlbums.add(track.album.name);
            });

            // Stop if we have enough variety
            if (allCandidates.length >= 25) break;
          }
        } catch (error) {
          console.error(`Search failed for term: ${searchTerm}`, error);
          continue;
        }
      }
      
      if (allCandidates.length >= 20) break; // Enough variety from current strategy
    }

    // Additional search for underground artists if we need more variety
    if (allCandidates.length < 20) {
      const undergroundResults = await this.searchUndergroundArtists(filters.language!, token, usedArtists, usedTracks);
      allCandidates.push(...undergroundResults);
    }

    if (allCandidates.length === 0) {
      throw new Error(`No diverse ${filters.language} tracks found`);
    }

    // Select track with balanced unpredictability (trending + underrated)
    return this.selectBalancedTrack(allCandidates, filters.language!);
  }

  private async searchUndergroundArtists(language: string, token: string, usedArtists: Set<string>, usedTracks: Set<string>): Promise<Track[]> {
    const undergroundTerms: { [key: string]: string[] } = {
      'hi': ['hindi indie band', 'underground hindi rapper', 'new hindi singer', 'delhi band hindi', 'mumbai indie hindi'],
      'ta': ['chennai indie band', 'tamil rapper', 'new tamil artist', 'tamil band', 'coimbatore band'],
      'te': ['hyderabad band telugu', 'indie telugu', 'new telugu singer', 'telugu rapper', 'vijayawada band'],
      'pa': ['punjabi band', 'underground punjabi', 'new punjabi artist', 'amritsar band', 'ludhiana indie'],
      'bn': ['bengali band', 'kolkata indie', 'new bengali singer', 'bangladesh band', 'bengali rapper'],
      'gu': ['gujarati band', 'ahmedabad indie', 'new gujarati artist', 'surat band', 'gujarati rapper'],
      'kn': ['bangalore band kannada', 'indie kannada', 'new kannada singer', 'mangalore band', 'kannada rapper'],
      'ml': ['kochi band malayalam', 'indie malayalam', 'new malayalam singer', 'kerala band', 'malayalam rapper'],
      'mr': ['pune band marathi', 'mumbai indie marathi', 'new marathi singer', 'marathi band', 'nashik band'],
      'ur': ['urdu band', 'pakistani indie', 'new urdu artist', 'karachi band', 'lahore indie'],
      'or': ['bhubaneswar band', 'indie odia', 'new odia singer', 'cuttack band', 'odia rapper'],
      'as': ['guwahati band', 'indie assamese', 'new assamese singer', 'assam band', 'northeast indie']
    };

    const terms = undergroundTerms[language] || [`${language} independent`, `${language} band`];
    const results: Track[] = [];

    for (const term of terms) {
      try {
        const response: any = await this.makeRequestWithRetry(
          'https://api.spotify.com/v1/search',
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              q: term,
              type: 'track',
              limit: 20,
              market: 'IN',
              offset: Math.floor(Math.random() * 100)
            },
          }
        );

        if (response.tracks?.items?.length > 0) {
          const filteredTracks = response.tracks.items.filter((track: Track) => {
            const artistName = track.artists[0]?.name;
            const trackKey = `${track.name}-${artistName}`;
            return !usedArtists.has(artistName) && !usedTracks.has(trackKey) && track.popularity < 60; // Focus on less popular tracks
          });

          results.push(...filteredTracks.slice(0, 3));
          
          // Update used sets
          filteredTracks.forEach((track: Track) => {
            const artistName = track.artists[0]?.name;
            const trackKey = `${track.name}-${artistName}`;
            usedArtists.add(artistName);
            usedTracks.add(trackKey);
          });
        }
      } catch (error) {
        continue;
      }
    }

    return results;
  }

  private isTrackInTargetLanguage(track: Track, targetLanguage: string): boolean {
    // Enhanced language detection logic
    const detectedLanguage = track.language || this.detectLanguageFromTrackData(track);
    
    // Direct match
    if (detectedLanguage === targetLanguage) return true;
    
    // Language family matches (for related languages)
    const languageFamilies: { [key: string]: string[] } = {
      'hi': ['hi', 'ur', 'mr'], // Hindi family
      'ta': ['ta', 'ml'],       // Tamil family  
      'te': ['te', 'kn'],       // Telugu family
      'bn': ['bn', 'as'],       // Bengali family
    };

    if (languageFamilies[targetLanguage]?.includes(detectedLanguage)) {
      return true;
    }

    // Fallback: check if track content suggests target language
    return this.analyzeTrackContentForLanguage(track, targetLanguage);
  }

  private detectLanguageFromTrackData(track: Track): string {
    const text = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
    
    // Quick script detection
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
    if (/[\u0980-\u09FF]/.test(text)) return 'bn';
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
    if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
    if (/[\u0600-\u06FF]/.test(text)) return 'ur';
    
    // Pattern-based detection with better accuracy
    if (/\b(bollywood|hindi|kumar|singh|sharma|agarwal|pyaar|ishq|dil)\b/i.test(text)) return 'hi';
    if (/\b(tamil|kollywood|raja|murugan|chennai|kadhal)\b/i.test(text)) return 'ta';
    if (/\b(telugu|tollywood|reddy|krishna|hyderabad|prema)\b/i.test(text)) return 'te';
    if (/\b(punjabi|singh|kaur|jatt|punjab|bhangra)\b/i.test(text)) return 'pa';
    if (/\b(bengali|bangla|kolkata|babu|roy|sen)\b/i.test(text)) return 'bn';
    if (/\b(gujarati|gujarat|patel|shah|garba)\b/i.test(text)) return 'gu';
    if (/\b(kannada|karnataka|gowda|bengaluru)\b/i.test(text)) return 'kn';
    if (/\b(malayalam|kerala|menon|nair)\b/i.test(text)) return 'ml';
    if (/\b(marathi|maharashtra|patil|kulkarni)\b/i.test(text)) return 'mr';
    if (/\b(urdu|ghazal|qawwali|khan|ali)\b/i.test(text)) return 'ur';
    if (/\b(odia|odisha|rath|panda)\b/i.test(text)) return 'or';
    if (/\b(assamese|assam|das|gogoi)\b/i.test(text)) return 'as';
    
    return 'en';
  }

  private analyzeTrackContentForLanguage(track: Track, targetLanguage: string): boolean {
    const artistName = track.artists[0]?.name.toLowerCase() || '';
    const trackName = track.name.toLowerCase();
    const albumName = track.album.name.toLowerCase();
    
    // Language-specific artist patterns for underrated/unknown artists
    const languagePatterns: { [key: string]: RegExp[] } = {
      'hi': [
        /\b(kumar|singh|sharma|gupta|verma|agarwal|jain|shah|mehta|pandey)\b/i,
        /\b(hindi|bollywood|mumbai|delhi|india|pyaar|ishq|dil|jaan)\b/i
      ],
      'ta': [
        /\b(raja|rajan|kumar|murugan|selvam|karthik|vijay|ajith|arjun|surya)\b/i,
        /\b(tamil|chennai|madras|coimbatore|salem|trichy|kadhal|anbu)\b/i
      ],
      'te': [
        /\b(reddy|rao|krishna|rama|sai|sri|venkat|chandra|kumar|prasad)\b/i,
        /\b(telugu|hyderabad|vijayawada|tirupati|vizag|warangal|prema)\b/i
      ],
      'pa': [
        /\b(singh|kaur|gill|dhillon|sandhu|brar|sidhu|bajwa|grewal)\b/i,
        /\b(punjabi|punjab|amritsar|ludhiana|patiala|chandigarh|jatt|munda)\b/i
      ],
      'bn': [
        /\b(das|roy|sen|ghosh|mukherjee|chatterjee|banerjee|chakraborty)\b/i,
        /\b(bengali|bangla|kolkata|dhaka|sylhet|chittagong|bhalobasha)\b/i
      ],
      'gu': [
        /\b(patel|shah|dave|mehta|joshi|gandhi|amin|desai|modi)\b/i,
        /\b(gujarati|gujarat|ahmedabad|surat|vadodara|rajkot|garba)\b/i
      ],
      'kn': [
        /\b(gowda|rao|kumar|hegde|shetty|nayak|bhat|acharya)\b/i,
        /\b(kannada|karnataka|bangalore|bengaluru|mysore|hubli|prema)\b/i
      ],
      'ml': [
        /\b(nair|menon|pillai|kumar|das|varma|krishnan|unni)\b/i,
        /\b(malayalam|kerala|kochi|trivandrum|kozhikode|thrissur|sneham)\b/i
      ],
      'mr': [
        /\b(patil|desai|joshi|kulkarni|bhosle|jadhav|pawar|shinde)\b/i,
        /\b(marathi|maharashtra|mumbai|pune|nagpur|nashik|lavani)\b/i
      ],
      'ur': [
        /\b(khan|ali|hassan|ahmed|shah|malik|qureshi|siddiqui)\b/i,
        /\b(urdu|ghazal|qawwali|nazm|shayari|pakistan|ishq|mohabbat)\b/i
      ],
      'or': [
        /\b(rath|panda|sahoo|nayak|das|mishra|patra|behera)\b/i,
        /\b(odia|odisha|bhubaneswar|cuttack|puri|sambalpur)\b/i
      ],
      'as': [
        /\b(das|gogoi|borah|deka|kalita|sharma|baruah|hazarika)\b/i,
        /\b(assamese|assam|guwahati|dibrugarh|jorhat|silchar|bihu)\b/i
      ]
    };

    const patterns = languagePatterns[targetLanguage] || [];
    const allText = `${artistName} ${trackName} ${albumName}`;
    
    return patterns.some(pattern => pattern.test(allText));
  }

  private selectBalancedTrack(tracks: Track[], language: string): Track {
    if (tracks.length === 1) return tracks[0];

    // Create balanced scoring system that includes trending hits and underrated gems
    const scoredTracks = tracks.map(track => {
      let varietyScore = Math.random() * 100; // Base randomness
      
      // Balanced approach: boost both high and low popularity tracks
      if (track.popularity > 70) {
        varietyScore += 25; // Trending hits get some boost
      } else if (track.popularity < 30) {
        varietyScore += 40; // Underrated tracks get higher boost
      } else if (track.popularity >= 30 && track.popularity <= 70) {
        varietyScore += 15; // Mid-range gets modest boost
      }
      
      // Boost score for album tracks vs singles (often more variety)
      if (!track.album.name.toLowerCase().includes('single')) {
        varietyScore += 20;
      }
      
      // Time-based variety (mix of old, recent, and current)
      const releaseYear = new Date(track.album.release_date).getFullYear();
      const currentYear = new Date().getFullYear();
      const age = currentYear - releaseYear;
      
      if (age > 15) varietyScore += 15; // Classic tracks
      else if (age < 2) varietyScore += 25; // Very recent
      else if (age >= 2 && age <= 5) varietyScore += 20; // Recent hits
      else if (age >= 6 && age <= 10) varietyScore += 10; // Mid-range
      
      // Boost for diverse artist names (likely independent or unique)
      const artistName = track.artists[0]?.name || '';
      if (artistName.length > 15 || artistName.includes('&') || artistName.includes('Band')) {
        varietyScore += 10;
      }
      
      // Boost for explicit content (often more diverse/authentic)
      if (track.explicit) {
        varietyScore += 5;
      }
      
      return { track, score: varietyScore };
    });

    // Sort by variety score
    scoredTracks.sort((a, b) => b.score - a.score);
    
    // Select from top balanced tracks with additional randomness
    const topBalanced = scoredTracks.slice(0, Math.min(8, scoredTracks.length));
    const finalSelection = topBalanced[Math.floor(Math.random() * topBalanced.length)];
    
    return finalSelection.track;
  }

  // Enhanced language detection with API data
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
