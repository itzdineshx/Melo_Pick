import { Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-card/30 border-t border-border/10 py-8">
      <div className="container mx-auto px-6">
        {/* Simple Footer */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="/lovable-uploads/097688f1-ef15-40f6-9855-042fc616f092.png" 
              alt="MeloPick Logo" 
              className="w-8 h-8 object-contain"
            />
            <h3 className="text-lg font-heading font-bold text-primary">
              MELOPICK
            </h3>
          </div>
          
          <p className="text-muted-foreground text-sm mb-4">
            © 2024 MeloPick. Powered by Spotify Web API.
          </p>
          
          <p className="text-muted-foreground text-xs flex items-center justify-center gap-1">
            Made with <Heart className="w-4 h-4 text-primary" /> for music lovers.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;