'use client';
import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Carousel, CarouselSlide, type CarouselApi } from '@salmonui/navigation/carousel';

const colors = ['var(--salmon-color-primary-subtle)', 'var(--salmon-color-success-subtle)', 'var(--salmon-color-warning-subtle)', 'var(--salmon-color-info-subtle)'];

export default function CarouselAutoplayDemo() {
  const api = useRef<CarouselApi>(null);
  return (
    <div>
      <Carousel ref={api} aria-label="Gallery" autoPlay={{ interval: 4000 }} effect="fade" indicators="progress" controls="hover" style={{ maxInlineSize: 640 }}>
        {colors.map((background, i) => (
          <CarouselSlide key={background} interval={i === 0 ? 6000 : undefined} style={{ display: 'grid', placeContent: 'center', minBlockSize: 180, borderRadius: 'var(--salmon-radius-lg)', background }}>
            <strong>Photo {i + 1}</strong>
          </CarouselSlide>
        ))}
      </Carousel>
      <div className="demo-toolbar" style={{ marginBlockStart: 12 }}>
        <Button variant="outline" onClick={() => api.current?.previous()}>
          api.previous()
        </Button>
        <Button variant="outline" onClick={() => api.current?.next()}>
          api.next()
        </Button>
        <Button variant="outline" onClick={() => api.current?.goTo(0)}>
          api.goTo(0)
        </Button>
      </div>
    </div>
  );
}
