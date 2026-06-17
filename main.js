import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

// Game Constants
const ARENA_WIDTH = 3;
const ARENA_HEIGHT = 2;
const ARENA_DEPTH = 10;
const BRICK_ROWS = 6;
const BRICK_COLS = 5;
const BRICK_SLICES = 5;
const BALL_RADIUS = 0.1;
const BALL_SPEED = 0.05;
const HAND_RADIUS = 0.15;
const GAME_DURATION = 5 * 60; // 5 minutes in seconds

// Audio
const bounceSound = new Audio('bounce.mp3');
const breakSound = new Audio('break.mp3');
const paddleSound = new Audio('paddle.mp3');
const bgMusic = new Audio('music.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

function playSound(sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.log("Audio playback failed:", e));
}

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

function createBallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base color
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(0, 0, 256, 256);

    // Add some stripes/pattern to make rotation visible
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 20;
    for (let i = 0; i < 256; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
    }

    return new THREE.CanvasTexture(canvas);
}

const wallTexture = createGridTexture();
const ballTexture = createBallTexture();

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
const brickMaterial = new THREE.MeshStandardMaterial({ color: 0xff0055 });
const specialBrickMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 }); // Gold color

function spawnBricks() {
    // Calculate dynamic brick dimensions based on arena size
    const brickWidth = ARENA_WIDTH / BRICK_COLS;
    const brickHeight = ARENA_HEIGHT / BRICK_ROWS;
    const brickDepth = (ARENA_DEPTH / 2) / BRICK_SLICES;
    const gap = 0.05;

    const brickGeo = new THREE.BoxGeometry(brickWidth - gap, brickHeight - gap, brickDepth - gap);

    for (let s = 0; s < BRICK_SLICES; s++) {
        const sliceBricks = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                const brick = new THREE.Mesh(brickGeo, brickMaterial);
                brick.position.set(
                    (c - (BRICK_COLS - 1) / 2) * brickWidth,
                    ARENA_HEIGHT - (r + 0.5) * brickHeight,
                    -ARENA_DEPTH + (s + 0.5) * brickDepth
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
    map: ballTexture,
    emissive: 0x444400,
    emissiveIntensity: 0.5
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

// VR UI elements
const vrUICanvas = document.createElement('canvas');
vrUICanvas.width = 512;
vrUICanvas.height = 128;
const vrUICtx = vrUICanvas.getContext('2d');
const vrUITexture = new THREE.CanvasTexture(vrUICanvas);
const vrUIGeo = new THREE.PlaneGeometry(2, 0.5);
const vrUIMat = new THREE.MeshBasicMaterial({ map: vrUITexture, transparent: true, side: THREE.DoubleSide });
const vrUIMesh = new THREE.Mesh(vrUIGeo, vrUIMat);
vrUIMesh.position.set(0, ARENA_HEIGHT - 0.1, -1); // Positioned above the arena
vrUIMesh.rotation.y = Math.PI; // Face the user
scene.add(vrUIMesh);

const vrCountdownCanvas = document.createElement('canvas');
vrCountdownCanvas.width = 256;
vrCountdownCanvas.height = 256;
const vrCountdownCtx = vrCountdownCanvas.getContext('2d');
const vrCountdownTexture = new THREE.CanvasTexture(vrCountdownCanvas);
const vrCountdownGeo = new THREE.PlaneGeometry(0.5, 0.5);
const vrCountdownMat = new THREE.MeshBasicMaterial({ map: vrCountdownTexture, transparent: true });
const vrCountdownMesh = new THREE.Mesh(vrCountdownGeo, vrCountdownMat);
vrCountdownMesh.position.set(0, 1.5, -1);
vrCountdownMesh.visible = false;
scene.add(vrCountdownMesh);

function updateVRUI() {
    // Main UI
    vrUICtx.clearRect(0, 0, vrUICanvas.width, vrUICanvas.height);
    vrUICtx.fillStyle = 'white';
    vrUICtx.font = 'bold 40px Arial';
    vrUICtx.textAlign = 'center';
    
    const minutes = Math.floor(gameTimeLeft / 60);
    const seconds = gameTimeLeft % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const text = `Score: ${score} | Time: ${timeStr}`;
    vrUICtx.fillText(text, vrUICanvas.width / 2, vrUICanvas.height / 2 + 15);
    vrUITexture.needsUpdate = true;
}

function updateVRCountdown(text) {
    vrCountdownCtx.clearRect(0, 0, vrCountdownCanvas.width, vrCountdownCanvas.height);
    vrCountdownCtx.fillStyle = 'white';
    vrCountdownCtx.font = 'bold 120px Arial';
    vrCountdownCtx.textAlign = 'center';
    vrCountdownCtx.textBaseline = 'middle';
    vrCountdownCtx.fillText(text, vrCountdownCanvas.width / 2, vrCountdownCanvas.height / 2);
    vrCountdownTexture.needsUpdate = true;
}

function updateUI() {
    const minutes = Math.floor(gameTimeLeft / 60);
    const seconds = gameTimeLeft % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    uiElement.innerText = `Score: ${score} | Time: ${timeStr}`;
    updateVRUI();
}

function updateScore() {
    updateUI();
}

function startGame() {
    if (gameState !== 'WAITING') return;
    
    bgMusic.play().catch(e => console.log("Music playback failed:", e));
    overlay.style.display = 'none';
    startButton3D.visible = false;
    gameState = 'COUNTDOWN';
    countdownValue = 5;
    countdownEl.style.display = 'block';
    countdownEl.innerText = countdownValue;
    
    vrCountdownMesh.visible = true;
    updateVRCountdown(countdownValue);

    const countdownInterval = setInterval(() => {
        countdownValue--;
        if (countdownValue > 0) {
            countdownEl.innerText = countdownValue;
            updateVRCountdown(countdownValue);
        } else {
            clearInterval(countdownInterval);
            countdownEl.style.display = 'none';
            vrCountdownMesh.visible = false;
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
    
    // Update VR UI for game over
    vrUICtx.clearRect(0, 0, vrUICanvas.width, vrUICanvas.height);
    vrUICtx.fillStyle = 'white';
    vrUICtx.font = 'bold 40px Arial';
    vrUICtx.textAlign = 'center';
    vrUICtx.fillText(`GAME OVER! Final Score: ${score}`, vrUICanvas.width / 2, vrUICanvas.height / 2 + 15);
    vrUITexture.needsUpdate = true;

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
    
    vrCountdownMesh.visible = true;
    updateVRCountdown(ballCountdownValue);

    const relaunchInterval = setInterval(() => {
        ballCountdownValue--;
        if (ballCountdownValue > 0) {
            countdownEl.innerText = ballCountdownValue;
            updateVRCountdown(ballCountdownValue);
        } else {
            clearInterval(relaunchInterval);
            countdownEl.style.display = 'none';
            vrCountdownMesh.visible = false;
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
    
    vrCountdownMesh.visible = true;
    updateVRCountdown('LEVEL CLEAR!');
    
    // Remove all balls
    balls.forEach(b => scene.remove(b));
    balls.length = 0;
    ballVelocities.length = 0;
    
    // Wait 2 seconds then start 5s countdown
    setTimeout(() => {
        if (gameState === 'GAMEOVER') return;
        
        ballCountdownValue = 5;
        countdownEl.innerText = ballCountdownValue;
        updateVRCountdown(ballCountdownValue);
        
        const levelInterval = setInterval(() => {
            ballCountdownValue--;
            if (ballCountdownValue > 0) {
                countdownEl.innerText = ballCountdownValue;
                updateVRCountdown(ballCountdownValue);
            } else {
                clearInterval(levelInterval);
                countdownEl.style.display = 'none';
                vrCountdownMesh.visible = false;
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
            playSound(bounceSound);
        }
        // Y-axis
        if (ball.position.y > ARENA_HEIGHT - BALL_RADIUS || ball.position.y < BALL_RADIUS) {
            ballVelocity.y *= -1;
            ball.position.y = ball.position.y < BALL_RADIUS ? BALL_RADIUS : ARENA_HEIGHT - BALL_RADIUS;
            playSound(bounceSound);
        }
        // Z-axis (Far wall)
        if (ball.position.z < -ARENA_DEPTH + BALL_RADIUS) {
            ballVelocity.z *= -1;
            ball.position.z = -ARENA_DEPTH + BALL_RADIUS;
            playSound(bounceSound);
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

            const brickSize = new THREE.Vector3();
            brick.geometry.computeBoundingBox();
            const boundingBox = brick.geometry.boundingBox;
            const size = new THREE.Vector3();
            boundingBox.getSize(size);

            if (dx < (size.x / 2 + BALL_RADIUS) && dy < (size.y / 2 + BALL_RADIUS) && dz < (size.z / 2 + BALL_RADIUS)) {
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

                playSound(breakSound);
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
                playSound(paddleSound);
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
                    playSound(paddleSound);
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
        // Move and rotate balls
        for (let i = 0; i < balls.length; i++) {
            const ball = balls[i];
            const velocity = ballVelocities[i];
            
            ball.position.add(velocity);
            
            // Rotate ball to make spinning visible
            // Use a simple rotation based on movement
            ball.rotation.x += velocity.z * 2;
            ball.rotation.y += velocity.x * 2;
            ball.rotation.z += velocity.y * 2;
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
