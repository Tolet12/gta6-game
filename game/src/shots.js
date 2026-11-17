// Screenshot staging for ?shot=<scene>. Each scene poses a real gameplay
// state (positions, wanted level, mission phase, money) and lets the normal
// simulation run, so the captured frame is the actual game, never a mock-up.
// Scenes are deterministic for a given seed: cover, chase, mission, complete.

export function stageShot(game, name) {
  const hud = game.hud;
  game.startGame(true); // fresh state, title screen off, simulation live
  if (name === 'cover') {
    game.money = 320;
    game.missions.startNext(); // M1 active: objective + checkpoints on the HUD
    game.placePlayerInCar(game.starterCar, -52, -85, Math.PI / 2, 15);
    game.input.setKey('KeyW', true);
    hud.showBanner('M1 · FIRST RUN', 'Hit every checkpoint across town', 30);
  } else if (name === 'chase') {
    game.money = 410;
    // East along the beach road: open sand on one side, so the frame stays
    // readable even when the units start shoving.
    game.placePlayerInCar(game.starterCar, -120, 255, Math.PI / 2, 16);
    game.wanted.setStars(4);
    game.police.forceSpawnNear(game.player.car.pos, 3);
    // Two units right on the player's tail at matched speed, so they sit
    // between the chase camera (~12 behind) and the player car in frame.
    const [u0, u1] = game.police.units;
    if (u0) { u0.pos.set(-126, 0, 253.4); u0.heading = Math.PI / 2; u0.speed = 15.5; }
    if (u1) { u1.pos.set(-129.5, 0, 256.6); u1.heading = Math.PI / 2; u1.speed = 15.5; }
    game.input.setKey('KeyW', true);
  } else if (name === 'mission') {
    game.money = 120;
    game.player.pos.set(7, 0, 187);
    game.player.heading = 2.48; // facing the beacon at the start marker
    game.camYaw = -0.62; // camera south-west of the player, looking north-east
    // Locals and traffic around the beacon for a lived-in frame.
    game.peds.slice(0, 4).forEach((ped, i) => {
      ped.pos.set(11 + i * 3.5, 0, 176 - i * 4);
      ped.pickTarget();
    });
    const car = game.trafficDrivers[0]?.car;
    if (car) { car.pos.set(-14, 0, 170); car.heading = Math.PI / 2; }
  } else if (name === 'complete') {
    game.money = 450;
    game.missions.nextIndex = 2; game.missions.doneCount = 2;
    game.missions.phase = 'offered'; game.missions.refreshBeacon();
    game.placePlayerInCar(game.starterCar, -85, -38, 0, 12);
    game.input.setKey('KeyW', true);
    hud.showBanner('MISSION COMPLETE', '+$300 — Hot Package delivered', 30);
  }
}
