// ローグライク ダンジョン探索ゲーム
// タイル定数
const TILE = {
  WALL: 0,
  FLOOR: 1,
  STAIRS: 2,
};

const MAP_WIDTH = 50;
const MAP_HEIGHT = 35;
const TILE_SIZE = 16;

// ゲーム状態
let canvas, ctx;
let map = [];
let visible = [];
let explored = [];
let player = { x: 0, y: 0, hp: 20, maxHp: 20, atk: 3 };
let enemies = [];
let stairs = { x: 0, y: 0 };
let currentFloor = 1;
let gameStarted = false;
let gameOver = false;
let onStairs = false;

// 色定義（ダークテーマ）
const COLORS = {
  wall: '#2d2d2d',
  floor: '#1a1a1a',
  floorLit: '#3d3d3d',
  player: '#4ade80',
  enemy: '#f87171',
  stairs: '#fbbf24',
  health: '#22c55e',
  text: '#e5e5e5',
};

// ログ追加
function addLog(message) {
  const logBox = document.getElementById('log');
  const p = document.createElement('p');
  p.textContent = message;
  logBox.insertBefore(p, logBox.firstChild);
  while (logBox.children.length > 15) logBox.removeChild(logBox.lastChild);
}

// ランダム整数
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 部屋の重なりチェック
function roomsOverlap(r1, r2, margin = 2) {
  return r1.x - margin < r2.x + r2.w &&
         r1.x + r1.w + margin > r2.x &&
         r1.y - margin < r2.y + r2.h &&
         r1.y + r1.h + margin > r2.y;
}

// ダンジョン生成（部屋と廊下方式）
function generateDungeon() {
  const mapData = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(TILE.WALL));
  const rooms = [];
  const numRooms = randInt(8, 15);

  for (let i = 0; i < numRooms; i++) {
    const w = randInt(5, 12);
    const h = randInt(4, 8);
    const x = randInt(1, MAP_WIDTH - w - 1);
    const y = randInt(1, MAP_HEIGHT - h - 1);

    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };

    let overlaps = false;
    for (const other of rooms) {
      if (roomsOverlap(room, other)) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      rooms.push(room);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          mapData[y + dy][x + dx] = TILE.FLOOR;
        }
      }
    }
  }

  // 廊下で部屋を接続
  for (let i = 1; i < rooms.length; i++) {
    const prev = rooms[i - 1];
    const curr = rooms[i];
    let x = prev.cx, y = prev.cy;

    while (x !== curr.cx || y !== curr.cy) {
      mapData[y][x] = TILE.FLOOR;
      if (x < curr.cx) x++;
      else if (x > curr.cx) x--;
      else if (y < curr.cy) y++;
      else if (y > curr.cy) y--;
    }
    mapData[curr.cy][curr.cx] = TILE.FLOOR;
  }

  // 階段をランダムな部屋に配置（プレイヤーと別の部屋）
  const stairsRoom = rooms[randInt(1, rooms.length - 1)];
  stairs.x = stairsRoom.cx;
  stairs.y = stairsRoom.cy;
  mapData[stairs.y][stairs.x] = TILE.STAIRS;

  // プレイヤーを最初の部屋に配置
  const startRoom = rooms[0];
  player.x = startRoom.cx;
  player.y = startRoom.cy;

  // 敵を配置
  enemies = [];
  const enemyCount = randInt(3, 8) + currentFloor;
  for (let i = 0; i < enemyCount; i++) {
    const room = rooms[randInt(0, rooms.length - 1)];
    let ex = room.x + randInt(1, room.w - 2);
    let ey = room.y + randInt(1, room.h - 2);
    if (ex === player.x && ey === player.y) continue;
    if (ex === stairs.x && ey === stairs.y) continue;

    const enemyHp = 5 + currentFloor * 2;
    const enemyAtk = 1 + Math.floor(currentFloor / 2);
    enemies.push({ x: ex, y: ey, hp: enemyHp, maxHp: enemyHp, atk: enemyAtk });
  }

  return mapData;
}

// 視界計算（シンプルな円形視界）
function updateVisibility() {
  const sightRange = 8;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const dist = Math.sqrt((x - player.x) ** 2 + (y - player.y) ** 2);
      if (dist <= sightRange && hasLineOfSight(player.x, player.y, x, y)) {
        visible[y][x] = true;
        explored[y][x] = true;
      } else {
        visible[y][x] = false;
      }
    }
  }
}

// 簡易レイキャスト風の視界
function hasLineOfSight(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (map[y0][x0] === TILE.WALL) return false;
    if (x0 === x1 && y0 === y1) return true;

    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

// 敵の位置を取得
function getEnemyAt(x, y) {
  return enemies.find(e => e.x === x && e.y === y && e.hp > 0);
}

// プレイヤーが敵に隣接しているか
function isAdjacentToEnemy() {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  return dirs.some(([dx, dy]) => getEnemyAt(player.x + dx, player.y + dy));
}

// プレイヤー移動
function movePlayer(dx, dy) {
  if (gameOver) return;

  const nx = player.x + dx;
  const ny = player.y + dy;

  if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) return;

  const tile = map[ny][nx];
  const enemy = getEnemyAt(nx, ny);

  if (enemy) {
    // 戦闘
    enemy.hp -= player.atk;
    addLog(`敵に${player.atk}ダメージ！`);
    if (enemy.hp <= 0) {
      addLog('敵を倒した！');
    }
    return;
  }

  if (tile === TILE.WALL) return;
  if (tile === TILE.STAIRS) {
    player.x = nx;
    player.y = ny;
    updateVisibility();
    onStairs = true;
    document.getElementById('victoryScreen').classList.add('visible');
    render();
    return;
  }

  player.x = nx;
  player.y = ny;
  updateVisibility();

  // 敵のターン
  enemyTurn();
}

// 敵のターン
function enemyTurn() {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;

    const dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
    if (dist <= 1) {
      player.hp -= enemy.atk;
      addLog(`敵の攻撃！${enemy.atk}ダメージを受けた`);
      if (player.hp <= 0) {
        player.hp = 0;
        gameOver = true;
        document.getElementById('gameOverScreen').classList.add('visible');
        document.getElementById('finalFloor').textContent = currentFloor;
      }
    } else if (dist < 6 && Math.random() < 0.5) {
      // プレイヤーに近づく
      let bestDx = 0, bestDy = 0, bestDist = dist;
      for (const [dx, dy] of dirs) {
        const nx = enemy.x + dx, ny = enemy.y + dy;
        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
        if (map[ny][nx] === TILE.WALL) continue;
        if (getEnemyAt(nx, ny)) continue;
        const nd = Math.abs(nx - player.x) + Math.abs(ny - player.y);
        if (nd < bestDist) {
          bestDist = nd;
          bestDx = dx;
          bestDy = dy;
        }
      }
      if (bestDx !== 0 || bestDy !== 0) {
        enemy.x += bestDx;
        enemy.y += bestDy;
      }
    }
  }
}

// 描画
function render() {
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!explored[y][x]) continue;

      const screenX = x * TILE_SIZE;
      const screenY = y * TILE_SIZE;

      const isLit = visible[y][x];
      const alpha = isLit ? 1 : 0.3;

      if (map[y][x] === TILE.WALL) {
        ctx.fillStyle = COLORS.wall;
        ctx.globalAlpha = alpha;
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = isLit ? COLORS.floorLit : COLORS.floor;
        ctx.globalAlpha = alpha;
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
      }

      if (map[y][x] === TILE.STAIRS && explored[y][x]) {
        ctx.fillStyle = COLORS.stairs;
        ctx.globalAlpha = alpha;
        ctx.font = `${TILE_SIZE - 2}px monospace`;
        ctx.fillText('>', screenX + 2, screenY + TILE_SIZE - 2);
      }

      ctx.globalAlpha = 1;
    }
  }

  // 敵を描画
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (!visible[enemy.y][enemy.x]) continue;

    const screenX = enemy.x * TILE_SIZE;
    const screenY = enemy.y * TILE_SIZE;
    ctx.fillStyle = COLORS.enemy;
    ctx.font = `${TILE_SIZE - 2}px monospace`;
    ctx.fillText('E', screenX + 2, screenY + TILE_SIZE - 2);
  }

  // プレイヤー
  const px = player.x * TILE_SIZE;
  const py = player.y * TILE_SIZE;
  ctx.fillStyle = COLORS.player;
  ctx.font = `${TILE_SIZE - 2}px monospace`;
  ctx.fillText('@', px + 2, py + TILE_SIZE - 2);

  // UI更新
  document.getElementById('playerHp').textContent = player.hp;
  document.getElementById('playerMaxHp').textContent = player.maxHp;
  document.getElementById('playerAtk').textContent = player.atk;
  document.getElementById('floor').textContent = currentFloor;
}

// 次の階へ
function nextFloor() {
  currentFloor++;
  player.hp = Math.min(player.maxHp, player.hp + 5);
  onStairs = false;
  document.getElementById('victoryScreen').classList.remove('visible');
  initFloor();
}

// フロア初期化
function initFloor() {
  map = generateDungeon();
  visible = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(false));
  explored = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(false));
  updateVisibility();
  addLog(`${currentFloor}階に到着した`);
}

// ゲーム開始
function startGame() {
  gameStarted = true;
  gameOver = false;
  currentFloor = 1;
  player = { x: 0, y: 0, hp: 20, maxHp: 20, atk: 3 };
  document.getElementById('titleScreen').classList.remove('visible');
  document.getElementById('gameWrapper').classList.add('visible');
  document.getElementById('gameOverScreen').classList.remove('visible');
  document.getElementById('log').innerHTML = '';

  initFloor();
  render();
}

// リトライ
function retry() {
  document.getElementById('gameOverScreen').classList.remove('visible');
  startGame();
}

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = MAP_WIDTH * TILE_SIZE;
  canvas.height = MAP_HEIGHT * TILE_SIZE;

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('retry-btn').addEventListener('click', retry);
  document.getElementById('descend-btn').addEventListener('click', nextFloor);

  document.addEventListener('keydown', (e) => {
    if (!gameStarted || gameOver || onStairs) return;

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); movePlayer(0, -1); break;
      case 'ArrowDown': e.preventDefault(); movePlayer(0, 1); break;
      case 'ArrowLeft': e.preventDefault(); movePlayer(-1, 0); break;
      case 'ArrowRight': e.preventDefault(); movePlayer(1, 0); break;
    }
    render();
  });
});
