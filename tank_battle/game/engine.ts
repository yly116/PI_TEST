import {
  BASE_RECT,
  BULLET_SIZE,
  COLS,
  DIR_VEC,
  ENEMY_SPAWNS,
  H,
  OPPOSITE,
  PLAYER_SPAWN,
  ROWS,
  TANK_OFFSET,
  TANK_SIZE,
  TILE,
  T_BRICK,
  T_EMPTY,
  T_GRASS,
  T_STEEL,
  T_WATER,
  W,
  type Dir,
} from './constants';
import { LEVELS } from './levels';
import { Sfx } from './sfx';

export type Status = 'ready' | 'playing' | 'paused' | 'levelclear' | 'gameover' | 'victory';
export type Variant = 'basic' | 'fast' | 'power' | 'armor';
export type PowerupKind = 'star' | 'life' | 'bomb' | 'freeze' | 'shield';

export interface Snapshot {
  status: Status;
  score: number;
  highScore: number;
  lives: number;
  level: number;
  enemiesLeft: number;
  power: number;
  sound: boolean;
}

interface Tank {
  id: number;
  kind: 'player' | 'enemy';
  variant: Variant;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: Dir;
  speed: number;
  hp: number;
  maxHp: number;
  bulletSpeed: number;
  cooldown: number;
  aiTimer: number;
  alive: boolean;
  shielded: number;
  flash: number;
  flashDrop: boolean;
}

interface Bullet {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: Dir;
  speed: number;
  owner: 'player' | 'enemy';
  tankId: number;
  power: number;
  alive: boolean;
}

interface Explosion {
  x: number;
  y: number;
  maxR: number;
  dur: number;
  t: number;
  seed: number;
}

interface Powerup {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PowerupKind;
  life: number;
  seed: number;
  dead: boolean;
}

interface Portal {
  x: number;
  y: number;
  t: number;
  variant: Variant;
  flashDrop: boolean;
}

interface Banner {
  text: string;
  t: number;
  dur: number;
}

const ENEMY_STATS: Record<Variant, { speed: number; hp: number; bulletSpeed: number; score: number }> = {
  basic: { speed: 52, hp: 1, bulletSpeed: 190, score: 100 },
  fast: { speed: 96, hp: 1, bulletSpeed: 190, score: 200 },
  power: { speed: 58, hp: 1, bulletSpeed: 280, score: 300 },
  armor: { speed: 42, hp: 3, bulletSpeed: 200, score: 400 },
};

const CHAR_TILE: Record<string, number> = {
  '.': T_EMPTY,
  B: T_BRICK,
  S: T_STEEL,
  W: T_WATER,
  G: T_GRASS,
};

const KEY_DIR: Record<string, Dir> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

const POWERUP_ICON: Record<PowerupKind, string> = {
  star: '★',
  life: '♥',
  bomb: '✹',
  freeze: '❄',
  shield: '◈',
};

const POWERUP_COLOR: Record<PowerupKind, string> = {
  star: '#ffd166',
  life: '#ff6b81',
  bomb: '#ff9f43',
  freeze: '#7fd3ff',
  shield: '#9be7c4',
};

const HIGH_SCORE_KEY = 'tank-battle-highscore';
const STEP = 1 / 60;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function overlapRect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class TankGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private notify: (snapshot: Snapshot) => void;
  private sfx = new Sfx();
  private dpr = 1;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private destroyed = false;
  private snapshotJson = '';

  private status: Status = 'ready';
  private tiles: number[][] = [];
  private baseAlive = true;
  private levelIndex = 0;
  private score = 0;
  private highScore = 0;
  private lives = 3;
  private power = 1;

  private player: Tank | null = null;
  private enemies: Tank[] = [];
  private bullets: Bullet[] = [];
  private explosions: Explosion[] = [];
  private powerups: Powerup[] = [];
  private portals: Portal[] = [];

  private spawnTimer = 0;
  private spawned = 0;
  private killed = 0;
  private total = 10;
  private maxOnField = 4;
  private freeze = 0;
  private respawnTimer = 0;
  private levelClearTimer = 0;
  private banner: Banner | null = null;
  private shake = 0;

  private nextId = 1;
  private keys = new Set<Dir>();
  private dirOrder: Dir[] = [];
  private fireHeld = false;

  constructor(canvas: HTMLCanvasElement, notify: (snapshot: Snapshot) => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available');
    this.ctx = ctx;
    this.notify = notify;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * this.dpr);
    canvas.height = Math.round(H * this.dpr);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    try {
      this.highScore = Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      this.highScore = 0;
    }

    this.loadLevel(0, false);
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.attachInput();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.publish();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.detachInput();
    this.sfx.close();
  }

  startGame() {
    if (this.status === 'playing' || this.status === 'levelclear') return;
    this.score = 0;
    this.lives = 3;
    this.power = 1;
    this.levelIndex = 0;
    this.sfx.play('start');
    this.loadLevel(0, true);
  }

  togglePause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.sfx.play('pause');
    } else if (this.status === 'paused') {
      this.status = 'playing';
      this.sfx.play('pause');
    }
  }

  toggleSound() {
    this.sfx.toggle();
  }

  setSound(on: boolean) {
    this.sfx.setEnabled(on);
  }

  press(dir: Dir) {
    if (!this.keys.has(dir)) {
      this.keys.add(dir);
      this.dirOrder = this.dirOrder.filter((d) => d !== dir);
      this.dirOrder.push(dir);
    }
  }

  release(dir: Dir) {
    this.keys.delete(dir);
    this.dirOrder = this.dirOrder.filter((d) => d !== dir);
  }

  setFire(on: boolean) {
    this.fireHeld = on;
    if (on && this.status === 'playing' && this.player?.alive) {
      this.tryShoot(this.player);
    }
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    const elapsed = Math.min(now - this.last, 100);
    this.last = now;
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= STEP * 1000 && steps < 5) {
      this.update(STEP);
      this.acc -= STEP * 1000;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    this.render();
    this.publish();
    this.raf = requestAnimationFrame(this.loop);
  };

  // -------------------------------------------------------------------- input

  private attachInput() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private detachInput() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const dir = KEY_DIR[key];
    if (dir) {
      e.preventDefault();
      this.press(dir);
    }
    if (e.code === 'Space' || key === 'j') {
      e.preventDefault();
      this.setFire(true);
    }
    if ((key === 'p' || key === 'escape') && !e.repeat) {
      e.preventDefault();
      this.togglePause();
    }
    if (key === 'enter' && !e.repeat) {
      // Let native button activation handle Enter when a control has focus.
      const target = e.target as HTMLElement | null;
      const onControl =
        !!target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'INPUT');
      if (!onControl) {
        if (this.status === 'ready' || this.status === 'gameover' || this.status === 'victory') {
          this.startGame();
        } else if (this.status === 'paused') {
          this.togglePause();
        }
      }
    }
    if (key === 'm' && !e.repeat) {
      this.toggleSound();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const dir = KEY_DIR[key];
    if (dir) this.release(dir);
    if (e.code === 'Space' || key === 'j') this.setFire(false);
  };

  private onBlur = () => {
    this.keys.clear();
    this.dirOrder = [];
    this.fireHeld = false;
  };

  private currentDir(): Dir | null {
    for (let i = this.dirOrder.length - 1; i >= 0; i--) {
      const dir = this.dirOrder[i];
      if (this.keys.has(dir)) return dir;
    }
    return null;
  }

  // ------------------------------------------------------------------- levels

  private loadLevel(index: number, playing: boolean) {
    const def = LEVELS[index % LEVELS.length];
    this.levelIndex = index;
    this.tiles = def.map.map((row) => row.split('').map((ch) => CHAR_TILE[ch] ?? T_EMPTY));
    this.total = def.total;
    this.maxOnField = def.maxOnField;

    this.enemies = [];
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.portals = [];
    this.spawned = 0;
    this.killed = 0;
    this.spawnTimer = 1.6;
    this.freeze = 0;
    this.respawnTimer = 0;
    this.levelClearTimer = 0;
    this.baseAlive = true;
    this.shake = 0;
    this.banner = { text: `STAGE ${index + 1}`, t: 0, dur: 2.2 };

    this.spawnPlayer(2.5);
    this.status = playing ? 'playing' : 'ready';
  }

  private spawnPlayer(shield: number) {
    const tank = this.createTank('player', 'basic', PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    tank.shielded = shield;
    tank.dir = 'up';
    this.player = tank;
    this.respawnTimer = 0;
  }

  private createTank(kind: 'player' | 'enemy', variant: Variant, x: number, y: number): Tank {
    if (kind === 'player') {
      return {
        id: this.nextId++,
        kind,
        variant: 'basic',
        x,
        y,
        w: TANK_SIZE,
        h: TANK_SIZE,
        dir: 'up',
        speed: 112,
        hp: 1,
        maxHp: 1,
        bulletSpeed: 290,
        cooldown: 0,
        aiTimer: 0,
        alive: true,
        shielded: 0,
        flash: 0,
        flashDrop: false,
      };
    }

    const stats = ENEMY_STATS[variant];
    return {
      id: this.nextId++,
      kind,
      variant,
      x,
      y,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: 'down',
      speed: stats.speed + this.levelIndex * 3,
      hp: stats.hp,
      maxHp: stats.hp,
      bulletSpeed: stats.bulletSpeed + this.levelIndex * 8,
      cooldown: rand(0.4, 1.2),
      aiTimer: rand(0.1, 0.7),
      alive: true,
      shielded: 0,
      flash: 0,
      flashDrop: false,
    };
  }

  // ------------------------------------------------------------------- update

  private update(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 24);

    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }

    if (this.status === 'playing') {
      this.updatePlaying(dt);
    } else if (this.status === 'levelclear') {
      this.updateEffects(dt);
      this.levelClearTimer -= dt;
      if (this.levelClearTimer <= 0) {
        if (this.levelIndex + 1 >= LEVELS.length) {
          this.finish('victory');
        } else {
          this.loadLevel(this.levelIndex + 1, true);
        }
      }
    } else if (this.status === 'gameover' || this.status === 'victory') {
      this.updateEffects(dt);
    }
  }

  private updatePlaying(dt: number) {
    if (this.freeze > 0) this.freeze = Math.max(0, this.freeze - dt);

    this.updatePlayer(dt);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    this.updateBullets(dt);
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
    this.updateSpawning(dt);
    this.updatePowerups(dt);
    this.updateEffects(dt);
    this.checkLevelClear();
  }

  private updatePlayer(dt: number) {
    const player = this.player;
    if (!player) return;

    if (!player.alive) {
      if (this.lives > 0 && this.status === 'playing') {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0 && this.spawnPointFree()) {
          this.spawnPlayer(2.5);
        }
      }
      return;
    }

    player.cooldown = Math.max(0, player.cooldown - dt);
    player.flash = Math.max(0, player.flash - dt);
    if (player.shielded > 0) player.shielded = Math.max(0, player.shielded - dt);

    const dir = this.currentDir();
    if (dir) {
      this.setDir(player, dir);
      this.moveTank(player, dir, player.speed * dt);
    }
    if (this.fireHeld) this.tryShoot(player);
  }

  private updateEnemy(enemy: Tank, dt: number) {
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (this.freeze > 0 || !enemy.alive) return;

    enemy.aiTimer -= dt;
    if (enemy.aiTimer <= 0) {
      enemy.aiTimer = rand(0.35, 1.15);
      this.setDir(enemy, this.chooseEnemyDir(enemy));
    }

    if (!this.moveTank(enemy, enemy.dir, enemy.speed * dt)) {
      enemy.aiTimer = 0;
    }

    if (enemy.cooldown <= 0) {
      if (this.alignedWithTarget(enemy)) {
        this.tryShoot(enemy);
        enemy.cooldown = Math.max(enemy.cooldown, rand(0.6, 1.2));
      } else if (Math.random() < 0.02) {
        this.tryShoot(enemy);
        enemy.cooldown = Math.max(enemy.cooldown, rand(0.6, 1.4));
      } else {
        enemy.cooldown = rand(0.25, 0.6);
      }
    }
  }

  private updateEffects(dt: number) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.t += dt;
      if (explosion.t >= explosion.dur) this.explosions.splice(i, 1);
    }
  }

  private updateSpawning(dt: number) {
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const portal = this.portals[i];
      portal.t -= dt;
      if (portal.t <= 0) {
        const enemy = this.createTank('enemy', portal.variant, portal.x, portal.y);
        enemy.flashDrop = portal.flashDrop;
        this.enemies.push(enemy);
        this.portals.splice(i, 1);
        this.explode(portal.x + TANK_SIZE / 2, portal.y + TANK_SIZE / 2, 14, 'small');
      }
    }

    if (this.spawned >= this.total) return;
    if (this.enemies.length + this.portals.length >= this.maxOnField) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const spots = ENEMY_SPAWNS.filter((spot) => this.rectFree(spot.x, spot.y, TANK_SIZE, TANK_SIZE));
    if (spots.length === 0) {
      this.spawnTimer = 0.4;
      return;
    }

    const spot = spots[Math.floor(Math.random() * spots.length)];
    const variant = this.pickVariant();
    const flashDrop = this.spawned > 0 && this.spawned % 4 === 3;
    this.portals.push({ x: spot.x, y: spot.y, t: 1.05, variant, flashDrop });
    this.spawned++;
    this.spawnTimer = Math.max(1.3, 2.7 - this.levelIndex * 0.4);
  }

  private updateBullets(dt: number) {
    for (const bullet of this.bullets) {
      if (bullet.alive) this.stepBullet(bullet, dt);
    }
    this.resolveBulletDuels();
    this.bullets = this.bullets.filter((bullet) => bullet.alive);
  }

  private updatePowerups(dt: number) {
    const player = this.player;
    for (const powerup of this.powerups) {
      if (powerup.dead) continue;
      powerup.life -= dt;
      if (powerup.life <= 0) {
        powerup.dead = true;
        continue;
      }
      if (
        player?.alive &&
        overlapRect(player.x, player.y, player.w, player.h, powerup.x, powerup.y, powerup.w, powerup.h)
      ) {
        powerup.dead = true;
        this.applyPowerup(powerup.kind);
      }
    }
    this.powerups = this.powerups.filter((powerup) => !powerup.dead);
  }

  private checkLevelClear() {
    if (this.status !== 'playing') return;
    if (this.killed >= this.total && this.enemies.length === 0 && this.portals.length === 0) {
      this.status = 'levelclear';
      this.levelClearTimer = 2.7;
      this.addScore(500 + this.levelIndex * 250);
      this.saveHighScore();
      this.banner = { text: 'STAGE CLEAR', t: 0, dur: 2.4 };
      this.sfx.play('level');
    }
  }

  // ----------------------------------------------------------------- movement

  private lane(value: number): number {
    return Math.round((value - TANK_OFFSET) / TILE) * TILE + TANK_OFFSET;
  }

  private setDir(tank: Tank, dir: Dir) {
    if (tank.dir === dir) return;
    tank.dir = dir;
    if (dir === 'up' || dir === 'down') {
      const lx = this.lane(tank.x);
      if (Math.abs(lx - tank.x) <= 12 && this.canOccupy(tank, lx, tank.y)) tank.x = lx;
    } else {
      const ly = this.lane(tank.y);
      if (Math.abs(ly - tank.y) <= 12 && this.canOccupy(tank, tank.x, ly)) tank.y = ly;
    }
  }

  private moveTank(tank: Tank, dir: Dir, distance: number): boolean {
    const [dx, dy] = DIR_VEC[dir];
    let remaining = distance;
    let moved = false;
    while (remaining > 0) {
      const step = Math.min(1.5, remaining);
      const nx = tank.x + dx * step;
      const ny = tank.y + dy * step;
      if (!this.canOccupy(tank, nx, ny)) break;
      tank.x = nx;
      tank.y = ny;
      remaining -= step;
      moved = true;
    }
    return moved;
  }

  private canOccupy(tank: Tank, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x + tank.w > W || y + tank.h > H) return false;

    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + tank.w - 0.01) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + tank.h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile === T_BRICK || tile === T_STEEL || tile === T_WATER) return false;
      }
    }

    if (
      this.baseAlive &&
      overlapRect(x, y, tank.w, tank.h, BASE_RECT.x, BASE_RECT.y, BASE_RECT.w, BASE_RECT.h)
    ) {
      return false;
    }

    for (const other of this.allTanks()) {
      if (other === tank || !other.alive) continue;
      if (overlapRect(x, y, tank.w, tank.h, other.x, other.y, other.w, other.h)) return false;
    }
    return true;
  }

  private allTanks(): Tank[] {
    const tanks: Tank[] = [];
    if (this.player) tanks.push(this.player);
    tanks.push(...this.enemies);
    return tanks;
  }

  private rectFree(x: number, y: number, w: number, h: number): boolean {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + w - 0.01) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile === T_BRICK || tile === T_STEEL || tile === T_WATER) return false;
      }
    }
    if (overlapRect(x, y, w, h, BASE_RECT.x, BASE_RECT.y, BASE_RECT.w, BASE_RECT.h)) return false;
    for (const tank of this.allTanks()) {
      if (tank.alive && overlapRect(x, y, w, h, tank.x, tank.y, tank.w, tank.h)) return false;
    }
    for (const portal of this.portals) {
      if (overlapRect(x, y, w, h, portal.x, portal.y, TANK_SIZE, TANK_SIZE)) return false;
    }
    return true;
  }

  private spawnPointFree(): boolean {
    return this.rectFree(PLAYER_SPAWN.x, PLAYER_SPAWN.y, TANK_SIZE, TANK_SIZE);
  }

  // --------------------------------------------------------------------- ai

  private chooseEnemyDir(enemy: Tank): Dir {
    const player = this.player;
    const target =
      player?.alive && Math.random() < 0.35
        ? { x: player.x + player.w / 2, y: player.y + player.h / 2 }
        : { x: BASE_RECT.x + BASE_RECT.w / 2, y: BASE_RECT.y + BASE_RECT.h / 2 };

    const dx = target.x - (enemy.x + enemy.w / 2);
    const dy = target.y - (enemy.y + enemy.h / 2);
    const horizontal: Dir = dx >= 0 ? 'right' : 'left';
    const vertical: Dir = dy >= 0 ? 'down' : 'up';

    const prefs: Dir[] =
      Math.abs(dx) > Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
    prefs.push(OPPOSITE[horizontal], OPPOSITE[vertical]);

    const all: Dir[] = ['up', 'down', 'left', 'right'];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }

    const tried = new Set<Dir>();
    for (const dir of [...prefs, ...all]) {
      if (tried.has(dir)) continue;
      tried.add(dir);
      this.setDir(enemy, dir);
      const [vx, vy] = DIR_VEC[dir];
      if (this.canOccupy(enemy, enemy.x + vx * 5, enemy.y + vy * 5)) return dir;
    }
    return enemy.dir;
  }

  private alignedWithTarget(enemy: Tank): boolean {
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2;
    const targets: Array<{ x: number; y: number; range: number }> = [
      // Enemies only snipe at the base once they are reasonably close.
      { x: BASE_RECT.x + BASE_RECT.w / 2, y: BASE_RECT.y + BASE_RECT.h / 2, range: 240 },
    ];
    if (this.player?.alive) {
      targets.push({
        x: this.player.x + this.player.w / 2,
        y: this.player.y + this.player.h / 2,
        range: Number.POSITIVE_INFINITY,
      });
    }

    for (const target of targets) {
      if (Math.hypot(target.x - cx, target.y - cy) > target.range) continue;
      if ((enemy.dir === 'up' || enemy.dir === 'down') && Math.abs(target.x - cx) < 26) {
        if (enemy.dir === 'up' && target.y < cy) return true;
        if (enemy.dir === 'down' && target.y > cy) return true;
      }
      if ((enemy.dir === 'left' || enemy.dir === 'right') && Math.abs(target.y - cy) < 26) {
        if (enemy.dir === 'left' && target.x < cx) return true;
        if (enemy.dir === 'right' && target.x > cx) return true;
      }
    }
    return false;
  }

  private pickVariant(): Variant {
    const roll = Math.random();
    if (this.levelIndex === 0) {
      return roll < 0.72 ? 'basic' : roll < 0.93 ? 'fast' : 'power';
    }
    if (this.levelIndex === 1) {
      if (roll < 0.42) return 'basic';
      if (roll < 0.68) return 'fast';
      if (roll < 0.9) return 'power';
      return 'armor';
    }
    if (roll < 0.28) return 'basic';
    if (roll < 0.54) return 'fast';
    if (roll < 0.78) return 'power';
    return 'armor';
  }

  // ------------------------------------------------------------------ combat

  private tryShoot(tank: Tank) {
    if (tank.cooldown > 0 || !tank.alive) return;

    const isPlayer = tank.kind === 'player';
    const maxBullets = isPlayer ? (this.power >= 2 ? 2 : 1) : tank.variant === 'power' ? 2 : 1;
    const active = this.bullets.filter((bullet) => bullet.tankId === tank.id && bullet.alive).length;
    if (active >= maxBullets) return;

    const speed = isPlayer ? (this.power >= 2 ? 330 : 295) : tank.bulletSpeed;
    const powerLevel = isPlayer ? (this.power >= 3 ? 2 : 1) : 1;

    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    const [dx, dy] = DIR_VEC[tank.dir];
    const offset = tank.w / 2 + 4;

    this.bullets.push({
      x: cx + dx * offset - BULLET_SIZE / 2,
      y: cy + dy * offset - BULLET_SIZE / 2,
      w: BULLET_SIZE,
      h: BULLET_SIZE,
      dir: tank.dir,
      speed,
      owner: tank.kind,
      tankId: tank.id,
      power: powerLevel,
      alive: true,
    });

    tank.cooldown = isPlayer ? 0.31 : 0.6;
    this.sfx.play(isPlayer ? 'shoot' : 'shootEnemy');
  }

  private stepBullet(bullet: Bullet, dt: number) {
    const [dx, dy] = DIR_VEC[bullet.dir];
    let remaining = bullet.speed * dt;

    while (remaining > 0 && bullet.alive) {
      const step = Math.min(3, remaining);
      bullet.x += dx * step;
      bullet.y += dy * step;
      remaining -= step;

      if (bullet.x < -BULLET_SIZE || bullet.y < -BULLET_SIZE || bullet.x > W || bullet.y > H) {
        bullet.alive = false;
        break;
      }
      this.resolveBulletTiles(bullet);
      if (bullet.alive) this.resolveBulletTanks(bullet);
    }
  }

  private resolveBulletTiles(bullet: Bullet) {
    if (
      this.baseAlive &&
      bullet.owner === 'enemy' &&
      overlapRect(
        bullet.x,
        bullet.y,
        bullet.w,
        bullet.h,
        BASE_RECT.x,
        BASE_RECT.y,
        BASE_RECT.w,
        BASE_RECT.h,
      )
    ) {
      bullet.alive = false;
      this.destroyBase();
      return;
    }

    const c0 = Math.floor(bullet.x / TILE);
    const c1 = Math.floor((bullet.x + bullet.w - 0.01) / TILE);
    const r0 = Math.floor(bullet.y / TILE);
    const r1 = Math.floor((bullet.y + bullet.h - 0.01) / TILE);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile === T_BRICK) {
          this.tiles[r][c] = T_EMPTY;
          this.explode(c * TILE + TILE / 2, r * TILE + TILE / 2, 13, 'small');
          this.sfx.play('brick');
          bullet.alive = false;
          return;
        }
        if (tile === T_STEEL) {
          if (bullet.power >= 2) {
            this.tiles[r][c] = T_EMPTY;
            this.explode(c * TILE + TILE / 2, r * TILE + TILE / 2, 17, 'small');
          } else {
            this.explode(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, 7, 'small');
          }
          this.sfx.play('steel');
          bullet.alive = false;
          return;
        }
      }
    }
  }

  private resolveBulletTanks(bullet: Bullet) {
    if (bullet.owner === 'player') {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (
          overlapRect(bullet.x, bullet.y, bullet.w, bullet.h, enemy.x, enemy.y, enemy.w, enemy.h)
        ) {
          bullet.alive = false;
          this.damageEnemy(enemy);
          return;
        }
      }
      return;
    }

    const player = this.player;
    if (
      player?.alive &&
      overlapRect(bullet.x, bullet.y, bullet.w, bullet.h, player.x, player.y, player.w, player.h)
    ) {
      bullet.alive = false;
      if (player.shielded > 0) {
        this.explode(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, 9, 'small');
        this.sfx.play('hit');
      } else {
        this.killPlayer();
      }
    }
  }

  private resolveBulletDuels() {
    for (const a of this.bullets) {
      if (!a.alive || a.owner !== 'player') continue;
      for (const b of this.bullets) {
        if (!b.alive || b.owner !== 'enemy') continue;
        if (overlapRect(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) {
          a.alive = false;
          b.alive = false;
          this.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8);
          break;
        }
      }
    }
  }

  private damageEnemy(enemy: Tank) {
    if (!enemy.alive) return;
    enemy.hp -= 1;
    enemy.flash = 0.18;
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2;

    if (enemy.hp > 0) {
      this.spark(cx, cy, 9);
      this.sfx.play('hit');
      return;
    }

    enemy.alive = false;
    this.killed += 1;
    this.addScore(ENEMY_STATS[enemy.variant].score);
    this.explode(cx, cy, 30, 'big');
    this.sfx.play('explode');
    this.shake = Math.max(this.shake, 5);

    if (enemy.flashDrop && this.powerups.length < 2) {
      this.spawnPowerup();
    }
  }

  private killPlayer() {
    const player = this.player;
    if (!player?.alive) return;

    player.alive = false;
    player.shielded = 0;
    this.explode(player.x + player.w / 2, player.y + player.h / 2, 38, 'big');
    this.sfx.play('explode');
    this.shake = 9;
    this.lives -= 1;
    this.power = 1;
    this.respawnTimer = 1.5;

    if (this.lives <= 0) this.finish('gameover');
  }

  private destroyBase() {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    const cx = BASE_RECT.x + BASE_RECT.w / 2;
    const cy = BASE_RECT.y + BASE_RECT.h / 2;
    for (let i = 0; i < 5; i++) {
      this.explode(cx + rand(-22, 22), cy + rand(-22, 22), rand(18, 34), 'big');
    }
    this.shake = 13;
    this.sfx.play('explode');
    this.finish('gameover');
  }

  private finish(status: 'gameover' | 'victory') {
    if (this.status === 'gameover' || this.status === 'victory') return;
    this.status = status;
    if (this.score > this.highScore) this.highScore = this.score;
    this.saveHighScore();
    this.sfx.play(status === 'victory' ? 'victory' : 'gameover');
  }

  private addScore(amount: number) {
    this.score += amount;
    if (this.score > this.highScore) this.highScore = this.score;
  }

  private saveHighScore() {
    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
    } catch {
      // ignore storage failures
    }
  }

  // ------------------------------------------------------------------ powerups

  private spawnPowerup() {
    const kinds: PowerupKind[] = ['star', 'life', 'bomb', 'freeze', 'shield'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const size = 24;

    for (let attempt = 0; attempt < 80; attempt++) {
      const col = 1 + Math.floor(Math.random() * (COLS - 2));
      const row = 1 + Math.floor(Math.random() * (ROWS - 3));
      if (this.tiles[row][col] !== T_EMPTY) continue;
      const x = col * TILE + (TILE - size) / 2;
      const y = row * TILE + (TILE - size) / 2;
      if (
        overlapRect(x, y, size, size, BASE_RECT.x, BASE_RECT.y, BASE_RECT.w, BASE_RECT.h)
      ) {
        continue;
      }
      if (!this.rectFree(x, y, size, size)) continue;

      this.powerups.push({
        x,
        y,
        w: size,
        h: size,
        kind,
        life: 16,
        seed: Math.random() * Math.PI * 2,
        dead: false,
      });
      return;
    }
  }

  private applyPowerup(kind: PowerupKind) {
    this.addScore(200);
    switch (kind) {
      case 'star':
        if (this.power < 3) {
          this.power += 1;
          this.sfx.play('powerup');
        } else {
          this.addScore(300);
          this.sfx.play('life');
        }
        break;
      case 'life':
        this.lives = Math.min(5, this.lives + 1);
        this.sfx.play('life');
        break;
      case 'freeze':
        this.freeze = 7;
        this.sfx.play('freeze');
        break;
      case 'shield':
        if (this.player?.alive) {
          this.player.shielded = Math.max(this.player.shielded, 10);
        }
        this.sfx.play('powerup');
        break;
      case 'bomb': {
        this.sfx.play('explode');
        this.shake = 10;
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          enemy.alive = false;
          this.killed += 1;
          this.addScore(100);
          this.explode(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 30, 'big');
        }
        this.enemies = [];
        break;
      }
    }
  }

  private explode(x: number, y: number, maxR: number, kind: 'small' | 'big') {
    this.explosions.push({
      x,
      y,
      maxR,
      dur: kind === 'big' ? 0.5 : 0.26,
      t: 0,
      seed: Math.random() * Math.PI * 2,
    });
    if (this.explosions.length > 50) this.explosions.shift();
  }

  private spark(x: number, y: number, r: number) {
    this.explode(x, y, r, 'small');
  }

  // ------------------------------------------------------------------- render

  private render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate(rand(-this.shake, this.shake) * 0.6, rand(-this.shake, this.shake) * 0.6);
    }

    ctx.fillStyle = '#080b0e';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    ctx.strokeStyle = 'rgba(120, 170, 210, 0.045)';
    ctx.lineWidth = 1;
    for (let x = TILE; x < W; x += TILE) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    for (let y = TILE; y < H; y += TILE) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = this.tiles[r][c];
        const x = c * TILE;
        const y = r * TILE;
        if (tile === T_BRICK) this.drawBrick(x, y, r, c);
        else if (tile === T_STEEL) this.drawSteel(x, y);
        else if (tile === T_WATER) this.drawWater(x, y);
      }
    }

    this.drawBase();

    for (const powerup of this.powerups) this.drawPowerup(powerup);

    for (const enemy of this.enemies) this.drawTank(enemy);
    if (this.player) this.drawTank(this.player);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.tiles[r][c] === T_GRASS) this.drawGrass(c * TILE, r * TILE);
      }
    }

    for (const bullet of this.bullets) this.drawBullet(bullet);
    for (const explosion of this.explosions) this.drawExplosion(explosion);
    for (const portal of this.portals) this.drawPortal(portal);

    ctx.strokeStyle = 'rgba(150, 200, 230, 0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    if (this.banner && (this.status === 'playing' || this.status === 'levelclear')) {
      this.drawBanner(this.banner);
    }

    ctx.restore();
  }

  private drawBrick(x: number, y: number, row: number, col: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#3b1a0c';
    ctx.fillRect(x, y, TILE, TILE);
    const shades = ['#b4552b', '#a64a24', '#c06031', '#aa5028'];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = shades[(row * 3 + col * 5 + i * 2 + j) % shades.length];
        ctx.fillRect(x + i * 16 + 1, y + j * 16 + 1, 14, 14);
        ctx.fillStyle = 'rgba(255, 190, 130, 0.13)';
        ctx.fillRect(x + i * 16 + 1, y + j * 16 + 1, 14, 2);
      }
    }
  }

  private drawSteel(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#3f474f';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#9aa5af';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#c6d0d9';
    ctx.fillRect(x + 4, y + 4, TILE - 8, 9);
    ctx.fillStyle = '#79838d';
    ctx.fillRect(x + 4, y + 19, TILE - 8, 9);
    ctx.fillStyle = '#e8f0f6';
    for (const [rx, ry] of [
      [6, 6],
      [TILE - 6, 6],
      [6, TILE - 6],
      [TILE - 6, TILE - 6],
    ]) {
      ctx.beginPath();
      ctx.arc(x + rx, y + ry, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawWater(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b2740';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = 'rgba(84, 180, 226, 0.6)';
    ctx.lineWidth = 2;
    const phase = this.time * 2 + (x + y) * 0.05;
    for (let k = 0; k < 3; k++) {
      const wy = y + 7 + k * 10;
      ctx.beginPath();
      for (let i = 0; i <= TILE; i += 4) {
        const yy = wy + Math.sin(phase + i * 0.4 + k * 1.3) * 1.8;
        if (i === 0) ctx.moveTo(x + i, yy);
        else ctx.lineTo(x + i, yy);
      }
      ctx.stroke();
    }
  }

  private drawGrass(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d3517';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 7; i++) {
      const bx = x + 3 + ((i * 13 + x * 3) % 26);
      const by = y + 5 + ((i * 19 + y * 5) % 23);
      ctx.fillStyle = i % 2 === 0 ? '#2d7d3d' : '#1f5e2c';
      ctx.beginPath();
      ctx.moveTo(bx, by + 8);
      ctx.lineTo(bx + 3, by);
      ctx.lineTo(bx + 6, by + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawBase() {
    const ctx = this.ctx;
    const { x, y, w, h } = BASE_RECT;
    const cx = x + w / 2;
    const cy = y + h / 2 + 2;

    ctx.fillStyle = '#151a1f';
    rr(ctx, x + 6, y + 8, w - 12, h - 12, 5);
    ctx.fill();

    if (!this.baseAlive) {
      ctx.fillStyle = '#313941';
      ctx.fillRect(x + 12, y + 24, 18, 14);
      ctx.fillRect(x + 32, y + 32, 14, 12);
      ctx.fillRect(x + 22, y + 40, 16, 10);
      ctx.strokeStyle = '#d8544f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 18, y + 20);
      ctx.lineTo(x + 46, y + 48);
      ctx.moveTo(x + 46, y + 20);
      ctx.lineTo(x + 18, y + 48);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = '#252d35';
    rr(ctx, x + 8, y + 10, w - 16, h - 16, 4);
    ctx.fill();

    // tail feathers
    ctx.fillStyle = '#c38f24';
    for (const dx of [-9, -3, 3, 9]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 2, cy + 6);
      ctx.lineTo(cx + dx * 1.4, cy + 18);
      ctx.lineTo(cx + dx + 3, cy + 6);
      ctx.closePath();
      ctx.fill();
    }

    // spread wings + body
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 10);
    ctx.bezierCurveTo(cx - 10, cy - 18, cx - 20, cy - 22, cx - 28, cy - 19);
    ctx.bezierCurveTo(cx - 25, cy - 12, cx - 24, cy - 6, cx - 22, cy - 1);
    ctx.lineTo(cx - 14, cy - 4);
    ctx.lineTo(cx - 10, cy + 1);
    ctx.lineTo(cx - 5, cy + 9);
    ctx.lineTo(cx - 4, cy + 12);
    ctx.lineTo(cx + 4, cy + 12);
    ctx.lineTo(cx + 5, cy + 9);
    ctx.lineTo(cx + 10, cy + 1);
    ctx.lineTo(cx + 14, cy - 4);
    ctx.lineTo(cx + 22, cy - 1);
    ctx.bezierCurveTo(cx + 24, cy - 6, cx + 25, cy - 12, cx + 28, cy - 19);
    ctx.bezierCurveTo(cx + 20, cy - 22, cx + 10, cy - 18, cx + 2, cy - 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 14, 4, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // white head
    ctx.fillStyle = '#f4f1e8';
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 14, 4, 0.35)';
    ctx.stroke();

    // hooked beak
    ctx.fillStyle = '#e07a2f';
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 16);
    ctx.quadraticCurveTo(cx + 11, cy - 14, cx + 12, cy - 11);
    ctx.lineTo(cx + 4, cy - 10.5);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = '#2a1c06';
    ctx.beginPath();
    ctx.arc(cx + 1.3, cy - 15.3, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPowerup(powerup: Powerup) {
    const ctx = this.ctx;
    if (powerup.life < 3.2 && Math.floor(powerup.life * 8) % 2 === 0) return;

    const cx = powerup.x + powerup.w / 2;
    const cy = powerup.y + powerup.h / 2;
    const color = POWERUP_COLOR[powerup.kind];
    const pulse = 1 + Math.sin(this.time * 6 + powerup.seed) * 0.06;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(8, 14, 18, 0.95)';
    rr(ctx, -12, -12, 24, 24, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    rr(ctx, -12, -12, 24, 24, 5);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWERUP_ICON[powerup.kind], 0, 1);
    ctx.restore();
  }

  private drawTank(tank: Tank) {
    const ctx = this.ctx;
    if (!tank.alive) return;

    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    const half = tank.w / 2;

    ctx.save();
    ctx.translate(cx, cy);

    if (tank.kind === 'player' && tank.shielded > 0) {
      const fading = tank.shielded < 2 && Math.floor(this.time * 10) % 2 === 0;
      ctx.strokeStyle = fading ? 'rgba(220, 245, 255, 0.45)' : 'rgba(95, 210, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -this.time * 40;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const angle =
      tank.dir === 'up'
        ? 0
        : tank.dir === 'right'
          ? Math.PI / 2
          : tank.dir === 'down'
            ? Math.PI
            : -Math.PI / 2;
    ctx.rotate(angle);

    const isPlayer = tank.kind === 'player';
    let body = '#b9c2cb';
    if (isPlayer) body = '#f2c14e';
    else if (tank.variant === 'fast') body = '#e6edf2';
    else if (tank.variant === 'power') body = '#7ac47a';
    else if (tank.variant === 'armor') {
      body = tank.hp >= 3 ? '#5fbf6a' : tank.hp === 2 ? '#e0b23c' : '#d8544f';
    }
    if (tank.flash > 0) body = '#ffffff';
    if (tank.flashDrop && Math.floor(this.time * 6) % 2 === 0) body = '#ff5b5b';

    ctx.fillStyle = '#171b1f';
    ctx.fillRect(-half, -half, 7, half * 2);
    ctx.fillRect(half - 7, -half, 7, half * 2);
    ctx.fillStyle = '#3b444c';
    for (let ty = -half + 1; ty < half - 1; ty += 5) {
      ctx.fillRect(-half + 1, ty, 5, 2);
      ctx.fillRect(half - 6, ty, 5, 2);
    }

    ctx.fillStyle = body;
    rr(ctx, -half + 6, -half + 2, half * 2 - 12, half * 2 - 4, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    rr(ctx, -half + 6, 3, half * 2 - 12, half - 5, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -1, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d7dee4';
    ctx.fillRect(-2.5, -half - 4, 5, 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(-2.5, -half - 4, 2, 14);

    if (isPlayer) {
      ctx.fillStyle = '#7a4a06';
      for (let i = 0; i < this.power; i++) {
        const px = (i - (this.power - 1) / 2) * 7;
        starPath(ctx, px, half - 6, 2.7, 1.15);
        ctx.fill();
      }
    }

    if (this.freeze > 0 && !isPlayer) {
      ctx.fillStyle = 'rgba(130, 215, 255, 0.32)';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawBullet(bullet: Bullet) {
    const ctx = this.ctx;
    const cx = bullet.x + bullet.w / 2;
    const cy = bullet.y + bullet.h / 2;
    const color = bullet.owner === 'player' ? '#ffe066' : '#ff8d8d';

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawExplosion(explosion: Explosion) {
    const ctx = this.ctx;
    const progress = Math.min(1, explosion.t / explosion.dur);
    const radius = explosion.maxR * (0.25 + 0.75 * Math.sqrt(progress));
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();

    if (explosion.maxR > 18) {
      for (let i = 0; i < 6; i++) {
        const angle = explosion.seed + (i * Math.PI) / 3 + Math.sin(explosion.seed + i) * 0.2;
        const distance = radius * (1.02 + 0.12 * Math.cos(explosion.seed * 2 + i));
        ctx.fillStyle = i % 2 === 0 ? '#ffb347' : '#ff7a1a';
        ctx.beginPath();
        ctx.arc(
          explosion.x + Math.cos(angle) * distance,
          explosion.y + Math.sin(angle) * distance,
          1.8 + (i % 3) * 0.7,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawPortal(portal: Portal) {
    const ctx = this.ctx;
    const progress = 1 - Math.max(0, portal.t) / 1.05;
    const cx = portal.x + TANK_SIZE / 2;
    const cy = portal.y + TANK_SIZE / 2;
    const blink = Math.floor(this.time * 12) % 2 === 0;

    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * progress;
    ctx.strokeStyle = blink ? '#8fe3ff' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 15 - progress * 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = blink ? '#8fe3ff' : '#ffe066';
    starPath(ctx, cx, cy, 9 * (0.4 + progress * 0.6), 4, 4);
    ctx.fill();
    ctx.restore();
  }

  private drawBanner(banner: Banner) {
    const ctx = this.ctx;
    const progress = banner.t / banner.dur;
    let alpha = 1;
    if (progress < 0.12) alpha = progress / 0.12;
    else if (progress > 0.75) alpha = Math.max(0, (1 - progress) / 0.25);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "Courier New", ui-monospace, monospace';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(banner.text, W / 2, H / 2 - 8);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(banner.text, W / 2, H / 2 - 8);

    ctx.strokeStyle = 'rgba(255, 209, 102, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 78, H / 2 + 14);
    ctx.lineTo(W / 2 + 78, H / 2 + 14);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ publish

  private publish() {
    const snapshot: Snapshot = {
      status: this.status,
      score: this.score,
      highScore: Math.max(this.highScore, this.score),
      lives: this.lives,
      level: this.levelIndex + 1,
      enemiesLeft: Math.max(0, this.total - this.killed),
      power: this.power,
      sound: this.sfx.enabled,
    };
    const json = JSON.stringify(snapshot);
    if (json !== this.snapshotJson) {
      this.snapshotJson = json;
      this.notify(snapshot);
    }
  }
}
