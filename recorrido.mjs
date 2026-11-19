export const fieldPoints = ["Acceso", "Pasillo", "Borde", "Sector D", "Sector E", "Sector F"];
export const surfacePoints = ["Fila 1 · A", "Fila 1 · B", "Fila 1 · C", "Fila 2 · A", "Fila 2 · B", "Fila 2 · C"];
export const faces = ["Frontal", "Derecha", "Posterior", "Izquierda", "Superior", "Inferior"];

// Relative survey responses for the six teaching stations; each case has its own geometry.
const profiles = {
  gauge: [0.08, 0.22, 0.56, 0.15, 1, 0.38],
  nuclear: [0.15, 0.47, 1, 0.08, 0.32, 0.59],
  waste: [0.08, 0.14, 0.43, 1, 0.5, 0.21],
  scrap: [0.12, 0.36, 0.84, 0.2, 0.47, 1],
  orphanStore: [0.17, 0.45, 1, 0.14, 0.26, 0.62],
  lab: [0.04, 1, 0.35, 0.08, 0.4, 0.02]
};

export function newRoute() {
  return { selected: null, marked: null, readings: {}, surface: {}, metre: {}, withdrawn: false };
}

export function expectedRate(mission, scenario, background, peak, point, distance) {
  if (mission === "presence" && scenario === "waste") return background;
  const profile = profiles[scenario] ?? profiles.lab;
  const reference = mission === "contamination" ? 0.5 : 100;
  // Illustrative spatial attenuation, normalized at the classroom reference distance.
  const response = (2 * reference ** 2) / (reference ** 2 + distance ** 2);
  return background + Math.max(0, peak - background) * profile[point] * response;
}

export function faceReading(stage, nominalMaximum, point) {
  const factors = stage === "surface"
    ? [0.61, 1, 0.73, 0.55, 0.86, 0.42]
    : [0.68, 0.76, 0.59, 0.71, 1, 0.53];
  return Number((nominalMaximum * factors[point]).toFixed(2));
}

export function maximumSelected(readings, selected) {
  const values = faces.map((_, i) => readings[i]);
  return selected !== null && values.every(Number.isFinite) && readings[selected] === Math.max(...values);
}

// Classroom trend flag for comparing mapped positions. Formal detection is decided
// separately from the fixed-position count and its background observation.
export function observedGradient(route, backgroundCpm) {
  const extrema = route?.extrema;
  return Boolean(extrema && extrema.highPoint !== extrema.lowPoint
    && extrema.high >= 1.5 * Math.max(1, extrema.low, backgroundCpm));
}

export function trackExtrema(route, point, rate) {
  if (!route.extrema) route.extrema = { low: rate, high: rate, lowPoint: point, highPoint: point };
  const extrema = route.extrema;
  if (rate < extrema.low) Object.assign(extrema, { low: rate, lowPoint: point });
  if (rate > extrema.high) Object.assign(extrema, { high: rate, highPoint: point });
}
