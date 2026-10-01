'use client';

import dynamic from 'next/dynamic';

const Playground = dynamic(() => import('../components/Playground.jsx'), {
  ssr: false,
  loading: () => <p style={{ padding: 24, color: '#8b95ab' }}>Loading playground…</p>,
});

export default function Home() {
  return <Playground />;
}
