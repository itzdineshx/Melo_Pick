import { useState, useEffect } from 'react';
import { Track } from '@/services/spotify';

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Track[]>([]);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = () => {
    try {
      const stored = localStorage.getItem('melopick_favorites');
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const addToFavorites = (track: Track) => {
    const updatedFavorites = [...favorites, track];
    setFavorites(updatedFavorites);
    localStorage.setItem('melopick_favorites', JSON.stringify(updatedFavorites));
  };

  const removeFromFavorites = (trackId: string) => {
    const updatedFavorites = favorites.filter(track => track.id !== trackId);
    setFavorites(updatedFavorites);
    localStorage.setItem('melopick_favorites', JSON.stringify(updatedFavorites));
  };

  const isFavorite = (trackId: string) => {
    return favorites.some(track => track.id === trackId);
  };

  const toggleFavorite = (track: Track) => {
    if (isFavorite(track.id)) {
      removeFromFavorites(track.id);
      return false;
    } else {
      addToFavorites(track);
      return true;
    }
  };

  return {
    favorites,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    toggleFavorite,
    favoritesCount: favorites.length
  };
};