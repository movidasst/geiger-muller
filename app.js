import { readDraft, saveDraft, discardDraft, restoreForm } from "./practice-draft.js";
let practiceOwner = null;
import { fieldPoints, surfacePoints, faces, newRoute, expectedRate, faceReading, maximumSelected, observedGradient, trackExtrema } from "./recorrido.mjs";
import { installAssessment, prepareAssessment, showDecision, equipmentCard } from "./assessment.js";
import { contaminationRate, countStatistics, simulateCounts } from "./metrology.mjs";
const $ = (id) => document.getElementById(id);
const SUPABASE_URL = "https://lfdmbkzghnwvsapxypvt.supabase.co";
const KEY = "sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1";
const SESSION = "movida-geiger-session", ATTEMPTS = "movida-geiger-attempts";
let audioContext = null;
let nextDetectorClickAt = 0;
const state = { mode: "guided", mission: "presence", step: 0, powered: false, audio: false, light: false, hold: false, unit: "\xB5Sv/h", range: "AUTO", inspected: false, background: null, gross: null, scanStarted: false, scanComplete: false, hotspot: false, confirmed: false, distance: 100, speed: 5, scenario: "lab", surfaceDose: null, oneMeterDose: null, transportDone: false, guideComplete: false, unitConfirmed: false, lastReading: null, maxReading: 0, timer: null };
const scenarios = {
  lab: { background: 36, gross: 184, dose: 0.42, surfaceDose: 74, oneMeterDose: 3.4, label: "Mesón de radioisótopos" },
  nuclear: { background: 44, gross: 328, dose: 1.18, surfaceDose: 286, oneMeterDose: 8.7, label: "Área de medicina nuclear" },
  waste: { background: 29, gross: 112, dose: 0.31, surfaceDose: 4.2, oneMeterDose: 0.34, label: "Almacén de residuos radiactivos" },
  gauge: { background: 34, gross: 486, dose: 3.2, surfaceDose: 740, oneMeterDose: 13.2, label: "Medidor nuclear industrial" },
  scrap: { background: 31, gross: 690, dose: 4.8, surfaceDose: 1280, oneMeterDose: 22.5, label: "Fuente sospechosa en chatarra" },
  orphanStore: { background: 33, gross: 820, dose: 6.2, surfaceDose: 1450, oneMeterDose: 31, label: "Objeto sin identificación en almacén" },
  packageWhite: { background: 34, gross: 92, dose: 0.22, surfaceDose: 3.0, oneMeterDose: 0.3, label: "Bulto B" },
  packageYellowII: { background: 36, gross: 260, dose: 0.86, surfaceDose: 120, oneMeterDose: 8.7, label: "Bulto A" },
  packageYellowIII: { background: 38, gross: 510, dose: 2.1, surfaceDose: 950, oneMeterDose: 8.6, label: "Bulto C" }
};
const missionScenarios = {
  presence: ["gauge", "nuclear", "waste"],
  source: ["scrap", "orphanStore"],
  contamination: ["lab", "nuclear", "waste"],
  transport: ["packageYellowII", "packageWhite", "packageYellowIII"]
};
const missionScenarioLabels = {
  presence: "ESCENARIO DE VIGILANCIA",
  source: "ESCENARIO DE BÚSQUEDA",
  contamination: "SUPERFICIE A EVALUAR",
  transport: "BULTO PARA TRANSPORTE"
};
function configureMissionScenarios(mission) {
  const allowed = missionScenarios[mission];
  $("scenario").replaceChildren(...allowed.map((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = scenarios[key].label;
    return option;
  }));
  state.scenario = allowed[0];
  $("scenario").value = state.scenario;
  $("scenarioLabel").textContent = missionScenarioLabels[mission];
}
const commonInspect = {
  title: "Selecciona e inspecciona el detector",
  text: "La configuración cambia según la misión. Revisa carcasa, cable, conector, ventana y vigencia de calibración antes de usarla.",
  why: "una sonda inadecuada o dañada puede responder, pero entregar una magnitud que no sirve para decidir.",
  observe: "la tarjeta “Detector seleccionado” debe coincidir con el objetivo de la misión.",
  target: "probeTarget", action: "Inspeccionar detector", done: () => state.inspected, run: inspectProbe
};
const commonPower = {
  title: "Enciende y comprueba el instrumento",
  text: "Pulsa ON/OFF y espera la autocomprobación de batería, pantalla, audio y estado del detector.",
  why: "una lectura solo es defendible si el sistema está operativo antes de entrar al área.",
  observe: "LED verde, batería suficiente y pantalla sin mensajes de falla.",
  target: "powerBtn", action: "Encender equipo", done: () => state.powered, run: () => togglePower(true)
};
const commonAudio = {
  title: "Elige la señal visual o audible",
  text: "Pulsa «Usar solo señal visual» o activa AUDIO para seguir también la cadencia de los pulsos.",
  why: "la cadencia de pulsos ayuda a advertir un gradiente sin fijar la mirada en la pantalla.",
  observe: "observa la lectura y la barra; más pulsos significan mayor respuesta, no identificación del radionucleido.",
  target: "audioBtn", action: "Elegir señal", done: () => state.audioReviewed, run: () => toggleAudio(true)
};
const doseBackgroundStep = {
  title: "Establece la tasa de fondo",
  text: "Mide 60 s en una zona representativa, lejos del objeto o punto sospechoso, manteniendo la misma unidad.",
  why: "el fondo es la referencia para reconocer un incremento y documentar la condición inicial.",
  observe: "una lectura estable en µSv/h; no restes automáticamente el fondo para comparar una tasa de dosis calibrada.",
  target: "countBtn", action: "Medir fondo 60 s", done: () => state.background !== null, run: measureBackground
};
const contaminationBackgroundStep = {
  title: "Mide el conteo de fondo",
  text: "Con la pancake alejada de la superficie, cuenta durante 60 s y registra el resultado en CPM.",
  why: "la contaminación se decide comparando el conteo bruto con la variabilidad del fondo.",
  observe: "CPM de fondo y el mismo tiempo de conteo que documentarás en el registro.",
  target: "countBtn", action: "Medir fondo en CPM", done: () => state.background !== null, run: measureBackground
};
const fieldSpeedStep = {
  title: "Ajusta el ritmo de reconocimiento",
  text: "Mueve el control desde 10 hasta 5 cm/s. Debe quedar dentro del rango verde de 3–6 cm/s antes de iniciar.",
  why: "un recorrido rápido puede ocultar un incremento breve y producir una falsa sensación de seguridad.",
  observe: "la pantalla debe indicar 5 cm/s; al entrar en 3–6 cm/s la guía avanza automáticamente.",
  target: "scanSpeed", action: "Mover velocidad hasta 5 cm/s", done: () => state.speed >= 3 && state.speed <= 6,
  run: () => pointTo("scanSpeed")
};
const presenceSteps = [
  commonInspect, commonPower,
  { title: "Confirma la magnitud correcta", text: "Usa la lectura principal Ḣ*(10) en µSv/h del detector compensado. CPM/CPS quedan como diagnóstico interno.", why: "la tasa de conteo no equivale universalmente a tasa de dosis.", observe: "la pantalla indica µSv/h y “TASA DE DOSIS H*(10)”.", target: "unitsBtn", action: "Confirmar µSv/h", done: () => state.unitConfirmed && state.unit === "µSv/h", run: ensureDoseUnit },
  doseBackgroundStep, commonAudio,
  { title: "Coloca la distancia inicial", text: "Mueve el deslizador que está en 50 cm hasta que la etiqueta marque exactamente 1,0 m.", why: "tiempo, distancia y blindaje reducen la exposición durante el reconocimiento.", observe: "la etiqueta superior del control debe mostrar 1,0 m; al alcanzarlo la guía avanza automáticamente.", target: "distance", action: "Mover distancia hasta 1,0 m", done: () => state.distance === 100, run: () => pointTo("distance") },
  fieldSpeedStep,
  { title: "Reconoce el área sistemáticamente", text: "Recorre el área lentamente, observa la tendencia y retrocede si la tasa aumenta con rapidez.", why: "el objetivo es caracterizar el campo sin exponerte innecesariamente.", observe: "un incremento sostenido respecto al fondo y no un pulso aislado.", target: "scanBtn", action: "Iniciar reconocimiento", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma e interpreta la tasa", text: "Mantén fija la geometría, confirma durante 30 s y luego observa automáticamente la tasa, la proyección para 8 h y el nivel de investigación del ejercicio.", why: "una lectura estable y reproducible permite interpretar y registrar; µSv/h es rapidez y µSv es acumulación.", observe: "tasa confirmada, valor máximo, proyección y veredicto ocupacional, sin presentarlo como límite legal universal.", target: "countBtn", action: "Confirmar 30 s", done: () => state.confirmed, run: confirmHotspot },
  { title: "Registra y comunica", text: "Documenta detector, calibración, ubicación, fondo, geometría, tasa máxima, tiempo y controles aplicados.", why: "la trazabilidad permite repetir la medición y justificar la decisión ocupacional.", observe: "un cierre completo; si hay incremento relevante, controla el área y comunica al responsable de protección radiológica.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.confirmed && state.submission?.ok && !state.powered, run: () => pointTo("powerBtn") }
];
const sourceSteps = [
  commonInspect, commonPower, commonAudio, doseBackgroundStep,
  { title: "Selecciona el punto inicial de este caso", text: "Mueve el deslizador desde 50 cm hasta que marque 1,0 m. Este metro pertenece al croquis simulado. La distancia de protección real depende del campo y del procedimiento.", why: "una fuente huérfana puede producir un gradiente desconocido; primero protege a las personas.", observe: "ruta de retirada disponible y etiqueta de distancia en 1,0 m; la guía avanzará al alcanzarla.", target: "distance", action: "Mover distancia hasta 1,0 m", done: () => state.distance === 100, run: () => pointTo("distance") },
  fieldSpeedStep,
  { title: "Busca el gradiente, no el objeto", text: "Haz un recorrido lento y ordenado. Si la tasa crece rápidamente, retrocede y delimita.", why: "localizar no significa aproximarse hasta tocar; la seguridad manda sobre la precisión.", observe: "aumento sostenido de µSv/h y de la señal audible al cambiar de posición.", target: "scanBtn", action: "Iniciar búsqueda segura", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma desde una posición segura", text: "Conserva distancia y orientación, realiza una lectura fija de 30 s y no manipules la fuente.", why: "confirmar el gradiente aporta evidencia sin aumentar innecesariamente la exposición.", observe: "tasa reproducible por encima del fondo.", target: "countBtn", action: "Confirmar incremento", done: () => state.confirmed, run: confirmHotspot },
  { title: "Toma la decisión ocupacional", text: "Interrumpe el acceso, aumenta la distancia y notifica al responsable radiológico; no intentes identificar el radionucleido con este equipo.", why: "un GM localiza radiación, pero no realiza espectrometría ni identifica la fuente.", observe: "el veredicto indica no tocar, aislar y comunicar.", target: "decisionPanel", action: "Registrar decisión", done: () => state.submission?.ok, run: () => advanceSoon() },
  { title: "Cierra sin manipular", text: "Mantén el área controlada y entrega la gestión a personal autorizado.", why: "el cierre seguro evita exposición secundaria o pérdida de trazabilidad.", observe: "práctica finalizada con el área aislada.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.confirmed && state.submission?.ok && !state.powered, run: () => pointTo("powerBtn") }
];
const contaminationSteps = [
  commonInspect, commonPower,
  { title: "Selecciona CPM", text: "La sonda pancake informa tasa de conteo. Usa CPM para fondo, barrido y confirmación.", why: "sin eficiencia y radionucleido conocidos, CPM no debe presentarse como µSv/h ni como actividad superficial.", observe: "la pantalla y los resultados muestran CPM.", target: "unitsBtn", action: "Confirmar CPM", done: () => state.unitConfirmed && state.unit === "CPM", run: ensureCountUnit },
  contaminationBackgroundStep, commonAudio,
  { title: "Ajusta distancia y orientación", text: "Mueve el deslizador desde 1,5 cm hasta que marque 0,5 cm. Mantén la ventana paralela y sin tocar la superficie.", why: "la distancia modifica mucho la eficiencia y el contacto puede romper o contaminar la ventana.", observe: "la etiqueta debe mostrar 0,5 cm; al entrar en 0,3–0,6 cm la guía avanza automáticamente.", target: "distance", action: "Mover distancia hasta 0,5 cm", done: () => state.distance >= 0.3 && state.distance <= 0.6, run: () => pointTo("distance") },
  { title: "Ajusta la velocidad de barrido", text: "Selecciona 3–6 cm/s y utiliza pasadas paralelas ligeramente solapadas.", why: "un barrido rápido reduce el tiempo sobre una zona activa y puede omitir contaminación.", observe: "5 cm/s y cobertura completa, sin huecos.", target: "scanSpeed", action: "Ajustar a 5 cm/s", done: () => state.speed >= 3 && state.speed <= 6, run: () => { setSpeed(5); $("scanSpeed").value=5; advanceSoon(); } },
  { title: "Barre toda la superficie", text: "Pulsa SCAN, recorre los seis sectores y marca un punto para confirmar. Puedes guiarte por la lectura visual.", why: "el barrido sirve para localizar; todavía no es la medición confirmatoria.", observe: "las lecturas de todos los sectores y el punto que elegiste.", target: "scanBtn", action: "Iniciar barrido", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma en posición fija", text: "Detén la sonda sobre el máximo y cuenta 30 s conservando la geometría.", why: "el conteo fijo permite calcular tasa neta y evaluar la señal frente al fondo.", observe: "conteo bruto, tasa neta, umbral de decisión e intervalo de cobertura.", target: "countBtn", action: "Confirmar 30 s", done: () => state.confirmed, run: confirmHotspot },
  { title: "Interpreta sin inventar actividad", text: "Decide si el efecto está demostrado sobre el fondo. No conviertas a Bq/cm² sin eficiencia, área y radionucleido.", why: "una tasa neta detectada no equivale por sí sola a actividad superficial.", observe: "el veredicto dice detectado/no demostrado y conserva CPM.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.confirmed && state.submission?.ok && !state.powered, run: () => pointTo("powerBtn") }
];
const transportSteps = [
  commonInspect, commonPower,
  { title: "Confirma el medidor de tasa de dosis", text: "Para esta misión usa el detector calibrado que indica Ḣ*(10) en µSv/h.", why: "el índice de transporte se basa en la tasa máxima a 1 m, no en CPM.", observe: "unidad µSv/h y configuración de tasa de dosis.", target: "unitsBtn", action: "Confirmar µSv/h", done: () => state.unitConfirmed && state.unit === "µSv/h", run: ensureDoseUnit },
  doseBackgroundStep,
  { title: "Localiza el máximo superficial", text: "Ajusta la referencia superficial a 0 cm en el croquis, elige cada cara y mide con COUNT. Marca la cara de mayor lectura.", why: "la categoría de etiqueta también depende del máximo superficial.", observe: "máximo superficial en µSv/h y condición física del bulto.", target: "countBtn", action: "Medir máximo superficial", done: () => state.surfaceDose !== null, run: measureSurfaceDose },
  { title: "Mide exactamente a 1 metro", text: "Ajusta 1,0 m desde la superficie externa. Repite las seis caras y selecciona el máximo de esta segunda serie.", why: "el IT se calcula con la tasa a 1 m de la superficie externa, no del centro.", observe: "lectura a 1 m expresada en µSv/h.", target: "countBtn", action: "Medir a 1 metro", done: () => state.oneMeterDose !== null, run: measureOneMeterDose },
  { title: "Calcula el índice de transporte", text: "Convierte µSv/h a mSv/h, multiplica por 100 y aplica el redondeo correspondiente.", why: "esa operación produce el número adimensional usado para control del transporte.", observe: "anota el resultado adimensional con el redondeo del ejercicio antes de comparar tu respuesta.", target: "calcBtn", action: "Calcular IT", done: () => state.transportDone, run: calculateTI },
  { title: "Verifica ambos criterios", text: "Revisa simultáneamente IT y máximo superficial para determinar la categoría simulada.", why: "la etiqueta no se decide únicamente con el IT.", observe: "I‑BLANCA, II‑AMARILLA, III‑AMARILLA o fuera del alcance ordinario.", target: "decisionPanel", action: "Registrar categoría", done: () => state.submission?.ok, run: () => advanceSoon() },
  { title: "No confundas IT con CSI", text: "El IT se relaciona con exposición externa; el índice de seguridad con respecto a la criticidad aplica a material fisible.", why: "son controles diferentes aunque ambos puedan aparecer en documentación de transporte.", observe: "el resultado permanece identificado como índice de transporte.", target: "tiResult", action: "Comprendí la diferencia", done: () => state.transportDone, run: () => advanceSoon() },
  { title: "Registra la verificación", text: "Documenta instrumento, calibración, fondo, máximos, distancia, IT, categoría, fecha y responsable.", why: "la trazabilidad forma parte del control del bulto y de la comunicación del riesgo.", observe: "verificación finalizada con todos los datos esenciales.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.transportDone && state.submission?.ok && !state.powered, run: () => pointTo("powerBtn") }
];
function activeSteps() {
  return ({ presence: presenceSteps, source: sourceSteps, contamination: contaminationSteps, transport: transportSteps })[state.mission];
}
function ensureDoseUnit() {
  if (!state.powered) { toast("Primero enciende el instrumento."); pointTo("powerBtn"); return; }
  state.unit = "µSv/h"; state.unitConfirmed = true; state.hold = false; updateDisplay(state.background); renderGuide();
  toast("Magnitud confirmada: tasa de equivalente de dosis ambiental Ḣ*(10)");
  advanceSoon();
}
function ensureCountUnit() {
  if (!state.powered) { toast("Primero enciende el instrumento."); pointTo("powerBtn"); return; }
  state.unit = "CPM"; state.unitConfirmed = true; state.hold = false; updateDisplay(state.background); renderGuide();
  toast("Magnitud confirmada: tasa de conteo en CPM");
  advanceSoon();
}
function setDistanceAndAdvance(value) {
  $("distance").value = value; setDistance(value); advanceSoon();
}
function finishGuide() {
  state.guideComplete = true;
  renderGuide();
  toast("Misión completada · revisa el resumen y registra el resultado");
}
function setLogin(text) {
  $("loginMessage").textContent = text;
}
function openApp(member, persist = true) {
  const name = [member?.nombres, member?.apellidos].filter(Boolean).join(" ") || member?.name || "integrante";
  const expiresAt = member?.expiresAt || Date.now() + 20 * 6e4;
  practiceOwner = member.practiceOwner || null;
  if (persist) sessionStorage.setItem(SESSION, JSON.stringify({ name, expiresAt, practiceOwner }));
  $("memberName").textContent = name;
  $("loginGate").hidden = true;
  $("appShell").hidden = false;
  document.body.classList.remove("auth-locked");
  document.body.classList.add("simulator-open");
  history.replaceState(null, "", location.pathname);
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const draft = practiceOwner && readDraft(practiceOwner);
  setMission(draft?.progress.mission || state.mission);
  if (draft && missionScenarios[state.mission].includes(draft.progress.scenario)) {
    resetScenario(draft.progress.scenario);
    Object.assign(state, draft.progress, { advancing: false, timer: null, audio: false, hold: false });
    $("scenario").value = state.scenario;
    $("distance").value = state.distance;
    $("scanSpeed").value = state.speed;
    setDistance(state.distance);
    setSpeed(state.speed);
    equipmentCard(state, state.instrumentFault);
    restoreForm(draft);
    if (state.confirmed) calculateResults();
    setMode(state.mode);
    renderRoute();
    updateDisplay(state.powered ? state.gross ?? state.background : null);
    toast("Práctica recuperada. Las mediciones interrumpidas pueden repetirse.");
  }
  setTimeout(() => { $("expiryWarning").hidden = false; }, Math.max(0, expiresAt - Date.now() - 120000));
  requestAnimationFrame(() => window.scrollTo(0, 0));
  setTimeout(() => logout(true), Math.max(0, expiresAt - Date.now()));
}
window.addEventListener("pagehide", () => saveDraft(practiceOwner, state));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveDraft(practiceOwner, state);
});
function logout(expired = false) {
  if (expired) saveDraft(practiceOwner, state);
  else discardDraft();
  practiceOwner = null;
  sessionStorage.removeItem(SESSION);
  clearInterval(state.timer);
  location.reload();
  if (expired) sessionStorage.setItem("movida-session-message", "La sesi\xF3n finaliz\xF3 por seguridad.");
}
async function login(e) {
  e.preventDefault();
  const cedula = $("memberId").value.replace(/\D/g, ""), codigo = $("memberPassword").value.trim();
  if (!cedula || !codigo) {
    setLogin("Escribe tu c\xE9dula y tu clave para continuar.");
    return;
  }
  const blocked = JSON.parse(localStorage.getItem(ATTEMPTS) || '{"count":0,"until":0}');
  if (blocked.until > Date.now()) {
    setLogin("Demasiados intentos. Espera unos minutos.");
    return;
  }
  const btn = $("loginSubmit");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Verificando\u2026";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/acceso_geiger`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_cedula: cedula, p_codigo: codigo }) });
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      if (r.status === 429 || error?.code === "GEIGER_RATE_LIMIT") {
        setLogin("Demasiados intentos. Espera 15 minutos antes de volver a probar.");
        return;
      }
      throw Error(String(r.status));
    }
    const p = await r.json(), m = Array.isArray(p) ? p[0] : p;
    if (!m) {
      const count = (blocked.count || 0) + 1, lock = count >= 5;
      localStorage.setItem(ATTEMPTS, JSON.stringify({ count: lock ? 0 : count, until: lock ? Date.now() + 15 * 6e4 : 0 }));
      setLogin(lock ? "Cinco intentos fallidos. Acceso pausado por 15 minutos." : `Datos no validados. Revisa c\xE9dula y clave; quedan ${5 - count} intentos.`);
      return;
    }
    localStorage.removeItem(ATTEMPTS);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cedula));
    const ownerKey = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
    openApp({ ...m, practiceOwner: ownerKey });
    toast("Acceso validado");
  } catch (err) {
    console.error(err);
    setLogin("El servicio de acceso no est\xE1 disponible. Intenta nuevamente en unos minutos.");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Abrir simulador";
  }
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2800);
}
function inspectProbe() {
  if (state.inspected) { toast("Inspección registrada."); return; }
  $("inspection").hidden = false;
  pointTo("probeChoice");
}
function acceptProbe() {
  if (state.inspected) {
    toast("La inspecci\xF3n ya fue registrada.");
    return;
  }
  state.inspected = true;
  renderGuide();
  toast("Paso completado \xB7 sonda, cable y ventana inspeccionados");
  advanceSoon();
}
function randomAround(value, spread = 5) {
  return Math.max(0, Math.round(value + (Math.random() - 0.5) * spread * 2));
}
function doseFromCpm(cpm) {
  return cpm * (scenarios[state.scenario].dose / scenarios[state.scenario].gross);
}
function formatInstrument(cpm, unit = state.unit) {
  if (cpm === null || cpm === void 0) return "\u2014";
  if (unit === "\xB5Sv/h") return doseFromCpm(cpm).toFixed(2);
  if (unit === "CPS") return (cpm / 60).toFixed(2);
  return Math.round(cpm);
}
function recordSample(cpm) {
  state.samples ??= [];
  state.samples.push(cpm);
  if (state.samples.length > 10) state.samples.shift();
}
function updateDisplay(value) {
  const cpm = value ?? (state.powered ? state.background ?? randomAround(scenarios[state.scenario].background, 2) : null);
  $("meter").classList.toggle("on", state.powered);
  $("screen").classList.toggle("lit", state.light);
  $("holdBtn").classList.toggle("active", state.hold);
  $("lightBtn").classList.toggle("active", state.light);
  if (state.hold && state.lastReading !== null) return;
  const shown = cpm === null ? "----" : formatInstrument(cpm);
  state.lastReading = shown;
  if (typeof cpm === "number") state.maxReading = Math.max(state.maxReading, cpm);
  $("reading").textContent = shown;
  $("unitLabel").textContent = state.unit;
  $("avgValue").textContent = state.samples?.length ? formatInstrument(state.samples.reduce((a, b) => a + b, 0) / state.samples.length) : "—";
  $("maxValue").textContent = state.maxReading ? formatInstrument(state.maxReading) : "\u2014";
  $("screenRange").textContent = state.range;
  $("screenMode").textContent = state.powered ? state.scanStarted && !state.scanComplete ? "RECONOCIMIENTO EN CURSO" : state.confirmed ? "MEDICI\xD3N CONFIRMADA" : state.unit === "\xB5Sv/h" ? "TASA DE DOSIS H*(10)" : "TASA DE CONTEO" : "EQUIPO APAGADO";
  $("audioBtn").classList.toggle("active", state.audio);
  $("audioIcon").style.opacity = state.audio ? 1 : 0.25;
  $("scaleBar").style.width = cpm === null ? "0%" : `${Math.min(100, cpm / 4)}%`;
}
function cycleUnits() {
  if (!state.powered) {
    toast("Primero enciende el instrumento.");
    return;
  }
  const currentGuideStep = state.mode === "guided" ? activeSteps()[state.step] : null;
  if (currentGuideStep?.target === "unitsBtn" && !currentGuideStep.done()) {
    if (state.mission === "contamination") ensureCountUnit();
    else ensureDoseUnit();
    return;
  }
  const allowed = state.mission === "contamination" ? ["CPM", "CPS"] : ["\xB5Sv/h", "CPM", "CPS"];
  state.unit = allowed[(allowed.indexOf(state.unit) + 1) % allowed.length];
  state.hold = false;
  updateDisplay(state.gross ?? state.background);
  toast(state.unit === "\xB5Sv/h" ? "Unidad profesional: tasa de dosis en \xB5Sv/h" : "Unidad t\xE9cnica secundaria: " + state.unit);
}
function cycleRange() {
  const ranges = ["AUTO", "LOW", "HIGH"];
  state.range = ranges[(ranges.indexOf(state.range) + 1) % ranges.length];
  $("rangeBtn").querySelector("small").textContent = state.range;
  updateDisplay();
  toast("Rango: " + state.range);
}
function toggleLight() {
  state.light = !state.light;
  $("meter").classList.toggle("lit", state.light);
  updateDisplay();
  toast(state.light ? "Iluminaci\xF3n activada" : "Iluminaci\xF3n desactivada");
}
function toggleHold() {
  state.hold = !state.hold;
  if (!state.hold) state.lastReading = null;
  updateDisplay(state.gross ?? state.background);
  toast(state.hold ? "Lectura retenida" : "Retenci\xF3n liberada");
}
function cancelMeasurement() {
  clearInterval(state.timer);
  state.timer = null;
  $("countBtn").disabled = false;
  $("scanBtn").disabled = false;
  $("countLabel").textContent = "MEDIR";
  if (!state.scanComplete) state.scanStarted = false;
}

function togglePower(force) {
  if (!state.powered && !state.inspected) { inspectProbe(); return; }
  if (state.powered && !$("countBtn").disabled && (state.confirmed || state.transportDone) && !state.submission?.ok) {
    toast("Antes de cerrar el caso, registra y revisa tu decisión.");
    pointTo("decisionPanel");
    return;
  }
  state.powered = force ?? !state.powered;
  if (!state.powered) {
    state.audio = false;
    state.hold = false;
    cancelMeasurement();
  }
  renderRoute();
  updateDisplay();
  renderGuide();
  if (state.powered) {
    toast("Autocomprobaci\xF3n correcta \xB7 bater\xEDa 92 %");
    advanceSoon();
  }
}
function ensureAudioContext() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioEngine();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}
function detectorClick(intensity = 1) {
  if (!state.audio) return;
  try {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const play = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = "square";
      osc.frequency.setValueAtTime(1250 + Math.min(500, intensity * 90), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.min(0.16, 0.055 + intensity * 0.012), now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    };
    if (ctx.state === "running") play();
    else ctx.resume().then(play).catch(() => {});
  } catch {
    toast("El navegador bloqueó el audio. Revisa el volumen multimedia y vuelve a pulsar AUDIO.");
  }
}
function emitDetectorClick(reading) {
  recordSample(reading);
  if (!state.audio) return;
  const now = performance.now();
  if (now < nextDetectorClickAt) return;
  const baseline = Math.max(1, state.background || 30);
  const ratio = Math.max(0.5, reading / baseline);
  nextDetectorClickAt = now + Math.max(70, 360 / ratio);
  detectorClick(Math.min(6, ratio));
}
function toggleAudio(force) {
  if (!state.powered) {
    toast("Primero enciende el instrumento.");
    pointTo("powerBtn");
    return;
  }
  state.audio = force ?? !state.audio;
  state.audioReviewed = true;
  if (state.audio) {
    ensureAudioContext();
    detectorClick(1);
    setTimeout(() => detectorClick(1.4), 110);
  }
  updateDisplay();
  renderGuide();
  toast(state.audio ? "Audio activado: escucharás dos pulsos de prueba." : "Respuesta audible desactivada");
  advanceSoon();
}
function simulateCount(button, duration, onDone, label) {
  if (!state.powered) {
    toast("El equipo est\xE1 apagado.");
    pointTo("powerBtn");
    return;
  }
  if (button.disabled || (state.scanStarted && !state.scanComplete)) return;
  button.disabled = true;
  let left = duration;
  const progressLabel = button.id === "countBtn" ? $("countLabel") : null;
  const original = progressLabel ? progressLabel.textContent : button.textContent;
  const setProgress = (value) => {
    if (progressLabel) progressLabel.textContent = value;
    else button.textContent = value;
  };
  setProgress(`${label} ${left} s sim.`);
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    left -= 5;
    setProgress(`${label} ${Math.max(0, left)} s sim.`);
    if (left <= 0) {
      clearInterval(state.timer);
      button.disabled = false;
      setProgress(original);
      onDone();
    }
  }, 180);
}
function measureBackground() {
  const seconds = 60;
  simulateCount($("countBtn"), seconds, () => {
    state.backgroundObservation = simulateCounts(scenarios[state.scenario].background, seconds);
    state.background = state.backgroundObservation.rate;
    const countsMode = state.mission === "contamination";
    $("backgroundResult").textContent = countsMode ? state.background : doseFromCpm(state.background).toFixed(2);
    if (countsMode) $("backgroundUnit").textContent = `CPM · ${state.backgroundObservation.counts} cuentas en ${seconds} s simulados`;
    recordSample(state.background);
    updateDisplay(state.background);
    renderGuide();
    toast("Medición de fondo registrada");
    advanceSoon();
  }, "Midiendo");
}
function setDistance(value) {
  state.distance = Number(value);
  $("distanceValue").textContent = state.distance >= 100 ? (state.distance / 100).toLocaleString("es-VE", { minimumFractionDigits: 1 }) + " m" : `${state.distance.toFixed(1).replace(".", ",")} cm`;
  renderGuide();
  if (state.mission === "contamination") {
    if (state.distance === 0) toast("No apoyes la ventana sobre la superficie.");
    else if (state.distance > 0.6) toast("Acerca la sonda: esta distancia reduce la respuesta.");
  } else if (state.mission !== "transport" && state.distance < 30) toast("Evita aproximarte antes de conocer el gradiente del campo.");
}
function setSpeed(value) {
  state.speed = Number(value);
  $("speedValue").textContent = `${state.speed} cm/s`;
  renderGuide();
  if (state.speed > 6) toast("Demasiado r\xE1pido: podr\xEDas pasar sobre un punto sin reconocerlo.");
}
function routePanel() {
  if ($("routePanel")) return $("routePanel");
  const panel = document.createElement("section");
  panel.id = "routePanel";
  panel.className = "route-card";
  panel.innerHTML = '<h3></h3><p class="route-help"></p><div class="route-map" role="group"></div><p class="route-status" role="status"></p><div class="route-actions"><button type="button" data-action="mark"></button><button type="button" data-action="withdraw">Detener y retirarse al acceso</button></div>';
  document.querySelector(".instrument-stage").append(panel);
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (!state.powered || $("countBtn").disabled) {
      toast("Enciende el equipo y espera a que termine la medición en curso.");
      return;
    }
    if (button.dataset.point !== undefined) chooseStation(Number(button.dataset.point));
    else if (state.mission === "transport") retainFaceMaximum();
    else finishRoute(button.dataset.action === "withdraw");
  });
  return panel;
}

function transportStage() {
  return state.surfaceDose === null ? "surface" : "metre";
}

function renderRoute() {
  const panel = routePanel();
  const route = state.route;
  const transport = state.mission === "transport";
  panel.hidden = !route || (!transport && !state.scanStarted);
  if (panel.hidden) return;
  const surface = state.mission === "contamination";
  const stage = transportStage();
  const points = transport ? faces : surface ? surfacePoints : fieldPoints;
  const readings = transport ? route[stage] : route.readings;
  const complete = transport ? state.oneMeterDose !== null : state.scanComplete;
  panel.querySelector("h3").textContent = transport ? "Caras del bulto" : surface ? "Croquis de la superficie" : "Croquis del área";
  panel.querySelector(".route-help").textContent = transport
    ? "Elige una cara y pulsa COUNT en el equipo. Repite en las seis caras a la distancia indicada y selecciona el mayor valor. Cada cara representa un sector del bulto simulado."
    : surface ? "Visita los seis sectores del mesón. Compara las lecturas y vuelve al punto que deseas confirmar."
    : "Elige puntos autorizados del escenario. Compara las lecturas con el fondo y marca el punto que deseas confirmar. Puedes detener el recorrido y retirarte al acceso.";
  const map = panel.querySelector(".route-map");
  map.setAttribute("aria-label", transport ? "Cara de medición" : "Punto del recorrido");
  while (map.children.length < points.length) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.point = map.children.length;
    button.append(document.createElement("span"), document.createElement("small"));
    map.append(button);
  }
  Array.from(map.children).forEach((button, i) => {
    button.firstChild.textContent = points[i];
    const reading = readings[i];
    button.lastChild.textContent = reading === undefined ? "Sin medir" : transport ? reading.toLocaleString("es") + " µSv/h" : formatInstrument(reading.cpm) + " " + state.unit;
    button.setAttribute("aria-pressed", String(route.selected === i));
    button.disabled = complete || !state.powered;
  });
  const mark = panel.querySelector('[data-action="mark"]');
  mark.textContent = transport ? "Registrar máximo de esta serie" : "Marcar punto para confirmar";
  mark.disabled = complete || !state.powered || route.selected === null;
  panel.querySelector('[data-action="withdraw"]').disabled = !state.powered;
  panel.querySelector('[data-action="withdraw"]').hidden = transport || surface || complete;
  panel.querySelector(".route-status").textContent = transport
    ? complete ? "Dos máximos registrados." : (stage === "surface" ? "Serie en superficie · 0 cm indicados" : "Serie a 1,0 m de las superficies externas") + " · " + Object.keys(readings).length + "/6 caras"
    : complete ? (route.withdrawn ? "Retirada registrada. Confirmación desde el acceso." : "Punto marcado para confirmar con COUNT.")
    : route.selected === null ? "Selecciona el primer punto." : points[route.selected] + " · " + formatInstrument(readings[route.selected].cpm) + " " + state.unit + " · " + readings[route.selected].distance + " cm";
}

function geometryReady() {
  const surface = state.mission === "contamination";
  if (surface && (state.distance < 0.3 || state.distance > 0.6)) {
    toast("Para este barrido ajusta 0,3–0,6 cm sin contacto.");
    pointTo("distance");
    return false;
  }
  if (!surface && state.distance < 30) {
    toast("Usa la geometría de reconocimiento indicada en el escenario.");
    pointTo("distance");
    return false;
  }
  if (state.speed < 3 || state.speed > 6) {
    toast("Ajusta el ritmo de este ejercicio entre 3 y 6 cm/s.");
    pointTo("scanSpeed");
    return false;
  }
  return true;
}

function sampleStation(point) {
  const scenario = scenarios[state.scenario];
  const peak = state.mission === "contamination" ? contaminationRate(state.scenario, scenario) : scenario.gross;
  const expected = expectedRate(state.mission, state.scenario, scenario.background, peak, point, state.distance);
  const count = randomAround(expected, Math.max(1, Math.sqrt(expected) / 2));
  state.route.readings[point] = { cpm: count, expected, distance: state.distance };
  trackExtrema(state.route, point, count);
  updateDisplay(count);
  emitDetectorClick(count);
}

function chooseStation(point) {
  if (state.mission !== "transport") {
    if (!state.scanStarted || state.scanComplete || !geometryReady()) return;
    sampleStation(point);
  }
  state.route.selected = point;
  renderRoute();
}

function finishRoute(withdraw) {
  const route = state.route;
  const surface = state.mission === "contamination";
  if (!state.scanStarted || state.scanComplete) return;
  const observed = Object.keys(route.readings).length;
  if (!observed || (!withdraw && observed < (surface ? 6 : 2))) {
    toast(surface ? "Recorre los seis sectores antes de marcar." : "Compara dos puntos o detén el recorrido tras la primera lectura.");
    return;
  }
  if (withdraw) {
    route.withdrawn = true;
    route.selected = 0;
    // Simulate the new observation from the predefined access station after retreat.
    state.distance = Math.max(100, state.distance);
    setDistanceAndAdvance(state.distance);
    sampleStation(0);
  }
  const point = route.readings[route.selected];
  if (point.distance !== state.distance) {
    toast("La distancia cambió. Mide otra vez el punto antes de marcarlo.");
    return;
  }
  route.marked = route.selected;
  state.sampleRateCpm = point.expected;
  state.scanComplete = true;
  state.hotspot = true; // A station is available for confirmation, including a background-compatible one.
  $("screenMode").textContent = "PUNTO MARCADO · PULSA COUNT";
  renderRoute();
  renderGuide();
  advanceSoon();
}

function startScanning() {
  if (state.mission === "transport") {
    toast("Elige una cara del bulto y mide con COUNT.");
    return;
  }
  if (!state.powered || state.background === null || $("countBtn").disabled) {
    toast("Enciende el equipo y termina la medición de fondo antes del recorrido.");
    return;
  }
  if (state.scanComplete) {
    toast("El punto ya está marcado. Pulsa COUNT para confirmar o RESET para otro recorrido.");
    return;
  }
  if (!geometryReady()) return;
  state.scanStarted = true;
  renderRoute();
  const first = $("routePanel").querySelector("[data-point]");
  first.focus();
}
function confirmHotspot() {
  if (!state.scanComplete || !state.hotspot) {
    toast("Primero completa el barrido y localiza el incremento.");
    pointTo("scanBtn");
    return;
  }
  const countsMode = state.mission === "contamination";
  const requestedSeconds = Number($("sampleSeconds")?.value);
  const seconds = countsMode && state.mode === "free" && [30, 60, 120].includes(requestedSeconds) ? requestedSeconds : 30;
  const scenario = scenarios[state.scenario];
  const expectedCpm = state.sampleRateCpm ?? (countsMode ? contaminationRate(state.scenario, scenario) : scenario.gross);
  simulateCount($("countBtn"), seconds, () => {
    state.grossObservation = simulateCounts(expectedCpm, seconds);
    state.gross = state.grossObservation.rate;
    state.confirmed = true;
    $("grossResult").textContent = countsMode ? state.gross.toLocaleString("es") : doseFromCpm(state.gross).toFixed(2);
    if (countsMode) $("grossUnit").textContent = `CPM · ${state.grossObservation.counts} cuentas en ${seconds} s simulados`;
    state.submission = null;
    $("decisionFeedback").textContent = "";
    $("saveReport").hidden = true;
    recordSample(state.gross);
    calculateResults();
    updateDisplay(state.gross);
    renderGuide();
    toast(state.mission === "contamination" ? "Conteo estacionario completado" : "Tasa de dosis confirmada");
    advanceSoon();
  }, "Midiendo");
}
function calculateResults() {
  const g = state.gross;
  const statistics = countStatistics(state.backgroundObservation, state.grossObservation);
  state.countStatistics = statistics;
  const { net, decision, detection, sufficient, low, high } = statistics;
  const dose = doseFromCpm(g), netDose = doseFromCpm(net);
  $("netResult").textContent = state.mission === "contamination" ? `${net.toFixed(1)} CPM` : `${netDose.toFixed(2)} \xB5Sv/h`;
  $("doseResult").textContent = state.mission === "contamination" ? "No aplicable" : `${dose.toFixed(2)} \xB5Sv/h`;
  $("projectionResult").textContent = state.mission === "contamination" ? "No aplicable" : `${(dose * Math.max(0, Math.min(24, Number($("hours").value)))).toFixed(1)} \xB5Sv`;
  const sparse = "Repetir con más cuentas";
  $("thresholdResult").textContent = sufficient ? `${decision.toFixed(1)} CPM · α 5 %` : sparse;
  $("detectionResult").textContent = sufficient ? `${detection.toFixed(1)} CPM · β 5 %` : sparse;
  $("coverageResult").textContent = sufficient ? `${low.toFixed(1)} a ${high.toFixed(1)} CPM · diferencia de tasas, 95 % aprox.` : sparse;
  const v = $("verdict");
  if (state.mission === "source") {
    const gradient = observedGradient(state.route, state.background);
    const heading = gradient ? "Variación espacial marcada en el recorrido" : "Objeto sospechoso pendiente de evaluación";
    const location = state.route?.withdrawn ? "desde el acceso tras retirarte" : "en el punto marcado";
    const finding = !sufficient ? "tiene cuentas insuficientes" : statistics.detected ? "supera el umbral de decisión" : "es compatible con el fondo";
    v.className = "verdict " + (gradient || statistics.detected ? "detected" : "neutral");
    v.innerHTML = "<b>" + heading + "</b><span>La confirmación " + location + " " + finding + ". Conserva las lecturas del recorrido, evita manipular el objeto, controla el acceso y comunica al responsable de protección radiológica.</span>";
    return;
  }
  if (!sufficient) {
    v.className = "verdict neutral";
    v.innerHTML = "<b>Conteo insuficiente para esta aproximación</b><span>Repite la medición con mayor tiempo de conteo y revisa el fondo.</span>";
    return;
  }
  if (statistics.detected) {
    v.className = "verdict detected";
    v.innerHTML = state.mission === "presence" ? dose >= 2.5 ? "<b>Supera el nivel de investigaci\xF3n del ejercicio</b><span>Controla el \xE1rea y eval\xFAa tiempo, distancia, blindaje, duraci\xF3n real y dosimetr\xEDa personal. No confundas este nivel operativo con un l\xEDmite legal universal.</span>" : "<b>Radiaci\xF3n detectada sobre el fondo</b><span>La tasa permanece bajo el nivel de investigaci\xF3n del ejercicio. Registra el resultado y conserva los controles radiol\xF3gicos.</span>" : "<b>Efecto neto detectado</b><span>La tasa neta supera el umbral de decisi\xF3n. Delimita el \xE1rea y aplica el procedimiento radiol\xF3gico autorizado.</span>";
  } else {
    v.className = "verdict clear";
    v.innerHTML = "<b>No demostrado sobre el fondo</b><span>El resultado no supera el umbral. Esto no demuestra ausencia absoluta de radiaci\xF3n.</span>";
  }
}
function measurePackageFace(stage) {
  if (!state.powered || state.background === null) {
    toast("Enciende el equipo y mide el fondo antes de evaluar el bulto.");
    return;
  }
  if (state.oneMeterDose !== null || stage !== transportStage()) {
    toast("Esta serie de caras ya está terminada.");
    return;
  }
  const distance = stage === "surface" ? 0 : 100;
  if (state.distance !== distance) {
    toast(stage === "surface" ? "Ajusta la referencia superficial a 0 cm en este croquis." : "Ajusta exactamente 1 m desde la superficie externa.");
    pointTo("distance");
    return;
  }
  const point = state.route.selected;
  if (point === null) {
    toast("Selecciona una de las seis caras.");
    $("routePanel").querySelector("[data-point]").focus();
    return;
  }
  const nominal = stage === "surface" ? scenarios[state.scenario].surfaceDose : scenarios[state.scenario].oneMeterDose;
  simulateCount($("countBtn"), 30, () => {
    if (state.distance !== distance) {
      toast("La distancia cambió durante la medición. Repite esta cara.");
      return;
    }
    const dose = faceReading(stage, nominal, point);
    state.route[stage][point] = dose;
    recordSample(dose / doseFromCpm(1));
    updateDisplay(dose / doseFromCpm(1));
    renderRoute();
    toast(faces[point] + " · " + dose.toLocaleString("es") + " µSv/h");
  }, "Midiendo");
}

function retainFaceMaximum() {
  if (state.oneMeterDose !== null) return;
  const stage = transportStage();
  const route = state.route;
  if (!maximumSelected(route[stage], route.selected)) {
    toast("Mide las seis caras y selecciona la de mayor lectura de esta serie.");
    return;
  }
  const key = stage === "surface" ? "surfaceDose" : "oneMeterDose";
  state[key] = route[stage][route.selected];
  $(key).textContent = state[key].toLocaleString("es") + " µSv/h · " + faces[route.selected];
  route[stage + "Face"] = route.selected;
  route.selected = null;
  renderRoute();
  renderGuide();
  advanceSoon();
}

function measureSurfaceDose() {
  measurePackageFace("surface");
}

function measureOneMeterDose() {
  measurePackageFace("metre");
}
function calculateTI() {
  if (state.oneMeterDose === null) {
    toast("Falta la medici\xF3n a 1 metro.");
    pointTo("countBtn");
    return;
  }
  const raw = state.oneMeterDose / 10;
  const ti = raw <= 0.05 ? 0 : Math.ceil(state.oneMeterDose) / 10;
  state.transportDone = true;
  $("tiResult").textContent = ti.toFixed(ti === 0 ? 0 : 1);
  let category;
  if (state.surfaceDose <= 5 && ti === 0) category = "Categor\xEDa I-BLANCA";
  else if (state.surfaceDose <= 500 && ti <= 1) category = "Categor\xEDa II-AMARILLA";
  else if (state.surfaceDose <= 2e3 && ti <= 10) category = "Categor\xEDa III-AMARILLA";
  else category = "Fuera de los l\xEDmites ordinarios simulados";
  $("tiCategory").textContent = category;
  renderGuide();
  toast("Series completas. Registra tu IT y la categoría.");
  advanceSoon();
}
function renderGuide() {
  document.querySelector(".active-config").hidden = state.mode === "free" && !state.inspected;
  const reportUnit = state.mission === "contamination" ? "CPM" : "µSv/h";
  const summary = $("readingSummary");
  if (summary) {
    const value = $("grossResult").textContent;
    summary.textContent = state.mission === "transport" ? "Superficie: " + $("surfaceDose").textContent + " · A 1 m: " + $("oneMeterDose").textContent
      : "Fondo: " + $("backgroundResult").textContent + " " + reportUnit + " · Confirmación: " + value + " " + reportUnit;
    if (state.confirmed || state.transportDone) summary.textContent += state.submission?.ok ? " · Decisión registrada" : " · Decisión pendiente";
  }
  if (state.confirmed || state.transportDone) showDecision(state);
  const guided = state.mode === "guided", flow = activeSteps();
  $("guideCard").hidden = !guided;
  $("coach").hidden = !guided;
  if (!guided) return;
  const s = flow[state.step];
  $("guideCount").textContent = `PASO ${state.step + 1} DE ${flow.length}`;
  $("guideNumber").textContent = String(state.step + 1).padStart(2, "0");
  $("guideTitle").textContent = s.title;
  $("guideText").textContent = s.text;
  $("guideWhy").textContent = s.why;
  $("guideObserve").textContent = s.observe;
  $("guideAction").textContent = state.step === flow.length - 1 && !state.submission?.ok ? "Registrar decisión y evidencia" : state.step === flow.length - 1 ? "Señalar botón ON/OFF" : `Ir al control · ${s.action}`;
  $("countLabel").textContent = s.target === "countBtn" ? (s.action.includes("60") ? "60 s" : s.action.includes("superficial") ? "SUPERFICIE" : s.action.includes("1 metro") ? "A 1 m" : "30 s") : "MEDIR";
  $("guideBar").style.width = `${(state.step + 1) / flow.length * 100}%`;
  $("guidePrev").disabled = state.step === 0;
  if (state.step === flow.length - 1 && s.done()) state.guideComplete = true;
  $("guideNext").textContent = state.guideComplete ? "Misión completada ✓" : "Siguiente →";
  $("guideNext").disabled = !s.done() || state.step === flow.length - 1;
  $("guideCard").classList.toggle("complete", state.guideComplete);
  $("coachStep").textContent = `SIGUIENTE \xB7 PASO ${state.step + 1} DE ${flow.length}`;
  $("coachTitle").textContent = s.title;
  $("coachHint").textContent = `Te llevar\xE9 al control exacto: ${s.action.toLowerCase()}`;
  clearTargets();
}
function goStep(delta) {
  const flow = activeSteps(), next = Math.max(0, Math.min(flow.length - 1, state.step + delta));
  if (delta > 0 && !flow[state.step].done()) {
    toast("Completa la acci\xF3n indicada antes de avanzar.");
    pointTo(flow[state.step].target);
    return;
  }
  state.step = next;
  renderGuide();
  pointTo(activeSteps()[state.step].target);
}
function advanceSoon() {
  const flow = activeSteps(), completedStep = state.step;
  if (state.mode !== "guided" || state.advancing || !flow[completedStep].done() || completedStep === flow.length - 1) return;
  state.advancing = true;
  $("guideNext").disabled = true;
  $("guideNext").textContent = "Paso completado \u2713";
  state.advanceTimer = setTimeout(() => {
    state.advancing = false;
    if (state.step === completedStep && activeSteps()[completedStep].done()) {
      state.step = completedStep + 1;
      renderGuide();
      pointTo(activeSteps()[state.step].target);
    }
  }, 700);
}
function clearTargets() {
  document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
}
function pointTo(id) {
  clearTargets();
  let el = $(id);
  if (!el) return;
  el.classList.add("coach-target");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el.focus) el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove("coach-target"), 4500);
}
function setMode(mode) {
  state.mode = mode;
  $("timeOptions").hidden = state.mission !== "contamination" || mode !== "free";
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("simulationView").hidden = mode === "concepts";
  $("conceptsView").hidden = mode !== "concepts";
  renderGuide();
  if (mode !== "concepts") window.scrollTo({ top: 70, behavior: "smooth" });
}
function setMission(mission) {
  clearTimeout(state.advanceTimer);
  clearInterval(state.timer);
  Object.assign(state, { mission, step: 0, advancing: false, inspected: false, powered: false, audio: false, guideComplete: false, unitConfirmed: false, unit: mission === "contamination" ? "CPM" : "\xB5Sv/h", distance: mission === "contamination" ? 1.5 : 50, speed: 10, lastReading: null, maxReading: 0 });
  document.querySelectorAll(".mission").forEach((b) => b.classList.toggle("active", b.dataset.mission === mission));
  $("transportPanel").hidden = mission !== "transport";
  const contamination = mission === "contamination";
  const configs = {
    presence: ["Detector GM compensado para gamma", "Ḣ*(10) · µSv/h", "Reconocimiento del campo y tasa de equivalente de dosis ambiental. No sustituye el dosímetro personal."],
    source: ["Detector GM compensado para gamma", "Ḣ*(10) · µSv/h", "Búsqueda por gradiente desde una distancia segura. No identifica radionucleidos."],
    contamination: ["Sonda GM pancake de ventana delgada", "Tasa de conteo · CPM/CPS", "Barrido y confirmación de contaminación. CPM no se convierte universalmente en dosis ni Bq/cm²."],
    transport: ["Detector de tasa de dosis calibrado", "Ḣ*(10) · µSv/h", "Máximo superficial y máximo a 1 m para verificar el índice de transporte."]
  };
  [$("activeProbe").textContent, $("activeQuantity").textContent, $("activeUse").textContent] = configs[mission];
  $("meterLabel").textContent = contamination ? "MONITOR DE CONTAMINACIÓN · SONDA PANCAKE" : "MEDIDOR DE TASA DE DOSIS · RESPUESTA CALIBRADA";
  document.querySelector(".instrument-stage").classList.toggle("dose-probe", !contamination);
  $("probeTypeLabel").textContent = contamination ? "α · β · γ" : "H*(10) · γ";
  $("probeSerial").textContent = contamination ? "GM‑P45" : "GM‑D10";
  $("techniqueTitle").textContent = contamination ? "Técnica de barrido superficial" : "Técnica de reconocimiento radiológico";
  $("techniqueList").innerHTML = contamination
    ? "<li><b>Distancia:</b> 0,3–0,6 cm, sin tocar.</li><li><b>Velocidad:</b> 3–6 cm/s en este ejercicio.</li><li><b>Trayectoria:</b> pasadas paralelas ligeramente solapadas.</li><li><b>Resultado:</b> CPM bruto y neto; Bq/cm² exige calibración adicional.</li>"
    : "<li><b>Inicio:</b> desde una distancia prudente y con ruta de retirada.</li><li><b>Lectura:</b> Ḣ*(10) en µSv/h con detector apropiado.</li><li><b>Tendencia:</b> observa el gradiente y retrocede ante aumentos rápidos.</li><li><b>Control:</b> tiempo, distancia, blindaje y comunicación.</li>";
  $("doseRow").hidden = contamination || mission === "transport";
  $("criterionRow").hidden = contamination || mission === "transport";
  $("projectionRow").hidden = contamination || mission === "transport";
  $("doseNote").hidden = mission === "transport";
  $("backgroundLabel").textContent = contamination ? "Conteo de fondo" : "Tasa de dosis de fondo";
  $("grossLabel").textContent = contamination ? "Conteo bruto confirmado" : "Tasa de dosis confirmada";
  $("backgroundUnit").textContent = contamination ? "CPM" : "\xB5Sv/h";
  $("grossUnit").textContent = contamination ? "CPM" : "\xB5Sv/h";
  $("netLabel").firstChild.textContent = contamination ? "Tasa neta " : "Incremento sobre el fondo ";
  $("thresholdRow").hidden = !contamination;
  $("detectionRow").hidden = !contamination;
  $("coverageRow").hidden = !contamination;
  $("distance").max = contamination ? 5 : 200;
  $("distance").step = contamination ? 0.5 : 10;
  if (contamination) {
    $("distance").value = 1.5;
    setDistance(1.5);
  } else {
    $("distance").value = mission === "transport" ? 0 : 50;
    setDistance(Number($("distance").value));
  }
  $("scanSpeed").value = 10;
  setSpeed(10);
  configureMissionScenarios(mission);
  resetScenario(state.scenario);
  renderGuide();
  toast({ contamination: "Misi\xF3n t\xE9cnica: contaminaci\xF3n en CPM", presence: "Misi\xF3n principal: tasa de dosis en \xB5Sv/h", source: "Misi\xF3n: b\xFAsqueda de fuente en \xB5Sv/h", transport: "Misi\xF3n: \xEDndice de transporte" }[mission]);
}
function resetScenario(value) {
  clearTimeout(state.advanceTimer);
  cancelMeasurement();
  Object.assign(state, { step: 0, powered: false, advancing: false, audio: false, sampleRateCpm: null, countStatistics: null, samples: [], audioReviewed: false, scenario: value, background: null, gross: null, scanStarted: false, scanComplete: false, hotspot: false, confirmed: false, surfaceDose: null, oneMeterDose: null, transportDone: false, guideComplete: false, unitConfirmed: false, lastReading: null, maxReading: 0 });
  state.backgroundObservation = state.grossObservation = null;
  state.hold = false;
  $("hours").value = 8;
  $("sampleSeconds").value = 30;
  $("backgroundUnit").textContent = $("grossUnit").textContent = state.mission === "contamination" ? "CPM" : "µSv/h";
  prepareAssessment(state);
  $("backgroundResult").textContent = "\u2014";
  $("grossResult").textContent = "\u2014";
  $("netResult").textContent = state.mission === "contamination" ? "\u2014 CPM" : "\u2014 \xB5Sv/h";
  $("doseResult").textContent = "\u2014 \xB5Sv/h";
  $("projectionResult").textContent = "\u2014 \xB5Sv";
  $("thresholdResult").textContent = "\u2014 CPM";
  $("detectionResult").textContent = "\u2014 CPM";
  $("coverageResult").textContent = "\u2014";
  $("surfaceDose").textContent = "\u2014 \xB5Sv/h";
  $("oneMeterDose").textContent = "\u2014 \xB5Sv/h";
  $("tiResult").textContent = "\u2014";
  $("tiCategory").textContent = "Pendiente de medici\xF3n";
  $("scanBtn").querySelector("small").textContent = state.mission === "contamination" ? "BARRER" : "RECONOCER";
  $("scanBtn").disabled = false;
  $("verdict").className = "verdict neutral";
  $("verdict").innerHTML = "<b>A\xFAn sin resultado</b><span>Completa el fondo, el recorrido y la confirmaci\xF3n.</span>";
  state.route = newRoute();
  renderRoute();
  updateDisplay();
}
function validateGuideContracts() {
  const flows = { presence: presenceSteps, source: sourceSteps, contamination: contaminationSteps, transport: transportSteps };
  const errors = [];
  Object.entries(flows).forEach(([mission, flow]) => {
    if (flow.length !== 10) errors.push(`${mission}: debe contener exactamente 10 pasos`);
    flow.forEach((step, index) => {
      if (!step.title || !step.text || !step.why || !step.observe) errors.push(`${mission} paso ${index + 1}: falta contenido didáctico`);
      if (!step.target || !$(step.target)) errors.push(`${mission} paso ${index + 1}: control ${step.target || "sin definir"} no existe`);
      if (typeof step.done !== "function" || typeof step.run !== "function") errors.push(`${mission} paso ${index + 1}: contrato de interacción incompleto`);
    });
    const finalStep = flow[flow.length - 1];
    if (finalStep.target !== "powerBtn") errors.push(`${mission}: el cierre debe realizarse desde ON/OFF`);
  });
  if (errors.length) {
    console.error("Errores de la guía:", errors);
    $("guideCard").classList.add("guide-error");
    $("guideTitle").textContent = "La guía necesita revisión";
    $("guideText").textContent = "Se detectó una inconsistencia interna. No continúes la práctica.";
    $("guideWhy").textContent = errors.join(" · ");
    $("guideObserve").textContent = "Comunica el error antes de utilizar resultados.";
    $("guideAction").disabled = true;
    $("guideNext").disabled = true;
    return false;
  }
  return true;
}
validateGuideContracts();
$("loginForm").addEventListener("submit", login);
$("togglePassword").addEventListener("click", () => {
  const i = $("memberPassword"), show = i.type === "password";
  i.type = show ? "text" : "password";
  $("togglePassword").textContent = show ? "Ocultar" : "Mostrar";
});
$("logoutBtn").addEventListener("click", () => logout());
$("silentBtn").addEventListener("click", () => toggleAudio(false));
$("lightBtn").addEventListener("click", toggleLight);
$("unitsBtn").addEventListener("click", cycleUnits);
$("rangeBtn").addEventListener("click", cycleRange);
$("avgBtn").addEventListener("click", () => toast("AVG promedia hasta las diez últimas lecturas adquiridas."));
$("holdBtn").addEventListener("click", toggleHold);
$("resetBtn").addEventListener("click", () => {
  resetScenario(state.scenario);
  state.maxReading = 0;
  state.lastReading = null;
  updateDisplay();
  renderGuide();
  toast("Lecturas reiniciadas");
});
$("upBtn").addEventListener("click", () => toast("Navegaci\xF3n superior"));
$("downBtn").addEventListener("click", () => toast("Navegaci\xF3n inferior"));
$("menuBtn").addEventListener("click", () => toast("Configuraci\xF3n: unidades, rango, promedio y alarmas"));
document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.querySelectorAll(".mission").forEach((b) => b.addEventListener("click", () => setMission(b.dataset.mission)));
$("probeTarget").addEventListener("click", (e) => {
  if (e.target.id !== "distance") inspectProbe();
});
$("probeTarget").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    inspectProbe();
  }
});
$("powerBtn").addEventListener("click", () => togglePower());
$("audioBtn").addEventListener("click", () => toggleAudio());
$("distance").addEventListener("input", (e) => {
  setDistance(e.target.value);
  if (state.mode === "guided" && activeSteps()[state.step]?.target === "distance" && activeSteps()[state.step].done()) advanceSoon();
});
$("scanSpeed").addEventListener("input", (e) => {
  setSpeed(e.target.value);
  if (state.mode === "guided" && activeSteps()[state.step]?.target === "scanSpeed" && activeSteps()[state.step].done()) advanceSoon();
});
$("scanBtn").addEventListener("click", startScanning);
$("countBtn").addEventListener("click", () => {
  const step = state.mode === "guided" ? activeSteps()[state.step] : null;
  if (step?.target === "countBtn") { step.run(); return; }
  if (state.mission === "transport") {
    if (state.background === null) measureBackground();
    else if (state.surfaceDose === null) measureSurfaceDose();
    else if (state.oneMeterDose === null) measureOneMeterDose();
    else toast("Las tres mediciones ya están registradas. Pulsa CALC.");
    return;
  }
  if (state.background === null) measureBackground();
  else if (state.scanComplete) confirmHotspot();
  else toast("Pulsa SCAN antes del conteo confirmatorio.");
});
$("calcBtn").addEventListener("click", calculateTI);
$("scenario").addEventListener("change", (e) => {
  clearTimeout(state.advanceTimer);
  state.step = 0;
  state.advancing = false;
  state.inspected = false;
  state.unitConfirmed = false;
  state.guideComplete = false;
  resetScenario(e.target.value);
  renderGuide();
  toast(`Escenario cargado: ${scenarios[e.target.value].label}. La guía volvió al paso 1 para asegurar una medición completa.`);
});
$("guideAction").addEventListener("click", () => pointTo(state.step === activeSteps().length - 1 && !state.submission?.ok ? "decisionPanel" : activeSteps()[state.step].target));
$("guidePrev").addEventListener("click", () => goStep(-1));
$("guideNext").addEventListener("click", () => goStep(1));
$("coachShow").addEventListener("click", () => pointTo(activeSteps()[state.step].target));
$("modeBtn").addEventListener("click", () => toast("CPM localiza incrementos; \xB5Sv/h exige una calibraci\xF3n adecuada."));

installAssessment(state, acceptProbe, () => { renderGuide(); advanceSoon(); }, toast);
$("hours").addEventListener("input", () => { if (state.confirmed) calculateResults(); });

const saved = JSON.parse(sessionStorage.getItem(SESSION) || "null");
if (saved?.expiresAt > Date.now()) openApp(saved, false);
else {
  sessionStorage.removeItem(SESSION);
  const msg = sessionStorage.getItem("movida-session-message");
  if (msg) {
    setLogin(msg);
    sessionStorage.removeItem("movida-session-message");
  }
}
