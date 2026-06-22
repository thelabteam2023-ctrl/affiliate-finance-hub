import { useEffect, useState, useCallback, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CarouselSlide {
  id: string;
  title: string;
  content: ReactNode;
}

interface Props {
  slides: CarouselSlide[];
  storageKey?: string;
}

export function PosicaoCapitalCarousel({ slides, storageKey }: Props) {
  const initial = (() => {
    if (!storageKey || typeof window === "undefined") return 0;
    const v = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(v) && v >= 0 && v < slides.length ? v : 0;
  })();

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    startIndex: initial,
  });
  const [selected, setSelected] = useState(initial);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(selected));
    }
  }, [selected, storageKey]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollNext();
    }
  };

  const active = slides[selected];

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label={active?.title}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
    >
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
          {active?.title}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" aria-hidden>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Ir para ${s.title}`}
                onClick={() => scrollTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === selected
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Anterior"
              onClick={scrollPrev}
              className="h-7 w-7 opacity-60 hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Próximo"
              onClick={scrollNext}
              className="h-7 w-7 opacity-60 hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={emblaRef}
        className="overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <div className="flex">
          {slides.map((s) => (
            <div
              key={s.id}
              className="min-w-0 flex-[0_0_100%]"
              aria-roledescription="slide"
              aria-label={s.title}
            >
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}