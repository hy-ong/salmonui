'use client';
import { useState } from 'react';
import { Carousel, CarouselSlide } from '@salmonui/navigation/carousel';

const stories = [
  { id: 'spring', title: 'Spring sale', text: 'Up to 40% off garden furniture.' },
  { id: 'arrivals', title: 'New arrivals', text: 'Fresh picks for the season.' },
  { id: 'shipping', title: 'Free shipping', text: 'On every order over $50.' },
  { id: 'members', title: 'Members club', text: 'Early access and extra rewards.' },
];

export default function CarouselBasicsDemo() {
  const [index, setIndex] = useState(0);
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <Carousel
        aria-label="Promotions"
        index={index}
        onIndexChange={(next, event) => {
          setIndex(next);
          setLast(`slide ${next + 1} (${event.source})`);
        }}
        peek
        style={{ maxInlineSize: 640 }}
      >
        {stories.map((story) => (
          <CarouselSlide key={story.id} label={story.title} style={{ display: 'grid', placeContent: 'center', minBlockSize: 180, padding: 24, borderRadius: 'var(--salmon-radius-lg)', background: 'var(--salmon-surface-sunken)' }}>
            <h3 style={{ margin: 0 }}>{story.title}</h3>
            <p style={{ margin: '8px 0 0' }}>{story.text}</p>
          </CarouselSlide>
        ))}
      </Carousel>
      <p>
        Last change: <output>{last}</output>
      </p>
    </div>
  );
}
