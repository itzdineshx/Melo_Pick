export default function AboutSection() {
  return (
    <section className="py-16 px-6 border-t border-border/10">
      <div className="container mx-auto max-w-3xl">
        <div className="bg-card rounded-lg border border-border p-8">
          <h2 className="text-2xl font-heading font-bold text-primary mb-4 text-center">
            ABOUT MELOPICK
          </h2>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Powered by <span className="text-primary font-medium">The Spotify Database (TMDB)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              The information for the songs on this website is provided by The Spotify Web API.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}