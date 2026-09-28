'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  geoMercator,
  geoEqualEarth,
  geoNaturalEarth1,
  geoEquirectangular,
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoCentroid,
  geoDistance,
  geoArea,
} from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import type { Feature, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { Minus, Plus, Maximize } from 'lucide-react';
import type { MapState } from '@/lib/model';
const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
export const countries = feature(topology, topology.objects.countries).features as Feature<
  Geometry,
  { name: string }
>[];
export const countryNames = countries.map((c) => c.properties.name).sort();
export default function WorldMap({
  map,
  onSelect,
  svgRef,
}: {
  map: MapState;
  onSelect: (name: string) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState('');
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const projection = useMemo(() => {
    if (map.projection === 'Mercator')
      return geoMercator()
        .scale(141)
        .translate([450, 318])
        .clipExtent([
          [8, 8],
          [892, 542],
        ]);
    const p =
      map.projection === 'Equal Earth'
        ? geoEqualEarth()
        : map.projection === 'Natural Earth'
          ? geoNaturalEarth1()
          : map.projection === 'Equirectangular'
            ? geoEquirectangular()
            : geoOrthographic().rotate([-10, -15]);
    return p.fitExtent(
      [
        [20, 20],
        [880, 530],
      ],
      { type: 'Sphere' },
    );
  }, [map.projection]);
  const draw = useMemo(() => geoPath(projection), [projection]);
  useEffect(() => {
    setView({ k: 1, x: 0, y: 0 });
  }, [map.projection]);
  function zoom(factor: number) {
    setView((v) => {
      const k = Math.max(1, Math.min(12, v.k * factor));
      return { k, x: k === 1 ? 0 : (v.x * k) / v.k, y: k === 1 ? 0 : (v.y * k) / v.k };
    });
  }
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = element.querySelector('svg')!.getBoundingClientRect();
      const scale = Math.min(r.width / 900, r.height / 550);
      const px = (event.clientX - r.left - r.width / 2) / scale;
      const py = (event.clientY - r.top - r.height / 2) / scale;
      setView((v) => {
        const k = Math.max(1, Math.min(12, v.k * Math.exp(-event.deltaY * 0.0015)));
        const ratio = k / v.k;
        return {
          k,
          x: k === 1 ? 0 : px - (px - v.x) * ratio,
          y: k === 1 ? 0 : py - (py - v.y) * ratio,
        };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  return (
    <div className="map-canvas" ref={host}>
      <svg
        ref={svgRef}
        viewBox="0 0 900 550"
        role="group"
        aria-label={`${map.projection} world map. Select a country to style it.`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(r.width / 900, r.height / 550);
          const dx = e.clientX - drag.current.x,
            dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
          if (drag.current.moved)
            setView((v) => ({ ...v, x: v.x + dx / scale, y: v.y + dy / scale }));
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
        }}
        onPointerUp={(e) => {
          if (drag.current && !drag.current.moved) {
            const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-country]');
            if (hit) onSelect(hit.getAttribute('data-country')!);
          }
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <clipPath id="map-clip">
            <rect width="900" height="550" />
          </clipPath>
        </defs>
        <rect width="900" height="550" fill="var(--ocean)" />
        <g clipPath="url(#map-clip)">
          <g
            transform={`translate(${450 + view.x} ${275 + view.y}) scale(${view.k}) translate(-450 -275)`}
          >
            {map.projection === 'Globe' && (
              <path d={draw({ type: 'Sphere' })!} fill="var(--ocean)" stroke="var(--graticule)" />
            )}
            <path
              d={draw(geoGraticule10())!}
              fill="none"
              stroke="var(--graticule)"
              strokeWidth={0.6 / view.k}
            />
            {countries.map((c) => (
              <path
                key={`${c.id}-${c.properties.name}`}
                data-country={c.properties.name}
                d={draw(c) || ''}
                fill={map.countries[c.properties.name]?.color || 'var(--land)'}
                stroke="var(--country-border)"
                strokeWidth={0.65 / view.k}
                tabIndex={0}
                role="button"
                aria-label={`Edit ${c.properties.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(c.properties.name);
                  }
                }}
                onMouseEnter={() => setHover(c.properties.name)}
                onMouseLeave={() => setHover('')}
                className="country"
              >
                <title>{c.properties.name}</title>
              </path>
            ))}
            {countries.map((c) => {
              const label =
                map.countries[c.properties.name]?.label ??
                (map.showLabels ? c.properties.name : '');
              if (!label) return null;
              const geometry = c.geometry;
              const main =
                geometry.type === 'MultiPolygon'
                  ? {
                      type: 'Polygon' as const,
                      coordinates: [...geometry.coordinates].sort(
                        (a, b) =>
                          geoArea({ type: 'Polygon', coordinates: b }) -
                          geoArea({ type: 'Polygon', coordinates: a }),
                      )[0],
                    }
                  : geometry;
              const center = geoCentroid(main);
              if (map.projection === 'Globe' && geoDistance(center, [10, 15]) > Math.PI / 2)
                return null;
              const p = projection(center);
              return (
                p && (
                  <text
                    key={`label-${c.id}-${c.properties.name}`}
                    x={p[0]}
                    y={p[1]}
                    textAnchor="middle"
                    className="country-label"
                    fontSize={11 / Math.sqrt(view.k)}
                    strokeWidth={2.5 / Math.sqrt(view.k)}
                  >
                    {label}
                  </text>
                )
              );
            })}
          </g>
        </g>
      </svg>
      <div className="map-hover" aria-live="polite">
        {hover || 'Scroll to zoom · Drag to explore'}
      </div>
      <div className="zoom-controls">
        <button
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => zoom(1.4)}
          disabled={view.k >= 12}
        >
          <Plus size={18} />
        </button>
        <span>{Math.round(view.k * 100)}%</span>
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoom(1 / 1.4)}
          disabled={view.k <= 1}
        >
          <Minus size={18} />
        </button>
        <i />
        <button
          title="Fit world"
          aria-label="Fit world"
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
        >
          <Maximize size={17} />
        </button>
      </div>
    </div>
  );
}
