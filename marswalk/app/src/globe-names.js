// Place names for the Mars globe (IAU nomenclature, planetocentric latitude, east longitude in degrees, -180..180).
// lv 1: great regions, shown always; lv 2: volcanoes, canyons, plains and big craters; lv 3: smaller features and landing sites.
// k: 'r' region, 'm' mountain, 'c' crater, 'v' valley, 's' landing site.
export const NAMES = [
  ['Tharsis', 2, -105, 1, 'r'], ['Olympus Mons', 18.6, -133.8, 1, 'm'], ['Valles Marineris', -13.9, -59.2, 1, 'v'], ['Hellas Planitia', -42.4, 70.5, 1, 'r'],
  ['Argyre Planitia', -49.7, -43.4, 1, 'r'], ['Utopia Planitia', 46.7, 117.5, 1, 'r'], ['Arabia Terra', 22.8, 5, 1, 'r'], ['Elysium', 25, 147.2, 1, 'r'],
  ['Isidis Planitia', 12.9, 87, 1, 'r'], ['Syrtis Major', 8.4, 69.5, 1, 'r'], ['Acidalia Planitia', 46.7, -22, 1, 'r'], ['Amazonis Planitia', 24.8, -164, 1, 'r'],
  ['Chryse Planitia', 28.4, -40, 1, 'r'], ['Noachis Terra', -45, -5, 1, 'r'], ['Terra Cimmeria', -32, 145, 1, 'r'], ['Terra Sabaea', 2, 42, 1, 'r'],
  ['Vastitas Borealis', 70, -60, 1, 'r'], [{ it: 'Calotta polare nord', en: 'North polar cap' }, 84, 30, 1, 'r'], [{ it: 'Calotta polare sud', en: 'South polar cap' }, -82, -30, 1, 'r'],
  ['Ascraeus Mons', 11.8, -104.5, 2, 'm'], ['Pavonis Mons', 1.5, -113, 2, 'm'], ['Arsia Mons', -8.3, -120.5, 2, 'm'], ['Alba Mons', 40.5, -109.6, 2, 'm'],
  ['Noctis Labyrinthus', -7, -102, 2, 'v'], ['Elysium Mons', 25, 147.2, 2, 'm'], ['Hecates Tholus', 32, 150.2, 2, 'm'], ['Gale', -5.4, 137.8, 2, 'c'],
  ['Gusev', -14.5, 175.4, 2, 'c'], ['Meridiani Planum', 0.2, -2.5, 2, 'r'], ['Huygens', -14, 55.6, 2, 'c'], ['Schiaparelli', -2.7, 16.7, 2, 'c'],
  ['Cerberus Fossae', 11.3, 166.4, 2, 'v'], ['Nili Fossae', 22, 76, 2, 'v'], ['Ares Vallis', 10.3, -25.8, 2, 'v'], ['Kasei Valles', 24.6, -65, 2, 'v'],
  ['Tyrrhena Terra', -15, 90, 2, 'r'], ['Lunae Planum', 10, -67, 2, 'r'], ['Solis Planum', -25, -90, 2, 'r'], ['Hesperia Planum', -21, 110, 2, 'r'],
  ['Tempe Terra', 39, -71, 2, 'r'], ['Promethei Terra', -64, 97, 2, 'r'], ['Aonia Terra', -60, -97, 2, 'r'], ['Malea Planum', -65, 65, 2, 'r'], ['Lyot', 50.5, 29.3, 2, 'c'],
  ['Holden', -26.4, -34, 3, 'c'], ['Eberswalde', -24, -33, 3, 'c'], ['Mawrth Vallis', 22.6, -16.5, 3, 'v'], ['Ma\'adim Vallis', -21.6, 177.5, 3, 'v'],
  ['Apollinaris Mons', -9.3, 174.4, 3, 'm'], ['Dao Vallis', -38, 93, 3, 'v'], ['Korolev', 73, 165, 3, 'c'], ['Hale', -35.7, -36.4, 3, 'c'],
  ['Iani Chaos', -2.6, -17.6, 3, 'v'], ['Aram Chaos', 2.6, -21.5, 3, 'v'], ['Medusae Fossae', -3, -163, 3, 'v'], ['Uzboi Vallis', -29.6, -36.6, 3, 'v'],
  ['Mangala Valles', -11.3, -151, 3, 'v'], ['Tyrrhenus Mons', -21.4, 106.5, 3, 'm'], ['Biblis Tholus', 2.7, -124.6, 3, 'm'], ['Ophir Chasma', -4, -72.5, 3, 'v'],
  ['Viking 1', 22.27, -47.95, 3, 's'], ['Viking 2', 47.64, -134.29, 3, 's'], ['Pathfinder', 19.13, -33.22, 3, 's'], ['Spirit', -14.57, 175.47, 3, 's'],
  ['Opportunity', -1.95, -5.53, 3, 's'], ['Phoenix', 68.22, -125.75, 3, 's'], ['Curiosity', -4.59, 137.44, 3, 's'], ['InSight', 4.5, 135.62, 3, 's'],
];
