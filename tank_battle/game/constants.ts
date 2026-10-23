export const TILE = 32;
export const COLS = 15;
export const ROWS = 15;
export const W = TILE * COLS;
export const H = TILE * ROWS;

export const TANK_SIZE = 28;
export const TANK_OFFSET = (TILE - TANK_SIZE) / 2;
export const BULLET_SIZE = 7;

export const BASE_COL = 6;
export const BASE_ROW = 13;
export const BASE_RECT = {
  x: BASE_COL * TILE,
  y: BASE_ROW * TILE,
  w: TILE * 2,
  h: TILE * 2,
};

export const PLAYER_SPAWN = {
  x: 4 * TILE + TANK_OFFSET,
  y: 14 * TILE + TANK_OFFSET,
};

export const ENEMY_SPAWNS = [0, 7, 14].map((col) => ({
  x: col * TILE + TANK_OFFSET,
  y: TANK_OFFSET,
}));

export const T_EMPTY = 0;
export const T_BRICK = 1;
export const T_STEEL = 2;
export const T_WATER = 3;
export const T_GRASS = 4;

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_VEC: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};
