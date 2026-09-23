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
  const lotesEjemplo = [];
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
  ejemplos.visible = false;
  escena.add(ejemplos);

  // ---- Plaza comercial unificada en el solar de 20,000 m² (ilustración de la forma:
  // nave de supermercado de una planta con cubierta a dos aguas, fachada alta al frente,
  // marquesina, parqueo y techo para motores). Se construye por fases con `construir(p)`.
  const plaza = new THREE.Group();
  const fases = [];  // {desde, hasta, fn(k)} con k de 0 a 1 dentro de la fase
  if (cg) {
    const [a, b, c] = cg.p;
    const eje = new THREE.Vector2(b[0] - a[0], b[1] - a[1]);
    const lado2 = new THREE.Vector2(c[0] - b[0], c[1] - b[1]);
    // eje local X = a lo largo de la carretera (el lado de 109 m)
    const largo = eje.length() < lado2.length() ? eje : lado2;
    const angPlaza = Math.atan2(largo.y, largo.x);
    const cx0 = cg.p.reduce((s, q) => s + q[0], 0) / 4, cn0 = cg.p.reduce((s, q) => s + q[1], 0) / 4;
    plaza.position.copy(P(cx0, cn0, 0));
    plaza.rotation.y = angPlaza;
    // que +Z local mire a la carretera (al este)
    const zLocal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angPlaza);
    if (zLocal.x < 0) plaza.rotation.y += Math.PI;
    escena.add(plaza);

    const M = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.7, ...extra});
    const caja = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; plaza.add(m); return m; };
    const fase = (desde, hasta, fn) => fases.push({desde, hasta, fn});
    const suave = (k) => k * k * (3 - 2 * k);

    // 1. Nivelación: la losa pasa de tierra a hormigón
    const losaP = caja(108, 0.6, 182, M("#8a6a4a"), 0, 2.6, 0);
    const tierra = new THREE.Color("#8a6a4a"), hormigon = new THREE.Color("#b9b6ae");
    fase(0, 0.1, (k) => { losaP.scale.y = Math.max(0.01, k); losaP.material.color.copy(tierra).lerp(hormigon, k); });

    // Rejilla de la nave: X -40..40, Z -80..10 (80 × 90 m = 7,200 m²)
    const NX = 9, NZ = 10, X0 = -40, X1 = 40, Z0 = -80, Z1 = 10, ALTO = 9, CUMBRE = 13;
    const xs = [...Array(NX)].map((_, i) => X0 + ((X1 - X0) * i) / (NX - 1));
    const zs = [...Array(NZ)].map((_, i) => Z0 + ((Z1 - Z0) * i) / (NZ - 1));
    // 2. Zapatas
    const zap = [];
    xs.forEach((x) => zs.forEach((z) => zap.push(caja(1.6, 1, 1.6, M("#9d9a92"), x, 3.2, z))));
    zap.forEach((m) => (m.scale.y = 0.01));
    fase(0.1, 0.2, (k) => zap.forEach((m, i) => { const q = Math.min(1, Math.max(0, k * zap.length / 20 - i / 20)); m.scale.y = Math.max(0.01, suave(Math.min(1, q))); m.visible = q > 0.02; }));
    // 3. Columnas de acero
    const acero = M("#5b6b7a", {metalness: 0.5, roughness: 0.45});
    const col = [];
    xs.forEach((x) => zs.forEach((z) => { const m = caja(0.5, ALTO, 0.5, acero, x, 3.2 + ALTO / 2, z); m.scale.y = 0.01; m.position.y = 3.2; col.push(m); }));
    fase(0.2, 0.36, (k) => col.forEach((m, i) => { const q = Math.min(1, Math.max(0, k * 1.6 - (i % NZ) / NZ * 0.6)); m.scale.y = Math.max(0.01, suave(q)); m.visible = q > 0.02; m.position.y = 3.2 + (ALTO * m.scale.y) / 2; }));
    // 4. Cerchas a dos aguas (una por cada línea de columnas en X)
    const cerchas = [];
    xs.forEach((x) => {
      const g = new THREE.Group();
      const mitad = (Z1 - Z0) / 2, zc = (Z0 + Z1) / 2;
      const ang = Math.atan2(CUMBRE - ALTO, mitad), lar = Math.hypot(mitad, CUMBRE - ALTO);
      [-1, 1].forEach((s) => {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, lar), acero);
        v.position.set(0, 3.2 + (ALTO + CUMBRE) / 2, zc + (s * mitad) / 2);
        v.rotation.x = s * ang;
        v.castShadow = true;
        g.add(v);
      });
      g.position.x = x;
      g.scale.set(1, 1, 0.001);
      plaza.add(g);
      cerchas.push(g);
    });
    fase(0.36, 0.48, (k) => cerchas.forEach((g, i) => { const q = Math.min(1, Math.max(0, k * 1.5 - i / cerchas.length * 0.5)); g.scale.z = Math.max(0.001, suave(q)); g.visible = q > 0.02; }));
    // 5. Cubierta: paneles que se colocan de un extremo al otro
    const techo = M("#d9dcdd", {metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide});
    const paneles = [];
    const mitad = (Z1 - Z0) / 2, zc = (Z0 + Z1) / 2, angT = Math.atan2(CUMBRE - ALTO, mitad), larT = Math.hypot(mitad, CUMBRE - ALTO) + 1.5;
    for (let i = 0; i < NX - 1; i++) {
      [-1, 1].forEach((s) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry((X1 - X0) / (NX - 1) + 0.2, 0.25, larT), techo);
        p.position.set(xs[i] + (X1 - X0) / (NX - 1) / 2, 3.2 + (ALTO + CUMBRE) / 2 + 0.6, zc + (s * mitad) / 2);
        p.rotation.x = s * angT;
        p.castShadow = p.receiveShadow = true;
        p.visible = false;
        plaza.add(p);
        paneles.push(p);
      });
    }
    fase(0.48, 0.62, (k) => paneles.forEach((p, i) => { const q = k * paneles.length - i; p.visible = q > 0; p.position.y = 3.2 + (ALTO + CUMBRE) / 2 + 0.6 + Math.max(0, 1 - q) * 18; }));
    // 6. Cerramientos y fachada alta con marquesina
    const muro = M("#ece8df");
    const muros = [
      caja(X1 - X0, ALTO, 0.4, muro, 0, 3.2 + ALTO / 2, Z0),
      caja(0.4, ALTO, Z1 - Z0, muro, X0, 3.2 + ALTO / 2, zc),
      caja(0.4, ALTO, Z1 - Z0, muro, X1, 3.2 + ALTO / 2, zc),
    ];
    const fachada = caja(X1 - X0 + 6, 15, 0.8, M("#f4f1ea"), 0, 3.2 + 7.5, Z1 + 0.6);
    const franja = caja(X1 - X0 + 6.2, 2.2, 0.9, M("#c8322a"), 0, 3.2 + 13, Z1 + 0.7);
    const vidrio = caja(30, 4.5, 0.9, M("#5f7f96", {metalness: 0.4, roughness: 0.15}), 0, 3.2 + 2.25, Z1 + 0.75);
    const marquesina = caja(40, 0.6, 9, M("#e9e6df"), 0, 3.2 + 6, Z1 + 5);
    const pilares = [-18, -6, 6, 18].map((x) => caja(0.5, 6, 0.5, acero, x, 3.2 + 3, Z1 + 9));
    const fachadaTodo = [...muros, fachada, franja, vidrio, marquesina, ...pilares];
    fachadaTodo.forEach((m) => { m.userData.y = m.position.y; m.userData.h = m.geometry.parameters.height; m.scale.y = 0.01; });
    // Locales en línea al sur de la nave
    const locales = caja(10, 6, 88, M("#efe9dc"), -48, 3.2 + 3, zc);
    locales.userData.y = locales.position.y; locales.userData.h = 6; locales.scale.y = 0.01;
    fachadaTodo.push(locales);
    fase(0.62, 0.76, (k) => fachadaTodo.forEach((m, i) => { const q = Math.min(1, Math.max(0, k * 1.4 - (i / fachadaTodo.length) * 0.4)); m.scale.y = Math.max(0.01, suave(q)); m.visible = q > 0.02; m.position.y = 3.2 + (m.userData.h * m.scale.y) / 2 + (m.userData.y - 3.2 - m.userData.h / 2); }));
    // 7. Parqueo: asfalto, rayas y techo para motores
    const asfalto = caja(100, 0.3, 62, M("#3b3f42", {roughness: 0.95}), 0, 3.35, 57);
    asfalto.scale.z = 0.01;
    const rayas = [];
    for (let fila = 0; fila < 4; fila++) {
      for (let i = 0; i < 34; i++) {
        const r = caja(0.2, 0.05, 5, M("#f2f2f2"), -46 + i * 2.8, 3.55, 34 + fila * 14);
        r.visible = false;
        rayas.push(r);
      }
    }
    const techoMotos = caja(30, 0.4, 8, M("#d9dcdd", {metalness: 0.3}), 30, 3.2 + 4, 20);
    techoMotos.visible = false;
    fase(0.76, 0.88, (k) => { asfalto.visible = k > 0.01; asfalto.scale.z = Math.max(0.01, suave(k)); asfalto.position.z = 26 + 31 * suave(k); rayas.forEach((r, i) => (r.visible = k * rayas.length > i)); techoMotos.visible = k > 0.8; });
    // 8. Paisajismo: árboles alrededor
    const arbolesP = [];
    for (let i = 0; i < 26; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 7).translate(0, 4, 0), M("#2f6b3a"));
      const perim = i < 13 ? [-52 + i * 8.5, 3.2, 90] : [53, 3.2, -84 + (i - 13) * 13];
      t.position.set(...perim);
      t.scale.setScalar(0.001);
      t.castShadow = true;
      plaza.add(t);
      arbolesP.push(t);
    }
    fase(0.88, 1, (k) => arbolesP.forEach((t, i) => t.scale.setScalar(Math.max(0.001, suave(Math.min(1, Math.max(0, k * 2 - i / arbolesP.length)))))));
    // Grúa torre mientras dura la obra
    const grua = new THREE.Group();
    const mastil = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2), M("#f3b33d"));
    mastil.position.y = 17;
    const pluma = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 1.4), M("#f3b33d"));
    pluma.position.set(12, 34, 0);
    grua.add(mastil, pluma);
    grua.position.set(46, 3.2, -30);
    grua.traverse((m) => (m.castShadow = true));
    plaza.add(grua);
    fase(0.18, 0.78, (k) => { pluma.rotation.y = k * Math.PI * 3; });
    fase(0, 1, (k) => { grua.visible = k > 0.15 && k < 0.8; });
  }
  let progresoObra = 1;
  function construir(p) {
    progresoObra = p;
    for (const f of fases) {
      const k = Math.min(1, Math.max(0, (p - f.desde) / (f.hasta - f.desde)));
      f.fn(k);
    }
  }
  construir(1);

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
  etiqueta("<b>Plaza comercial</b><span>solar de 20,000 m² · 109 × 183.5 m</span>", P(cxG, cnG, 40), [0, 1, 3], "coral");
  etiqueta("Carretera Las Cejas – La Enea", P(110, 120, 6), [1]);
  {
    const l = D.plano.poligonos.find((q) => q.id === "C12");
    if (l) etiqueta("<b>Ejemplo</b><span>locales de 2 niveles con parqueo</span>", P(l.p.reduce((a, q) => a + q[0], 0) / l.p.length, l.p.reduce((a, q) => a + q[1], 0) / l.p.length, 24), [1]);
  }
  etiqueta("<b>Residencial</b><span>131 solares</span>", P(cxR, cnR - 60, 22), [0, 3], "azul");
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
  if (cg) {
    CAPS[1] = {pos: plaza.localToWorld(new THREE.Vector3(135, 95, 175)), mira: plaza.localToWorld(new THREE.Vector3(0, 6, -10))};
  }
  let cap = -1, tw = null, t0 = performance.now(), foco = -1, obraInicio = 0, captura = false;
  const DURACION_OBRA = 14;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  function irA(pos, mira, ms = 2200) {
    manual = false;
    tw = {p0: camara.position.clone(), m0: controles.target.clone(), p1: pos, m1: mira, t: performance.now(), ms: quieto ? 1 : ms};
  }
  function capitulo(i) {
    if (i === cap) return;
    cap = i; foco = -1;
    if (i === 1) { obraInicio = performance.now(); construir(0); } else construir(1);
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
    reconstruir() { obraInicio = performance.now(); construir(0); },
    // Captura para vídeo: fija obra, cámara y dibuja un cuadro (sin animaciones automáticas)
    fotograma(p, a, dist, alto, girar) {
      captura = true;
      construir(p);
      const c = plaza.localToWorld(new THREE.Vector3(0, 6, -10));
      const off = new THREE.Vector3(Math.sin(a) * dist, alto, Math.cos(a) * dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), plaza.rotation.y);
      camara.position.copy(c).add(off);
      camara.lookAt(c);
      lotes.forEach((m) => { m.scale.y = m.userData.altura = 1; m.material.opacity = 1; });
      renderer.render(escena, camara);
      return true;
    },
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
    if (captura) return;
    controles.update();
    if (cap === 1 && !quieto) construir(Math.min(1, (ahora - obraInicio) / 1000 / DURACION_OBRA));
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
