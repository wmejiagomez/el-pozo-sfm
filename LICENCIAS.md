---
proyecto: editor-pro-max
tipo: guia
fecha: 2026-09-30
tags: [licencias, el-pozo, render]
---

# Licencias de los recursos de El Pozo (propuesta 2)

Comprobado el 30/09/2026 abriendo la ficha de cada recurso en polyhaven.com y su entrada en
`api.polyhaven.com/info/<id>`; Poly Haven declara todo su contenido CC0 (https://polyhaven.com/license).

## Poly Haven (CC0 1.0, dominio público; no exige atribución)
| Recurso | Uso | Autor(es) según la ficha | Ficha |
|---|---|---|---|
| Asphalt 02 | asfalto de calles y parqueos | Rob Tuytel | https://polyhaven.com/a/asphalt_02 |
| Concrete Floor 02 | hormigón, cerca | Rob Tuytel | https://polyhaven.com/a/concrete_floor_02 |
| Corrugated Iron 02 | techo de la nave | Jenelle van Heerden, Sergej Majboroda | https://polyhaven.com/a/corrugated_iron_02 |
| Painted Plaster Wall | fachadas | Amal Kumar | https://polyhaven.com/a/painted_plaster_wall |
| Aerial Grass Rock | césped | Rob Tuytel | https://polyhaven.com/a/aerial_grass_rock |
| Brown Mud Leaves 01 | tierra | Rob Tuytel | https://polyhaven.com/a/brown_mud_leaves_01 |
| Kloofendal 48d Partly Cloudy (Pure Sky) | cielo HDRI | Greg Zaal, Jarod Guest | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| Island Tree 01, 02 y 03 | árboles | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/island_tree_01 (y _02, _03) |
| Tree Small 02 | árboles | Rico Cilliers | https://polyhaven.com/a/tree_small_02 |
| Street Lamp 02 | solo en los renders de la primera vuelta (ya no se usa) | Josh Dean | https://polyhaven.com/a/street_lamp_02 |

## Hecho en casa (sin licencia de terceros)
Coches, farolas, casas, locales, aceras, cerca y la nave se generan con código propio en
`render3d/escena_blender.py`. El terreno sale de las fotos de dron de Werner (ODM / ortofoto).

## Otros componentes
- **Blender 4.2 LTS** (GPL) solo como programa que corre los renders; no se distribuye con el sitio.
- **Three.js** (MIT) por CDN en la página.
- **OpenStreetMap** (ODbL): © colaboradores de OpenStreetMap, atribuido en la maqueta.
- **Sentinel-2 cloudless, EOX: RETIRADO del sitio (30/09/2026, decisión de Werner).** No se pudo confirmar que la
  capa `s2cloudless_3857` fuera la de 2016 (CC BY 4.0); de 2018 en adelante es no comercial. El fondo de
  `assets/mapa_base.jpg` ahora es un color liso con las calles y edificios de OpenStreetMap
  (`scripts/mapa_base.py`); el sitio ya no contiene ni deriva de datos Sentinel-2. La ortofoto es propia (dron).
