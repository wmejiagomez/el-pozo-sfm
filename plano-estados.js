// Plano de la propuesta 2 con zoom/arrastre y estados por solar (disponible, reservado, vendido).
// Los estados son DE MUESTRA (asignación fija por posición): no son datos comerciales.
// SVG propio, sin librerías. Contrato DOM: data-verify-unit="plano-estados".
(function () {
  const caja = document.getElementById("plano-estados");
  if (!caja) return;
  const NS = "http://www.w3.org/2000/svg";
  const ETQ = {disponible: "Disponible", reservado: "Reservado", vendido: "Vendido"};
  const ZONA = {comercial: "Plaza comercial", comercio: "Comercio", residencial: "Residencial", villa: "Villa", verde: "Área verde", reserva: "Reserva natural"};
  const VENDIBLES = new Set(["comercial", "comercio", "residencial", "villa"]);
  const el = (tag, attrs, padre) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (padre) padre.appendChild(e); return e; };
  const pts = (l) => l.map(([x, n]) => `${x.toFixed(1)},${(-n).toFixed(1)}`).join(" ");
  const fmt = (n) => Math.round(n).toLocaleString("es-DO");

  const json = (u) => fetch(u).then((r) => r.json());
  Promise.all([json("plano_dxf.json"), json("propuesta2/viales.json")]).then(([P, V]) => {
    const lienzo = caja.querySelector(".lienzo-estados");
    const svg = el("svg", {class: "estados-svg", role: "img", "aria-label": "Plano de solares de El Pozo con su estado"}, lienzo);
    const g = el("g", {}, svg);
    // ortofoto del dron de fondo (WebP con transparencia fuera del vuelo); extensión como en vista3d.js
    el("image", {href: "assets/orto_fondo.webp", x: -245.03, y: -408.94, width: 406.43, height: 893.75, preserveAspectRatio: "none"}, g);
    el("polygon", {points: pts(P.terreno), class: "terreno"}, g);
    // viales aparte: carretera existente, marginal y calles del proyecto
    const ruta = (anillos) => anillos.map((poly) => poly.map((r) => "M" + r.map(([x, n]) => `${x},${-n}`).join("L") + "Z").join("")).join("");
    for (const k of ["calles", "marginal", "carretera"]) el("path", {d: ruta(V[k]), class: "vial " + k, "fill-rule": "evenodd"}, g);
    const leyenda = caja.querySelector(".leyenda-viales");
    const NOM = {carretera_existente: ["carretera", "Carretera existente"], marginal: ["marginal", "Marginal frente a los solares de comercio"], calles_proyecto: ["calles", "Calles del proyecto"]};
    leyenda.innerHTML = Object.entries(NOM).map(([c, [cl, nombre]]) => `<li><i class="vial-pt ${cl}"></i>${nombre}: ${fmt(V.resumen[c].m2)} m² (${V.resumen[c].pct.toLocaleString("es-DO")} %)</li>`).join("");
    caja.dataset.viales = Object.keys(V.resumen).join(",");

    let k = 0;
    const solares = P.poligonos.map((s) => {
      const vendible = VENDIBLES.has(s.zona);
      // muestra: 2 de cada 7 vendidos, 1 reservado, el resto disponible
      const estado = !vendible ? null : s.zona === "comercial" ? "disponible" : (k % 7 < 2 ? "vendido" : k % 7 === 2 ? "reservado" : "disponible");
      if (vendible) k++;
      const poly = el("polygon", {points: pts(s.p), class: "solar " + (estado || "nodisp"), tabindex: vendible ? 0 : -1, role: vendible ? "button" : "presentation", "aria-label": `${ZONA[s.zona]} ${s.id}`}, g);
      const o = {...s, estado, poly};
      if (vendible) {
        poly.addEventListener("click", () => elegir(o));
        poly.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(o); } });
      }
      return o;
    });

    // --- filtro, contadores y ficha
    let filtro = "todos", elegido = null, arrastrado = false;
    const ficha = caja.querySelector(".ficha-estado");
    const botones = caja.querySelectorAll("[data-filtro]");
    function contar() {
      const c = {disponible: 0, reservado: 0, vendido: 0};
      solares.forEach((s) => { if (s.estado) c[s.estado]++; });
      caja.dataset.total = c.disponible + c.reservado + c.vendido;
      caja.dataset.disponibles = c.disponible;
      caja.dataset.reservados = c.reservado;
      caja.dataset.vendidos = c.vendido;
      botones.forEach((b) => { const n = b.querySelector(".n"); if (n && c[b.dataset.filtro] != null) n.textContent = c[b.dataset.filtro]; });
    }
    function pintar() {
      caja.dataset.filtro = filtro;
      caja.dataset.elegido = elegido ? elegido.id : "";
      botones.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro)));
      solares.forEach((s) => {
        s.poly.classList.toggle("tenue", !!s.estado && filtro !== "todos" && s.estado !== filtro);
        s.poly.classList.toggle("sel", s === elegido);
      });
    }
    function elegir(s) {
      if (arrastrado || (filtro !== "todos" && s.estado !== filtro)) return; // arrastre o solar atenuado por el filtro
      elegido = s;
      ficha.innerHTML = `<b>${ZONA[s.zona]} ${s.id}</b><span>${fmt(s.m2)} m² · <i class="pt ${s.estado}"></i>${ETQ[s.estado]}</span><em>Estado de ejemplo, no refleja disponibilidad real</em>`;
      pintar();
    }
    botones.forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.filtro; pintar(); }));
    contar(); pintar();

    // --- zoom y arrastre sobre el viewBox
    const xs = P.terreno.map((p) => p[0]), ys = P.terreno.map((p) => -p[1]);
    const m = 20;
    const base = {x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m};
    let v = {...base};
    const nivel = caja.querySelector(".nivel");
    function aplicar() {
      svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
      const z = base.w / v.w;
      caja.dataset.zoom = z.toFixed(2);
      if (nivel) nivel.textContent = Math.round(z * 100) + "%";
    }
    function zoom(f, cx, cy) {
      const nw = Math.min(base.w, Math.max(base.w / 12, v.w / f));
      const r = nw / v.w;
      v = {x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r, w: nw, h: v.h * r};
      acotar(); aplicar();
    }
    function acotar() {
      v.x = Math.min(Math.max(v.x, base.x - v.w * 0.25), base.x + base.w - v.w * 0.75);
      v.y = Math.min(Math.max(v.y, base.y - v.h * 0.25), base.y + base.h - v.h * 0.75);
    }
    const aPlano = (e) => { const r = svg.getBoundingClientRect(); return [v.x + ((e.clientX - r.left) / r.width) * v.w, v.y + ((e.clientY - r.top) / r.height) * v.h]; };
    const centro = () => [v.x + v.w / 2, v.y + v.h / 2];
    svg.addEventListener("wheel", (e) => { e.preventDefault(); const [cx, cy] = aPlano(e); zoom(e.deltaY < 0 ? 1.25 : 0.8, cx, cy); }, {passive: false});
    svg.addEventListener("dblclick", (e) => { const [cx, cy] = aPlano(e); zoom(2, cx, cy); });
    const punt = new Map();
    let dist0 = 0;
    svg.addEventListener("pointerdown", (e) => { punt.set(e.pointerId, e); arrastrado = false; if (punt.size === 2) { const [a, b] = [...punt.values()]; dist0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
    svg.addEventListener("pointermove", (e) => {
      if (!punt.has(e.pointerId)) return;
      const prev = punt.get(e.pointerId);
      punt.set(e.pointerId, e);
      const r = svg.getBoundingClientRect();
      if (punt.size === 1) {
        const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 0 && !arrastrado && Math.hypot(e.clientX - prev.clientX, e.clientY - prev.clientY) > 1) { arrastrado = true; try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
        v.x -= (dx / r.width) * v.w; v.y -= (dy / r.height) * v.h; acotar(); aplicar();
      } else if (punt.size === 2) {
        const [a, b] = [...punt.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (dist0) { const [cx, cy] = aPlano({clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2}); zoom(d / dist0, cx, cy); }
        dist0 = d;
      }
    });
    const soltar = (e) => { punt.delete(e.pointerId); dist0 = 0; };
    svg.addEventListener("pointerup", soltar); svg.addEventListener("pointercancel", soltar);
    svg.addEventListener("pointerup", () => setTimeout(() => { arrastrado = false; }, 0));
    caja.querySelector("[data-zoom-mas]").addEventListener("click", () => zoom(1.4, ...centro()));
    caja.querySelector("[data-zoom-menos]").addEventListener("click", () => zoom(1 / 1.4, ...centro()));
    caja.querySelector("[data-zoom-reset]").addEventListener("click", () => { v = {...base}; aplicar(); });
    aplicar();
    caja.dataset.state = "ok";
  }).catch(() => { caja.dataset.state = "error"; });
})();
