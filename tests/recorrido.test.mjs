import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedRate, faceReading, maximumSelected, newRoute } from '../recorrido.mjs';

test('el recorrido responde al punto y a la distancia; residuos en presencia solo da fondo', () => {
  const rate = (point, distance) => expectedRate('source', 'scrap', 30, 600, point, distance);
  assert.ok(rate(5, 100) > rate(0, 100));
  assert.ok(rate(5, 100) > rate(5, 200));
  assert.equal(expectedRate('presence', 'waste', 30, 120, 3, 100), 30);
  assert.equal(expectedRate('contamination', 'lab', 36, 184, 1, 0.5), 184);
});

test('cada máximo requiere las seis caras y puede corresponder a caras distintas', () => {
  const r = newRoute();
  for (let i = 0; i < 5; i++) {
    r.surface[i] = faceReading('surface', 950, i);
    r.metre[i] = faceReading('metre', 8.6, i);
  }
  assert.equal(maximumSelected(r.surface, 1), false);
  r.surface[5] = faceReading('surface', 950, 5);
  r.metre[5] = faceReading('metre', 8.6, 5);
  assert.equal(maximumSelected(r.surface, 1), true);
  assert.equal(maximumSelected(r.metre, 1), false);
  assert.equal(maximumSelected(r.metre, 4), true);
});
