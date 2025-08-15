import { Music2, Home, Filter, Heart, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NavLink, useLocation } from 'react-router-dom';
import FiltersModal, { MusicFilters } from '@/components/FiltersModal';
import FavoritesModal from '@/components/FavoritesModal';
import { useFavorites } from '@/hooks/useFavorites';

interface HeaderProps {
  onFiltersChange?: (filters: MusicFilters) => void;
  currentFilters?: MusicFilters;
}

export default function Header({ onFiltersChange, currentFilters }: HeaderProps) {
  const { favoritesCount } = useFavorites();
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  const scrollToAbout = () => {
    const aboutSection = document.getElementById('about-section');
    if (aboutSection) {
      aboutSection.scrollIntoView({ behavior: 'smooth' });
    }
  };
  return (
    <header className="bg-background border-b border-border/10 sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-0.5 hover:opacity-80 transition-opacity">
            <img 
              src="/lovable-uploads/097688f1-ef15-40f6-9855-042fc616f092.png" 
              alt="MeloPick Logo" 
              className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 object-contain"
            />
            <h1 className="text-lg sm:text-xl font-heading font-bold text-primary">
              MELOPICK
            </h1>
          </NavLink>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <NavLink to="/">
              <Button 
                variant="ghost" 
                className={`flex items-center gap-2 ${isActive('/') ? 'text-primary bg-primary/10' : 'text-foreground hover:text-primary'}`}
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </Button>
            </NavLink>
            
            {onFiltersChange && currentFilters && (
              <FiltersModal 
                onFiltersChange={onFiltersChange}
                currentFilters={currentFilters}
                trigger={
                  <Button variant="ghost" className="flex items-center gap-2 text-foreground hover:text-primary">
                    <Filter className="w-4 h-4" />
                    <span>Filters</span>
                  </Button>
                }
              />
            )}
            
            <FavoritesModal
              trigger={
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 relative text-foreground hover:text-primary"
                >
                  <Heart className="w-4 h-4" />
                  <span>Favorites</span>
                  {favoritesCount > 0 && (
                    <Badge variant="secondary" className="bg-primary text-primary-foreground ml-1 px-1.5 py-0.5 text-xs">
                      {favoritesCount}
                    </Badge>
                  )}
                </Button>
              }
            />
            
            <Button 
              variant="ghost" 
              className="flex items-center gap-2 text-foreground hover:text-primary"
              onClick={scrollToAbout}
            >
              <Info className="w-4 h-4" />
              <span>About</span>
            </Button>
          </nav>

          {/* Mobile Navigation */}
          <nav className="flex md:hidden items-center gap-2">
            {onFiltersChange && currentFilters && (
              <FiltersModal 
                onFiltersChange={onFiltersChange}
                currentFilters={currentFilters}
                trigger={
                  <Button variant="ghost" size="sm" className="text-foreground hover:text-primary">
                    <Filter className="w-4 h-4" />
                  </Button>
                }
              />
            )}
            
            <FavoritesModal
              trigger={
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="relative text-foreground hover:text-primary"
                >
                  <Heart className="w-4 h-4" />
                  {favoritesCount > 0 && (
                    <Badge variant="secondary" className="absolute -top-2 -right-2 bg-primary text-primary-foreground px-1.5 py-0.5 text-xs">
                      {favoritesCount}
                    </Badge>
                  )}
                </Button>
              }
            />
            
            <Button 
              variant="ghost" 
              size="sm"
              className="text-foreground hover:text-primary"
              onClick={scrollToAbout}
            >
              <Info className="w-4 h-4" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}