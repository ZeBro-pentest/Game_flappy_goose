// ==========================================
//  Утка-Прыгунья — Игра для Сони
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DOM
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('score-display');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const heartEls = document.querySelectorAll('.heart');

// ==========================================
//  Размеры (адаптивные)
// ==========================================
let W, H;
let GROUND_Y, DUCK_SIZE, OBSTACLE_WIDTH, OBSTACLE_GAP;
let OBSTACLE_SPACING, OBSTACLE_SPEED;

function resizeCanvas() {
    const wrapper = document.getElementById('game-wrapper');
    W = wrapper.clientWidth;
    H = wrapper.clientHeight;
    canvas.width = W;
    canvas.height = H;

    GROUND_Y = H;

    const isMobile = W < 500;

    DUCK_SIZE = Math.min(W, H) * (isMobile ? 0.14 : 0.11);
    OBSTACLE_WIDTH = Math.max(26, W * (isMobile ? 0.045 : 0.05));
    OBSTACLE_GAP = H * (isMobile ? 0.40 : 0.42);
    OBSTACLE_SPACING = W * (isMobile ? 0.60 : 0.50);
    OBSTACLE_SPEED = W * (isMobile ? 0.0025 : 0.0028);

    if (gameState === 'menu') drawStartBackground();
}

// ==========================================
//  Физика
// ==========================================
const GRAVITY = 0.35;
const JUMP_FORCE = -8.5;
const MAX_FALL = 8;

// ==========================================
//  Ресурсы
// ==========================================
const duckImg = new Image();
duckImg.src = 'images/Игрок.png';

// Уникальные фоны (загружаем каждый один раз)
const bgImageMap = {};
const bgUniqueSources = [
    'images/1.jpg',
    'images/2.png',
    'images/3.webp',
    'images/4.jpg',
    'images/5.png'
];

for (const src of bgUniqueSources) {
    const img = new Image();
    img.src = src;
    bgImageMap[src] = img;
}

// Цикл смены фонов: 1 → 3 → 4 → 5 → 4 → 2 → 1 → ...
const bgCycle = [
    'images/1.jpg',
    'images/3.webp',
    'images/4.jpg',
    'images/5.png',
    'images/4.jpg',
    'images/2.png',
    'images/1.jpg'
];
const BG_CHANGE_EVERY = 20; // смена фона каждые N очков
let currentBgIndex = 0;

const breadImg = new Image();
breadImg.src = 'images/хлеб-обычный.png';
const breadTimeImg = new Image();
breadTimeImg.src = 'images/хлеб-времени.png';
const breadBomberImg = new Image();
breadBomberImg.src = 'images/хлеб-подрывник.png';
const breadPortalImg = new Image();
breadPortalImg.src = 'images/хлеб-портал.png';

let assetsLoaded = 0;
const TOTAL_ASSETS = 5 + bgUniqueSources.length; // утка + 4 хлеба + все фоны

function onAssetLoad() {
    assetsLoaded++;
    if (assetsLoaded >= TOTAL_ASSETS) {
        resizeCanvas();
        drawStartBackground();
    }
}

duckImg.onload = onAssetLoad;
for (const img of Object.values(bgImageMap)) img.onload = onAssetLoad;
breadImg.onload = onAssetLoad;
breadTimeImg.onload = onAssetLoad;
breadBomberImg.onload = onAssetLoad;
breadPortalImg.onload = onAssetLoad;

// ==========================================
//  Состояние игры
// ==========================================
let gameState = 'menu';
let score = 0;
let lives = 3;
let bestScore = parseInt(localStorage.getItem('duckBestScore')) || 0;
let duck = {};
let obstacles = [];
let bgX = 0;
let particles = [];
let frameCount = 0;
let shakeTimer = 0;
let flashAlpha = 0;
let invincibleTimer = 0; // неуязвимость после удара

let animFrameId = null;

// Эффекты времени и портала
let timeScale = 1.0;
let slowTimer = 0;
let isInverted = false;

// Хлеб (бонус)
let bread = null;
let breadTimer = 0;
const BREAD_SPAWN_MIN = 480; // ~8 сек при 60fps
const BREAD_SPAWN_MAX = 900; // ~15 сек
const BREAD_SIZE_RATIO = 0.08;

// ==========================================
//  Утка
// ==========================================
function resetDuck() {
    duck = {
        x: W * 0.15,
        y: H * 0.4,
        width: DUCK_SIZE,
        height: DUCK_SIZE,
        vy: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        bobTimer: 0
    };
}

function jumpDuck() {
    duck.vy = JUMP_FORCE;
    // Эффект "Strtech" (вытягивание) при прыжке:
    // Уже и выше (scaleY > 1), но тоньше (scaleX < 1)
    duck.scaleX = 0.8;
    duck.scaleY = 1.25;

    // Частицы при прыжке
    for (let i = 0; i < 4; i++) {
        particles.push(createParticle(
            duck.x + duck.width / 2,
            duck.y + duck.height,
            (Math.random() - 0.5) * 3,
            Math.random() * 2 + 1,
            Math.random() * 3 + 2,
            `hsl(${40 + Math.random() * 20}, 100%, ${60 + Math.random() * 20}%)`
        ));
    }
}

function updateDuck() {
    duck.vy += GRAVITY * timeScale;
    // Ограничиваем максимальную скорость падения
    if (duck.vy > MAX_FALL) duck.vy = MAX_FALL;
    duck.y += duck.vy * timeScale;

    // Плавное вращение (сглаживание)
    const targetRot = Math.min(Math.max(duck.vy * 3.5, -25), 45); // целевой угол
    // Используем меньший коэффициент интерполяции для плавности (0.08 -> 0.1 для отзывчивости, но clamp скорости)
    // Чтобы убрать "резкость", ограничим скорость поворота
    let rotDiff = targetRot - duck.rotation;
    // Ограничиваем скорость изменения угла за кадр
    const maxRotSpeed = 3 * timeScale;
    if (rotDiff > maxRotSpeed) rotDiff = maxRotSpeed;
    if (rotDiff < -maxRotSpeed) rotDiff = -maxRotSpeed;

    duck.rotation += rotDiff;

    // Возврат масштаба (Squash & Stretch relax)
    duck.scaleX += (1 - duck.scaleX) * 0.1 * timeScale;
    duck.scaleY += (1 - duck.scaleY) * 0.1 * timeScale;

    // Лёгкое покачивание при полёте
    duck.bobTimer += 0.06;

    // Земля (упал вниз)
    if (duck.y > H) {
        loseLife();
    }

    // Потолок
    if (duck.y < 0) {
        duck.y = 0;
        duck.vy = 0.5;
    }

    // Таймер неуязвимости
    if (invincibleTimer > 0) invincibleTimer--;

    // Таймер замедления
    if (slowTimer > 0) {
        slowTimer--;
        if (slowTimer <= 0) timeScale = 1.0;
    }
}

function drawDuck() {
    ctx.save();
    const cx = duck.x + duck.width / 2;
    const cy = duck.y + duck.height / 2 + Math.sin(duck.bobTimer) * 1.5;
    ctx.translate(cx, cy);
    ctx.rotate((duck.rotation * Math.PI) / 180);
    // Масштабирование с учётом направления (зеркалим по X)
    ctx.scale(-duck.scaleX, duck.scaleY);

    // Мигание при неуязвимости
    if (invincibleTimer > 0 && Math.floor(invincibleTimer / 4) % 2 === 0) {
        ctx.globalAlpha = 0.3;
    }

    // Тень
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 4;

    ctx.drawImage(duckImg, -duck.width / 2, -duck.height / 2, duck.width, duck.height);
    ctx.restore();
}

// ==========================================
//  Препятствия
// ==========================================
function createObstacle(x) {
    const minY = 50;
    const maxY = GROUND_Y - OBSTACLE_GAP - 30;
    const gapY = minY + Math.random() * Math.max(1, maxY - minY);
    return { x, gapY, width: OBSTACLE_WIDTH, scored: false };
}

function resetObstacles() {
    obstacles = [];
    for (let i = 0; i < 4; i++) {
        obstacles.push(createObstacle(W + i * OBSTACLE_SPACING));
    }
}

function updateObstacles() {
    for (const obs of obstacles) {
        obs.x -= OBSTACLE_SPEED * timeScale;

        if (!obs.scored && obs.x + obs.width < duck.x) {
            obs.scored = true;
            score++;
            scoreDisplay.textContent = score;

            // Смена фона каждые N очков
            const newBgIndex = Math.floor(score / BG_CHANGE_EVERY) % bgCycle.length;
            if (newBgIndex !== currentBgIndex) {
                currentBgIndex = newBgIndex;
            }

            // Частицы +1
            for (let i = 0; i < 5; i++) {
                particles.push(createParticle(
                    duck.x + duck.width, duck.y,
                    Math.random() * 4 + 1, (Math.random() - 0.5) * 4,
                    Math.random() * 2 + 1,
                    '#ffd700'
                ));
            }
        }
    }

    // Рециклим
    if (obstacles.length > 0 && obstacles[0].x + obstacles[0].width < -30) {
        obstacles.shift();
        const last = obstacles[obstacles.length - 1];
        obstacles.push(createObstacle(last.x + OBSTACLE_SPACING));
    }
}

function drawObstacle(obs) {
    // Верхняя труба
    drawPipe(obs.x, 0, obs.width, obs.gapY, true);
    // Нижняя труба
    const botY = obs.gapY + OBSTACLE_GAP;
    drawPipe(obs.x, botY, obs.width, H - botY, false);
}

function drawPipe(x, y, w, h, fromTop) {
    if (h <= 0) return;
    ctx.save();

    const capH = 26;
    const borderW = 3;

    // Градиент трубы
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#558c22');
    grad.addColorStop(0.1, '#73bf2e');
    grad.addColorStop(0.4, '#9ce659'); // блик
    grad.addColorStop(0.8, '#73bf2e');
    grad.addColorStop(1, '#538a21');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#2d4a12';
    ctx.lineWidth = borderW;

    // Тело трубы
    if (fromTop) {
        // Верхняя: тело идет до шапки
        const bodyH = Math.max(0, h - capH);
        if (bodyH > 0) {
            ctx.fillRect(x, y - 10, w, bodyH + 10); // +10 чтобы скрыть стык сверху
            ctx.strokeRect(x, y - 10, w, bodyH + 10);
        }

        // Шапка внизу
        const capY = y + h - capH;
        ctx.fillRect(x - 3, capY, w + 6, capH);
        ctx.strokeRect(x - 3, capY, w + 6, capH);

        // Внутренний блик на шапке
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x - 3, capY + 2, w + 6, 2);
    } else {
        // Нижняя: шапка сверху
        ctx.fillRect(x - 3, y, w + 6, capH);
        ctx.strokeRect(x - 3, y, w + 6, capH);

        // Тело ниже шапки
        const bodyY = y + capH;
        const bodyH = Math.max(0, h - capH);
        if (bodyH > 0) {
            ctx.fillStyle = grad; // восстановим цвет
            ctx.fillRect(x, bodyY, w, bodyH); // до низа экрана
            ctx.strokeRect(x, bodyY, w, bodyH);

            // Чтобы убрать нижнюю границу рамки (она уходит за экран), можно рисовать чуть больше:
            ctx.fillRect(x, bodyY, w, bodyH + 10);
            ctx.strokeRect(x, bodyY, w, bodyH + 10);
        }

        // Внутренний блик на шапке
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x - 3, y + 2, w + 6, 2);
    }

    ctx.restore();
}

// ==========================================
//  Столкновения
// ==========================================
function checkCollision() {
    if (invincibleTimer > 0) return false;

    const pad = DUCK_SIZE * 0.18;
    const dx = duck.x + pad;
    const dy = duck.y + pad;
    const dw = duck.width - pad * 2;
    const dh = duck.height - pad * 2;

    for (const obs of obstacles) {
        const colW = obs.width * 0.6;
        const colX = obs.x + (obs.width - colW) / 2;

        // Верхний
        if (rectsOverlap(dx, dy, dw, dh, colX, 0, colW, obs.gapY)) return true;
        // Нижний
        const botY = obs.gapY + OBSTACLE_GAP;
        if (rectsOverlap(dx, dy, dw, dh, colX, botY, colW, H - botY)) return true;
    }
    return false;
}

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

// ==========================================
//  Жизни
// ==========================================
function updateHeartsUI() {
    heartEls.forEach((el, i) => {
        if (i < lives) {
            el.classList.remove('lost');
            el.textContent = '❤️';
        } else {
            el.classList.add('lost');
            el.textContent = '🖤';
        }
    });
}

function loseLife() {
    lives--;
    invincibleTimer = 90; // ~1.5 сек неуязвимости
    shakeTimer = 8;
    flashAlpha = 0.35;

    // Анимация потерянного сердечка
    if (lives >= 0 && lives < heartEls.length) {
        heartEls[lives].classList.add('hit');
        setTimeout(() => {
            heartEls[lives].classList.remove('hit');
            updateHeartsUI();
        }, 400);
    }

    // Частицы удара
    for (let i = 0; i < 10; i++) {
        particles.push(createParticle(
            duck.x + duck.width / 2,
            duck.y + duck.height / 2,
            (Math.random() - 0.5) * 7,
            (Math.random() - 0.5) * 7,
            Math.random() * 4 + 2,
            `hsl(${Math.random() * 40 + 10}, 100%, 55%)`
        ));
    }

    // Отбросить утку вверх
    duck.vy = -5;

    if (lives <= 0) {
        setTimeout(gameOver, 300);
    }
}

// ==========================================
//  Хлеб (бонус +1 жизнь)
// ==========================================
function spawnBread() {
    const size = Math.min(W, H) * BREAD_SIZE_RATIO;
    // Появляется в правой половине экрана, в безопасной зоне
    const x = W * 0.6 + Math.random() * W * 0.3;
    const minY = 60;
    const maxY = GROUND_Y - size - 30;
    const y = minY + Math.random() * (maxY - minY);

    // Выбор типа хлеба
    const rand = Math.random();
    let type = 'regular';
    if (rand < 0.15) type = 'portal';
    else if (rand < 0.35) type = 'bomber';
    else if (rand < 0.60) type = 'time';

    bread = { x, y, size, bobTimer: 0, glow: 0, type };
}

function updateBread() {
    if (bread) {
        bread.x -= OBSTACLE_SPEED * timeScale;
        bread.bobTimer += 0.05;
        bread.glow += 0.04;

        // Ушёл за экран
        if (bread.x + bread.size < -10) {
            bread = null;
            breadTimer = BREAD_SPAWN_MIN + Math.random() * (BREAD_SPAWN_MAX - BREAD_SPAWN_MIN);
            return;
        }

        // Проверка подбора
        const pad = bread.size * 0.1;
        if (rectsOverlap(
            duck.x + duck.width * 0.15, duck.y + duck.height * 0.15,
            duck.width * 0.7, duck.height * 0.7,
            bread.x + pad, bread.y + pad,
            bread.size - pad * 2, bread.size - pad * 2
        )) {
            collectBread();
        }
    } else {
        breadTimer--;
        if (breadTimer <= 0) {
            spawnBread();
        }
    }
}

function drawBread() {
    if (!bread) return;
    ctx.save();

    const cx = bread.x + bread.size / 2;
    const cy = bread.y + bread.size / 2 + Math.sin(bread.bobTimer) * 4;

    // Золотое свечение (меняем цвет в зависимости от типа)
    let shadowColor = 'rgba(255, 220, 80, 0.8)';
    let img = breadImg;

    if (bread.type === 'time') {
        shadowColor = 'rgba(0, 200, 255, 0.8)';
        img = breadTimeImg;
    } else if (bread.type === 'bomber') {
        shadowColor = 'rgba(255, 50, 50, 0.8)';
        img = breadBomberImg;
    } else if (bread.type === 'portal') {
        shadowColor = 'rgba(200, 50, 255, 0.8)';
        img = breadPortalImg;
    }

    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 15 + Math.sin(bread.glow) * 5;

    ctx.drawImage(
        img,
        bread.x,
        cy - bread.size / 2,
        bread.size,
        bread.size
    );

    ctx.restore();
}

function collectBread() {
    // Частицы подбора
    let particleColor = `hsl(${100 + Math.random() * 40}, 80%, 55%)`;
    if (bread.type === 'time') particleColor = '#00ffff';
    else if (bread.type === 'bomber') particleColor = '#ff3333';
    else if (bread.type === 'portal') particleColor = '#aa33ff';

    for (let i = 0; i < 12; i++) {
        particles.push(createParticle(
            bread.x + bread.size / 2,
            bread.y + bread.size / 2,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            Math.random() * 4 + 2,
            particleColor
        ));
    }

    if (bread.type === 'regular') {
        if (lives < 3) {
            lives++;
            updateHeartsUI();
        }
        flashAlpha = 0.2; // зелёная вспышка
    } else if (bread.type === 'time') {
        timeScale = 0.5;
        slowTimer = 300; // 5 сек при 60fps
    } else if (bread.type === 'bomber') {
        lives -= 2;
        updateHeartsUI();
        shakeTimer = 15;
        flashAlpha = 0.5; // красная вспышка
        if (lives <= 0) setTimeout(gameOver, 300);
    } else if (bread.type === 'portal') {
        isInverted = !isInverted;
        const wrapper = document.getElementById('game-wrapper');
        if (isInverted) wrapper.classList.add('inverted');
        else wrapper.classList.remove('inverted');
    }

    bread = null;
    breadTimer = BREAD_SPAWN_MIN + Math.random() * (BREAD_SPAWN_MAX - BREAD_SPAWN_MIN);
}
// ==========================================
//  Частицы
// ==========================================
function createParticle(x, y, vx, vy, size, color) {
    return { x, y, vx, vy, life: 1, size, color };
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * timeScale;
        p.y += p.vy * timeScale;
        p.life -= 0.028 * timeScale;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
//  Фон
// ==========================================
function drawBackground() {
    bgX -= OBSTACLE_SPEED * 0.35 * timeScale;
    if (bgX <= -W) bgX += W;

    const bgName = bgCycle[currentBgIndex];
    const activeBg = bgImageMap[bgName];
    ctx.drawImage(activeBg, bgX, 0, W, H);
    ctx.drawImage(activeBg, bgX + W, 0, W, H);

    // drawGround();
}

function drawGround() {
    // Земля удалена
}

function drawStartBackground() {
    if (assetsLoaded < 2) return;
    const startBgName = bgCycle[0];
    ctx.drawImage(bgImageMap[startBgName], 0, 0, W, H);
    // drawGround();

    const sz = DUCK_SIZE * 1.6;
    ctx.save();
    ctx.translate(W / 2, H / 2 + H * 0.03);
    ctx.scale(-1, 1); // зеркалим
    ctx.drawImage(duckImg, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
}

// ==========================================
//  Эффекты
// ==========================================
function applyScreenEffects() {
    if (shakeTimer > 0) {
        ctx.translate(
            (Math.random() - 0.5) * shakeTimer * 0.8,
            (Math.random() - 0.5) * shakeTimer * 0.8
        );
        shakeTimer--;
    }

    if (flashAlpha > 0) {
        // Красная вспышка при уроне, зелёная при лечении
        const isHealing = lives > 0 && flashAlpha <= 0.2 && invincibleTimer === 0;
        const flashColor = isHealing ? '80, 255, 80' : '255, 80, 80';
        ctx.fillStyle = `rgba(${flashColor}, ${flashAlpha})`;
        ctx.fillRect(-10, -10, W + 20, H + 20);
        flashAlpha -= 0.02;
    }
}

// ==========================================
//  Основной цикл
// ==========================================
function gameLoop() {
    // После game over — дорисовываем эффекты
    if (gameState !== 'playing') {
        if (shakeTimer > 0 || flashAlpha > 0 || particles.length > 0) {
            ctx.save();
            drawBackground();
            for (const obs of obstacles) drawObstacle(obs);
            drawBread();
            drawDuck();
            updateParticles();
            drawParticles();
            applyScreenEffects();
            ctx.restore();
            animFrameId = requestAnimationFrame(gameLoop);
        }
        return;
    }

    frameCount++;
    ctx.save();

    drawBackground();

    updateObstacles();
    for (const obs of obstacles) drawObstacle(obs);

    updateBread();
    drawBread();

    updateDuck();
    drawDuck();

    updateParticles();
    drawParticles();

    if (checkCollision()) {
        loseLife();
    }

    applyScreenEffects();
    ctx.restore();

    animFrameId = requestAnimationFrame(gameLoop);
}

// ==========================================
//  Управление
// ==========================================
function startGame() {
    gameState = 'playing';
    score = 0;
    lives = 3;
    bgX = 0;
    particles = [];
    frameCount = 0;
    shakeTimer = 0;
    flashAlpha = 0;
    invincibleTimer = 0;
    invincibleTimer = 0;
    currentBgIndex = 0;
    timeScale = 1.0;
    slowTimer = 0;
    isInverted = false;
    document.getElementById('game-wrapper').classList.remove('inverted');

    bread = null;
    breadTimer = BREAD_SPAWN_MIN + Math.random() * (BREAD_SPAWN_MAX - BREAD_SPAWN_MIN);

    scoreDisplay.textContent = '0';
    hud.style.display = 'flex';
    updateHeartsUI();

    resizeCanvas();
    resetDuck();
    resetObstacles();

    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');

    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'gameover';

    shakeTimer = 12;
    flashAlpha = 0.5;

    // Взрыв
    for (let i = 0; i < 18; i++) {
        particles.push(createParticle(
            duck.x + duck.width / 2,
            duck.y + duck.height / 2,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            Math.random() * 5 + 2,
            `hsl(${Math.random() * 50 + 10}, 100%, 55%)`
        ));
    }

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('duckBestScore', bestScore);
    }

    hud.style.display = 'none';
    finalScoreEl.textContent = `Счёт: ${score}`;
    bestScoreEl.textContent = `Лучший: ${bestScore}`;

    setTimeout(() => {
        gameoverScreen.classList.remove('hidden');
    }, 500);
}

// ==========================================
//  Ввод
// ==========================================
function handleJump(e) {
    e.preventDefault();
    e.stopPropagation();
    if (gameState === 'playing') jumpDuck();
}

// Тач (телефон)
document.addEventListener('touchstart', function (e) {
    if (gameState !== 'playing') return;
    if (e.target.tagName === 'BUTTON') return;
    handleJump(e);
}, { passive: false });

// Клик (ПК)
canvas.addEventListener('mousedown', function (e) {
    if (gameState === 'playing') handleJump(e);
});

// Клавиатура
document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (gameState === 'playing') handleJump(e);
    }
});

// Кнопки
startBtn.addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
restartBtn.addEventListener('click', (e) => { e.stopPropagation(); startGame(); });

// Тач на кнопках для мобильных без задержки
startBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); startGame(); });
restartBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); startGame(); });

// Ресайз
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 250));

// Предотвращаем scroll на мобильных
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ==========================================
//  Старт
// ==========================================
bestScoreEl.textContent = `Лучший: ${bestScore}`;
resizeCanvas();
