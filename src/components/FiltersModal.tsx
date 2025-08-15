import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Filter, Music2, Search, Globe, Calendar, Zap, Heart, Volume2, Music } from 'lucide-react';
import SearchModal from './SearchModal';

interface FiltersModalProps {
  onFiltersChange: (filters: MusicFilters) => void;
  currentFilters: MusicFilters;
  trigger?: React.ReactNode;
}

export interface MusicFilters {
  genre?: string;
  yearRange: [number, number];
  artist?: string;
  market: string;
  language?: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  popularity?: number;
}

const GENRES = [
  'pop', 'rock', 'hip-hop', 'electronic', 'country', 'jazz', 'classical',
  'r&b', 'indie', 'alternative', 'metal', 'reggae', 'blues', 'folk',
  'punk', 'funk', 'disco', 'house', 'techno', 'ambient', 'soul', 'gospel'
];

const MARKETS = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ta', name: 'Tamil' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'te', name: 'Telugu' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ru', name: 'Russian' },
];

export default function FiltersModal({ onFiltersChange, currentFilters, trigger }: FiltersModalProps) {
  const [localFilters, setLocalFilters] = useState<MusicFilters>(currentFilters);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setLocalFilters(currentFilters);
  }, [currentFilters]);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleReset = () => {
    const resetFilters: MusicFilters = {
      yearRange: [1960, new Date().getFullYear()],
      market: 'US'
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    setIsOpen(false);
  };

  const handleArtistSelect = (artistName: string) => {
    setLocalFilters(prev => ({
      ...prev,
      artist: artistName
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-card border-border/50 backdrop-blur-md max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Music2 className="w-5 h-5 text-primary" />
            Music Filters
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Filters</TabsTrigger>
            <TabsTrigger value="advanced">Audio Features</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-6">{/* Basic Filters Tab */}
          {/* Genre Selection */}
          <div className="space-y-2">
            <Label htmlFor="genre" className="text-sm font-medium flex items-center gap-2">
              <Music2 className="w-4 h-4 text-accent" />
              Genre
            </Label>
            <Select
              value={localFilters.genre || ''}
              onValueChange={(value) => setLocalFilters(prev => ({
                ...prev,
                genre: value === 'all' ? undefined : value
              }))}
            >
              <SelectTrigger className="bg-input border-border/50">
                <SelectValue placeholder="Any genre" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/50">
                <SelectItem value="all">Any genre</SelectItem>
                {GENRES.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre.charAt(0).toUpperCase() + genre.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year Range */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" />
              Year Range
            </Label>
            <div className="px-2">
              <Slider
                value={localFilters.yearRange}
                onValueChange={(value) => setLocalFilters(prev => ({
                  ...prev,
                  yearRange: [value[0], value[1]]
                }))}
                min={1960}
                max={new Date().getFullYear()}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{localFilters.yearRange[0]}</span>
                <span>{localFilters.yearRange[1]}</span>
              </div>
            </div>
          </div>

          {/* Artist Search */}
          <div className="space-y-2">
            <Label htmlFor="artist" className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4 text-accent" />
              Artist
            </Label>
            <div className="flex gap-2">
              <Input
                id="artist"
                placeholder="Type artist name or search..."
                value={localFilters.artist || ''}
                onChange={(e) => setLocalFilters(prev => ({
                  ...prev,
                  artist: e.target.value || undefined
                }))}
                className="bg-input border-border/50 flex-1"
              />
              <SearchModal 
                onArtistSelect={handleArtistSelect}
                trigger={
                  <Button variant="outline" size="sm" className="px-3">
                    <Search className="w-4 h-4" />
                  </Button>
                }
              />
            </div>
          </div>

          {/* Market Selection */}
          <div className="space-y-2">
            <Label htmlFor="market" className="text-sm font-medium flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              Region
            </Label>
            <Select
              value={localFilters.market}
              onValueChange={(value) => setLocalFilters(prev => ({
                ...prev,
                market: value
              }))}
            >
              <SelectTrigger className="bg-input border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/50">
                {MARKETS.map((market) => (
                  <SelectItem key={market.code} value={market.code}>
                    {market.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language Selection */}
          <div className="space-y-2">
            <Label htmlFor="language" className="text-sm font-medium flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              Language
            </Label>
            <Select
              value={localFilters.language || ''}
              onValueChange={(value) => setLocalFilters(prev => ({
                ...prev,
                language: value === 'all' ? undefined : value
              }))}
            >
              <SelectTrigger className="bg-input border-border/50">
                <SelectValue placeholder="Any language" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/50">
                <SelectItem value="all">Any language</SelectItem>
                {LANGUAGES.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            {/* Audio Features Tab */}
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Fine-tune your music discovery with audio characteristics
              </div>

              {/* Energy */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent" />
                  Energy ({localFilters.energy || 50}%)
                </Label>
                <Slider
                  value={[localFilters.energy || 50]}
                  onValueChange={([value]) => setLocalFilters(prev => ({ ...prev, energy: value }))}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Chill</span>
                  <span>Energetic</span>
                </div>
              </div>

              {/* Danceability */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Music className="w-4 h-4 text-accent" />
                  Danceability ({localFilters.danceability || 50}%)
                </Label>
                <Slider
                  value={[localFilters.danceability || 50]}
                  onValueChange={([value]) => setLocalFilters(prev => ({ ...prev, danceability: value }))}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Not Danceable</span>
                  <span>Very Danceable</span>
                </div>
              </div>

              {/* Valence (Mood) */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Heart className="w-4 h-4 text-accent" />
                  Mood ({localFilters.valence || 50}%)
                </Label>
                <Slider
                  value={[localFilters.valence || 50]}
                  onValueChange={([value]) => setLocalFilters(prev => ({ ...prev, valence: value }))}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sad</span>
                  <span>Happy</span>
                </div>
              </div>

              {/* Acousticness */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-accent" />
                  Acousticness ({localFilters.acousticness || 50}%)
                </Label>
                <Slider
                  value={[localFilters.acousticness || 50]}
                  onValueChange={([value]) => setLocalFilters(prev => ({ ...prev, acousticness: value }))}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Electronic</span>
                  <span>Acoustic</span>
                </div>
              </div>

              {/* Popularity */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-accent" />
                  Popularity ({localFilters.popularity || 50})
                </Label>
                <Slider
                  value={[localFilters.popularity || 50]}
                  onValueChange={([value]) => setLocalFilters(prev => ({ ...prev, popularity: value }))}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Hidden Gems</span>
                  <span>Mainstream Hits</span>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1"
            >
              Reset All
            </Button>
            <Button
              onClick={handleApplyFilters}
              className="btn-hero flex-1"
            >
              Apply Filters
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}