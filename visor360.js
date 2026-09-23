// Recorrido 360 por El Pozo: las tres panorámicas originales del dron (DJI_0308/0310/0309,
// 8192×4096 reducidas a 4096) enlazadas, con la distribución del DXF sobre el suelo, puntos
// para saltar de una a otra, destinos reales en el horizonte y un minimapa. Posición y
// altura: GPS y altura relativa del XMP. Rumbo: ajustado contra el suelo de las fotos
// calibradas (scripts/calibrar_360_dji.py → render3d/panos_dji.json).
(function () {
  const cont = document.getElementById("visor360");
  if (!cont || !window.THREE) return;
  const D = window.EL_POZO;
  // rumbo0 = rumbo (grados desde el norte) del centro de la foto (lon = 0)
  // posición, altura, rumbo e inclinación ajustados contra la ortofoto de ODM (scripts/calibrar_360_odm.py)
  const PANOS = [
    {id: "entrada", nombre: "Entrada", src: "assets/360/entrada.jpg", x: -2.62, n: 215.43, h: 74.12, rumbo0: 183.167, incE: 0.102, incN: 0.144},
    {id: "centro", nombre: "Centro", src: "assets/360/centro.jpg", x: -12.09, n: -12.7, h: 81.82, rumbo0: 359.554, incE: 1.119, incN: -0.486},
    {id: "fondo", nombre: "Fondo", src: "assets/360/fondo.jpg", x: -51.66, n: -266.44, h: 79.45, rumbo0: 176.693, incE: 1.606, incN: -0.229},
  ];
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true});
  } catch (e) {
    cont.dataset.state = "sin-webgl";
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  cont.prepend(renderer.domElement);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(96, 1, 0.1, 100);
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 40).scale(-1, 1, 1), new THREE.MeshBasicMaterial({transparent: true}));
  escena.add(esfera);
  const capaPlano = new THREE.Group();
  escena.add(capaPlano);
  const capaEtq = cont.querySelector(".etiquetas360");
  const cargador = new THREE.TextureLoader();
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const R = Math.PI / 180;
  let actual = null, lon = 0, lat = -52, arrastre = null, ultimoToque = 0, fade = 1;

  // Dirección en la esfera de un punto del suelo visto desde la panorámica
  // (mismo modelo que scripts/calibrar_360_odm.py: inclinación pequeña del horizonte y rumbo)
  function direccion(pano, x, n, alto = 0) {
    let e = x - pano.x, nn = n - pano.n, u = alto - pano.h;
    const a = (pano.incE || 0) * R, b = (pano.incN || 0) * R;
    [nn, u] = [nn * Math.cos(a) - u * Math.sin(a), nn * Math.sin(a) + u * Math.cos(a)];
    [e, u] = [e * Math.cos(b) + u * Math.sin(b), -e * Math.sin(b) + u * Math.cos(b)];
    const r = Math.hypot(e, nn) || 0.01;
    const L = (Math.atan2(e, nn) / R - pano.rumbo0) * R;
    return new THREE.Vector3(-Math.cos(L) * r, u, -Math.sin(L) * r).normalize();
  }
  // Borde grueso: cinta de ancho angular fijo entre puntos de la esfera (WebGL no dibuja líneas gruesas)
  function cintas(segmentos, ancho, radio) {
    const v = [], c = new THREE.Vector3();
    for (const [p1, p2] of segmentos) {
      c.crossVectors(p1, p2);
      if (c.lengthSq() < 1e-12) continue;
      c.normalize().multiplyScalar(ancho * radio);
      const a1 = p1.clone().multiplyScalar(radio), a2 = p2.clone().multiplyScalar(radio);
      const q = [a1.clone().add(c), a1.clone().sub(c), a2.clone().add(c), a2.clone().sub(c)];
      v.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[3].toArray());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return g;
  }
  const ZCOL = {comercial: "#e4573d", residencial: "#4f8fe8", mixto: "#f0b43c", verde: "#6cc070", plaza: "#f2c29a", apartamentos: "#f0cf55", escuela: "#a996e8"};

  function construirPlano(pano) {
    capaPlano.clear();
    const bordes = [], bordesCG = [];
    for (const pol of D.plano.poligonos) {
      const fino = [];
      for (let i = 0; i < pol.p.length; i++) {
        const [x1, n1] = pol.p[i], [x2, n2] = pol.p[(i + 1) % pol.p.length];
        for (let k = 0; k < 6; k++) fino.push([x1 + ((x2 - x1) * k) / 6, n1 + ((n2 - n1) * k) / 6]);
      }
      const tri = THREE.ShapeUtils.triangulateShape(fino.map(([x, n]) => new THREE.Vector2(x, n)), []);
      const dirs = fino.map(([x, n]) => direccion(pano, x, n));
      const geo = new THREE.BufferGeometry().setFromPoints(dirs.map((d) => d.clone().multiplyScalar(40)));
      geo.setIndex(tri.flat());
      capaPlano.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: ZCOL[pol.zona], transparent: true, opacity: pol.zona === "comercial" ? 0.12 : 0.1, side: THREE.DoubleSide, depthTest: false})));
      const segs = dirs.map((d, i) => [d, dirs[(i + 1) % dirs.length]]);
      (pol.zona === "comercial" ? bordesCG : bordes).push(...segs);
    }
    capaPlano.add(new THREE.Mesh(cintas(bordes, 0.0022, 39.8), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false})));
    capaPlano.add(new THREE.Mesh(cintas(bordesCG, 0.0045, 39.7), new THREE.MeshBasicMaterial({color: 0xe4573d, side: THREE.DoubleSide, depthTest: false})));
    // Circunvalación sobre el suelo
    D.vias.filter((v) => v.c === "circ").forEach((v) => {
      const dirs = v.p.map(([x, n]) => direccion(pano, x, n));
      capaPlano.add(new THREE.Mesh(cintas(dirs.slice(1).map((d, i) => [dirs[i], d]), 0.004, 39.5), new THREE.MeshBasicMaterial({color: 0xf3b33d, side: THREE.DoubleSide, depthTest: false})));
    });
  }

  // Etiquetas: otras panorámicas (saltos) y destinos en el horizonte
  let etiquetas = [];
  function construirEtiquetas(pano) {
    capaEtq.innerHTML = "";
    etiquetas = [];
    const poner = (html, dir, clase, alClic) => {
      const el = document.createElement(alClic ? "button" : "div");
      el.className = "e360 " + clase;
      el.innerHTML = html;
      if (alClic) { el.type = "button"; el.addEventListener("click", alClic); }
      capaEtq.appendChild(el);
      etiquetas.push({el, dir});
    };
    PANOS.filter((p) => p !== pano).forEach((p) => {
      const d = Math.round(Math.hypot(p.x - pano.x, p.n - pano.n));
      poner(`Ir a: ${p.nombre}<span>${d} m</span>`, direccion(pano, p.x, p.n), "salto", () => ir(p));
    });
    D.rutas.destinos.filter((d) => ["Parque Duarte"].includes(d.nombre)).forEach((d) => poner(`${d.nombre}<span>${d.min_carro} min</span>`, direccion(pano, d.xy[0], d.xy[1], 40), "destino"));
    const ci = D.vias.filter((v) => v.c === "circ").flatMap((v) => v.p).reduce((a, q) => (Math.hypot(q[0] - pano.x, q[1] - pano.n) < Math.hypot(a[0] - pano.x, a[1] - pano.n) ? q : a));
    poner("Circunvalación", direccion(pano, ci[0], ci[1]), "oro");
    const com = D.plano.poligonos.filter((q) => q.zona === "comercial").flatMap((q) => q.p);
    const cc = com.reduce((a, q) => [a[0] + q[0] / com.length, a[1] + q[1] / com.length], [0, 0]);
    poner("Plaza comercial", direccion(pano, cc[0] + 20, cc[1] + (pano.n - cc[1]) * 0.5), "coral");
  }

  function ir(pano) {
    if (actual === pano) return;
    const rumboVista = actual ? actual.rumbo0 + (lon - 180) : null;
    cont.dataset.state = "cargando";
    cargador.load(pano.src, (t) => {
      t.minFilter = THREE.LinearFilter;
      esfera.material.map = t;
      esfera.material.needsUpdate = true;
      actual = pano;
      // conservar hacia dónde se miraba
      lon = rumboVista === null ? 180 + (90 - pano.rumbo0) : 180 + (rumboVista - pano.rumbo0);
      construirPlano(pano);
      construirEtiquetas(pano);
      fade = 0;
      cont.dataset.state = "listo";
      cont.dataset.foto = pano.src;
      cont.dataset.pano = pano.id;
      cont.querySelectorAll("[data-ir360]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ir360 === pano.id)));
      dibujarMini();
    }, undefined, () => { cont.dataset.state = "error"; });
  }

  // Minimapa: el terreno, las tres fotos y el cono de visión
  const mini = cont.querySelector(".mini360");
  const NS = "http://www.w3.org/2000/svg";
  const svgMini = document.createElementNS(NS, "svg");
  svgMini.setAttribute("viewBox", "-190 -380 380 760");
  mini.appendChild(svgMini);
  const cono = document.createElementNS(NS, "path");
  function dibujarMini() {
    svgMini.innerHTML = "";
    for (const pol of D.plano.poligonos) {
      const pg = document.createElementNS(NS, "polygon");
      pg.setAttribute("points", pol.p.map(([x, n]) => `${x},${-n}`).join(" "));
      pg.setAttribute("fill", ZCOL[pol.zona]);
      pg.setAttribute("opacity", ".85");
      svgMini.appendChild(pg);
    }
    cono.setAttribute("fill", "rgba(255,255,255,.55)");
    svgMini.appendChild(cono);
    PANOS.forEach((p) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p.x); c.setAttribute("cy", -p.n); c.setAttribute("r", p === actual ? 22 : 16);
      c.setAttribute("fill", p === actual ? "#12301f" : "#fff");
      c.setAttribute("stroke", "#12301f"); c.setAttribute("stroke-width", 6);
      c.style.cursor = "pointer";
      c.addEventListener("click", () => ir(p));
      const t = document.createElementNS(NS, "title"); t.textContent = p.nombre; c.appendChild(t);
      svgMini.appendChild(c);
    });
  }

  cont.querySelectorAll("[data-ir360]").forEach((b) => b.addEventListener("click", () => ir(PANOS.find((p) => p.id === b.dataset.ir360))));
  cont.querySelector("[data-plano360]").addEventListener("click", (e) => {
    capaPlano.visible = !capaPlano.visible;
    e.currentTarget.setAttribute("aria-pressed", String(capaPlano.visible));
    cont.dataset.plano = capaPlano.visible ? "si" : "no";
  });
  const lienzo = renderer.domElement;
  lienzo.addEventListener("pointerdown", (e) => { arrastre = {x: e.clientX, y: e.clientY, lon, lat}; lienzo.setPointerCapture(e.pointerId); });
  lienzo.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    lon = arrastre.lon - (e.clientX - arrastre.x) * 0.15;
    lat = Math.max(-88, Math.min(6, arrastre.lat + (e.clientY - arrastre.y) * 0.15));
    ultimoToque = performance.now();
  });
  lienzo.addEventListener("pointerup", () => { arrastre = null; });

  function medir() {
    const w = cont.clientWidth, h = cont.clientHeight;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.fov = w < 600 ? 104 : 96;
    camara.updateProjectionMatrix();
  }
  new ResizeObserver(medir).observe(cont);
  medir();
  let visible = false;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(cont);
  const brujula = cont.querySelector(".brujula360");
  const v = new THREE.Vector3();
  let antes = performance.now();
  function cuadro(t) {
    requestAnimationFrame(cuadro);
    const dt = Math.min(0.1, (t - antes) / 1000);
    antes = t;
    if (!visible || !actual) return;
    if (!arrastre && !quieto && t - ultimoToque > 3000) lon += 2 * dt;
    fade = Math.min(1, fade + dt * 2.5);
    esfera.material.opacity = quieto ? 1 : fade;
    const f = (90 - lat) * R, th = lon * R;
    camara.lookAt(Math.sin(f) * Math.cos(th), Math.cos(f), Math.sin(f) * Math.sin(th));
    renderer.render(escena, camara);
    // rumbo de la vista (brújula y cono del minimapa)
    const rumbo = actual.rumbo0 + (lon - 180);
    brujula.style.transform = `rotate(${-rumbo}deg)`;
    const a1 = (rumbo - 35) * R, a2 = (rumbo + 35) * R;
    cono.setAttribute("d", `M${actual.x},${-actual.n} L${actual.x + Math.sin(a1) * 260},${-actual.n - Math.cos(a1) * 260} L${actual.x + Math.sin(a2) * 260},${-actual.n - Math.cos(a2) * 260} Z`);
    const w = cont.clientWidth, h = cont.clientHeight;
    // dentro del marco, por debajo de los botones de arriba, y sin pisarse
    const medidas = etiquetas.map((e) => [e.el.offsetWidth, e.el.offsetHeight]);
    const arriba = (cont.querySelector(".barra360").offsetHeight || 40) + 20;
    const puestas = [];
    etiquetas.forEach((e, i) => {
      v.copy(e.dir).multiplyScalar(30).project(camara);
      let ok = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      const [ew, eh] = medidas[i];
      const x = Math.min(w - 8 - ew / 2, Math.max(8 + ew / 2, ((v.x + 1) / 2) * w));
      const y = Math.min(h - 52 - eh / 2, Math.max(arriba + eh / 2, ((1 - v.y) / 2) * h));
      const r = {x0: x - ew / 2, x1: x + ew / 2, y0: y - eh / 2, y1: y + eh / 2};
      if (ok && puestas.some((q) => r.x0 < q.x1 + 4 && r.x1 > q.x0 - 4 && r.y0 < q.y1 + 4 && r.y1 > q.y0 - 4)) ok = false;
      if (ok) puestas.push(r);
      e.el.style.opacity = ok ? 1 : 0;
      e.el.style.pointerEvents = ok ? "auto" : "none";
      if (e.el.tagName === "BUTTON") e.el.tabIndex = ok ? 0 : -1;
      e.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
  }
  requestAnimationFrame(cuadro);
  ir(PANOS[0]);
})();
