import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const html = readFileSync("index.html", "utf8");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const flowNames = ["presenceSteps", "sourceSteps", "contaminationSteps", "transportSteps"];

function flowSource(name) {
  const start = app.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `No existe el flujo ${name}`);
  const end = app.indexOf("\n];", start);
  assert.notEqual(end, -1, `El flujo ${name} no cierra correctamente`);
  return app.slice(start, end + 3);
}

test("las cuatro misiones tienen diez pasos y controles existentes", () => {
  for (const name of flowNames) {
    const source = flowSource(name);
    const entries = [...source.matchAll(/(?:commonInspect|commonPower|commonAudio|doseBackgroundStep|contaminationBackgroundStep)|\{ title:/g)];
    assert.equal(entries.length, 10, `${name} no tiene 10 pasos`);
    for (const [, target] of source.matchAll(/target: "([^"]+)"/g)) {
      assert.ok(ids.has(target), `${name} apunta al control inexistente #${target}`);
    }
  }
});

test("cada paso enseña qué hacer, por qué y qué observar", () => {
  const shared = app.slice(app.indexOf("const commonInspect"), app.indexOf("const presenceSteps"));
  for (const source of [shared, ...flowNames.map(flowSource)]) {
    const stepCount = (source.match(/title:/g) || []).length;
    assert.equal((source.match(/text:/g) || []).length, stepCount);
    assert.equal((source.match(/why:/g) || []).length, stepCount);
    assert.equal((source.match(/observe:/g) || []).length, stepCount);
  }
});

test("UNITS confirma la magnitud del paso guiado", () => {
  assert.match(app, /currentGuideStep\?\.target === "unitsBtn"/);
  assert.match(app, /state\.unitConfirmed = true/);
  assert.match(app, /state\.mission === "contamination"\) ensureCountUnit\(\)/);
  assert.match(app, /else ensureDoseUnit\(\)/);
});

test("cada misión cierra apagando el instrumento real", () => {
  for (const name of flowNames) {
    const source = flowSource(name);
    assert.match(source, /target: "powerBtn", action: "Apagar desde el equipo"/);
    assert.match(source, /!state\.powered/);
  }
});

test("cambiar escenario reinicia la guía de forma segura", () => {
  assert.match(app, /state\.step = 0;/);
  assert.match(app, /state\.unitConfirmed = false;/);
  assert.match(app, /La guía volvió al paso 1/);
});

test("distancia y velocidad avanzan al alcanzar el rango guiado", () => {
  assert.match(app, /target === "distance" && activeSteps\(\)\[state\.step\]\.done\(\)\) advanceSoon\(\)/);
  assert.match(app, /target === "scanSpeed" && activeSteps\(\)\[state\.step\]\.done\(\)\) advanceSoon\(\)/);
  assert.match(app, /distance: mission === "contamination" \? 1\.5 : 50/);
  assert.match(app, /speed: 10/);
});

test("el avance mantiene el foco en el equipo", () => {
  assert.doesNotMatch(app, /guideCard"\)\.scrollIntoView/);
  const focusCalls = app.match(/pointTo\(activeSteps\(\)\[state\.step\]\.target\)/g) || [];
  assert.ok(focusCalls.length >= 3, "el paso siguiente no señala su control real");
});
