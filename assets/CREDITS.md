# Credits and licences — Langi Ghiran 3D tour

## Imagery and terrain data
- Aerial imagery (near tier): Vicmap Basemap "Aerial" WMTS, © State of Victoria (Department of Transport and Planning), CC BY 4.0. https://www.land.vic.gov.au/maps-and-spatial/maps/vicmap-basemap
- Satellite imagery (far tier and the map's wide views): Esri World Imagery (Wayback), © Esri and its data partners, used under the ArcGIS terms of use.
- Elevation: Terrarium terrain tiles (AWS Public Datasets / Mapzen), derived from SRTM and other public DEMs.

## Sky and environment lighting (Poly Haven, CC0)
- qwantani_noon_puresky — day sky and environment map
- qwantani_sunset_puresky — dusk sky and environment map
- kloppenheim_02_puresky — night sky and environment map
https://polyhaven.com/hdris

## PBR ground and material textures (Poly Haven, CC0)
- brown_mud_dry (dirt), gravel_floor_02 (gravel), withered_grass (dry grass), forrest_ground_01 (woodland floor), rocky_trail_02 (trail surface)
- wood_floor_deck (decks and tables), weathered_plank_siding (hut cladding, posts), corrugated_iron_02 (roofs, water tank), denim_fabric_03 (tinted as tent canvas)
- eucalyptus_bark, bark_bluegum (tree trunks; bark_bluegum also tinted as granite)
https://polyhaven.com/textures

## Libraries
- three.js r160 (MIT), loaded from unpkg.com, including the CSM, post-processing and RGBE loader addons.
- MapLibre GL JS (BSD-3-Clause) for the map.

## Built in-house
- The terrain shader, grass, trail and feature geometry, bell tents, decks, hut, stations, lift, riders, people, signage, furniture, cars, eucalypt models and impostor bakes are generated in `lg-game.js`.
- Concept films were generated with Kling via Higgsfield and are labelled as concept.
