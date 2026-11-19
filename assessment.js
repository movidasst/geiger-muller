const byId = id => document.getElementById(id);
const decisions = {
  presence: ["Compatible con el fondo del ejercicio", "Incremento inferior al nivel de investigación", "Alcanza o supera el nivel de investigación"],
  source: ["Aproximarse al objeto para identificarlo", "Retirarse, controlar el acceso y comunicar el hallazgo"],
  contamination: ["La señal neta no supera el umbral", "La señal neta supera el umbral", "Cuentas insuficientes: repetir o prolongar"],
  transport: ["Categoría I-BLANCA", "Categoría II-AMARILLA", "Categoría III-AMARILLA", "Fuera del alcance ordinario"]
};

export function equipmentCard(state, faulty) {
  state.instrumentFault = faulty;
  byId("inspectDetails").textContent = faulty
    ? "Ficha B · calibración vigente · cable con aislamiento abierto · prueba de respuesta pendiente."
    : "Ficha A · calibración vigente · cable y ventana íntegros · respuesta de control dentro de la banda de referencia.";
}

export function prepareAssessment(state) {
  state.submission = null;
  state.inspected = false;
  byId("inspection").hidden = true;
  byId("decisionForm").reset();
  byId("inspectionForm").reset();
  byId("decisionPanel").hidden = true;
  byId("decisionFeedback").textContent = "";
  byId("saveReport").hidden = true;
  byId("decision").replaceChildren(new Option("Selecciona una conclusión", ""), ...decisions[state.mission].map((text, index) => new Option(text, String(index))));
  byId("timeOptions").hidden = state.mission !== "contamination" || state.mode !== "free";
  byId("extraTime").hidden = !["presence", "source"].includes(state.mission);
  byId("readingPrompt").firstChild.textContent = state.mission === "transport" ? "Máximo medido a 1 m (µSv/h)" : state.mission === "contamination" ? "Tasa bruta confirmada (CPM)" : "Tasa confirmada (µSv/h)";
  byId("decisionIT").hidden = state.mission !== "transport";
  byId("learnerIT").required = state.mission === "transport";
  byId("verdict").hidden = true;
  byId("tiCategory").hidden = true;
  byId("tiResult").hidden = true;
  equipmentCard(state, Math.random() < 0.5);
}

export function showDecision(state) {
  byId("decisionPanel").hidden = false;
  byId("verdict").hidden = state.mission === "transport" || !state.submission;
  byId("tiCategory").hidden = !state.submission;
  byId("tiResult").hidden = !state.submission;
}

export function installAssessment(state, onInspect, onDecision, toast) {
  byId("inspectionForm").addEventListener("submit", event => {
    event.preventDefault();
    const correctProbe = state.mission === "contamination" ? "surface" : "field";
    if (byId("probeChoice").value !== correctProbe) {
      toast("Revisa la magnitud solicitada y la respuesta del detector seleccionado.");
      return;
    }
    const reject = byId("fitness").value === "reject";
    if (state.instrumentFault !== reject) {
      toast("Revisa la integridad del cable y la respuesta de control antes de decidir.");
      return;
    }
    if (reject) {
      equipmentCard(state, false);
      byId("fitness").value = "";
      toast("Equipo retirado. Inspecciona la ficha del equipo de reemplazo.");
      return;
    }
    byId("inspection").hidden = true;
    onInspect();
  });
  byId("decisionForm").addEventListener("submit", event => {
    event.preventDefault();
    const transport = state.mission === "transport";
    if (transport ? !state.transportDone : !state.confirmed) return;
    const detected = byId("verdict").classList.contains("detected");
    const category = byId("tiCategory").textContent;
    const expected = transport ? decisions.transport.indexOf(category)
      : state.mission === "source" ? 1
      : state.mission === "contamination" && !state.countStatistics.sufficient ? 2
      : state.mission === "presence" && detected ? (Number.parseFloat(byId("doseResult").textContent) >= 2.5 ? 2 : 1)
      : Number(detected);
    const choice = Number(byId("decision").value);
    const observed = Number(byId("evidenceReading").value);
    const reference = transport ? state.oneMeterDose : state.mission === "contamination" ? state.gross : Number(byId("grossResult").textContent);
    const tiCorrect = !transport || Math.abs(Number(byId("learnerIT").value) - Number(byId("tiResult").textContent)) < 0.001;
    const ok = choice === expected && Math.abs(observed - reference) < 0.011 && tiCorrect;
    const feedback = ok ? "La conclusión y los valores concuerdan con las mediciones." : "Revisa tu conclusión y los valores registrados con la interpretación del ejercicio.";
    state.submission = {
      conclusion: decisions[state.mission][choice], observed,
      ti: transport ? byId("learnerIT").value : null,
      recipient: byId("recipient").value.trim(), message: byId("message").value.trim(), feedback, ok
    };
    byId("decisionFeedback").textContent = feedback;
    byId("saveReport").hidden = false;
    showDecision(state);
    onDecision();
  });
  byId("saveReport").addEventListener("click", () => {
    if (!state.submission) return;
    const s = state.submission;
    const lines = [
      "La Movida de SST+ · Registro de simulación OSR", new Date().toLocaleString("es-VE"),
      byId("scenario").selectedOptions[0].text, byId("activeProbe").textContent,
      "Fondo: " + byId("backgroundResult").textContent + " " + byId("backgroundUnit").textContent,
      "Inspección aceptada: " + byId("inspectDetails").textContent,
      ...(state.route.marked !== null ? ["Punto marcado: " + (state.route.marked + 1), "Distancia registrada: " + state.route.readings[state.route.marked].distance + " cm"] : []),
      ...(state.backgroundObservation ? ["Fondo: " + state.backgroundObservation.counts + " cuentas en " + state.backgroundObservation.seconds + " s"] : []),
      ...(state.grossObservation ? ["Confirmación: " + state.grossObservation.counts + " cuentas en " + state.grossObservation.seconds + " s"] : []),
      "Lectura confirmada: " + s.observed + (state.mission === "contamination" ? " CPM" : " µSv/h"),
      ...(s.ti !== null ? ["Máximo superficial: " + byId("surfaceDose").textContent, "IT declarado: " + s.ti] : []),
      s.conclusion, "Destinatario: " + s.recipient, "Comunicación: " + s.message, s.feedback
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "registro-practica-osr.txt" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}
