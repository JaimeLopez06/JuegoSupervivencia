const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const frame = document.querySelector(".arena-frame");
const introScreen = document.querySelector("#intro-screen");
const overlay = document.querySelector("#game-overlay");
const overlayContent = document.querySelector("#overlay-content");
const pauseButton = document.querySelector("#pause-button");
const soundButton = document.querySelector("#sound-button");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const STAGE_SECONDS = 32;
const STAGE_NAMES = ["Despertar", "Pasillos", "Cuarentena", "Núcleo", "Última señal"];
const keys = new Set();
const upgrades = [
  { id: "rapid", icon: "↯", title: "Disparo veloz", detail: "Dispara un 25% más rápido.", apply: () => { player.fireRate = Math.max(0.2, player.fireRate * 0.75); } },
  { id: "power", icon: "✳", title: "Carga cinética", detail: "Tus proyectiles hacen el doble de daño.", apply: () => { player.damage += 1; } },
  { id: "repair", icon: "+", title: "Reparar traje", detail: "Recupera una unidad de integridad.", apply: () => { player.health = Math.min(player.maxHealth, player.health + 1); } },
  { id: "speed", icon: "»", title: "Impulso ligero", detail: "Muévete un 15% más rápido.", apply: () => { player.speed *= 1.15; } },
  { id: "range", icon: "◎", title: "Pulso expansivo", detail: "Aumenta el alcance del disparo.", apply: () => { player.range += 95; } },
];

let player;
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let particles = [];
let pickups = [];
let score = 0;
let bestScore = loadBestScore();
let level = 1;
let stageTime = STAGE_SECONDS;
let spawnClock = 0;
let elapsed = 0;
let mode = "title";
let lastFrame = 0;
let soundOn = false;
let audioContext;
let pointerMove = { x: 0, y: 0 };
let fireHeld = false;
let joystickPointer = null;
let dashCooldown = 0;

document.querySelector("#best-score").textContent = formatScore(bestScore);

function loadBestScore() {
  try { return Number(localStorage.getItem("ultima-luz-best") || 0); }
  catch { return 0; }
}

function formatScore(value) {
  return String(Math.max(0, Math.floor(value))).padStart(6, "0");
}

function setMode(nextMode) {
  mode = nextMode;
  const active = nextMode === "playing";
  overlay.classList.toggle("is-hidden", active || nextMode === "title");
  introScreen.hidden = nextMode !== "title";
  frame.classList.toggle("is-playing", active);
  pauseButton.disabled = !active && nextMode !== "paused";
  pauseButton.setAttribute("aria-label", nextMode === "paused" ? "Continuar partida" : "Pausar partida");
  pauseButton.title = nextMode === "paused" ? "Continuar partida" : "Pausar partida";
  document.querySelector("#system-status").textContent = active ? "SEÑAL ACTIVA" : nextMode === "paused" ? "PAUSA" : nextMode === "gameover" ? "SEÑAL PERDIDA" : nextMode === "won" ? "SEÑAL RECUPERADA" : "EN ESPERA";
  document.querySelector(".status-dot").classList.toggle("live", active);
}

function showTitle() {
  setMode("title");
  document.querySelector("#start-button").addEventListener("click", startGame);
}

function startGame() {
  score = 0;
  level = 1;
  enemies = [];
  projectiles = [];
  enemyProjectiles = [];
  particles = [];
  pickups = [];
  player = { x: WIDTH / 2, y: HEIGHT / 2, radius: 11, speed: 185, health: 3, maxHealth: 3, fireRate: 0.62, fireClock: 0, damage: 1, range: 355, invulnerable: 0, aim: 0 };
  fireHeld = false;
  dashCooldown = 0;
  updateHud();
  startStage();
}

function startStage() {
  stageTime = STAGE_SECONDS;
  spawnClock = 0.4;
  enemies = [];
  projectiles = [];
  enemyProjectiles = [];
  pickups = [];
  setMode("playing");
  overlayContent.innerHTML = "";
}

function pauseGame() {
  if (mode === "playing") {
    setMode("paused");
    overlayContent.innerHTML = `<p class="overlay-kicker">MISIÓN EN PAUSA</p><h2 class="overlay-title">TOMA<br><span>AIRE</span></h2><p class="overlay-copy">La estación sigue esperando.</p><button class="primary-button" id="resume-button" type="button">CONTINUAR <span class="button-arrow" aria-hidden="true">→</span></button>`;
    document.querySelector("#resume-button").addEventListener("click", () => setMode("playing"));
  } else if (mode === "paused") {
    setMode("playing");
  }
}

function endGame(victory = false) {
  setMode(victory ? "won" : "gameover");
  if (score > bestScore) {
    bestScore = score;
    try { localStorage.setItem("ultima-luz-best", String(bestScore)); } catch {}
  }
  document.querySelector("#best-score").textContent = formatScore(bestScore);
  overlayContent.innerHTML = `
    <p class="overlay-kicker">${victory ? "TRANSMISIÓN RESTABLECIDA" : "FIN DE TRANSMISIÓN"}</p>
    <h2 class="overlay-title">${victory ? "SEÑAL<br><span>ENVIADA</span>" : "NO HAY<br><span>SEÑAL</span>"}</h2>
    <p class="overlay-copy">${victory ? "La estación vuelve a respirar. Alguien ha recibido tu mensaje." : "La estación se ha quedado en silencio. La próxima vez llegarás más lejos."}</p>
    <div class="overlay-stats"><span class="overlay-stat">SEÑAL RECUPERADA<strong>${formatScore(score)}</strong></span><span class="overlay-stat">FASE ALCANZADA<strong>${String(Math.min(level, 5)).padStart(2, "0")} / 05</strong></span></div>
    <button class="primary-button" id="retry-button" type="button">${victory ? "JUGAR DE NUEVO" : "INTENTAR DE NUEVO"} <span class="button-arrow" aria-hidden="true">↻</span></button>`;
  document.querySelector("#retry-button").addEventListener("click", startGame);
}

function showUpgrade() {
  setMode("upgrade");
  const choices = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);
  overlayContent.innerHTML = `
    <p class="overlay-kicker">FASE ${String(level).padStart(2, "0")} COMPLETADA</p>
    <h2 class="overlay-title">ELIGE<br><span>UNA MEJORA</span></h2>
    <p class="overlay-copy">La señal se debilita. Refuerza tu equipo antes de avanzar.</p>
    <div class="upgrade-grid">${choices.map((upgrade) => `<button class="upgrade-card" type="button" data-upgrade="${upgrade.id}"><span class="upgrade-icon">${upgrade.icon}</span><strong>${upgrade.title}</strong><small>${upgrade.detail}</small></button>`).join("")}</div>`;
  overlayContent.querySelectorAll("[data-upgrade]").forEach((button) => {
    button.addEventListener("click", () => {
      choices.find((upgrade) => upgrade.id === button.dataset.upgrade).apply();
      level += 1;
      if (level > 5) endGame(true);
      else {
        updateHud();
        startStage();
      }
    });
  });
}

function updateHud() {
  document.querySelector("#score-value").textContent = formatScore(score);
  document.querySelector("#level-value").textContent = String(Math.min(level, 5)).padStart(2, "0");
  document.querySelector(".panel-index").textContent = `${String(Math.min(level, 5)).padStart(2, "0")} / 05`;
  document.querySelector("#phase-name").textContent = STAGE_NAMES[Math.min(level - 1, 4)];
  document.querySelector("#health-value").textContent = `${String(player?.health ?? 3).padStart(2, "0")} / ${String(player?.maxHealth ?? 3).padStart(2, "0")}`;
  document.querySelector("#health-pips").setAttribute("aria-label", `${player?.health ?? 3} de ${player?.maxHealth ?? 3} unidades de integridad`);
  document.querySelectorAll("#health-pips span").forEach((pip, index) => pip.classList.toggle("is-empty", index >= (player?.health ?? 3)));
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  const padding = 25;
  const enemy = { x: edge === 0 ? -padding : edge === 1 ? WIDTH + padding : Math.random() * WIDTH, y: edge === 2 ? -padding : edge === 3 ? HEIGHT + padding : Math.random() * HEIGHT, radius: 10, health: 1, speed: 48 + level * 5, damageClock: 0, shotClock: 1.2 + Math.random(), type: "drifter" };
  const roll = Math.random();
  if (level >= 2 && roll > 0.72) Object.assign(enemy, { radius: 15, health: 3, speed: 31 + level * 3, type: "brute" });
  else if (level >= 2 && roll > 0.5) Object.assign(enemy, { radius: 11, health: 2, speed: 26 + level * 3, type: "shooter" });
  else if (level >= 3 && roll < 0.2) Object.assign(enemy, { radius: 8, health: 1, speed: 82 + level * 4, type: "stalker" });
  enemies.push(enemy);
}

function shootAtNearest() {
  let target = null;
  let nearest = player.range;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance < nearest) { target = enemy; nearest = distance; }
  }
  if (!target) return;
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  player.aim = angle;
  projectiles.push({ x: player.x + Math.cos(angle) * 12, y: player.y + Math.sin(angle) * 12, vx: Math.cos(angle) * 390, vy: Math.sin(angle) * 390, life: 0.9, damage: player.damage });
  playTone(510, 0.035, 0.012);
}

function dash() {
  if (mode !== "playing" || dashCooldown > 0) return;
  const movement = getMovement();
  let dx = movement.x;
  let dy = movement.y;
  if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(player.aim); dy = Math.sin(player.aim); }
  const magnitude = Math.hypot(dx, dy) || 1;
  player.x = clamp(player.x + dx / magnitude * 105, 20, WIDTH - 20);
  player.y = clamp(player.y + dy / magnitude * 105, 20, HEIGHT - 20);
  player.invulnerable = 0.48;
  dashCooldown = 2.4;
  burst(player.x, player.y, "#c8fa70", 8);
  playTone(190, 0.08, 0.035);
}

function getMovement() {
  let x = Number(keys.has("ArrowRight") || keys.has("d") || keys.has("D")) - Number(keys.has("ArrowLeft") || keys.has("a") || keys.has("A"));
  let y = Number(keys.has("ArrowDown") || keys.has("s") || keys.has("S")) - Number(keys.has("ArrowUp") || keys.has("w") || keys.has("W"));
  x += pointerMove.x;
  y += pointerMove.y;
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return { x, y };
}

function update(delta) {
  elapsed += delta;
  stageTime = Math.max(0, stageTime - delta);
  dashCooldown = Math.max(0, dashCooldown - delta);
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  player.fireClock -= delta;
  spawnClock -= delta;

  const movement = getMovement();
  player.x = clamp(player.x + movement.x * player.speed * delta, 20, WIDTH - 20);
  player.y = clamp(player.y + movement.y * player.speed * delta, 20, HEIGHT - 20);

  const spawnRate = Math.max(0.42, 1.55 - level * 0.16);
  if (spawnClock <= 0 && enemies.length < 18 + level * 3) { spawnEnemy(); spawnClock = spawnRate * (0.72 + Math.random() * 0.5); }
  if ((fireHeld || keys.has("f") || keys.has("F")) && player.fireClock <= 0) { shootAtNearest(); player.fireClock = player.fireRate; }

  for (const projectile of projectiles) {
    projectile.x += projectile.vx * delta;
    projectile.y += projectile.vy * delta;
    projectile.life -= delta;
    for (const enemy of enemies) {
      if (enemy.health > 0 && Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < enemy.radius + 4) {
        enemy.health -= projectile.damage;
        projectile.life = 0;
        burst(projectile.x, projectile.y, "#c8fa70", 3);
        if (enemy.health <= 0) defeatEnemy(enemy);
        break;
      }
    }
  }
  projectiles = projectiles.filter((projectile) => projectile.life > 0 && projectile.x > -20 && projectile.x < WIDTH + 20 && projectile.y > -20 && projectile.y < HEIGHT + 20);

  for (const projectile of enemyProjectiles) {
    projectile.x += projectile.vx * delta;
    projectile.y += projectile.vy * delta;
    projectile.life -= delta;
    if (Math.hypot(projectile.x - player.x, projectile.y - player.y) < player.radius + projectile.radius) {
      projectile.life = 0;
      if (player.invulnerable <= 0 && hitPlayer()) return;
    }
  }
  enemyProjectiles = enemyProjectiles.filter((projectile) => projectile.life > 0 && projectile.x > -20 && projectile.x < WIDTH + 20 && projectile.y > -20 && projectile.y < HEIGHT + 20);

  for (const enemy of enemies) {
    if (enemy.health <= 0) continue;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    let movementScale = 1;
    if (enemy.type === "shooter") {
      if (distance < 205) movementScale = -0.65;
      else if (distance < 275) movementScale = 0;
      enemy.shotClock -= delta;
      if (enemy.shotClock <= 0 && distance < 450) {
        enemyProjectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * (175 + level * 7), vy: Math.sin(angle) * (175 + level * 7), radius: 5, life: 2.5 });
        enemy.shotClock = 1.8 + Math.random() * 0.55;
        playTone(230, 0.05, 0.012);
      }
    }
    enemy.x += Math.cos(angle) * enemy.speed * movementScale * delta;
    enemy.y += Math.sin(angle) * enemy.speed * movementScale * delta;
    enemy.damageClock = Math.max(0, enemy.damageClock - delta);
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + player.radius && enemy.damageClock <= 0 && player.invulnerable <= 0) {
      enemy.damageClock = 0.7;
      if (hitPlayer()) return;
    }
  }
  enemies = enemies.filter((enemy) => enemy.health > 0);

  for (const pickup of pickups) {
    pickup.life -= delta;
    pickup.phase += delta * 4;
    if (Math.hypot(pickup.x - player.x, pickup.y - player.y) < player.radius + 10) {
      pickup.life = 0;
      score += 25;
      burst(pickup.x, pickup.y, "#79d8cf", 5);
      updateHud();
    }
  }
  pickups = pickups.filter((pickup) => pickup.life > 0);
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  }
  particles = particles.filter((particle) => particle.life > 0);

  document.querySelector("#timer-value").textContent = `00:${String(Math.ceil(stageTime)).padStart(2, "0")}`;
  document.querySelector("#phase-progress").style.width = `${((STAGE_SECONDS - stageTime) / STAGE_SECONDS) * 100}%`;
  if (stageTime <= 0) {
    score += level * 100;
    updateHud();
    showUpgrade();
  }
}

function defeatEnemy(enemy) {
  score += enemy.type === "brute" ? 45 : 20;
  pickups.push({ x: enemy.x, y: enemy.y, life: 5, phase: 0 });
  burst(enemy.x, enemy.y, enemy.type === "brute" ? "#ff7868" : "#79d8cf", 9);
  playTone(290, 0.06, 0.018);
  updateHud();
}

function hitPlayer() {
  player.health -= 1;
  player.invulnerable = 0.85;
  burst(player.x, player.y, "#ff7868", 11);
  playTone(110, 0.12, 0.045);
  updateHud();
  if (player.health <= 0) {
    endGame(false);
    return true;
  }
  return false;
}

function burst(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 100;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.2 + Math.random() * 0.35, color, size: 2 + Math.floor(Math.random() * 3) });
  }
}

function draw() {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#182125";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawFloor();
  drawHazards();
  for (const pickup of pickups) drawPickup(pickup);
  for (const projectile of projectiles) {
    context.fillStyle = "#e2ffae";
    context.fillRect(Math.round(projectile.x - 3), Math.round(projectile.y - 3), 6, 6);
    context.fillStyle = "#c8fa7066";
    context.fillRect(Math.round(projectile.x - 6), Math.round(projectile.y - 6), 12, 12);
  }
  for (const projectile of enemyProjectiles) {
    context.fillStyle = "#ff9a77";
    context.fillRect(Math.round(projectile.x - 3), Math.round(projectile.y - 3), 6, 6);
    context.fillStyle = "#ff786866";
    context.fillRect(Math.round(projectile.x - 7), Math.round(projectile.y - 7), 14, 14);
  }
  for (const enemy of enemies) if (enemy.health > 0) drawEnemy(enemy);
  for (const particle of particles) {
    context.globalAlpha = Math.max(0, Math.min(1, particle.life * 3));
    context.fillStyle = particle.color;
    context.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
  }
  context.globalAlpha = 1;
  if (player) drawPlayer();
  drawVignette();
}

function drawFloor() {
  context.fillStyle = "#263035";
  for (let x = 24; x < WIDTH; x += 48) {
    for (let y = 24; y < HEIGHT; y += 48) {
      if (((x / 48 + y / 48) | 0) % 2 === 0) context.fillRect(x, y, 1, 1);
    }
  }
  context.strokeStyle = "#b8cfbc0d";
  context.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 48) { context.beginPath(); context.moveTo(x + .5, 0); context.lineTo(x + .5, HEIGHT); context.stroke(); }
  for (let y = 0; y <= HEIGHT; y += 48) { context.beginPath(); context.moveTo(0, y + .5); context.lineTo(WIDTH, y + .5); context.stroke(); }
  context.fillStyle = "#313b3c";
  context.fillRect(22, 22, WIDTH - 44, 3);
  context.fillRect(22, HEIGHT - 25, WIDTH - 44, 3);
  context.fillRect(22, 22, 3, HEIGHT - 44);
  context.fillRect(WIDTH - 25, 22, 3, HEIGHT - 44);
  context.fillStyle = "#81a58c";
  for (const [x, y, sx, sy] of [[22, 22, 1, 1], [WIDTH - 25, 22, -1, 1], [22, HEIGHT - 25, 1, -1], [WIDTH - 25, HEIGHT - 25, -1, -1]]) {
    context.fillRect(x + (sx < 0 ? -10 : 3), y + (sy < 0 ? -10 : 3), 7, 2);
    context.fillRect(x + (sx < 0 ? -10 : 3), y + (sy < 0 ? -10 : 3), 2, 7);
  }
}

function drawHazards() {
  const pulse = 0.55 + Math.sin(elapsed * 2) * 0.18;
  context.globalAlpha = pulse;
  context.fillStyle = "#ff7868";
  context.fillRect(95, 94, 5, 5);
  context.fillRect(WIDTH - 100, HEIGHT - 99, 5, 5);
  context.globalAlpha = 1;
  context.strokeStyle = "#4e5a57";
  context.strokeRect(72.5, 72.5, 52, 52);
  context.strokeRect(WIDTH - 124.5, HEIGHT - 124.5, 52, 52);
  context.fillStyle = "#293331";
  context.fillRect(78, 78, 41, 41);
  context.fillRect(WIDTH - 119, HEIGHT - 119, 41, 41);
  context.fillStyle = "#59685a";
  context.fillRect(91, 91, 15, 15);
  context.fillRect(WIDTH - 106, HEIGHT - 106, 15, 15);
}

function drawPlayer() {
  const blink = player.invulnerable > 0 && Math.floor(elapsed * 17) % 2 === 0;
  if (blink) return;
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  context.fillStyle = "#718548";
  context.fillRect(x - 10, y - 9, 20, 19);
  context.fillStyle = "#c8fa70";
  context.fillRect(x - 7, y - 12, 14, 4);
  context.fillRect(x - 7, y + 9, 14, 4);
  context.fillRect(x - 12, y - 5, 4, 11);
  context.fillRect(x + 8, y - 5, 4, 11);
  context.fillStyle = "#1c2826";
  context.fillRect(x - 5, y - 4, 10, 9);
  context.fillStyle = "#efffbf";
  context.fillRect(x - 3, y - 2, 6, 4);
  context.save();
  context.translate(x, y);
  context.rotate(player.aim);
  context.fillStyle = "#e5f5c6";
  context.fillRect(6, -2, 10, 4);
  context.restore();
}

function drawEnemy(enemy) {
  const x = Math.round(enemy.x);
  const y = Math.round(enemy.y);
  const color = enemy.type === "brute" ? "#df7367" : enemy.type === "stalker" ? "#b594cf" : enemy.type === "shooter" ? "#e5aa68" : "#78bcb0";
  context.fillStyle = "#10191b";
  context.fillRect(x - enemy.radius - 2, y - enemy.radius - 2, (enemy.radius + 2) * 2, (enemy.radius + 2) * 2);
  context.fillStyle = color;
  context.fillRect(x - enemy.radius, y - enemy.radius + 3, enemy.radius * 2, enemy.radius * 2 - 6);
  context.fillRect(x - enemy.radius + 3, y - enemy.radius, enemy.radius * 2 - 6, enemy.radius * 2);
  context.fillStyle = "#162022";
  context.fillRect(x - 5, y - 2, 3, 4);
  context.fillRect(x + 2, y - 2, 3, 4);
  if (enemy.type === "brute") {
    context.fillStyle = "#ffc1a4";
    context.fillRect(x - 7, y - enemy.radius - 5, Math.max(3, 14 * enemy.health / 3), 2);
  }
  if (enemy.type === "shooter") {
    context.fillStyle = "#39251e";
    context.fillRect(x - 5, y - 2, 3, 4);
    context.fillRect(x + 2, y - 2, 3, 4);
  }
}

function drawPickup(pickup) {
  const bob = Math.sin(pickup.phase) * 2;
  const x = Math.round(pickup.x);
  const y = Math.round(pickup.y + bob);
  context.fillStyle = "#79d8cf33";
  context.fillRect(x - 8, y - 8, 16, 16);
  context.fillStyle = "#9df4dc";
  context.fillRect(x - 3, y - 6, 6, 12);
  context.fillRect(x - 6, y - 3, 12, 6);
}

function drawVignette() {
  const gradient = context.createRadialGradient(WIDTH / 2, HEIGHT / 2, 165, WIDTH / 2, HEIGHT / 2, 620);
  gradient.addColorStop(0, "#08101100");
  gradient.addColorStop(1, "#071011a8");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function playTone(frequency, duration, volume) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {}
}

function loop(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000 || 0, 0.04);
  lastFrame = timestamp;
  if (mode === "playing") update(delta);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  keys.add(event.key);
  if (event.key.toLowerCase() === "f") event.preventDefault();
  if (event.code === "Space" && !event.repeat) dash();
  if (event.key === "Escape") pauseGame();
});
window.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("blur", () => { keys.clear(); fireHeld = false; if (mode === "playing") pauseGame(); });
pauseButton.addEventListener("click", pauseGame);
document.querySelector("#dash-button").addEventListener("pointerdown", (event) => { event.preventDefault(); dash(); });
const fireButton = document.querySelector("#fire-button");
soundButton.addEventListener("click", () => {
  soundOn = !soundOn;
  soundButton.setAttribute("aria-pressed", String(soundOn));
  soundButton.setAttribute("aria-label", soundOn ? "Desactivar sonido" : "Activar sonido");
  soundButton.title = soundOn ? "Desactivar sonido" : "Activar sonido";
  playTone(520, 0.08, 0.025);
});

function startFiring(event) {
  if (mode !== "playing" || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  fireHeld = true;
  event.currentTarget.setPointerCapture(event.pointerId);
}
function stopFiring(event) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  fireHeld = false;
}
canvas.addEventListener("pointerdown", startFiring);
fireButton.addEventListener("pointerdown", startFiring);
canvas.addEventListener("pointerup", stopFiring);
canvas.addEventListener("pointercancel", stopFiring);
fireButton.addEventListener("pointerup", stopFiring);
fireButton.addEventListener("pointercancel", stopFiring);

joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystick.addEventListener("pointermove", (event) => { if (joystickPointer === event.pointerId) updateJoystick(event); });
function resetJoystick() {
  joystickPointer = null;
  pointerMove = { x: 0, y: 0 };
  joystickKnob.style.transform = "translate(0, 0)";
}
joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);

function updateJoystick(event) {
  const bounds = joystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maxDistance = bounds.width * 0.28;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const length = Math.hypot(dx, dy);
  if (length > maxDistance) { dx = dx / length * maxDistance; dy = dy / length * maxDistance; }
  pointerMove = { x: dx / maxDistance, y: dy / maxDistance };
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

showTitle();
requestAnimationFrame(loop);