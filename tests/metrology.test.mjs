import test from "node:test";
import assert from "node:assert/strict";
import { contaminationRate, countStatistics, simulateCounts } from "../metrology.mjs";

test("120 CPM en 30 s provienen de 60 cuentas", () => {
  const result = countStatistics({ counts: 30, seconds: 60 }, { counts: 60, seconds: 30 });
  assert.equal(result.net, 90);
  assert.ok(Math.abs(result.grossUncertainty - 15.491933) < 0.000001);
  assert.ok(Math.abs(result.uncertainty - Math.sqrt(270)) < 0.000001);
  const k = 1.6448536269514722;
  assert.ok(Math.abs(result.detection - result.decision - k * Math.sqrt(90 + 2 * result.detection)) < 1e-9);
  assert.ok(result.detected);
});

test("caso nulo conserva la estimación neta con signo y la advertencia para muestras escasas", () => {
  assert.equal(contaminationRate("waste", { background: 29, gross: 112 }), 29);
  assert.equal(contaminationRate("nuclear", { background: 44, gross: 328 }), 52);
  const result = countStatistics({ counts: 40, seconds: 60 }, { counts: 15, seconds: 30 });
  assert.equal(result.net, -10);
  assert.equal(result.detected, false);
  assert.ok(result.low < 0 && result.high > 0);
  assert.equal(countStatistics({counts: 1, seconds: 60}, {counts: 1, seconds: 30}).sufficient, false);
});

test("conteos independientes, enteros y con media y varianza de Poisson", () => {
  let seed = 123456;
  const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) + 0.5) / 4294967296;
  const n = 12000;
  let sum = 0, sumSquares = 0;
  for (let i = 0; i < n; i++) {
    const { counts, rate } = simulateCounts(120, 30, random);
    assert.equal(rate, counts * 2);
    assert.ok(Number.isInteger(counts));
    sum += counts;
    sumSquares += counts * counts;
  }
  const mean = sum / n;
  assert.ok(Math.abs(mean - 60) < 0.5);
  assert.ok(Math.abs(sumSquares / n - mean * mean - 60) < 3);
  assert.equal(simulateCounts(0, 60, random).counts, 0);
});
