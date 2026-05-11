import React, { useEffect, useRef, useState } from 'react';
import { MapRenderer } from '../game/MapRenderer.ts';
import type { PolygonData } from '../../../shared/src/types.ts';

interface MapProps {
  polygons: PolygonData[];
  onPolygonClick?: (id: string) => void;
}

export const Map: React.FC<MapProps> = ({ polygons, onPolygonClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let isMounted = true;

    const renderer = new MapRenderer(containerRef.current);
    rendererRef.current = renderer;

    renderer.init().then(() => {
      if (!isMounted) {
        renderer.destroy();
        return;
      }
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClickCallback(onPolygonClick);
    }
  }, [onPolygonClick]);

  useEffect(() => {
    if (isReady && rendererRef.current) {
      rendererRef.current.updatePolygons(polygons);
    }
  }, [polygons, isReady]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};