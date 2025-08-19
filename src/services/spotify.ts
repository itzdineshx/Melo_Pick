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

interface TrackWithLanguage extends Track {
  language: string;
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
  private readonly MIN_POPULARITY = 25;
  private readonly REQUEST_TIMEOUT = 8000;
  private usedTrackIds: Set<string> = new Set();
  private sessionStartTime: number = Date.now();

  // Enhanced language-specific search terms with better regional targeting
  private readonly LANGUAGE_SEARCH_TERMS: { [key: string]: string[][] } = {
    'en': [
      ['english pop', 'billboard hits', 'top 40', 'radio hits', 'chart toppers'],
      ['classic english', 'rock classics', '80s hits', '90s hits', 'y2k hits', 'retro english'],
      ['indie english', 'alternative rock', 'indie pop', 'bedroom pop', 'lo-fi english'],
      ['new english 2024', 'latest english 2025', 'fresh english', 'trending english', 'viral english'],
      ['english album', 'soundtrack english', 'movie soundtrack', 'tv soundtrack'],
      ['pop rock', 'hip hop', 'edm', 'electronic', 'jazz', 'country', 'folk'],
      ['love songs english', 'sad english', 'party english', 'workout english', 'chill english']
    ],

    'ta': [
      ['tamil songs', 'tamil music', 'kollywood', 'tamil hits', 'tamilnadu music'],
      ['purani tamil', 'old tamil songs', '90s tamil', 'ilaiyaraaja', 'ar rahman tamil', 'spb tamil'],
      ['tamil indie', 'tamil rock', 'tamil fusion', 'independent tamil', 'underground tamil'],
      ['puthu tamil', 'latest tamil 2024', 'tamil 2025', 'new tamil songs', 'trending tamil'],
      ['tamil cinema', 'kollywood songs', 'tamil movie songs', 'tamil soundtrack'],
      ['tamil kuthu', 'tamil melody', 'tamil folk', 'tamil classical', 'carnatic tamil'],
      ['kadhal paadal', 'sad tamil', 'romantic tamil', 'tamil dance', 'tamil party songs']
    ],

    'hi': [
      ['hindi songs', 'bollywood music', 'hindi gana', 'bollywood hits', 'filmi geet'],
      ['purane gane', 'old hindi songs', '90s bollywood', 'kumar sanu', 'lata mangeshkar', 'kishore kumar'],
      ['indie hindi', 'hindi band', 'hindi rock', 'fusion hindi', 'non filmi hindi'],
      ['naye gane', 'latest hindi 2024', 'hindi 2025', 'new bollywood', 'trending hindi'],
      ['bollywood soundtrack', 'hindi movie songs', 'film music', 'playback hindi'],
      ['hindi rap', 'hindi pop', 'hindi rock', 'sufi hindi', 'qawwali', 'ghazal'],
      ['romantic hindi', 'sad hindi', 'party hindi', 'dance hindi', 'bhangra', 'item songs']
    ],

    'ml': [
      ['malayalam songs', 'mollywood', 'malayalam music', 'kerala songs'],
      ['old malayalam', 'evergreen malayalam', '90s malayalam', 'yesudas malayalam'],
      ['malayalam indie', 'malayalam band', 'malayalam fusion', 'alternative malayalam'],
      ['new malayalam 2024', 'latest malayalam', 'malayalam 2025', 'trending malayalam'],
      ['mollywood songs', 'malayalam cinema', 'malayalam soundtrack', 'film songs malayalam'],
      ['malayalam classical', 'malayalam folk', 'malayalam devotional', 'oppana'],
      ['pranayam malayalam', 'sad malayalam', 'romantic malayalam', 'malayalam dance']
    ],

    'te': [
      ['telugu songs', 'tollywood', 'telugu music', 'andhra songs', 'telangana songs'],
      ['old telugu songs', 'evergreen telugu', '90s telugu', 'spb telugu', 'janaki telugu'],
      ['telugu indie', 'telugu band', 'telugu fusion', 'independent telugu'],
      ['kotha telugu', 'latest telugu 2024', 'telugu 2025', 'new telugu songs'],
      ['tollywood songs', 'telugu cinema', 'telugu movie songs', 'telugu soundtrack'],
      ['telugu classical', 'telugu folk', 'telugu devotional', 'carnatic telugu'],
      ['prema telugu', 'sad telugu', 'romantic telugu', 'telugu dance', 'mass songs']
    ],

    'kn': [
      ['kannada songs', 'sandalwood', 'kannada music', 'karnataka songs'],
      ['old kannada songs', 'evergreen kannada', '90s kannada', 'pbsreenivas kannada'],
      ['kannada indie', 'kannada band', 'kannada fusion', 'raghu dixit'],
      ['new kannada 2024', 'latest kannada', 'kannada 2025', 'trending kannada'],
      ['sandalwood songs', 'kannada cinema', 'kannada movie songs'],
      ['kannada classical', 'kannada folk', 'kannada devotional', 'yakshagana'],
      ['preeti kannada', 'sad kannada', 'romantic kannada', 'kannada dance']
    ],

    'pa': [
      ['punjabi songs', 'punjabi music', 'punjab songs', 'desi punjabi'],
      ['old punjabi songs', 'evergreen punjabi', 'gurdas maan', 'kuldeep manak'],
      ['punjabi indie', 'punjabi band', 'punjabi fusion', 'urban punjabi'],
      ['new punjabi 2024', 'latest punjabi', 'punjabi 2025', 'trending punjabi'],
      ['punjabi cinema', 'pollywood', 'punjabi movie songs'],
      ['bhangra', 'punjabi folk', 'giddha', 'punjabi classical', 'sufi punjabi'],
      ['ishq punjabi', 'sad punjabi', 'romantic punjabi', 'punjabi party', 'club punjabi']
    ],

    'bn': [
      ['bengali songs', 'bangla music', 'bengali gaan', 'kolkata songs'],
      ['old bengali songs', 'rabindra sangeet', 'nazrul geeti', 'hemanta mukherjee'],
      ['bengali band', 'bengali rock', 'bengali fusion', 'independent bengali'],
      ['new bengali 2024', 'latest bengali', 'bengali 2025', 'trending bengali'],
      ['bengali cinema', 'tollywood bengali', 'bengali movie songs'],
      ['bengali classical', 'bengali folk', 'baul', 'kirtan', 'adhunik bengali'],
      ['bhalobasha bengali', 'sad bengali', 'romantic bengali', 'bengali dance']
    ],

    'gu': [
      ['gujarati songs', 'gujarati music', 'gujarat songs', 'gujarati geet'],
      ['old gujarati songs', 'evergreen gujarati', 'gujarati lok geet'],
      ['gujarati band', 'gujarati fusion', 'independent gujarati'],
      ['new gujarati 2024', 'latest gujarati', 'gujarati 2025'],
      ['gujarati cinema', 'gujarati movie songs', 'gujarati film'],
      ['garba', 'dandiya', 'gujarati folk', 'gujarati classical', 'gujarati bhajan'],
      ['prem gujarati', 'sad gujarati', 'romantic gujarati', 'gujarati dance']
    ],

    'mr': [
      ['marathi songs', 'marathi music', 'maharashtra songs', 'marathi geet'],
      ['old marathi songs', 'evergreen marathi', 'lata marathi', 'marathi classics'],
      ['marathi band', 'marathi fusion', 'independent marathi'],
      ['new marathi 2024', 'latest marathi', 'marathi 2025'],
      ['marathi cinema', 'marathi movie songs', 'marathi film'],
      ['lavani', 'marathi folk', 'marathi classical', 'marathi bhajan', 'powada'],
      ['prem marathi', 'sad marathi', 'romantic marathi', 'marathi dance']
    ]
  };

  // More comprehensive regional markets mapping
  private readonly LANGUAGE_MARKETS: { [key: string]: string[] } = {
    'hi': ['IN', 'US', 'CA', 'GB', 'AU'], // Hindi speakers globally
    'ta': ['IN', 'LK', 'SG', 'MY', 'US'], // Tamil diaspora
    'te': ['IN', 'US', 'CA', 'AU'],       // Telugu diaspora
    'pa': ['IN', 'CA', 'US', 'GB'],       // Punjabi diaspora
    'bn': ['IN', 'BD', 'US', 'GB'],       // Bengali speakers
    'gu': ['IN', 'US', 'CA', 'GB'],       // Gujarati diaspora
    'kn': ['IN', 'US', 'CA'],             // Kannada speakers
    'ml': ['IN', 'AE', 'US', 'GB'],       // Malayalam diaspora
    'mr': ['IN', 'US'],                   // Marathi speakers
    'en': ['US', 'GB', 'CA', 'AU', 'NZ', 'IE'],
    'es': ['ES', 'MX', 'AR', 'CO', 'US'],
    'fr': ['FR', 'CA', 'BE', 'CH'],
    'de': ['DE', 'AT', 'CH'],
    'it': ['IT', 'US', 'AR'],
    'pt': ['BR', 'PT'],
    'ja': ['JP', 'US'],
    'ko': ['KR', 'US'],
    'zh': ['CN', 'TW', 'HK', 'SG'],
    'ar': ['SA', 'EG', 'AE', 'MA']
  };

  // Language detection patterns - much more comprehensive
  private readonly LANGUAGE_PATTERNS: { [key: string]: RegExp[] } = {
  'hi': [
    /[\u0900-\u097F]/g, // Devanagari script
    /\b(bollywood|hindi|bharat|hindustan|desi|filmi|gana|geet|sangam|rangila|item\s*song|naach|gaana)\b/i,
    /\b(arijit|shreya|lata|kishore|kumar|sonu|nigam|rahat|udit|alka|sunidhi|neha|jubin|badshah|yo\s*yo|armaan|kk|shankar)\b/i,
    /\b(pyaar|ishq|dil|jaan|mohabbat|prem|saath|zindagi|sapna|khushi|yaad|aankh|aasman|raat|dosti)\b/i,
    /\b(main|hum|tum|aap|kya|hai|hoon|ghar|raat|din|kab|kaise|kyun|chal|aao|jana)\b/i
  ],

  'ta': [
    /[\u0B80-\u0BFF]/g, // Tamil script
    /\b(tamil|kollywood|tamilnadu|chennai|madras|thalapathy|ilayathalapathy|ajith|rajini|kamal)\b/i,
    /\b(anirudh|rahman|yuvan|harris|deva|ilayaraja|spb|janaki|yesudas|hariharan|chinmayi|shankar|sid\s*sriram)\b/i,
    /\b(kadhal|anbu|pen|kannu|thangam|amma|appa|vaazhkai|kaathal|nenjam|vannam|manam)\b/i,
    /\b(naan|nee|avan|aval|enna|eppo|enga|oru|ippadi|ipo|seri)\b/i
  ],

  'te': [
    /[\u0C00-\u0C7F]/g, // Telugu script
    /\b(telugu|tollywood|andhra|telangana|hyderabad|vijayawada|vizag|charminar)\b/i,
    /\b(thaman|devi\s*sri|keeravani|mickey|chakri|dsp|ram|charan|prabhas|samantha|ntr|allu|sitarama|sid\s*sriram)\b/i,
    /\b(prema|nuvvu|nenu|chinna|papa|amma|nanna|jeevitham|sneham|kalalu|hrudayam)\b/i,
    /\b(nenu|meeru|vaadu|aame|enti|ekkada|ela|okka|idi|inka|ippudu)\b/i
  ],

  'pa': [
    /[\u0A00-\u0A7F]/g, // Gurmukhi script
    /\b(punjabi|punjab|sikh|sardar|amritsar|ludhiana|chandigarh|patiala|balle|gidha|bhangra)\b/i,
    /\b(diljit|sidhu|babbu|gurdas|jazzy|kuldeep|manak|surjit|bindrakhia|ammy|hardy|neha|rafiq)\b/i,
    /\b(jatt|munda|kudi|gal|dil|pyaar|ishq|mittra|yaar|bhai|sher|zindgi|nakhra)\b/i,
    /\b(main|tu|oh|asi|tusi|ki|hai|da|de|nu|kithon|hor|hun)\b/i
  ],

  'bn': [
    /[\u0980-\u09FF]/g, // Bengali script
    /\b(bengali|bangla|kolkata|calcutta|dhaka|bangladesh|paschimbanga|adda|puchka)\b/i,
    /\b(rabindra|nazrul|tagore|hemanta|kishore|manna|sandhya|shreya|arijit|anupam|suman|lopamudra)\b/i,
    /\b(bhalobasha|mon|chokh|gaan|sur|jibon|swapno|meye|chele|hasi|dure|asha)\b/i,
    /\b(ami|tumi|se|apni|kemon|kothay|ki|ache|nebo|dao|hobey|korbo)\b/i
  ],

  'kn': [
    /[\u0C80-\u0CFF]/g, // Kannada script
    /\b(kannada|karnataka|bangalore|bengaluru|mysore|hubli|mangalore|udupi)\b/i,
    /\b(rajkumar|vishnuvardhan|pbsreenivas|vani|jayanthi|srinivas|raghu|dixit|c\.\s*ashwath|arjun\s*jeniya)\b/i,
    /\b(preeti|hrudaya|jeeva|mane|amma|appa|snehitaru|santosha|bhava|ninna)\b/i,
    /\b(naanu|neenu|avanu|avalu|yenu|elli|hege|ondu|idu|ivaga)\b/i
  ],

  'ml': [
    /[\u0D00-\u0D7F]/g, // Malayalam script
    /\b(malayalam|kerala|kochi|trivandrum|calicut|kozhikode|kannur|thrissur|alappuzha)\b/i,
    /\b(yesudas|chithra|jayachandran|mg\s*sreekumar|sujatha|unni\s*menon|vidyadharan|vineeth\s*sreenivasan|bijibal)\b/i,
    /\b(pranayam|sneham|jeevitham|amma|achan|pennu|oru|manasu|swapnam|hridayam)\b/i,
    /\b(njan|nee|avan|aval|enthu|evide|engane|onnu|ipo|pinnem)\b/i
  ],

  'gu': [
    /[\u0A80-\u0AFF]/g, // Gujarati script
    /\b(gujarati|gujarat|ahmedabad|surat|vadodara|rajkot|gandhinagar|dandiya|garba)\b/i,
    /\b(hemant|chauhan|kirtidan|gadhvi|praful|dave|atul|purohit|asha|falguni|kinjal)\b/i,
    /\b(prem|jindagi|sapnu|khushi|maa|papa|dikri|dikro|mitra|yaad|dil)\b/i,
    /\b(hun|tame|te|aapne|shu|kya|kevi|ek|jyaare|kem|chhe)\b/i
  ],

  'mr': [
    /[\u0900-\u097F]/g, // Devanagari (shared with Hindi, but distinct vocab)
    /\b(marathi|maharashtra|mumbai|pune|nagpur|nashik|kolhapur|lavani|tamasha)\b/i,
    /\b(lata|mangeshkar|bhimsen|joshi|pt\s*bhimsen|asha|bhosle|suresh|wadkar|shreya|arati|salil)\b/i,
    /\b(prem|jeevan|swapna|aai|baba|mulga|mulgi|mitra|yaad|dil|saathi)\b/i,
    /\b(mi|tu|to|ti|aapan|kay|kuthe|kase|ek|kon|kadhi)\b/i
  ],
  'en': [
    /[a-zA-Z]/g, // Latin alphabet
    /\b(english|usa|uk|british|american|london|new\s*york|hollywood|pop|rock|rap|hip\s*hop)\b/i,
    /\b(beatles|elvis|beyonce|rihanna|taylor|swift|drake|eminem|adele|bieber|bruno|ed\s*sheeran)\b/i,
    /\b(love|heart|baby|dance|night|dream|music|song|girl|boy|life|forever)\b/i,
    /\b(i|you|we|they|she|he|it|is|are|was|were|the|and|but|if|then)\b/i
  ],

  'es': [
    /[\u00C0-\u017F]/g, // Latin with accents
    /\b(español|espanol|latino|reggaeton|bachata|salsa|sevilla|madrid|barcelona)\b/i,
    /\b(shakira|enrique|iglesias|daddy\s*yankee|bad\s*bunny|maluma|jbalvin|rosalia)\b/i,
    /\b(amigo|corazon|amor|vida|beso|bailar|cancion|fiesta|noche|querer|sueño)\b/i,
    /\b(yo|tú|usted|vos|él|ella|nosotros|ustedes|ellos|soy|eres|estoy|estás)\b/i
  ],

  'fr': [
    /[\u00C0-\u017F]/g, // French accents
    /\b(francais|français|paris|marseille|lyon|france|chanson|amour|parfum|belle)\b/i,
    /\b(edith|piaf|stromae|daft\s*punk|johnny|halliday|celine|dion|mylene|farmer)\b/i,
    /\b(amour|coeur|vie|baiser|nuit|soleil|chanson|musique|reve|belle)\b/i,
    /\b(je|tu|il|elle|nous|vous|ils|elles|suis|es|est|sommes|êtes|sont)\b/i
  ],

  'de': [
    /[\u00C0-\u017F]/g, // German accents
    /\b(deutsch|german|berlin|munich|hamburg|cologne|schlager|techno|krautrock)\b/i,
    /\b(beethoven|bach|mozart|schiller|rammstein|tokio\s*hotel|scorpions)\b/i,
    /\b(liebe|herz|traum|leben|nacht|musik|tanz|mädchen|junge)\b/i,
    /\b(ich|du|er|sie|wir|ihr|sie|bin|bist|ist|sind|seid)\b/i
  ],

  'it': [
    /[\u00C0-\u017F]/g, // Italian accents
    /\b(italiano|italia|roma|napoli|milano|opera|canzone|amore|bella)\b/i,
    /\b(andrea\s*bocelli|eros\s*ramazzotti|laura\s*pausini|paolo|conte)\b/i,
    /\b(amore|cuore|vita|notte|sogno|canzone|ballare|ragazza|ragazzo)\b/i,
    /\b(io|tu|lui|lei|noi|voi|loro|sono|sei|è|siamo|siete)\b/i
  ],

  'pt': [
    /[\u00C0-\u017F]/g, // Portuguese accents
    /\b(portugues|português|brasil|brasileiro|lisboa|fado|samba|bossa|funk)\b/i,
    /\b(roberto\s*carlo|caetano\s*veloso|gilberto\s*gil|anitta|ivete|sangalo)\b/i,
    /\b(amigo|amor|coração|vida|noite|música|dança|menina|menino)\b/i,
    /\b(eu|tu|ele|ela|nós|vocês|eles|sou|estou|é|somos)\b/i
  ],

  'ja': [
    /[\u3040-\u30FF\u4E00-\u9FFF]/g, // Hiragana, Katakana, Kanji
    /\b(japan|japanese|tokyo|osaka|anime|jpop|enka|idol|samurai)\b/i,
    /\b(utada|hikaru|perfume|arashi|akb48|namie|amuro|kumi|koda)\b/i,
    /\b(ai|kokoro|yume|hoshi|yoru|uta|kaze|hana|kimi|watashi|anata)\b/i,
    /\b(watashi|anata|kare|kanojo|boku|ore|kimi|sore|kore|are)\b/i
  ],

  'ko': [
    /[\uAC00-\uD7AF]/g, // Hangul
    /\b(korean|seoul|kpop|k-drama|hallyu|idol|gangnam|taegeuk)\b/i,
    /\b(bts|blackpink|exo|twice|iu|bigbang|psy|shinee|red\s*velvet|stray\s*kids)\b/i,
    /\b(sarang|maeum|babo|norae|bam|kkum|chingu|yeoja|namja)\b/i,
    /\b(naneun|neon|geunyeo|geu|uri|neo|nae|iga|eotteohge)\b/i
  ],

  'zh': [
    /[\u4E00-\u9FFF]/g, // Chinese Hanzi
    /\b(mandarin|chinese|beijing|shanghai|c-pop|taiwan|hk-pop|mandopop|cantopop)\b/i,
    /\b(jay\s*chou|jacky\s*cheung|faye\s*wong|teresa\s*teng|wang\s*lee\s*hom)\b/i,
    /\b(ai|xin|meng|ge|ye|yinyue|pengyou|mei|nü|nan|hua)\b/i,
    /\b(wo|ni|ta|women|nimen|tamen|shi|bu|zai|le|de)\b/i
  ],

  'ar': [
    /[\u0600-\u06FF]/g, // Arabic script
    /\b(arabic|egypt|lebanon|morocco|saudi|iraq|palestine|qatar|dubai)\b/i,
    /\b(umm\s*kulthum|fairuz|amr\s*diab|nancy\s*ajram|tamer\s*hosny)\b/i,
    /\b(hubb|qalb|hayat|ghina|layl|saheb|salam|dunya|farah)\b/i,
    /\b(ana|anta|anti|huwa|hiya|nahnu|antum|hum|fi|ma|la)\b/i
  ],

  'ru': [
    /[\u0400-\u04FF]/g, // Cyrillic script
    /\b(russian|moscow|petersburg|ussr|kremlin|balalaika|slav|popsa|estrada)\b/i,
    /\b(tsoi|alla\s*pugacheva|filipp\s*kirkorov|sergey|lazarev|zemfira)\b/i,
    /\b(lyubov|serdtse|zhizn|noch|pesnya|mechta|druga|devushka|malchik)\b/i,
    /\b(ya|ty|on|ona|my|vy|oni|eto|kto|gde|kak)\b/i
  ]
  };



  private clearUsedTracksIfNeeded(): void {
    if (Date.now() - this.sessionStartTime > 45 * 60 * 1000) { // 45 minutes
      this.usedTrackIds.clear();
      this.sessionStartTime = Date.now();
    }
  }

  private async makeRequestWithRetry<T>(
    url: string,
    config: any,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<T>(url, {
          ...config,
          timeout: this.REQUEST_TIMEOUT,
        });
        return response.data;
      } catch (error: any) {
        console.warn(`Request attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) throw error;
        
        if (error.response?.status === 429) {
          // Rate limited - wait longer
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        } else if (error.response?.status >= 500) {
          // Server error - retry with backoff
          await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          // Network issues - retry
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        } else {
          // Other errors - don't retry
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  private getCacheKey(method: string, params: any): string {
    const baseKey = `${method}_${JSON.stringify(params, Object.keys(params).sort())}`;
    const timeSlot = Math.floor(Date.now() / (15 * 60 * 1000)); // 15-minute slots
    return `${baseKey}_${timeSlot}`;
  }

  // Remove random cache invalidation or use a proper cache strategy
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    // Clean up old cache entries
    if (this.cache.size > 500) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, 100);
      keysToDelete.forEach(key => this.cache.delete(key));
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post<SpotifyAuthResponse>(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({ grant_type: 'client_credentials' }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
          },
          timeout: this.REQUEST_TIMEOUT,
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
      return this.accessToken;
    } catch (error: any) {
      console.error('Failed to get access token:', error.message);
      throw new Error('Authentication failed');
    }
  }

  async getRecommendations(filters: RecommendationFilters = {}): Promise<Track> {
    this.clearUsedTracksIfNeeded();
    
    try {
      const token = await this.getAccessToken();

      // Language-specific discovery
      if (filters.language) {
        return await this.getLanguageSpecificTrack(filters, token);
      }

      // General discovery with improved variety
      return await this.getGeneralDiscoveryTrack(filters, token);
    } catch (error: any) {
      console.error('Error in getRecommendations:', error);
      
      // Enhanced fallback
      try {
        return await this.getFallbackRecommendation(filters);
      } catch (fallbackError: any) {
        throw new Error(`Discovery failed: ${error.message || 'Unknown error'}`);
      }
    }
  }

  private async getFallbackRecommendation(filters: RecommendationFilters): Promise<Track> {
    const token = await this.getAccessToken();
    
    const fallbackTerms = [
      'popular songs', 'top hits', 'chart music', 'trending tracks',
      'new releases', 'favorite music', 'radio hits', 'playlist favorites'
    ];
    
    const searchTerm = fallbackTerms[Math.floor(Math.random() * fallbackTerms.length)];
    const offset = Math.floor(Math.random() * 200); // Smaller range for fallback
    
    const markets = filters.language ? 
      this.LANGUAGE_MARKETS[filters.language] || ['IN', 'US'] : 
      ['US', 'GB', 'CA', 'AU'];
    const market = markets[Math.floor(Math.random() * markets.length)];

    const response: any = await this.makeRequestWithRetry(
      'https://api.spotify.com/v1/search',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: searchTerm,
          type: 'track',
          limit: 50,
          offset: offset,
          market: market,
        },
      }
    );

    let tracks = response.tracks?.items || [];
    
    if (tracks.length === 0) {
      throw new Error('No tracks found in fallback search');
    }
    
    // Apply filters
    tracks = this.applyFilters(tracks, filters);

    if (tracks.length === 0) {
      // If no tracks after filtering, use original list with basic filtering
      tracks = response.tracks?.items?.filter((track: Track) => 
        track.popularity >= this.MIN_POPULARITY
      ) || [];
    }

    if (tracks.length === 0) {
      throw new Error('No suitable tracks found in fallback');
    }

    const tracksWithLanguage = this.detectAndAddLanguage(tracks);
    const selectedTrack = this.selectOptimalTrackWithYearRandomness(tracksWithLanguage);
    this.usedTrackIds.add(selectedTrack.id);
    
    return selectedTrack;
  }

  private async getLanguageSpecificTrack(filters: RecommendationFilters, token: string): Promise<Track> {
    const language = filters.language!;
    const markets = this.LANGUAGE_MARKETS[language] || ['IN', 'US'];
    
    // Multi-market search for better results
    let allCandidates: Track[] = [];
    const searchTermGroups = this.LANGUAGE_SEARCH_TERMS[language] || [[`${language} music`]];
    
    // Try multiple markets and search strategies
    const maxAttempts = Math.min(4, markets.length * 2);
    
    for (let attempt = 0; attempt < maxAttempts && allCandidates.length < 100; attempt++) {
      try {
        const marketIndex = attempt % markets.length;
        const market = markets[marketIndex];
        
        const strategyIndex = Math.floor(attempt / markets.length) % searchTermGroups.length;
        const searchTerms = searchTermGroups[strategyIndex];
        const searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
        
        // Dynamic offset based on language popularity
        const maxOffset = this.getMaxOffsetForLanguage(language);
        const offset = Math.floor(Math.random() * maxOffset);
        
        const cacheKey = this.getCacheKey('language_search', { 
          language, market, searchTerm, offset: Math.floor(offset / 50) * 50 
        });
        
        let response = this.getFromCache<any>(cacheKey);
        
        if (!response) {
          response = await this.makeRequestWithRetry(
            'https://api.spotify.com/v1/search',
            {
              headers: { Authorization: `Bearer ${token}` },
              params: {
                q: searchTerm,
                type: 'track',
                limit: 50,
                offset: offset,
                market: market,
              },
            }
          );
          this.setCache(cacheKey, response);
        }

        const tracks = response.tracks?.items || [];
        
        // Strict language filtering with improved detection
        const languageFilteredTracks = tracks.filter((track: Track) => {
          if (this.usedTrackIds.has(track.id)) return false;
          if (track.popularity < this.MIN_POPULARITY) return false;
          
          const detectedLanguage = this.enhancedLanguageDetection(track);
          return detectedLanguage === language;
        });
        
        allCandidates.push(...languageFilteredTracks);
        
      } catch (error: any) {
        console.warn(`Language search attempt ${attempt + 1} failed:`, error.message);
        continue;
      }
    }

    if (allCandidates.length === 0) {
      return await this.getLanguageFallback(language, token);
    }

    // Remove duplicates and apply additional filters
    const uniqueTracks = this.removeDuplicates(allCandidates);
    const filteredTracks = this.applyFilters(uniqueTracks, filters);
    
    const finalTracks = filteredTracks.length > 0 ? filteredTracks : uniqueTracks;
    const tracksWithLanguage = this.addLanguageToTracks(finalTracks, language);

    const selectedTrack = this.selectOptimalTrackWithYearRandomness(tracksWithLanguage);
    this.usedTrackIds.add(selectedTrack.id);
    return selectedTrack;
  }

  private getMaxOffsetForLanguage(language: string): number {
    // Different languages have different amounts of content on Spotify
    const languageOffsets: { [key: string]: number } = {
      'en': 2000,
      'hi': 1500,
      'es': 1800,
      'ta': 800,
      'te': 600,
      'pa': 400,
      'bn': 300,
      'kn': 250,
      'ml': 200,
      'gu': 150,
      'mr': 200
    };
    return languageOffsets[language] || 500;
  }

  private async getGeneralDiscoveryTrack(filters: RecommendationFilters, token: string): Promise<Track> {
    const strategy = Math.random();
    
    if (strategy < 0.4) {
      return await this.getSpotifyRecommendations(filters, token);
    } else if (strategy < 0.7) {
      return await this.getSearchBasedDiscovery(filters, token);
    } else {
      return await this.getNewReleasesDiscovery(filters, token);
    }
  }

  private async getNewReleasesDiscovery(filters: RecommendationFilters, token: string): Promise<Track> {
    const market = filters.market || 'US';
    const offset = Math.floor(Math.random() * 100);

    const response: any = await this.makeRequestWithRetry(
      'https://api.spotify.com/v1/browse/new-releases',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: 50,
          offset: offset,
          market: market,
        },
      }
    );

    const albums = response.albums?.items || [];
    if (albums.length === 0) {
      throw new Error('No new releases found');
    }

    // Get tracks from random albums
    const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
    
    const albumResponse: any = await this.makeRequestWithRetry(
      `https://api.spotify.com/v1/albums/${randomAlbum.id}/tracks`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { market: market, limit: 50 },
      }
    );

    let tracks = albumResponse.items || [];
    
    // Add album info to tracks (Spotify's album tracks endpoint doesn't include full track info)
    tracks = tracks.map((track: any) => ({
      ...track,
      album: randomAlbum,
      popularity: Math.floor(Math.random() * 40) + 30, // Estimate for new releases
    }));

    tracks = tracks.filter((track: Track) => 
      !this.usedTrackIds.has(track.id) && 
      track.popularity >= this.MIN_POPULARITY
    );

    if (tracks.length === 0) {
      throw new Error('No suitable new release tracks found');
    }

    const tracksWithLanguage = this.detectAndAddLanguage(tracks);
    const selectedTrack = this.selectOptimalTrackWithYearRandomness(tracksWithLanguage);
    this.usedTrackIds.add(selectedTrack.id);
    return selectedTrack;
  }

  private async getSpotifyRecommendations(filters: RecommendationFilters, token: string): Promise<Track> {
    const params: any = {
      limit: 50,
      market: filters.market || 'US',
      min_popularity: this.MIN_POPULARITY,
      max_popularity: 95,
    };

    // Enhanced seed selection
    if (filters.genre) {
      params.seed_genres = filters.genre;
    } else {
      const genres = await this.getGenres();
      const randomGenres = this.selectRandomItems(genres, Math.random() > 0.5 ? 1 : 2);
      params.seed_genres = randomGenres.join(',');
    }

    // Add audio features with more variance
    this.addAudioFeaturesWithVariance(params, filters);
    
    // Enhanced year constraints
    if (filters.yearRange) {
      const [minYear, maxYear] = filters.yearRange;
      params.min_release_date = `${minYear}-01-01`;
      params.max_release_date = `${maxYear}-12-31`;
    }

    const cacheKey = this.getCacheKey('recommendations', params);
    let response = this.getFromCache<any>(cacheKey);

    if (!response) {
      response = await this.makeRequestWithRetry(
        'https://api.spotify.com/v1/recommendations',
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }
      );
      this.setCache(cacheKey, response);
    }

    let tracks = response.tracks || [];
    tracks = this.applyFilters(tracks, filters);

    if (tracks.length === 0) {
      throw new Error('No suitable recommendations found');
    }

    const tracksWithLanguage = this.detectAndAddLanguage(tracks);
    const selectedTrack = this.selectOptimalTrackWithYearRandomness(tracksWithLanguage);
    this.usedTrackIds.add(selectedTrack.id);
    return selectedTrack;
  }

  private async getSearchBasedDiscovery(filters: RecommendationFilters, token: string): Promise<Track> {
    const discoveryTerms = [
      'indie music', 'underground tracks', 'emerging artists', 'hidden gems',
      'album deep cuts', 'b-sides', 'rare tracks', 'underrated songs',
      'fresh music', 'new talent', 'breakthrough artists', 'cult classics'
    ];

    if (filters.genre) {
      discoveryTerms.push(
        `${filters.genre} indie`, 
        `new ${filters.genre}`, 
        `${filters.genre} underground`,
        `${filters.genre} emerging`
      );
    }

    const searchTerm = discoveryTerms[Math.floor(Math.random() * discoveryTerms.length)];
    const offset = Math.floor(Math.random() * 1000);
    const market = filters.market || 'US';

    const response: any = await this.makeRequestWithRetry(
      'https://api.spotify.com/v1/search',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: searchTerm,
          type: 'track',
          limit: 50,
          offset: offset,
          market: market,
        },
      }
    );

    let tracks = response.tracks?.items || [];
    tracks = this.applyFilters(tracks, filters);

    // Favor discovery tracks (lower popularity)
    tracks = tracks.filter((track: Track) => 
      track.popularity >= this.MIN_POPULARITY && 
      track.popularity <= 70 // Sweet spot for discovery
    );

    if (tracks.length === 0) {
      throw new Error('No discovery tracks found');
    }

    const tracksWithLanguage = this.detectAndAddLanguage(tracks);
    const selectedTrack = this.selectOptimalTrackWithYearRandomness(tracksWithLanguage);
    this.usedTrackIds.add(selectedTrack.id);
    return selectedTrack;
  }

  // Enhanced language detection with better accuracy
  private enhancedLanguageDetection(track: Track): string {
    const trackName = track.name.toLowerCase();
    const artistName = track.artists.map(a => a.name).join(' ').toLowerCase();
    const albumName = track.album.name.toLowerCase();
    const allText = `${trackName} ${artistName} ${albumName}`;

    // Check each language pattern
    for (const [language, patterns] of Object.entries(this.LANGUAGE_PATTERNS)) {
      let score = 0;
      
      for (const pattern of patterns) {
        const matches = allText.match(pattern);
        if (matches) {
          if (pattern.source.includes('[\\u')) {
            // Script-based match (most reliable)
            score += matches.length * 10;
          } else {
            // Keyword-based match
            score += matches.length * 2;
          }
        }
      }
      
      // Higher threshold for more accuracy
      if (score >= 5) {
        return language;
      }
    }

    // Enhanced fallback detection
    if (/[\u0900-\u097F]/.test(allText)) {
      // Devanagari could be Hindi or Marathi, check context
      if (/\b(marathi|maharashtra|mumbai|pune)\b/i.test(allText)) {
        return 'mr';
      }
      return 'hi';
    }

    return 'en'; // Default fallback
  }

  private async getLanguageFallback(language: string, token: string): Promise<Track> {
    const markets = this.LANGUAGE_MARKETS[language] || ['IN', 'US'];
    const broadTerms = [
      `${language} songs`,
      `${language} music`,
      `${language} hits`,
      language
    ];
    
    for (const market of markets) {
      for (const term of broadTerms) {
        try {
          const response: any = await this.makeRequestWithRetry(
            'https://api.spotify.com/v1/search',
            {
              headers: { Authorization: `Bearer ${token}` },
              params: {
                q: term,
                type: 'track',
                limit: 50,
                market: market,
                offset: Math.floor(Math.random() * 200),
              },
            }
          );

          let tracks = response.tracks?.items || [];
          tracks = tracks.filter((track: Track) => 
            !this.usedTrackIds.has(track.id) && 
            track.popularity >= this.MIN_POPULARITY &&
            this.enhancedLanguageDetection(track) === language
          );

          if (tracks.length > 0) {
            const selectedTrack = this.selectOptimalTrackWithYearRandomness(tracks);
            this.usedTrackIds.add(selectedTrack.id);
            return { ...selectedTrack, language };
          }
        } catch (error) {
          console.warn(`Language fallback failed for ${term} in ${market}:`, error);
          continue;
        }
      }
    }

    throw new Error(`No ${language} tracks available after exhaustive search`);
  }

  // Enhanced filter application
  private applyFilters(tracks: Track[], filters: RecommendationFilters): Track[] {
    let filteredTracks = tracks.filter((track: Track) => 
      !this.usedTrackIds.has(track.id) && 
      track.popularity >= this.MIN_POPULARITY
    );

    if (filters.genre) {
      filteredTracks = this.filterByGenre(filteredTracks, filters.genre);
    }
    
    if (filters.yearRange) {
      filteredTracks = this.filterByYear(filteredTracks, filters.yearRange);
    }

    if (filters.artist) {
      filteredTracks = filteredTracks.filter(track => 
        track.artists.some(artist => 
          artist.name.toLowerCase().includes(filters.artist!.toLowerCase())
        )
      );
    }

    if (filters.popularity !== undefined) {
      const targetPop = filters.popularity;
      filteredTracks = filteredTracks.filter(track => 
        Math.abs(track.popularity - targetPop) <= 20
      );
    }

    return filteredTracks;
  }

  // Utility methods
  private addLanguageToTracks(tracks: Track[], language: string): TrackWithLanguage[] {
    return tracks.map(track => ({
      ...track,
      language: language
    }));
  }

  private detectAndAddLanguage(tracks: Track[]): TrackWithLanguage[] {
    return tracks.map(track => ({
      ...track,
      language: this.enhancedLanguageDetection(track)
    }));
  }

  private removeDuplicates(tracks: Track[]): Track[] {
    const seen = new Set<string>();
    return tracks.filter(track => {
      const key = `${track.name.toLowerCase().replace(/[^\w\s]/g, '')}-${track.artists[0]?.name.toLowerCase().replace(/[^\w\s]/g, '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private filterByGenre<T extends Track>(tracks: T[], genre: string): T[] {
    return tracks.filter(track => {
      const text = `${track.name} ${track.artists.map(a => a.name).join(' ')} ${track.album.name}`.toLowerCase();
      const genreKeywords = genre.toLowerCase().split(/[\s-_]+/);
      return genreKeywords.some(keyword => text.includes(keyword));
    });
  }

  private filterByYear<T extends Track>(tracks: T[], yearRange: [number, number]): T[] {
    const [minYear, maxYear] = yearRange;
    return tracks.filter(track => {
      try {
        const year = new Date(track.album.release_date).getFullYear();
        return year >= minYear && year <= maxYear;
      } catch {
        return false; // Invalid date
      }
    });
  }

  // Enhanced track selection with year-based randomness
  private selectOptimalTrackWithYearRandomness<T extends Track>(tracks: T[]): T {
    if (tracks.length === 1) return tracks[0];

    const currentYear = new Date().getFullYear();
    
    const weighted = tracks.map(track => {
      let weight = 1;
      
      // Year-based randomness (NEW FEATURE)
      try {
        const releaseYear = new Date(track.album.release_date).getFullYear();
        const yearsAgo = currentYear - releaseYear;
        
        if (yearsAgo <= 1) weight *= 2.2;   // Very recent (but not overpowered)
        else if (yearsAgo <= 3) weight *= 2.0;   // Recent
        else if (yearsAgo <= 5) weight *= 1.7;   // Somewhat recent
        else if (yearsAgo <= 10) weight *= 1.5;  // Modern
        else if (yearsAgo <= 20) weight *= 1.4;  // Classic
        else if (yearsAgo <= 30) weight *= 1.8;  // Retro (resurgence boost)
        else weight *= 1.2;   // Vintage

        
        // Add randomness within year groups
        const yearGroupRandomness = Math.random() * 0.5 + 0.75; // 0.75 to 1.25
        weight *= yearGroupRandomness;
        
      } catch {
        weight *= 1.0; // Neutral if date parsing fails
      }
      
      // Popularity-based weighting (enhanced)
      if (track.popularity <= 25) weight *= 1.8;      // Hidden gems
      else if (track.popularity <= 35) weight *= 2.2; // Rare finds
      else if (track.popularity <= 50) weight *= 3.0; // Discovery sweet spot
      else if (track.popularity <= 65) weight *= 2.5; // Good balance
      else if (track.popularity <= 80) weight *= 1.8; // Popular but not overplayed
      else if (track.popularity <= 90) weight *= 1.3; // Well-known
      else weight *= 0.8; // Overplayed
      
      // Album vs single preference
      const albumType = track.album.name.toLowerCase();
      if (!albumType.includes('single') && !albumType.includes('ep')) {
        weight *= 1.4; // Favor full album tracks
      }
      
      // Explicit content slight boost (often more authentic)
      if (track.explicit) weight *= 1.2;
      
      // Duration preference (avoid very short tracks)
      if (track.duration_ms > 120000 && track.duration_ms < 360000) { // 2-6 minutes
        weight *= 1.3;
      }
      
      return { track, weight };
    });

    // Weighted random selection
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight === 0) {
      // Fallback to random selection
      return tracks[Math.floor(Math.random() * tracks.length)];
    }
    let random = Math.random() * totalWeight;
    
    for (const item of weighted) {
      random -= item.weight;
      if (random <= 0) return item.track;
    }
    
    return tracks[0]; // Fallback
  }

  private selectRandomItems<T>(items: T[], count: number): T[] {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, items.length));
  }

  private addAudioFeaturesWithVariance(params: any, filters: RecommendationFilters): void {
    const addFeature = (filterValue: number | undefined, paramName: string) => {
      if (filterValue !== undefined) {
        const normalizedValue = Math.max(0, Math.min(1, filterValue / 100));
        const variance = 0.15; // Allow 15% variance for variety
        const minValue = Math.max(0, normalizedValue - variance);
        const maxValue = Math.min(1, normalizedValue + variance);
        
        params[`min_${paramName}`] = minValue;
        params[`max_${paramName}`] = maxValue;
        params[`target_${paramName}`] = normalizedValue;
      }
    };

    addFeature(filters.energy, 'energy');
    addFeature(filters.danceability, 'danceability');
    addFeature(filters.valence, 'valence');
    addFeature(filters.acousticness, 'acousticness');
    addFeature(filters.instrumentalness, 'instrumentalness');
  }

  // Public methods
  async searchArtists(query: string, market: string = 'US'): Promise<any[]> {
    const token = await this.getAccessToken();
    
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

    return response.artists?.items || [];
  }

  async getGenres(): Promise<string[]> {
    const token = await this.getAccessToken();
    
    try {
      const cacheKey = 'genres';
      let cached = this.getFromCache<string[]>(cacheKey);
      
      if (cached) return cached;
      
      const response: any = await this.makeRequestWithRetry(
        'https://api.spotify.com/v1/recommendations/available-genre-seeds',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const genres = response.genres || [];
      this.setCache(cacheKey, genres);
      return genres;
    } catch (error) {
      console.warn('Failed to fetch genres, using fallback:', error);
      // Comprehensive fallback genres
      return [
        'pop', 'rock', 'hip-hop', 'electronic', 'country', 'jazz', 'indie', 
        'alternative', 'dance', 'folk', 'classical', 'r-n-b', 'reggae', 
        'blues', 'punk', 'metal', 'funk', 'soul', 'house', 'techno'
      ];
    }
  }

  // Enhanced analytics and management
  getDiscoveryStats(): { 
    usedTracks: number; 
    sessionTime: number; 
    cacheSize: number;
    successRate: number;
  } {
    return {
      usedTracks: this.usedTrackIds.size,
      sessionTime: Math.floor((Date.now() - this.sessionStartTime) / 1000 / 60),
      cacheSize: this.cache.size,
      successRate: Math.min(100, Math.max(0, 100 - (this.usedTrackIds.size * 2))) // Rough success rate
    };
  }

  resetDiscoverySession(): void {
    this.usedTrackIds.clear();
    this.cache.clear();
    this.sessionStartTime = Date.now();
    console.log('Discovery session reset');
  }

  // Get available markets for a language
  getMarketsForLanguage(language: string): string[] {
    return this.LANGUAGE_MARKETS[language] || ['US'];
  }

  // Check if a language is supported
  isSupportedLanguage(language: string): boolean {
    return Object.keys(this.LANGUAGE_SEARCH_TERMS).includes(language);
  }

  // Get supported languages
  getSupportedLanguages(): string[] {
    return Object.keys(this.LANGUAGE_SEARCH_TERMS);
  }

  // Advanced search with multiple strategies
  async advancedSearch(query: string, options: {
    market?: string;
    limit?: number;
    type?: 'track' | 'artist' | 'album';
    strictLanguage?: string;
  } = {}): Promise<any> {
    const token = await this.getAccessToken();
    const { 
      market = 'US', 
      limit = 50, 
      type = 'track',
      strictLanguage 
    } = options;

    const response: any = await this.makeRequestWithRetry(
      'https://api.spotify.com/v1/search',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: query,
          type: type,
          limit: limit,
          market: market,
          offset: Math.floor(Math.random() * 100),
        },
      }
    );

    let results = response[`${type}s`]?.items || [];

    // Apply strict language filtering if specified
    if (strictLanguage && type === 'track') {
      results = results.filter((track: Track) => 
        this.enhancedLanguageDetection(track) === strictLanguage
      );
    }

    return results;
  }
}

export const spotifyService = new SpotifyService();
export type { Track, RecommendationFilters, TrackWithLanguage };