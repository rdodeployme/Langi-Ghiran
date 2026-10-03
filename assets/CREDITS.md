# Credits and licences — Langi Ghiran 3D tour

## Imagery and terrain data
- Aerial imagery (near tier): Vicmap Basemap "Aerial" WMTS, © State of Victoria (Department of Transport and Planning), CC BY 4.0. https://www.land.vic.gov.au/maps-and-spatial/maps/vicmap-basemap
- Satellite imagery (far tier and the map's wide views): Esri World Imagery (Wayback), © Esri and its data partners, used under the ArcGIS terms of use.
- Elevation (near the site): Vicmap Elevation DEM 10m, © State of Victoria, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: resampled to the scene's height grid, shifted 7.15 m to match the outer terrain, feathered into the outer hills. https://discover.data.vic.gov.au/dataset/vicmap-elevation-dem-10m
- Elevation (outer hills, blended with the above): Terrarium terrain tiles (AWS Public Datasets / Mapzen), derived from SRTM and other public DEMs.

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

## Scanned 3D models (Poly Haven, CC0), decimated and texture-reduced for the web
- stone_fire_pit (Sebastian Platen) — camp fire pits
- outdoor_table_chair_set_01 (James Ray Cock) — bistro sets beside the tents
- Lantern_01 (Rajil Jose Macatangay) — table lanterns
- boulder_01 (Rico Cilliers), namaqualand_boulders_01 (Greg Zaal, Jenelle van Heerden) — tinted as granite on the summit and around the top station
- dead_tree_trunk, tree_stump_01 (Rob Tuytel) — fallen logs and stumps
- dry_branches_medium_01 (Rico Cilliers) — branch litter
- wild_rooibos_bush (James Ray Cock, Jenelle van Heerden) — understorey shrubs
https://polyhaven.com/models

## Libraries
- three.js r160 (MIT), loaded from unpkg.com, including the CSM, post-processing, RGBE and glTF loader addons.
- MapLibre GL JS (BSD-3-Clause) for the map.

## Built in-house
- The terrain shader, grass, trail and feature geometry, bell tents, decks, hut, stations, lift, riders, signage, furniture, cars, eucalypt models and impostor bakes are generated in `lg-game.js`.
- Concept films were generated with Kling via Higgsfield and are labelled as concept.
