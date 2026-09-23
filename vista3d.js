// Vista 3D sencilla de El Pozo para la página demo: satélite de contexto, ortofoto del
// vuelo, solares en planta y la plaza como volumen blanco. Sin rutas ni animaciones de obra.
(function () {
  const cont = document.getElementById("vista3d");
  if (!cont || !window.THREE) return;
  const D = window.EL_POZO;
  let render;
  try {
    render = new THREE.WebGLRenderer({antialias: true});
  } catch (e) {
    cont.dataset.state = "sin-webgl";
    return;
  }
  THREE.ColorManagement.legacyMode = false;
  render.outputEncoding = THREE.sRGBEncoding;
  render.setPixelRatio(Math.min(devicePixelRatio, 2));
  cont.prepend(render.domElement);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color("#eef3f0");
  escena.fog = new THREE.Fog("#eef3f0", 1300, 2400);
  const camara = new THREE.PerspectiveCamera(40, 1, 1, 6000);
  camara.position.set(420, 380, 380);
  const control = new THREE.OrbitControls(camara, render.domElement);
  control.target.set(0, 0, 60);
  control.enableDamping = true;
  control.maxPolarAngle = 1.2;
  control.minDistance = 180;
  control.maxDistance = 1500;
  control.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  control.autoRotateSpeed = 0.35;
  control.addEventListener("start", () => (control.autoRotate = false));
  escena.add(new THREE.HemisphereLight("#ffffff", "#9aa59a", 0.9));
  const sol = new THREE.DirectionalLight("#ffffff", 0.9);
  sol.position.set(-300, 500, 200);
  escena.add(sol);

  const P = (x, n, y = 0) => new THREE.Vector3(x, y, -n);
  const carga = new THREE.TextureLoader();
  const tex = (url) => { const t = carga.load(url); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
  const suelo = (url, alfa, x0, x1, n0, n1, y, orden) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, n1 - n0), new THREE.MeshLambertMaterial({map: tex(url), alphaMap: alfa ? carga.load(alfa) : null, transparent: !!alfa, depthWrite: !alfa}));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(P((x0 + x1) / 2, (n0 + n1) / 2, y));
    m.renderOrder = orden;
    escena.add(m);
  };
  // Plano base esquemático (calles de OpenStreetMap sobre un tono de Sentinel-2, 3 km;
  // scripts/mapa_base.py) y, encima, la ortofoto real del vuelo
  suelo("assets/mapa_base.jpg", null, -1500, 1500, -1560, 1440, -0.3, 0);
  suelo("assets/orto_odm.jpg", "assets/orto_odm_alfa.png", -245.03, 161.4, -484.81, 408.94, 0, 1);

  // Solares en planta
  const COLOR = {comercial: "#e4573d", mixto: "#f0b43c", residencial: "#4f86d9"};
  // con rotateX(-π/2) la y de la forma pasa a ser -z, es decir, el norte: se usa (x, n) tal cual
  const forma = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, n], i) => (i ? s.lineTo(x, n) : s.moveTo(x, n))); return s; };
  const borde = new THREE.LineBasicMaterial({color: "#ffffff", transparent: true, opacity: 0.8});
  for (const p of D.plano.poligonos) {
    const g = new THREE.ShapeGeometry(forma(p.p)).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: COLOR[p.zona], transparent: true, opacity: p.grande ? 0.35 : 0.5, depthWrite: false}));
    m.position.y = 0.6;
    m.renderOrder = 2;
    escena.add(m);
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p.p.map(([x, n]) => P(x, n, 0.8))), p.grande ? new THREE.LineBasicMaterial({color: "#e4573d"}) : borde);
    l.renderOrder = 3;
    escena.add(l);
  }
  cont.dataset.lotes = D.plano.poligonos.length;

  // La plaza como volumen blanco, dentro del solar comercial (misma posición que los renders)
  const cg = D.plano.poligonos.find((q) => q.grande);
  const nv = cg.p.length;
  let ie = 0;
  for (let i = 0; i < nv; i++) { const a = cg.p[i], b = cg.p[(i + 1) % nv], c = cg.p[ie], d = cg.p[(ie + 1) % nv]; if (a[0] + b[0] > c[0] + d[0]) ie = i; }
  const fa = cg.p[ie], fb = cg.p[(ie + 1) % nv];
  const lu = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]);
  const u = [(fb[0] - fa[0]) / lu, (fb[1] - fa[1]) / lu];          // a lo largo del frente, hacia el sur
  const v = u[1] < 0 ? [-u[1], u[0]] : [u[1], -u[0]];              // perpendicular, hacia el este
  const e = v[0] > 0 ? v : [-v[0], -v[1]];
  const cx = cg.p.reduce((s, q) => s + q[0], 0) / nv + 10 * u[0], cn = cg.p.reduce((s, q) => s + q[1], 0) / nv + 10 * u[1];
  const punto = (X, Y) => [cx + X * u[0] + Y * e[0], cn + X * u[1] + Y * e[1]];
  const caja = (X0, X1, Y0, Y1, alto, color, aristas) => {
    const g = new THREE.ExtrudeGeometry(forma([punto(X0, Y0), punto(X1, Y0), punto(X1, Y1), punto(X0, Y1)]), {depth: alto, bevelEnabled: false}).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({color}));
    m.position.y = 0.9;
    escena.add(m);
    if (aristas) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({color: "#4a5750"})));
  };
  caja(-40, 40, -65, 5, 11, "#f5f3ee", true);     // nave
  caja(-49, 45, 22, 60, 0.3, "#b9bdbb", false);   // parqueo

  // Tres etiquetas
  const capa = cont.querySelector(".etiquetas");
  const media = (zona) => { const ps = D.plano.poligonos.filter((q) => q.zona === zona).flatMap((q) => q.p); return [ps.reduce((a, q) => a + q[0], 0) / ps.length, ps.reduce((a, q) => a + q[1], 0) / ps.length]; };
  const circ = D.vias.filter((q) => q.c === "circ").flatMap((q) => q.p).reduce((a, q) => (Math.hypot(q[0], q[1] - 300) < Math.hypot(a[0], a[1] - 300) ? q : a));
  const etiquetas = [["Plaza comercial", media("comercial"), "#e4573d"], ["Mixtos", media("mixto"), "#b07d12"], ["Residencial", media("residencial"), "#2f6fcf"], ["Circunvalación", circ, "#f3b33d"]].map(([t, [x, n], c]) => {
    const el = document.createElement("span");
    el.className = "etq3d";
    el.textContent = t;
    el.style.borderColor = c;
    capa.appendChild(el);
    return {el, pos: P(x, n, 30)};
  });

  let tocado = false;
  control.addEventListener("start", () => (tocado = true));
  const inicial = camara.position.clone().sub(control.target);
  const medir = () => {
    const w = cont.clientWidth, h = cont.clientHeight;
    render.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    // en pantallas estrechas (móvil) la cámara se aleja para que quepa el proyecto entero
    if (!tocado) camara.position.copy(control.target).add(inicial.clone().multiplyScalar(Math.max(1, Math.pow(1.4 / camara.aspect, 0.85))));
  };
  new ResizeObserver(medir).observe(cont);
  medir();
  let visible = false;
  new IntersectionObserver((x) => (visible = x[0].isIntersecting)).observe(cont);
  const q = new THREE.Vector3();
  (function cuadro() {
    requestAnimationFrame(cuadro);
    if (!visible) return;
    control.update();
    render.render(escena, camara);
    const w = cont.clientWidth, h = cont.clientHeight;
    etiquetas.forEach((t) => {
      q.copy(t.pos).project(camara);
      t.el.style.opacity = q.z < 1 ? 1 : 0;
      t.el.style.transform = `translate(${((q.x + 1) / 2) * w}px, ${((1 - q.y) / 2) * h}px) translate(-50%, -100%)`;
    });
  })();
  cont.dataset.state = "listo";
  window.Vista3D = {camara, control};
})();
