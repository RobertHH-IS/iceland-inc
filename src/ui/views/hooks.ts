/**
 * React glue for the EngineClient.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { EngineClient, Frame } from '../engine-client.ts';

/** The client's current frame; re-renders the caller on every tick. */
export function useFrame(client: EngineClient): Frame {
  return useSyncExternalStore(client.subscribe, client.getFrame, client.getFrame);
}

/** True when the user asked the system for reduced motion. False during server rendering. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}
