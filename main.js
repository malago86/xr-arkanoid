import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

// Game Constants
const ARENA_WIDTH = 4;
const ARENA_HEIGHT = 3;
const ARENA_DEPTH = 10;
const BRICK_ROWS = 6;
const BRICK_COLS = 5;
const BRICK_SLICES = 5;
const BALL_RADIUS = 0.1;
const BALL_SPEED = 0.05;
const HAND_RADIUS = 0.15;
const GAME_DURATION = 5 * 60; // 5 minutes in seconds

let score = 0;
let gameState = 'WAITING'; // WAITING, COUNTDOWN, PLAYING, GAMEOVER, LEVEL_COMPLETE
let gameTimeLeft = GAME_DURATION;
let countdownValue = 5;
let ballCountdownValue = 5;

// Three.js Core
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 1); // Moved back to see the paddle and arena

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemisphereLight.position.set(0, 10, 0);
scene.add(hemisphereLight);

const pointLight = new THREE.PointLight(0xffffff, 1.5, 20);
pointLight.position.set(0, 5, -5);
scene.add(pointLight);

// Procedural Texture for Walls
function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#aaaa cc';
    ctx.fillRect(0, 0, 256, 256);

    // Grid lines
    ctx.strokeStyle = '#cccc ee';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(256, 0);
    ctx.moveTo(0, 256); ctx.lineTo(256, 256);
    ctx.moveTo(0, 0); ctx.lineTo(0, 256);
    ctx.moveTo(256, 0); ctx.lineTo(256, 256);
    ctx.stroke();

    // Inner accents
    ctx.strokeStyle = '#bbbbdd';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 236, 236);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Adjust based on arena size
    return texture;
}

const wallTexture = createGridTexture();

// Arena (Visuals and Boundaries)
const arenaMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, 
    map: wallTexture,
    side: THREE.BackSide 
});
const arenaGeo = new THREE.BoxGeometry(ARENA_WIDTH, ARENA_HEIGHT, ARENA_DEPTH);
const arena = new THREE.Mesh(arenaGeo, arenaMaterial);
arena.position.set(0, ARENA_HEIGHT / 2, -ARENA_DEPTH / 2);
scene.add(arena);

// Floor Grid for orientation
const grid = new THREE.GridHelper(10, 10);
scene.add(grid);

// Bricks
const bricks = [];
const brickGeo = new THREE.BoxGeometry(0.6, 0.3, 0.3);
const brickMaterial = new THREE.MeshStandardMaterial({ color: 0xff0055 });
const specialBrickMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 }); // Gold color

function spawnBricks() {
    for (let s = 0; s < BRICK_SLICES; s++) {
        const sliceBricks = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                const brick = new THREE.Mesh(brickGeo, brickMaterial);
                brick.position.set(
                    (c - (BRICK_COLS - 1) / 2) * 0.7,
                    ARENA_HEIGHT - 0.5 - r * 0.4,
                    -ARENA_DEPTH + 0.5 + s * 0.5
                );
                brick.isSpecial = false;
                scene.add(brick);
                bricks.push(brick);
                sliceBricks.push(brick);
            }
        }

        // Randomly assign 2 special bricks per slice
        let specialCount = 0;
        while (specialCount < 2) {
            const randomIndex = Math.floor(Math.random() * sliceBricks.length);
            const brick = sliceBricks[randomIndex];
            if (!brick.isSpecial) {
                brick.material = specialBrickMaterial;
                brick.isSpecial = true;
                specialCount++;
            }
        }
    }
}

spawnBricks();

// Balls
const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
const ballMat = new THREE.MeshStandardMaterial({ 
    color: 0xffff00,
    emissive: 0xffff00,
    emissiveIntensity: 1.0
});

const balls = [];
const ballVelocities = [];

function createBall(position, velocity) {
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.copy(position);

    // Ball light
    const ballLight = new THREE.PointLight(0xffff00, 2.5, 5);
    ball.add(ballLight);

    scene.add(ball);
    balls.push(ball);
    ballVelocities.push(velocity.clone());
}

// Start Button (3D for VR)
const btnGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
const btnMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa });
const startButton3D = new THREE.Mesh(btnGeo, btnMat);
startButton3D.position.set(0, 1.2, -0.5);
scene.add(startButton3D);

// Initial Ball (Now handled by startGame)
// Mouse Paddle (Fallback for non-VR)
const paddleGeo = new THREE.BoxGeometry(0.8, 0.2, 0.1);
const paddleMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa });
const mousePaddle = new THREE.Mesh(paddleGeo, paddleMat);
mousePaddle.position.set(0, 1, -0.5);
scene.add(mousePaddle);

window.addEventListener('mousemove', (event) => {
    // Map mouse X (0 to windowWidth) to arena X (-ARENA_WIDTH/2 to ARENA_WIDTH/2)
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePaddle.position.x = x * (ARENA_WIDTH / 2);

    // Map mouse Y (0 to windowHeight) to arena Y (0 to ARENA_HEIGHT)
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    mousePaddle.position.y = (y + 1) / 2 * ARENA_HEIGHT;
});

// XR Controllers (Hands)
const controllers = [];
const handMeshes = [];

function onControllerConnected(event) {
    const controller = event.data.session.inputSources[0]; // Simplified for example
    // Note: In a real app, we handle multiple controllers via renderer.xr.getController()
}

// We use the Three.js controller helpers
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);

// Hide mouse paddle when VR starts
renderer.xr.addEventListener('sessionstart', () => {
    mousePaddle.visible = false;
});
renderer.xr.addEventListener('sessionend', () => {
    mousePaddle.visible = true;
});

const handGeo = new THREE.SphereGeometry(HAND_RADIUS, 16, 16);
const handMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });

const hand1 = new THREE.Mesh(handGeo, handMat);
const hand2 = new THREE.Mesh(handGeo, handMat);

controller1.add(hand1);
controller2.add(hand2);
scene.add(controller1);
scene.add(controller2);

handMeshes.push(hand1, hand2);

// UI update
const uiElement = document.getElementById('ui');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const countdownEl = document.getElementById('countdown');

function updateUI() {
    const minutes = Math.floor(gameTimeLeft / 60);
    const seconds = gameTimeLeft % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    uiElement.innerText = `Score: ${score} | Time: ${timeStr}`;
}

function updateScore() {
    updateUI();
}

function startGame() {
    if (gameState !== 'WAITING') return;
    
    overlay.style.display = 'none';
    startButton3D.visible = false;
    gameState = 'COUNTDOWN';
    countdownValue = 5;
    countdownEl.style.display = 'block';
    countdownEl.innerText = countdownValue;

    const countdownInterval = setInterval(() => {
        countdownValue--;
        if (countdownValue > 0) {
            countdownEl.innerText = countdownValue;
        } else {
            clearInterval(countdownInterval);
            countdownEl.style.display = 'none';
            gameState = 'PLAYING';
            createBall(new THREE.Vector3(0, 1, -1), new THREE.Vector3(0, 0, -BALL_SPEED));
            
            // Start Game Timer
            const gameTimer = setInterval(() => {
                if (gameState === 'PLAYING' || gameState === 'BALL_COUNTDOWN' || gameState === 'LEVEL_COMPLETE') {
                    gameTimeLeft--;
                    updateUI();
                    if (gameTimeLeft <= 0) {
                        clearInterval(gameTimer);
                        endGame();
                    }
                }
            }, 1000);
        }
    }, 1000);
}

startBtn.addEventListener('click', startGame);

function endGame() {
    gameState = 'GAMEOVER';
    uiElement.innerText = `GAME OVER! Final Score: ${score}`;
    // Remove all balls
    balls.forEach(b => scene.remove(b));
    balls.length = 0;
    ballVelocities.length = 0;
}

function relaunchBall() {
    gameState = 'BALL_COUNTDOWN';
    ballCountdownValue = 5;
    countdownEl.style.display = 'block';
    countdownEl.innerText = ballCountdownValue;

    const relaunchInterval = setInterval(() => {
        ballCountdownValue--;
        if (ballCountdownValue > 0) {
            countdownEl.innerText = ballCountdownValue;
        } else {
            clearInterval(relaunchInterval);
            countdownEl.style.display = 'none';
            gameState = 'PLAYING';
            createBall(new THREE.Vector3(0, 1, -1), new THREE.Vector3(0, 0, -BALL_SPEED));
        }
    }, 1000);
}

function handleLevelComplete() {
    gameState = 'LEVEL_COMPLETE';
    
    // Show congrats message
    countdownEl.style.display = 'block';
    countdownEl.innerText = 'LEVEL CLEAR!';
    
    // Remove all balls
    balls.forEach(b => scene.remove(b));
    balls.length = 0;
    ballVelocities.length = 0;
    
    // Wait 2 seconds then start 5s countdown
    setTimeout(() => {
        if (gameState === 'GAMEOVER') return;
        
        ballCountdownValue = 5;
        countdownEl.innerText = ballCountdownValue;
        
        const levelInterval = setInterval(() => {
            ballCountdownValue--;
            if (ballCountdownValue > 0) {
                countdownEl.innerText = ballCountdownValue;
            } else {
                clearInterval(levelInterval);
                countdownEl.style.display = 'none';
                spawnBricks();
                gameState = 'PLAYING';
                createBall(new THREE.Vector3(0, 1, -1), new THREE.Vector3(0, 0, -BALL_SPEED));
            }
        }, 1000);
    }, 2000);
}

// Collision Detection
function checkCollisions() {
    if (gameState !== 'PLAYING') return;

    for (let bIdx = balls.length - 1; bIdx >= 0; bIdx--) {
        const ball = balls[bIdx];
        const ballVelocity = ballVelocities[bIdx];

        // 1. Wall Collisions
        // X-axis
        if (Math.abs(ball.position.x) > (ARENA_WIDTH / 2) - BALL_RADIUS) {
            ballVelocity.x *= -1;
            ball.position.x = Math.sign(ball.position.x) * ((ARENA_WIDTH / 2) - BALL_RADIUS);
        }
        // Y-axis
        if (ball.position.y > ARENA_HEIGHT - BALL_RADIUS || ball.position.y < BALL_RADIUS) {
            ballVelocity.y *= -1;
            ball.position.y = ball.position.y < BALL_RADIUS ? BALL_RADIUS : ARENA_HEIGHT - BALL_RADIUS;
        }
        // Z-axis (Far wall)
        if (ball.position.z < -ARENA_DEPTH + BALL_RADIUS) {
            ballVelocity.z *= -1;
            ball.position.z = -ARENA_DEPTH + BALL_RADIUS;
        }
        // Z-axis (Player death zone)
        if (ball.position.z > 0) {
            scene.remove(ball);
            balls.splice(bIdx, 1);
            ballVelocities.splice(bIdx, 1);
            if (balls.length === 0 && gameState !== 'GAMEOVER') {
                relaunchBall();
            }
            continue; // This ball is gone, move to next
        }

        // 2. Brick Collisions
        for (let i = bricks.length - 1; i >= 0; i--) {
            const brick = bricks[i];
            const dx = Math.abs(ball.position.x - brick.position.x);
            const dy = Math.abs(ball.position.y - brick.position.y);
            const dz = Math.abs(ball.position.z - brick.position.z);

            if (dx < (0.6 / 2 + BALL_RADIUS) && dy < (0.3 / 2 + BALL_RADIUS) && dz < (0.3 / 2 + BALL_RADIUS)) {
                // Reflect
                if (dx > dy && dx > dz) ballVelocity.x *= -1;
                else if (dy > dx && dy > dz) ballVelocity.y *= -1;
                else ballVelocity.z *= -1;

                if (brick.isSpecial) {
                    // Generate a new ball with slightly randomized velocity
                    const newVel = new THREE.Vector3(
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05,
                        -BALL_SPEED
                    );
                    createBall(ball.position.clone(), newVel);
                }

                scene.remove(brick);
                bricks.splice(i, 1);
                score += 10;
                updateScore();

                if (bricks.length === 0) {
                    handleLevelComplete();
                }
                break; // Only hit one brick per ball per frame
            }
        }

        // 3. Hand Collisions
        handMeshes.forEach(hand => {
            const dist = ball.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()));
            if (dist < BALL_RADIUS + HAND_RADIUS) {
                const normal = new THREE.Vector3().subVectors(ball.position, hand.getWorldPosition(new THREE.Vector3())).normalize();
                ballVelocity.reflect(normal);
                if (ballVelocity.z > 0) ballVelocity.z *= -1;
            }
        });

        // 4. Mouse Paddle Collision (Non-VR)
        if (!renderer.xr.isPresenting) {
            if (ballVelocity.z > 0) {
                const dx = Math.abs(ball.position.x - mousePaddle.position.x);
                const dy = Math.abs(ball.position.y - mousePaddle.position.y);
                const dz = Math.abs(ball.position.z - mousePaddle.position.z);

                if (dx < (0.8 / 2 + BALL_RADIUS) && dy < (0.2 / 2 + BALL_RADIUS) && dz < (0.1 / 2 + BALL_RADIUS)) {
                    ballVelocity.z *= -1;
                    ball.position.z = mousePaddle.position.z - (0.1 / 2 + BALL_RADIUS);
                    ballVelocity.x += (ball.position.x - mousePaddle.position.x) * 0.1;
                    ballVelocity.y += (ball.position.y - mousePaddle.position.y) * 0.1;
                    ballVelocity.clampLength(0, BALL_SPEED * 1.5);
                }
            }
        }
    }
}

// Game Loop
renderer.setAnimationLoop(() => {
    if (gameState === 'PLAYING') {
        // Move balls
        for (let i = 0; i < balls.length; i++) {
            balls[i].position.add(ballVelocities[i]);
        }
        checkCollisions();
    }

    // Check VR button interaction
    if (gameState === 'WAITING') {
        handMeshes.forEach(hand => {
            const handPos = hand.getWorldPosition(new THREE.Vector3());
            if (handPos.distanceTo(startButton3D.position) < HAND_RADIUS + 0.2) {
                startGame();
            }
        });
    }

    renderer.render(scene, camera);
});

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Keyboard Cheats
window.addEventListener('keydown', (event) => {
    const key = event.key.toUpperCase();
    
    if (key === 'R') {
        // Restart Game Completely
        score = 0;
        gameTimeLeft = GAME_DURATION;
        gameState = 'WAITING';
        
        // Clear balls
        balls.forEach(b => scene.remove(b));
        balls.length = 0;
        ballVelocities.length = 0;
        
        // Clear bricks
        bricks.forEach(b => scene.remove(b));
        bricks.length = 0;
        
        // Reset UI
        overlay.style.display = 'flex';
        startButton3D.visible = true;
        updateUI();
        
        // Respawn bricks for fresh start
        spawnBricks();
        console.log('Game Restarted');
    }
    
    if (key === 'K') {
        // Delete all blocks
        bricks.forEach(b => scene.remove(b));
        bricks.length = 0;
        
        // Trigger the level complete sequence
        handleLevelComplete();
        console.log('Blocks Deleted');
    }
});
