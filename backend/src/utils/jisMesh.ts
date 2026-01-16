export function meshCode250(lat: number, lon: number): string {
  const p = Math.floor(lat * 1.5);
  const q = Math.floor(lon) - 100;
  const latMinutes = lat * 60;
  const lonMinutes = lon * 60;
  const r = Math.floor((latMinutes - p * 40) / 5);
  const s = Math.floor((lonMinutes - Math.floor(lon) * 60) / 7.5);
  const t = Math.floor(((latMinutes - p * 40 - r * 5) * 60) / 30);
  const u = Math.floor(
    ((lonMinutes - Math.floor(lon) * 60 - s * 7.5) * 60) / 45
  );

  const latSeconds = lat * 3600;
  const lonSeconds = lon * 3600;
  const latBaseSeconds = p * 2400 + r * 300 + t * 30;
  const lonBaseSeconds = (q + 100) * 3600 + s * 450 + u * 45;
  const latSecIn1km = Math.min(
    29.999999,
    Math.max(0, latSeconds - latBaseSeconds)
  );
  const lonSecIn1km = Math.min(
    44.999999,
    Math.max(0, lonSeconds - lonBaseSeconds)
  );
  const latHalf = Math.floor(latSecIn1km / 15);
  const lonHalf = Math.floor(lonSecIn1km / 22.5);
  const halfDigit = latHalf * 2 + lonHalf + 1;
  const latSecInHalf = latSecIn1km - latHalf * 15;
  const lonSecInHalf = lonSecIn1km - lonHalf * 22.5;
  const latQuarter = Math.floor(latSecInHalf / 7.5);
  const lonQuarter = Math.floor(lonSecInHalf / 11.25);
  const quarterDigit = latQuarter * 2 + lonQuarter + 1;

  return `${String(p).padStart(2, "0")}${String(q).padStart(2, "0")}${r}${s}${t}${u}${halfDigit}${quarterDigit}`;
}
