import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const app = readFileSync("app.js", "utf8");
const handlers = app.slice(app.indexOf("function sixthStepAction"), app.indexOf("function renderGuide"));
for (const mission of ["presence", "source", "contamination", "transport"]) {
  test("El botón del paso 6 aplica el ajuste en " + mission, () => {
    const state = { mission, mode: "guided", step: 5, distance: 0, route: { metre: {}, selected: null } };
    const nodes = { distance: {}, scanSpeed: {}, countBtn: { click() { measured = true; } } };
    let measured = false, pointed, done = false;
    const ctx = { state, $: id => nodes[id], faces: Array(6),
      activeSteps: () => Array(6).fill({ done: () => done }),
      goStep: n => state.step += n, setSpeed: n => state.speed = n,
      setDistance: n => state.distance = n, pointTo: id => pointed = id };
    const act = runInNewContext(handlers + "\n() => useGuideControl('fallback')", ctx);
    act();
    if (mission === "transport") {
      assert.equal(state.step, 5);
      assert.equal(state.distance, 100);
      assert.equal(pointed, "routePanel");
      state.route.selected = 1;
      act();
      assert.ok(measured);
      done = true;
      act();
    } else if (mission === "source") assert.equal(state.speed, 5);
    else assert.equal(state.distance, mission === "presence" ? 100 : 0.5);
    assert.equal(state.step, 6);
  });
}
