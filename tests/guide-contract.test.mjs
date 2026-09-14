import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
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
    const entries = [...source.matchAll(/(?:commonInspect|commonPower|commonAudio|doseBackgroundStep|contaminationBackgroundStep|fieldSpeedStep)|\{ title:/g)];
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

test("cada misión carga únicamente escenarios compatibles", () => {
  assert.match(app, /presence: \["gauge", "nuclear", "waste"\]/);
  assert.match(app, /source: \["scrap", "orphanStore"\]/);
  assert.match(app, /contamination: \["lab", "nuclear", "waste"\]/);
  assert.match(app, /transport: \["packageYellowII", "packageWhite", "packageYellowIII"\]/);
  assert.match(app, /configureMissionScenarios\(mission\);\s+resetScenario\(state\.scenario\)/);
  assert.match(app, /state\.scenario = allowed\[0\]/);
});

test("el barrido de campo siempre tiene ajuste de velocidad previo", () => {
  for (const name of ["presenceSteps", "sourceSteps"]) {
    const source = flowSource(name);
    assert.ok(source.indexOf("fieldSpeedStep") < source.indexOf('target: "scanBtn"'), `${name} inicia el barrido antes de ajustar velocidad`);
  }
  assert.match(app, /Mueve el control desde 10 hasta 5 cm\/s/);
});

test("el paso de distancia indica el valor exacto", () => {
  assert.match(app, /Mover distancia hasta 1,0 m/);
  assert.match(app, /Mover distancia hasta 0,5 cm/);
});

test("todas las mediciones se ejecutan desde el instrumento", () => {
  for (const forbidden of ["backgroundBtn", "confirmBtn", "surfaceDoseBtn", "oneMeterBtn", "calculateTIBtn", "startScan", "scanArea"]) assert.ok(!ids.has(forbidden), `permanece el control externo #${forbidden}`);
  for (const required of ["countBtn", "scanBtn", "calcBtn"]) assert.ok(ids.has(required), `falta el botón físico #${required}`);
  assert.match(app, /step\?\.target === "countBtn"/);
  assert.match(app, /scanBtn"\)\.addEventListener\("click", startScanning\)/);
  assert.match(app, /calcBtn"\)\.addEventListener\("click", calculateTI\)/);
});


test("COUNT conserva su estructura durante todas las cuentas regresivas", () => {
  const start = app.indexOf("function simulateCount");
  const end = app.indexOf("\nfunction measureBackground", start);
  const source = app.slice(start, end);
  assert.match(source, /button\.id === "countBtn" \? \$\("countLabel"\) : null/);
  assert.match(source, /progressLabel\.textContent = value/);
  assert.match(source, /setProgress\(original\)/);
});

test("no quedan referencias de ejecución a paneles eliminados", () => {
  assert.doesNotMatch(app, /querySelector\("\.surface-panel"\)/);
  assert.doesNotMatch(app, /querySelector\("\.scan-controls label"\)/);
});


test("el audio se desbloquea desde el botón y emite pulsos de prueba", () => {
  assert.match(app, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(app, /audioContext\.resume\(\)/);
  assert.match(app, /detectorClick\(1\)/);
  assert.match(app, /dos pulsos de prueba/);
});

test("el barrido reproduce clics con cadencia dependiente de la lectura", () => {
  assert.match(app, /function emitDetectorClick\(reading\)/);
  assert.match(app, /const ratio = Math\.max\(0\.5, reading \/ baseline\)/);
  assert.match(app, /emitDetectorClick\(count\)/);
  assert.doesNotMatch(app, /function clickSound\(\)/);
});


test("el acceso y el simulador son vistas excluyentes", () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(app, /\$\("loginGate"\)\.hidden = true/);
  assert.match(app, /\$\("appShell"\)\.hidden = false/);
  assert.match(app, /classList\.add\("simulator-open"\)/);
});

test("al ingresar la vista comienza arriba en PC, tablet y móvil", () => {
  assert.match(app, /window\.scrollTo\(0, 0\)/);
  assert.match(app, /document\.documentElement\.scrollTop = 0/);
  assert.match(css, /#appShell\{min-height:100svh\}/);
});
