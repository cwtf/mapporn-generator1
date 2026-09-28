import type { MapState } from './model';
export async function exportMap(svg: SVGSVGElement, map: MapState, format: 'svg' | 'png') {
  if (!svg) throw new Error('Map is not ready.');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const original = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const copied = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (let i = 0; i < original.length; i++) {
    const style = getComputedStyle(original[i]);
    for (const property of [
      'fill',
      'stroke',
      'stroke-width',
      'font-size',
      'font-family',
      'font-weight',
      'paint-order',
      'text-anchor',
    ])
      (copied[i] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
    copied[i].removeAttribute('tabindex');
    copied[i].removeAttribute('role');
  }
  const ns = 'http://www.w3.org/2000/svg';
  clone.setAttribute('xmlns', ns);
  clone.setAttribute('viewBox', '0 -95 900 720');
  clone.setAttribute('width', '1800');
  clone.setAttribute('height', '1440');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '-95');
  bg.setAttribute('width', '900');
  bg.setAttribute('height', '720');
  bg.setAttribute(
    'fill',
    getComputedStyle(document.documentElement).getPropertyValue('--ocean').trim(),
  );
  clone.insertBefore(bg, clone.firstChild);
  function text(value: string, x: number, y: number, size: number) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('font-size', String(size));
    t.setAttribute('font-family', 'Arial, sans-serif');
    t.setAttribute(
      'fill',
      getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim(),
    );
    t.textContent = value;
    clone.appendChild(t);
  }
  text(map.title, 24, -48, 28);
  text(map.subtitle, 24, -21, 13);
  let x = 24,
    y = 570;
  for (const item of map.legend) {
    if (x + item.label.length * 7 + 40 > 860) {
      x = 24;
      y += 22;
    }
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y - 10));
    r.setAttribute('width', '10');
    r.setAttribute('height', '10');
    r.setAttribute('fill', item.color);
    clone.appendChild(r);
    text(item.label, x + 16, y, 12);
    x += item.label.length * 7 + 42;
  }
  text(
    `Made with Atlas · ${map.projection} · Natural Earth boundaries`,
    24,
    Math.max(607, y + 28),
    11,
  );
  const height = Math.max(720, y + 135);
  clone.setAttribute('viewBox', `0 -95 900 ${height}`);
  clone.setAttribute('height', String(height * 2));
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  let downloadBlob = blob;
  if (format === 'png') {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = height * 2;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      downloadBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const url = URL.createObjectURL(downloadBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${
    map.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 65) || 'atlas-map'
  }.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
