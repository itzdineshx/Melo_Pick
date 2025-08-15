import { useState } from 'react';
import { Search, Music2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { spotifyService } from '@/services/spotify';

interface SearchModalProps {
  onArtistSelect: (artist: string) => void;
  trigger: React.ReactNode;
}

interface Artist {
  id: string;
  name: string;
  images: Array<{ url: string }>;
  genres: string[];
  popularity: number;
}

export default function SearchModal({ onArtistSelect, trigger }: SearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await spotifyService.searchArtists(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleArtistSelect = (artistName: string) => {
    onArtistSelect(artistName);
    setIsOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Search Artists
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Search Input */}
          <div className="space-y-2">
            <Label htmlFor="search">Artist Name</Label>
            <div className="flex gap-2">
              <Input
                id="search"
                placeholder="Search for an artist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
              />
              <Button 
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="btn-hero px-6"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <Label>Search Results</Label>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {searchResults.map((artist) => (
                  <div 
                    key={artist.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-card cursor-pointer transition-colors"
                    onClick={() => handleArtistSelect(artist.name)}
                  >
                    {/* Artist Image */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                      {artist.images?.[0]?.url ? (
                        <img 
                          src={artist.images[0].url} 
                          alt={artist.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Artist Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {artist.name}
                      </h3>
                      {artist.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {artist.genres.slice(0, 2).map((genre) => (
                            <Badge 
                              key={genre} 
                              variant="secondary" 
                              className="text-xs bg-primary/10 text-primary"
                            >
                              {genre}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Popularity */}
                    <div className="text-sm text-muted-foreground">
                      {artist.popularity}% popular
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {searchResults.length === 0 && searchQuery && !isSearching && (
            <div className="text-center py-8">
              <Music2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                No artists found for "{searchQuery}"
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}