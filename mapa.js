// Mapa en planta de la ubicación: calles de OpenStreetMap, El Pozo, los lugares principales
// de San Francisco de Macorís y la ruta en carro a cada uno, hoy o con la Circunvalación
// terminada (estimado, ver scripts/lugares_mapa.py). SVG propio: sin teselas externas.
(function () {
  const caja = document.getElementById("mapa");
  if (!caja) return;
  const D = window.EL_POZO;
  const NS = "http://www.w3.org/2000/svg";
  const CAT = {
    salida: {nombre: "Carreteras", color: "#e4573d"},
    super: {nombre: "Supermercados", color: "#2f7de1"},
    plaza: {nombre: "Tiendas y plazas", color: "#8a5cd6"},
    centro: {nombre: "Lugares emblemáticos", color: "#12301f"},
    servicio: {nombre: "Salud y deporte", color: "#1f9e8a"},
    banco: {nombre: "Bancos", color: "#b07d12"},
    educacion: {nombre: "Educación", color: "#d0487c"},
    gasolinera: {nombre: "Gasolineras", color: "#6b7a72"},
  };
  const el = (tag, attrs, padre) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (padre) padre.appendChild(e); return e; };
  const pts = (lista) => lista.map(([x, n]) => `${x.toFixed(1)},${(-n).toFixed(1)}`).join(" ");

  fetch("lugares.json").then((r) => r.json()).then((L) => {
    const svg = el("svg", {class: "mapa-svg", role: "img", "aria-label": "Mapa de El Pozo y los lugares principales de San Francisco de Macorís"});
    caja.querySelector(".lienzo-mapa").appendChild(svg);
    const g = el("g", {}, svg);
    // calles
    for (const c of ["res", "sec", "prin"]) {
      const capa = el("g", {class: "via " + c}, g);
      D.vias.filter((v) => v.c === c && v.p.length > 1).forEach((v) => el("polyline", {points: pts(v.p)}, capa));
    }
    el("polyline", {points: pts(L.circunvalacion), class: "circ"}, g);
    const mc = L.circunvalacion[Math.floor(L.circunvalacion.length * 0.3)];
    const tc = el("text", {x: mc[0], y: -mc[1], class: "rotulo-circ"}, g);
    tc.textContent = "Circunvalación (en obra)";
    // El Pozo
    el("polygon", {points: pts(D.plano.terreno), class: "pozo"}, g);
    const rutaHoy = el("polyline", {class: "ruta hoy", points: ""}, g);
    const rutaCirc = el("polyline", {class: "ruta futuro", points: ""}, g);
    const marcas = el("g", {}, g);
    const [ex, en] = L.entrada;
    el("circle", {cx: ex, cy: -en, class: "marca-pozo"}, marcas);
    const tPozo = el("text", {x: ex, y: -en, class: "rotulo-pozo"}, marcas);
    tPozo.textContent = "El Pozo";

    let escenario = "hoy", activo = null, filtro = new Set(Object.keys(CAT));
    const lista = caja.querySelector(".lugares");
    const ficha = caja.querySelector(".ficha-mapa");
    const botones = [];
    L.lugares.forEach((p, i) => {
      const m = el("g", {class: "punto", tabindex: 0, role: "button", "aria-label": p.nombre}, marcas);
      el("circle", {cx: p.xy[0], cy: -p.xy[1], fill: CAT[p.cat].color}, m);
      const t = el("text", {x: p.xy[0], y: -p.xy[1], class: "num"}, m);
      t.textContent = i + 1;
      m.addEventListener("click", () => elegir(i));
      m.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(i); } });
      p.marca = m;
      const li = document.createElement("li");
      li.innerHTML = `<button type="button"><span class="n" style="background:${CAT[p.cat].color}">${i + 1}</span><span class="nom">${p.nombre}</span><span class="t"></span></button>`;
      li.querySelector("button").addEventListener("click", () => elegir(i));
      li.dataset.cat = p.cat;
      lista.appendChild(li);
      p.li = li;
      botones.push(li);
    });
    // filtros por categoría
    const filtros = caja.querySelector(".filtros");
    Object.entries(CAT).forEach(([k, c]) => {
      if (!L.lugares.some((p) => p.cat === k)) return;
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-pressed", "true");
      b.innerHTML = `<i style="background:${c.color}"></i>${c.nombre}`;
      b.addEventListener("click", () => {
        if (filtro.has(k)) filtro.delete(k); else filtro.add(k);
        b.setAttribute("aria-pressed", String(filtro.has(k)));
        pintar();
      });
      filtros.appendChild(b);
    });
    // hoy / con Circunvalación
    caja.querySelectorAll("[data-escenario]").forEach((b) => b.addEventListener("click", () => {
      escenario = b.dataset.escenario;
      caja.querySelectorAll("[data-escenario]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      caja.dataset.escenario = escenario;
      pintar();
    }));

    const dato = (p) => (escenario === "circ" && p.circ ? p.circ : p.hoy);
    function pintar() {
      L.lugares.forEach((p) => {
        const ver = filtro.has(p.cat);
        p.marca.style.display = ver ? "" : "none";
        p.li.hidden = !ver;
        const d = dato(p);
        const mejora = escenario === "circ" && p.circ;
        p.li.querySelector(".t").innerHTML = `${d.min} min <small>${d.km.toFixed(1)} km</small>` + (mejora ? ` <em>−${p.hoy.min - p.circ.min}</em>` : "");
      });
      if (activo !== null) elegir(activo, true);
      caja.dataset.visibles = L.lugares.filter((p) => filtro.has(p.cat)).length;
    }
    function elegir(i, solo) {
      activo = i;
      const p = L.lugares[i];
      rutaHoy.setAttribute("points", pts(p.hoy.ruta));
      rutaCirc.setAttribute("points", escenario === "circ" && p.circ ? pts(p.circ.ruta) : "");
      rutaHoy.classList.toggle("tenue", escenario === "circ" && !!p.circ);
      botones.forEach((li, k) => li.classList.toggle("activo", k === i));
      L.lugares.forEach((q, k) => q.marca.classList.toggle("activo", k === i));
      const d = dato(p);
      ficha.innerHTML = `<b>${p.nombre}</b><span>${d.min} min en carro · ${d.km.toFixed(1)} km</span>` +
        (p.circ ? `<span class="comp">Hoy ${p.hoy.min} min · con la Circunvalación ${p.circ.min} min (estimado)</span>` : "");
      caja.dataset.elegido = p.nombre;
      if (!solo) encuadrar([...p.hoy.ruta, ...(p.circ && escenario === "circ" ? p.circ.ruta : [])]);
    }

    // encuadre, arrastre y zoom con viewBox
    let vb = null;
    const poner = () => svg.setAttribute("viewBox", vb.map((v) => v.toFixed(1)).join(" "));
    function encuadrar(lista, margen = 0.12) {
      const xs = lista.map((q) => q[0]), ys = lista.map((q) => -q[1]);
      let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const r = svg.clientWidth / Math.max(1, svg.clientHeight);
      let w = (x1 - x0) * (1 + margen * 2), h = (y1 - y0) * (1 + margen * 2);
      if (w / h < r) w = h * r; else h = w / r;
      w = Math.max(w, 1200); h = Math.max(h, 1200 / r);
      vb = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
      poner();
      const esc = w / svg.clientWidth;
      svg.style.setProperty("--k", esc.toFixed(2));
    }
    let arr = null;
    svg.addEventListener("pointerdown", (e) => { if (e.target.closest(".punto")) return; arr = {x: e.clientX, y: e.clientY, vb: [...vb]}; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", (e) => {
      if (!arr) return;
      const k = vb[2] / svg.clientWidth;
      vb[0] = arr.vb[0] - (e.clientX - arr.x) * k;
      vb[1] = arr.vb[1] - (e.clientY - arr.y) * k;
      poner();
    });
    svg.addEventListener("pointerup", () => (arr = null));
    const zoom = (f) => { const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2; vb[2] *= f; vb[3] *= f; vb[0] = cx - vb[2] / 2; vb[1] = cy - vb[3] / 2; poner(); svg.style.setProperty("--k", (vb[2] / svg.clientWidth).toFixed(2)); };
    caja.querySelector("[data-zoom='mas']").addEventListener("click", () => zoom(0.7));
    caja.querySelector("[data-zoom='menos']").addEventListener("click", () => zoom(1.4));
    caja.querySelector("[data-zoom='todo']").addEventListener("click", () => encuadrar([L.entrada, ...L.lugares.map((p) => p.xy)]));
    encuadrar([L.entrada, ...L.lugares.map((p) => p.xy)]);
    new ResizeObserver(() => vb && encuadrar([L.entrada, ...L.lugares.map((p) => p.xy)])).observe(svg);
    pintar();
    elegir(L.lugares.findIndex((p) => p.nombre === "Carretera a Santo Domingo"), true);
    caja.dataset.total = L.lugares.length;
    caja.dataset.state = "listo";
  }).catch(() => { caja.dataset.state = "error"; });
})();
