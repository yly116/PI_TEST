'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Dir } from '@/game/constants';
import { TankGame, type Snapshot } from '@/game/engine';

const INITIAL_SNAPSHOT: Snapshot = {
  status: 'ready',
  score: 0,
  highScore: 0,
  lives: 3,
  level: 1,
  enemiesLeft: 10,
  power: 1,
  sound: true,
};

function pad(value: number, length: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(length, '0');
}

interface HoldHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}

export default function TankBattle() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<TankGame | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new TankGame(canvas, setSnapshot);
    gameRef.current = game;
    game.start();

    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const startGame = useCallback(() => {
    gameRef.current?.startGame();
  }, []);

  const togglePause = useCallback(() => {
    gameRef.current?.togglePause();
  }, []);

  const toggleSound = useCallback(() => {
    gameRef.current?.toggleSound();
  }, []);

  const hold = useCallback(
    (dir: Dir): HoldHandlers => ({
      onPointerDown: (event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        gameRef.current?.press(dir);
      },
      onPointerUp: (event) => {
        event.preventDefault();
        gameRef.current?.release(dir);
      },
      onPointerCancel: () => gameRef.current?.release(dir),
      onLostPointerCapture: () => gameRef.current?.release(dir),
      onContextMenu: (event) => event.preventDefault(),
    }),
    [],
  );

  const fireHandlers: HoldHandlers = {
    onPointerDown: (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gameRef.current?.setFire(true);
    },
    onPointerUp: (event) => {
      event.preventDefault();
      gameRef.current?.setFire(false);
    },
    onPointerCancel: () => gameRef.current?.setFire(false),
    onLostPointerCapture: () => gameRef.current?.setFire(false),
    onContextMenu: (event) => event.preventDefault(),
  };

  const { status } = snapshot;
  const overlayVisible =
    status === 'ready' || status === 'paused' || status === 'gameover' || status === 'victory';
  const pauseDisabled = status !== 'playing' && status !== 'paused';

  return (
    <section className="shell">
      <header className="brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="brand-text">
          <h1>
            TANK<span>BATTLE</span>
          </h1>
          <p>坦克大战 · 守住老鹰基地</p>
        </div>
        <div className="brand-badge">FC 1985</div>
      </header>

      <div className="hud" role="status" aria-label="游戏状态">
        <div className="stat">
          <span>SCORE</span>
          <b>{pad(snapshot.score, 6)}</b>
        </div>
        <div className="stat">
          <span>HI-SCORE</span>
          <b>{pad(snapshot.highScore, 6)}</b>
        </div>
        <div className="stat">
          <span>STAGE</span>
          <b>{snapshot.level}</b>
        </div>
        <div className="stat">
          <span>LIVES</span>
          <b className="lives">
            {Array.from({ length: Math.max(0, snapshot.lives) }, (_, i) => (
              <i key={i} aria-hidden="true">
                ▲
              </i>
            ))}
            {snapshot.lives <= 0 ? '—' : ''}
          </b>
        </div>
        <div className="stat">
          <span>ENEMY</span>
          <b>{pad(snapshot.enemiesLeft, 2)}</b>
        </div>
      </div>

      <div className="screen-frame">
        <div className="screen">
          <canvas ref={canvasRef} className="game-canvas" aria-label="坦克大战游戏画面" />
          <div className="scanlines" aria-hidden="true" />
          <div className="glare" aria-hidden="true" />

          {overlayVisible && (
            <div className={`overlay overlay-${status}`}>
              {status === 'ready' && (
                <div className="overlay-card">
                  <p className="kicker">BATTLE CITY CLASSIC</p>
                  <h2 className="title">
                    TANK<span>BATTLE</span>
                  </h2>
                  <p className="lede">
                    驾驶坦克，击毁全部敌军，保护基地老鹰。
                    <br />
                    小心埋伏 —— 敌人会从三个方向不断涌入。
                  </p>
                  <button type="button" className="btn primary" onClick={startGame}>
                    <span>开始游戏</span>
                    <kbd>Enter</kbd>
                  </button>
                  <ul className="keys">
                    <li>
                      <kbd>↑</kbd>
                      <kbd>↓</kbd>
                      <kbd>←</kbd>
                      <kbd>→</kbd>
                      <span>/ WASD 移动</span>
                    </li>
                    <li>
                      <kbd>Space</kbd>
                      <span>/ J 射击</span>
                    </li>
                    <li>
                      <kbd>P</kbd>
                      <span>暂停</span>
                      <kbd>M</kbd>
                      <span>音效</span>
                    </li>
                  </ul>
                </div>
              )}

              {status === 'paused' && (
                <div className="overlay-card compact">
                  <p className="kicker">PAUSED</p>
                  <h2 className="title small">暂停中</h2>
                  <p className="lede">按 P 或点击下方按钮继续战斗</p>
                  <button type="button" className="btn primary" onClick={togglePause}>
                    <span>继续游戏</span>
                    <kbd>P</kbd>
                  </button>
                </div>
              )}

              {status === 'gameover' && (
                <div className="overlay-card compact">
                  <p className="kicker danger">MISSION FAILED</p>
                  <h2 className="title small danger">GAME OVER</h2>
                  <div className="score-board">
                    <div>
                      <span>SCORE</span>
                      <b>{pad(snapshot.score, 6)}</b>
                    </div>
                    <div>
                      <span>HI-SCORE</span>
                      <b>{pad(snapshot.highScore, 6)}</b>
                    </div>
                  </div>
                  <button type="button" className="btn primary" onClick={startGame}>
                    <span>再来一局</span>
                    <kbd>Enter</kbd>
                  </button>
                </div>
              )}

              {status === 'victory' && (
                <div className="overlay-card compact">
                  <p className="kicker victory">ALL STAGES CLEAR</p>
                  <h2 className="title small victory">VICTORY!</h2>
                  <p className="lede">总部安全，敌军已被全部击退。</p>
                  <div className="score-board">
                    <div>
                      <span>SCORE</span>
                      <b>{pad(snapshot.score, 6)}</b>
                    </div>
                    <div>
                      <span>HI-SCORE</span>
                      <b>{pad(snapshot.highScore, 6)}</b>
                    </div>
                  </div>
                  <button type="button" className="btn primary" onClick={startGame}>
                    <span>再战一次</span>
                    <kbd>Enter</kbd>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="screen-footer">
          <div className="power" aria-label={`火力等级 ${snapshot.power}`}>
            <span>POWER</span>
            <b>
              {'★'.repeat(snapshot.power)}
              {'☆'.repeat(Math.max(0, 3 - snapshot.power))}
            </b>
          </div>
          <div className="footer-actions">
            <button type="button" className="btn ghost" onClick={toggleSound}>
              {snapshot.sound ? '🔊 音效开' : '🔇 音效关'}
            </button>
            <button type="button" className="btn ghost" onClick={togglePause} disabled={pauseDisabled}>
              {status === 'paused' ? '▶ 继续' : '❚❚ 暂停'}
            </button>
          </div>
        </div>
      </div>

      <div className="touch-controls" aria-label="触屏操作">
        <div className="dpad">
          <button type="button" className="pad pad-up" aria-label="向上" {...hold('up')}>
            ▲
          </button>
          <button type="button" className="pad pad-left" aria-label="向左" {...hold('left')}>
            ◀
          </button>
          <div className="pad-center" aria-hidden="true" />
          <button type="button" className="pad pad-right" aria-label="向右" {...hold('right')}>
            ▶
          </button>
          <button type="button" className="pad pad-down" aria-label="向下" {...hold('down')}>
            ▼
          </button>
        </div>
        <button type="button" className="fire" aria-label="开火" {...fireHandlers}>
          FIRE
        </button>
      </div>

      <p className="hint">
        <span>目标：保护基地，消灭全部敌军</span>
        <span className="dot" aria-hidden="true" />
        <span>砖墙可摧毁，钢墙需要三星火力</span>
      </p>
    </section>
  );
}
