// World and gameplay constants for NEON PALMS.
// Everything tunable lives here so the other modules stay focused on logic.

export const CONFIG = {
  // City layout: roads run on a square grid. ROAD_COORDS are the centre lines
  // of every street, on both axes, so intersections are (coord, coord) pairs.
  roadCoords: [-255, -170, -85, 0, 85, 170, 255],
  roadWidth: 15,
  sidewalkWidth: 3.4,
  cityHalf: 292, // playable ground half-extent (beach starts past +z)
  beachZ: 292, // sand strip begins here on the +z edge
  waterZ: 330, // water plane begins here
  worldBound: 318, // hard clamp for cars and the player

  // Player
  walkSpeed: 5.2,
  runSpeed: 9.0,
  playerRadius: 0.55,
  maxHealth: 100,

  // Cars
  carAccel: 16,
  carBrake: 30,
  carReverseAccel: 9,
  carMaxSpeed: 34,
  carMaxReverse: -10,
  carDrag: 0.55,
  carRadius: 1.55,
  carMaxHealth: 100,

  // Wanted / police
  sightRange: 55, // crimes only count when a witness is this close
  starDecaySeconds: 12, // hidden this long -> lose one star
  bustFillSeconds: 2.2, // time a nearby unit needs to bust a slow player
  bustRange: 7,

  // Economy
  wastedCost: 100,
  bustedCost: 150,

  // Spawn points
  playerSpawn: { x: 6, z: 196 },
  hospital: { x: -248, z: 248 }, // south-west corner block
  policeStation: { x: 248, z: -248 }, // north-east corner block
  missionMarker: { x: 14, z: 178 }, // start marker, just north of spawn
  hideout: { x: 238, z: 238 },
};

// The three story jobs, in order. Points are intersections or landmarks.
export const MISSIONS = [
  {
    id: 'first-run',
    title: 'M1 · First Run',
    name: 'First Run',
    reward: 150,
    timeLimit: 150,
    brief: 'A nervous shopkeeper needs a driver. Hit every checkpoint across town before the clock runs out.',
    checkpoints: [
      { x: -170, z: 85 },
      { x: 85, z: 0 },
      { x: -85, z: -170 },
      { x: 170, z: -85 },
    ],
  },
  {
    id: 'hot-package',
    title: 'M2 · Hot Package',
    name: 'Hot Package',
    reward: 300,
    timeLimit: 180,
    brief: 'Pick up the glowing package by the north market and drop it at the marina gate. Expect attention.',
    pickup: { x: -238, z: -238 },
    dropoff: { x: 170, z: 255 },
    pickupStars: 2,
  },
  {
    id: 'the-getaway',
    title: 'M3 · The Getaway',
    name: 'The Getaway',
    reward: 500,
    timeLimit: 0, // no clock: the heat is the challenge
    brief: 'Every unit in Palmera Bay is looking for you. Reach the hideout, then lose the heat while you stay near it.',
    stars: 3,
    hideout: { x: 238, z: 238 },
  },
];

export const CAR_COLORS = [0xd94f3d, 0x2e7fc2, 0xf2b134, 0x3fa46a, 0xe8e3d8, 0x7a4fa3, 0x22262b, 0xe2703a, 0x4fb8c9];
export const BUILDING_PALETTES = [
  ['#f7e3c3', '#e8b04b'], ['#fce8e9', '#d96c75'], ['#dff3f0', '#3d9b8f'], ['#e9e4f5', '#7a68b8'],
  ['#fdf6d8', '#c9a227'], ['#f3e0cf', '#b87355'], ['#e2eef7', '#4a7fb5'], ['#fbe3f0', '#c65b96'],
];
export const SHOP_NAMES = ['Coco Loco', 'Palmera Deli', 'Sunset Tapes', 'Marina Bait', 'Tropicana Gym', 'Cafe Ola', 'Neon Nails', 'Bay Books', 'Palm Pharmacy', 'Salsa Records', 'Hotel Brisa', 'Taco Marea'];
