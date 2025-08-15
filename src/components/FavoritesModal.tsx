import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Music2, Heart, Trash2, ExternalLink, AlertCircle } from 'lucide-react';
import { Track } from '@/services/spotify';
import { useFavorites } from '@/hooks/useFavorites';
import { toast } from '@/hooks/use-toast';

interface FavoritesModalProps {
  trigger: React.ReactNode;
}

export default function FavoritesModal({ trigger }: FavoritesModalProps) {
  const { favorites, removeFromFavorites } = useFavorites();
  const [isOpen, setIsOpen] = useState(false);

  const handleRemoveFavorite = (trackId: string) => {
    removeFromFavorites(trackId);
    toast({
      title: "💔 Removed from Favorites",
      description: "Song removed from your favorites list",
    });
  };

  const clearAllFavorites = () => {
    favorites.forEach(track => removeFromFavorites(track.id));
    toast({
      title: "🗑️ All Favorites Cleared",
      description: "Your favorites list has been cleared",
    });
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${parseInt(seconds) < 10 ? '0' : ''}${seconds}`;
  };

  const formatYear = (dateString: string) => {
    return new Date(dateString).getFullYear();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Heart className="w-6 h-6 text-primary" />
            Your Favorites ({favorites.length})
          </DialogTitle>
        </DialogHeader>

        {/* Action Bar */}
        {favorites.length > 0 && (
          <div className="flex justify-between items-center pb-4 border-b border-border">
            <p className="text-muted-foreground">
              {favorites.length} song{favorites.length !== 1 ? 's' : ''} saved
            </p>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={clearAllFavorites}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </Button>
          </div>
        )}

        {/* Favorites List */}
        <div className="flex-1 overflow-y-auto">
          {favorites.length > 0 ? (
            <div className="space-y-3 pr-2">
              {favorites.map((track) => (
                <div key={track.id} className="bg-secondary/30 rounded-lg p-4 animate-fade-in">
                  <div className="flex items-start gap-4">
                    {/* Album Cover */}
                    <div className="flex-shrink-0">
                      <img 
                        src={track.album.images?.[0]?.url || '/placeholder.svg'} 
                        alt={`${track.album.name} cover`}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    </div>

                    {/* Track Info */}
                    <div className="flex-grow min-w-0">
                      <h3 className="text-lg font-heading font-bold text-foreground mb-1 truncate">
                        {track.name}
                      </h3>
                      <p className="text-muted-foreground mb-2 truncate">
                        {track.artists.map(a => a.name).join(', ')} • {track.album.name}
                      </p>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {formatYear(track.album.release_date)}
                        </Badge>
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {formatDuration(track.duration_ms)}
                        </Badge>
                        {track.explicit && (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                            Explicit
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(track.external_urls.spotify, '_blank')}
                        className="border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground text-xs px-2"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Spotify
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFavorite(track.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 rounded-full bg-secondary/30 flex items-center justify-center mb-4">
                <Heart className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-heading font-semibold text-foreground mb-2">
                No Favorites Yet
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                Start discovering music and save your favorite songs by clicking the heart icon.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}