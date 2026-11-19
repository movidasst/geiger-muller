// Independent counting intervals in a stationary field. Model and pedagogy only.
export function contaminationRate(scenarioKey, scenario) {
  if (scenarioKey === "nuclear") return scenario.background + 8;
  if (scenarioKey === "waste") return scenario.background;
  return scenario.gross;
}

export function simulateCounts(rateCpm, seconds, random = Math.random) {
  const mean = rateCpm * seconds / 60;
  if (!Number.isFinite(mean) || mean < 0 || !Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError("Se requiere una tasa finita no negativa y un tiempo positivo");
  }
  // Disjoint Poisson intervals add. Chunks keep exp(-mean) representable.
  let counts = 0;
  for (let remaining = mean; remaining > 0; remaining -= 25) {
    const threshold = Math.exp(-Math.min(remaining, 25));
    let product = random();
    while (product > threshold) {
      counts++;
      product *= random();
    }
  }
  return { counts, seconds, rate: counts * 60 / seconds };
}

export function countStatistics(background, gross) {
  const tb = background.seconds / 60;
  const tg = gross.seconds / 60;
  const b = background.counts / tb;
  const g = gross.counts / tg;
  const net = g - b;
  const grossUncertainty = Math.sqrt(gross.counts) / tg;
  const uncertainty = Math.hypot(grossUncertainty, Math.sqrt(background.counts) / tb);
  // Normal approximation for two independent Poisson rates (MARLAP ch. 20).
  // Equal one-sided alpha and beta = 0.05. Solving Ld = Lc + k*u(Ld)
  // with u(Ld)^2 = b*(1/tg + 1/tb) + Ld/tg gives 2*Lc + k^2/tg.
  const k = 1.6448536269514722;
  const decision = k * Math.sqrt(b * (1 / tg + 1 / tb));
  const detection = 2 * decision + k * k / tg;
  // Suppress normal-approximation inferences for sparse samples.
  const sufficient = background.counts >= 10 && gross.counts >= 10 && b * tg >= 10;
  return {
    net, grossUncertainty, uncertainty, decision, detection, sufficient,
    detected: sufficient && net > decision,
    low: net - 1.959963984540054 * uncertainty,
    high: net + 1.959963984540054 * uncertainty
  };
}
