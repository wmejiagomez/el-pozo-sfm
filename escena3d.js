// Maqueta 3D de El Pozo: plano maestro georreferenciado, vías y edificios de
// OpenStreetMap, rutas reales en carro (OSRM) y un recorrido por capítulos.
// Coordenadas: metros desde el centro del proyecto. Three: x = este, y = arriba, z = -norte.
(function () {
  const D = window.EL_POZO;
  const cont = document.getElementById("escena");
  const capaEtiquetas = document.getElementById("etiquetas3d");
  const aviso = document.getElementById("sin-webgl");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: "high-performance"});
  } catch (e) {
    aviso.hidden = false;
    cont.dataset.state = "sin-webgl";
    return;
  }
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  cont.prepend(renderer.domElement);

  const CIELO = new THREE.Color("#dde5dd");
  const escena = new THREE.Scene();
  escena.background = CIELO;
  escena.fog = new THREE.Fog(CIELO, 7000, 24000);
  const camara = new THREE.PerspectiveCamera(38, 1, 5, 40000);
  const controles = new THREE.OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;
  controles.enableZoom = false;
  controles.maxPolarAngle = 1.38;
  controles.addEventListener("start", () => { manual = true; });
  let manual = false;

  escena.add(new THREE.HemisphereLight(0xffffff, 0x8f9a86, 0.55));
  const sol = new THREE.DirectionalLight(0xfff1dc, 0.85);
  sol.position.set(-700, 1100, 500);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, {left: -650, right: 650, top: 650, bottom: -650, near: 10, far: 3000});
  sol.shadow.bias = -0.0005;
  escena.add(sol);

  const P = (x, n, y = 0) => new THREE.Vector3(x, y, -n);
  const C0 = D.plano.centro;
  const KC = 111320 * Math.cos((C0[0] * Math.PI) / 180);
  const aM = (lat, lon) => [(lon - C0[1]) * KC, (lat - C0[0]) * 111320];

  // ---- Suelo: las vías de OSM pintadas en una textura, como una maqueta de arquitecto
  const EXT = {x0: -3200, x1: 5200, n0: -2800, n1: 5600};
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 4096;
  const g = lienzo.getContext("2d");
  const sx = 4096 / (EXT.x1 - EXT.x0), sn = 4096 / (EXT.n1 - EXT.n0);
  const cx = (x) => (x - EXT.x0) * sx, cn = (n) => (EXT.n1 - n) * sn;
  g.fillStyle = "#c3d0b8";
  g.fillRect(0, 0, 4096, 4096);
  const ANCHO = {res: 9, sec: 16, prin: 26, circ: 34};
  for (const pasada of [0, 1]) {
    for (const c of ["res", "sec", "prin", "circ"]) {
      for (const v of D.vias.filter((q) => q.c === c)) {
        g.beginPath();
        v.p.forEach(([x, n], i) => (i ? g.lineTo(cx(x), cn(n)) : g.moveTo(cx(x), cn(n))));
        g.lineCap = g.lineJoin = "round";
        g.lineWidth = (ANCHO[c] + (pasada ? 0 : 8)) * sx;
        g.strokeStyle = pasada ? "#ffffff" : "#8f9a88";
        g.stroke();
      }
    }
  }
  const texSuelo = new THREE.CanvasTexture(lienzo);
  texSuelo.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(EXT.x1 - EXT.x0, EXT.n1 - EXT.n0), new THREE.MeshStandardMaterial({map: texSuelo, roughness: 1}));
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.set((EXT.x0 + EXT.x1) / 2, 0, -(EXT.n0 + EXT.n1) / 2);
  suelo.receiveShadow = true;
  escena.add(suelo);

  // Terreno del proyecto (arena), bajo los lotes
  const ESQ = D.plano.terreno;  // contorno del terreno a escala real (1:950)
  const forma = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, n], i) => (i ? s.lineTo(x, n) : s.moveTo(x, n))); return s; };
  const losa = new THREE.Mesh(new THREE.ExtrudeGeometry(forma(ESQ), {depth: 0.6, bevelEnabled: false}).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({color: "#d9c9a6", roughness: 1}));
  losa.receiveShadow = true;
  escena.add(losa);

  // ---- Lotes del plan maestro
  const ZONA = {
    comercial: {color: "#e4573d", h: 7},
    residencial: {color: "#5b93e6", h: 3},
    verde: {color: "#7fbf6a", h: 0.8},
    plaza: {color: "#efc9a5", h: 1},
    apartamentos: {color: "#f0cf55", h: 14},
    escuela: {color: "#a996e8", h: 6},
  };
  const lotes = [];
  const bordes = new THREE.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.7});
  for (const p of D.plano.poligonos) {
    const z = p.grande ? {color: "#c93f2a", h: 2.5} : ZONA[p.zona];
    const geo = new THREE.ExtrudeGeometry(forma(p.p), {depth: z.h, bevelEnabled: false}).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({color: z.color, roughness: 0.65, transparent: true, opacity: 1});
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    m.scale.y = 0.001;
    const lineas = new THREE.LineSegments(new THREE.EdgesGeometry(geo), bordes);
    m.add(lineas);
    const norte = p.p.reduce((a, q) => a + q[1], 0) / p.p.length;
    m.userData = {zona: p.zona, id: p.id, m2: p.m2, retraso: (300 - norte) / 1000, altura: 1};
    lotes.push(m);
    escena.add(m);
  }
  const cg = D.plano.poligonos.find((q) => q.grande);
  const centroZona = (zona) => {
    const ps = D.plano.poligonos.filter((p) => p.zona === zona).flatMap((p) => p.p);
    return [ps.reduce((a, q) => a + q[0], 0) / ps.length, ps.reduce((a, q) => a + q[1], 0) / ps.length];
  };

  // ---- Locales de ejemplo: qué cabe en un solar comercial de 1,220 m² (ilustración)
  const ejemplos = new THREE.Group();
  const matLocal = new THREE.MeshStandardMaterial({color: "#f7f4ee", roughness: 0.6});
  const matVidrio = new THREE.MeshStandardMaterial({color: "#6f8fa6", roughness: 0.2, metalness: 0.3});
  const matParqueo = new THREE.MeshStandardMaterial({color: "#6b6f6a", roughness: 1});
  const matRaya = new THREE.MeshBasicMaterial({color: "#ffffff"});
  const lotesEjemplo = ["C12", "C20"];
  for (const id of lotesEjemplo) {
    const lote = D.plano.poligonos.find((q) => q.id === id);
    if (!lote) continue;
    const xs = lote.p.map((q) => q[0]), ns = lote.p.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), n0 = Math.min(...ns), n1 = Math.max(...ns);
    const fondo = x1 - x0, frente = n1 - n0, nc = (n0 + n1) / 2;
    // parqueo del lado de la carretera (este), local detrás
    const par = new THREE.Mesh(new THREE.BoxGeometry(fondo * 0.38, 0.4, frente * 0.9), matParqueo);
    par.position.set(x1 - fondo * 0.21, 7.3, -nc);
    ejemplos.add(par);
    for (let k = -3; k <= 3; k++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(fondo * 0.3, 0.1, 0.35), matRaya);
      r.position.set(x1 - fondo * 0.21, 7.55, -(nc + k * frente * 0.12));
      ejemplos.add(r);
    }
    const local = new THREE.Mesh(new THREE.BoxGeometry(fondo * 0.5, 8, frente * 0.84), matLocal);
    local.position.set(x0 + fondo * 0.3, 7 + 4, -nc);
    local.castShadow = local.receiveShadow = true;
    ejemplos.add(local);
    const vitrina = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, frente * 0.74), matVidrio);
    vitrina.position.set(x0 + fondo * 0.55 + 0.2, 7 + 2, -nc);
    ejemplos.add(vitrina);
  }
  if (cg) {
    const g2 = new THREE.Group();
    const [x0, x1] = [Math.min(...cg.p.map((q) => q[0])), Math.max(...cg.p.map((q) => q[0]))];
    const [n0, n1] = [Math.min(...cg.p.map((q) => q[1])), Math.max(...cg.p.map((q) => q[1]))];
    const edif = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) * 0.42, 9, (n1 - n0) * 0.5), matLocal);
    edif.position.set(x0 + (x1 - x0) * 0.32, 2.5 + 4.5, -(n0 + (n1 - n0) * 0.55));
    edif.castShadow = edif.receiveShadow = true;
    const par = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) * 0.4, 0.4, (n1 - n0) * 0.62), matParqueo);
    par.position.set(x0 + (x1 - x0) * 0.74, 2.7, -(n0 + (n1 - n0) * 0.52));
    g2.add(edif, par);
    ejemplos.add(g2);
  }
  ejemplos.visible = false;
  escena.add(ejemplos);

  // ---- Árboles: el bosque real al oeste del terreno y los del parque
  const arbolGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const arbolMat = new THREE.MeshStandardMaterial({color: "#2d5a34", roughness: 0.9});
  const semilla = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(7);
  const posArboles = [];
  for (let i = 0; i < 1600; i++) posArboles.push([-95 - semilla() * 620, -340 + semilla() * 680]);
  const dentro = ([x, n], poly) => {
    let d = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, ni] = poly[i], [xj, nj] = poly[j];
      if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) d = !d;
    }
    return d;
  };
  // el bosque no puede pisar el proyecto
  for (let i = posArboles.length - 1; i >= 0; i--) if (dentro(posArboles[i], ESQ)) posArboles.splice(i, 1);
  for (const p of D.plano.poligonos.filter((q) => q.zona === "verde")) {
    const xs = p.p.map((q) => q[0]), ns = p.p.map((q) => q[1]);
    for (let i = 0; i < 120; i++) {
      const q = [Math.min(...xs) + semilla() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ns) + semilla() * (Math.max(...ns) - Math.min(...ns))];
      if (dentro(q, p.p)) posArboles.push(q);
    }
  }
  const bosque = new THREE.InstancedMesh(arbolGeo, arbolMat, posArboles.length);
  const tmp = new THREE.Object3D();
  posArboles.forEach(([x, n], i) => {
    const r = 5 + semilla() * 5, h = 10 + semilla() * 9;
    tmp.position.set(x, 0, -n); tmp.scale.set(r, h, r); tmp.updateMatrix();
    bosque.setMatrixAt(i, tmp.matrix);
  });
  bosque.castShadow = true;
  escena.add(bosque);

  // ---- Edificios de OSM, blancos, unidos en una sola malla
  const unir = (geos) => {
    const pos = [], nor = [];
    for (const gg of geos) {
      const q = gg.index ? gg.toNonIndexed() : gg;
      pos.push(...q.attributes.position.array); nor.push(...q.attributes.normal.array);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return out;
  };
  const geoEd = D.edificios.filter((e) => e.p.length > 2).map((e) => new THREE.ExtrudeGeometry(forma(e.p), {depth: e.h || 6 + semilla() * 5, bevelEnabled: false}).rotateX(-Math.PI / 2));
  const edificios = new THREE.Mesh(unir(geoEd), new THREE.MeshStandardMaterial({color: "#f4f1ea", roughness: 0.8}));
  edificios.castShadow = edificios.receiveShadow = true;
  escena.add(edificios);

  // ---- Cintas: circunvalación y rutas reales
  function cinta(pts, ancho, altura) {
    const v = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, n1] = pts[i], [x2, n2] = pts[i + 1];
      const dx = x2 - x1, dn = n2 - n1, l = Math.hypot(dx, dn) || 1;
      const ox = (-dn / l) * ancho / 2, on = (dx / l) * ancho / 2;
      const a = [x1 + ox, altura, -(n1 + on)], b = [x1 - ox, altura, -(n1 - on)], c = [x2 + ox, altura, -(n2 + on)], d = [x2 - ox, altura, -(n2 - on)];
      v.push(...a, ...b, ...c, ...c, ...b, ...d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return geo;
  }
  const matCirc = new THREE.MeshBasicMaterial({color: "#f3b33d", side: THREE.DoubleSide, transparent: true, opacity: 0.9});
  const circ = new THREE.Group();
  D.vias.filter((v) => v.c === "circ").forEach((v) => circ.add(new THREE.Mesh(cinta(v.p, 30, 0.9), matCirc)));
  escena.add(circ);

  const COLOR = {super: "#2f7de1", centro: "#e0921b", servicio: "#6d8f7c"};
  const rutas = D.rutas.destinos.map((d) => {
    const geo = cinta(d.ruta, 26, 1.6 + Math.random() * 0.3);
    const total = geo.attributes.position.count;
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({color: COLOR[d.tipo], side: THREE.DoubleSide, transparent: true, opacity: 0.95});
    const m = new THREE.Mesh(geo, mat);
    escena.add(m);
    const faro = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 220, 20).translate(0, 110, 0), new THREE.MeshBasicMaterial({color: COLOR[d.tipo], transparent: true, opacity: 0.55}));
    const bola = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16).translate(0, 235, 0), new THREE.MeshBasicMaterial({color: COLOR[d.tipo]}));
    faro.add(col, bola);
    faro.position.copy(P(d.xy[0], d.xy[1]));
    faro.scale.y = 0.001;
    escena.add(faro);
    const auto = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({color: "#ffffff"}));
    auto.visible = false;
    escena.add(auto);
    // longitudes acumuladas para mover el punto
    const acum = [0];
    for (let i = 1; i < d.ruta.length; i++) acum.push(acum[i - 1] + Math.hypot(d.ruta[i][0] - d.ruta[i - 1][0], d.ruta[i][1] - d.ruta[i - 1][1]));
    return {d, m, total, faro, auto, acum, avance: 0};
  });
  const enRuta = (r, f) => {
    const L = r.acum[r.acum.length - 1] * f;
    let i = r.acum.findIndex((a) => a >= L);
    if (i <= 0) i = 1;
    const k = (L - r.acum[i - 1]) / (r.acum[i] - r.acum[i - 1] || 1);
    const [x1, n1] = r.d.ruta[i - 1], [x2, n2] = r.d.ruta[i];
    return P(x1 + (x2 - x1) * k, n1 + (n2 - n1) * k, 12);
  };

  // ---- Etiquetas HTML
  const etiquetas = [];
  function etiqueta(html, pos, capitulos, clase = "") {
    const el = document.createElement("div");
    el.className = "etq " + clase;
    el.innerHTML = html;
    capaEtiquetas.appendChild(el);
    const e = {el, pos, capitulos};
    etiquetas.push(e);
    return e;
  }
  const [cxC, cnC] = centroZona("comercial");
  const [cxR, cnR] = centroZona("residencial");
  etiqueta("<b>El Pozo</b>", P(0, 360, 40), [0, 2], "grande");
  const [cxG, cnG] = [cg.p.reduce((a, q) => a + q[0], 0) / cg.p.length, cg.p.reduce((a, q) => a + q[1], 0) / cg.p.length];
  etiqueta("<b>Solar comercial</b><span>20,000 m² en la entrada</span>", P(cxG, cnG, 34), [0, 1, 3], "coral");
  etiqueta("<b>Frente comercial</b><span>28 solares de 1,220 m²</span>", P(cxC + 8, cnC - 90, 26), [1], "coral");
  etiqueta("Carretera Las Cejas – La Enea", P(95, -120, 6), [1]);
  {
    const l = D.plano.poligonos.find((q) => q.id === "C12");
    if (l) etiqueta("<b>Ejemplo</b><span>locales de 2 niveles con parqueo</span>", P(l.p.reduce((a, q) => a + q[0], 0) / l.p.length, l.p.reduce((a, q) => a + q[1], 0) / l.p.length, 24), [1]);
  }
  etiqueta("<b>Residencial</b><span>106 solares · 342–456 m²</span>", P(cxR, cnR - 60, 22), [0, 3], "azul");
  const ptCirc = D.vias.filter((v) => v.c === "circ").flatMap((v) => v.p).reduce((a, q) => (Math.hypot(q[0], q[1] - 300) < Math.hypot(a[0], a[1] - 300) ? q : a));
  etiqueta("Circunvalación", P(ptCirc[0] + 60, ptCirc[1] + 40, 10), [1, 2], "oro");
  rutas.forEach((r) => { r.etq = etiqueta(`<b>${r.d.nombre}</b><span>${r.d.min_carro} min · ${r.d.km_carro.toLocaleString("es-DO")} km</span>`, P(r.d.xy[0], r.d.xy[1], 300), [2], "destino"); });

  // ---- Capítulos: cámara y estado
  const CAPS = [
    {pos: P(430, -560, 300), mira: P(0, 10, 0)},
    {pos: P(460, -420, 150), mira: P(30, 60, 0)},
    {pos: P(3100, -2500, 5400), mira: P(1850, 2150, 0)},
    {pos: P(-60, -470, 380), mira: P(-25, 40, 0)},
  ];
  let cap = -1, tw = null, t0 = performance.now(), foco = -1;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  function irA(pos, mira, ms = 2200) {
    manual = false;
    tw = {p0: camara.position.clone(), m0: controles.target.clone(), p1: pos, m1: mira, t: performance.now(), ms: quieto ? 1 : ms};
  }
  function capitulo(i) {
    if (i === cap) return;
    cap = i; foco = -1;
    cont.dataset.capitulo = i;
    irA(CAPS[i].pos, CAPS[i].mira);
    lotes.forEach((m) => {
      const z = m.userData.zona;
      m.userData.altura = i === 1 ? (z === "comercial" ? 1 : 0.6) : i === 3 ? (z === "residencial" || z === "verde" || z === "apartamentos" ? 1.4 : 0.8) : 1;
      m.material.opacity = i === 1 && z !== "comercial" ? 0.45 : i === 3 && z === "comercial" ? 0.55 : 1;
    });
    rutas.forEach((r) => { r.objetivo = i === 2 ? 1 : 0; });
    ejemplos.visible = i === 1;
  }
  window.ElPozo3D = {
    capitulo,
    enfocar(k) {
      capitulo(2);
      foco = k;
      const r = rutas[k];
      const [x, n] = r.d.xy, dist = Math.hypot(x, n);
      irA(P(x / 2 + dist * 0.35, n / 2 - dist * 0.65, dist * 0.8), P(x / 2, n / 2, 0), 1600);
    },
  };

  // ---- Selección de lotes con el ratón o el dedo
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const ficha = document.getElementById("ficha3d");
  renderer.domElement.addEventListener("click", (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camara);
    const hit = ray.intersectObjects(lotes, false)[0];
    lotes.forEach((m) => m.material.emissive && m.material.emissive.set(0x000000));
    if (!hit || !hit.object.userData.id) { ficha.hidden = true; cont.dataset.elegido = ""; return; }
    const u = hit.object.userData;
    hit.object.material.emissive.set(0x442200);
    const tipo = u.zona === "comercial" ? "Solar comercial, frente a la carretera" : u.zona === "residencial" ? "Solar residencial" : u.zona;
    ficha.innerHTML = `<b>${u.id}</b> · ${u.m2 ? u.m2.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " m²" : ""}<br><span>${tipo}</span>`;
    ficha.hidden = false;
    cont.dataset.elegido = u.id;
  });

  // ---- Tamaño y bucle
  function medir() {
    const w = cont.clientWidth, h = cont.clientHeight;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }
  new ResizeObserver(medir).observe(cont);
  medir();
  camara.position.copy(P(1400, -2400, 1500));
  controles.target.copy(P(0, 0, 0));
  capitulo(0);

  const v = new THREE.Vector3();
  let visible = true;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(cont);
  let antes = performance.now();
  function cuadro(ahora) {
    requestAnimationFrame(cuadro);
    const dt = Math.min(0.1, (ahora - antes) / 1000);
    antes = ahora;
    if (!visible) return;
    const t = (ahora - t0) / 1000;
    if (tw) {
      const k = Math.min(1, (ahora - tw.t) / tw.ms), e = ease(k);
      camara.position.lerpVectors(tw.p0, tw.p1, e);
      controles.target.lerpVectors(tw.m0, tw.m1, e);
      if (k >= 1) tw = null;
    } else if (!manual && !quieto && cap !== 2) {
      // órbita lenta alrededor del objetivo
      const o = camara.position.clone().sub(controles.target);
      o.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.035 * dt);
      camara.position.copy(controles.target).add(o);
    }
    controles.update();
    // crecer lotes escalonados
    lotes.forEach((m) => {
      const objetivo = Math.max(0.001, Math.min(1, (t - 0.3 - m.userData.retraso) * 1.6)) * m.userData.altura;
      m.scale.y += ((quieto ? m.userData.altura : objetivo) - m.scale.y) * Math.min(1, dt * 7);
    });
    rutas.forEach((r, i) => {
      const meta = r.objetivo || 0;
      r.avance = quieto ? meta : meta > r.avance ? Math.min(meta, r.avance + dt / (2.6 + i * 0.25)) : Math.max(meta, r.avance - dt * 3);
      const n = Math.floor((r.avance * r.total) / 6) * 6;
      r.m.geometry.setDrawRange(0, n);
      r.m.material.opacity = foco < 0 || foco === i ? 0.95 : 0.25;
      r.faro.scale.y = Math.max(0.001, r.avance > 0.9 ? (r.avance - 0.9) * 10 : 0.001);
      r.auto.visible = r.avance > 0.98 && (foco < 0 || foco === i);
      if (r.auto.visible) r.auto.position.copy(enRuta(r, ((t * 0.12 + i * 0.13) % 1)));
    });
    matCirc.opacity = cap === 1 || cap === 2 ? 0.95 : 0.55;
    renderer.render(escena, camara);
    // etiquetas
    const w = cont.clientWidth, h = cont.clientHeight;
    etiquetas.forEach((e, i) => {
      v.copy(e.pos).project(camara);
      const ok = e.capitulos.includes(cap) && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && (!rutas.some((r) => r.etq === e) || rutas.find((r) => r.etq === e).avance > 0.9);
      e.el.style.opacity = ok ? 1 : 0;
      e.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    });
  }
  requestAnimationFrame(cuadro);
  cont.dataset.state = "listo";
  cont.dataset.lotes = lotes.length;
  cont.dataset.rutas = rutas.length;
})();
