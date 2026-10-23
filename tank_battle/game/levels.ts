export interface LevelDef {
  name: string;
  map: string[];
  total: number;
  maxOnField: number;
}

/**
 * Map legend:
 *  .  empty
 *  B  brick (destructible)
 *  S  steel (only destroyed by level-3 player bullets)
 *  W  water (blocks tanks, bullets fly over)
 *  G  grass (tanks are hidden beneath it)
 *
 * The base (eagle) always occupies cols 6-7 / rows 13-14.
 * Its protective brick ring lives at:
 *   row 12: cols 5-8, rows 13-14: col 5 and col 8.
 */
export const LEVELS: LevelDef[] = [
  {
    name: '外围阵地',
    total: 10,
    maxOnField: 4,
    map: [
      '...............',
      '..BB.......BB..',
      '..BB.......BB..',
      '...............',
      '.BB.BBBBBBB.BB.',
      '.BB.B.....B.BB.',
      '....B.....B....',
      'BB..B.BBB.B..BB',
      '....B.B.B.B....',
      '.BB.B.B.B.B.BB.',
      '.BB...B.B...BB.',
      '....BBBB.BB....',
      '.....BBBB......',
      '.....B..BB.....',
      '.....B..BB.....',
    ],
  },
  {
    name: '水泽要塞',
    total: 12,
    maxOnField: 4,
    map: [
      '...............',
      '.BB.SSSSSSS.BB.',
      '.BB.S.....S.BB.',
      '....S.BBB.S....',
      'WW..S.B.B.S..WW',
      'WW....B.B....WW',
      '....BBB.BBB....',
      '.GG...B.B...GG.',
      '.GG.BBB.BBB.GG.',
      '....B.....B....',
      'SS..B.BBB.B..SS',
      'BB....BBB....BB',
      '.....BBBB......',
      '.....B..BB.....',
      '.....B..BB.....',
    ],
  },
  {
    name: '钢铁核心',
    total: 14,
    maxOnField: 5,
    map: [
      '...............',
      '..S.BBBBBBB.S..',
      '..S.B.....B.S..',
      '..S.B.SSS.B.S..',
      '....B.S.S.B....',
      'BB..B.S.S.B..BB',
      'BB....S.S....BB',
      '.BBB..S.S..BBB.',
      '...B..BBB..B...',
      '.W.B.......B.W.',
      '.W.BBB.B.BBB.W.',
      '.....BBB.B.....',
      '.....BBBB......',
      '.....B..BB.....',
      '.....B..BB.....',
    ],
  },
];

if (process.env.NODE_ENV === 'development') {
  LEVELS.forEach((level, i) => {
    if (level.map.length !== 15) {
      throw new Error(`Level ${i + 1} must have 15 rows, got ${level.map.length}`);
    }
    level.map.forEach((row, r) => {
      if (row.length !== 15) {
        throw new Error(`Level ${i + 1} row ${r} must have 15 chars, got ${row.length}`);
      }
    });
  });
}
