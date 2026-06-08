// ========== MEDIAPIPE CONFIGURACIÓN ==========
let faceLandmarker;
let runningMode = "VIDEO";
let enableWebcam = false;
let webcamRunning = false;
let video = document.getElementById('webcam');
let canvas = document.getElementById('overlayCanvas');
let ctx = canvas.getContext('2d');

// ========== ELEMENTOS DOM ==========
const btnStart = document.getElementById('btnStart');
const btnAnalyze = document.getElementById('btnAnalyze');
const loading = document.getElementById('loading');
const resultName = document.getElementById('resultName');
const resultIcon = document.getElementById('resultIcon');
const resultDescription = document.getElementById('resultDescription');
const ratioVal = document.getElementById('ratioVal');
const angleVal = document.getElementById('angleVal');
const cheekVal = document.getElementById('cheekVal');

let lastVideoTime = -1;
let currentLandmarks = null;

// ========== FUNCIONES DE CLASIFICACIÓN DE ROSTRO ==========

// Calcular distancia entre dos puntos (en píxeles normalizados)
function distancia(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Calcular ángulo entre tres puntos (en grados)
function angulo(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    const rad = Math.acos(dot / (mag1 * mag2));
    return rad * 180 / Math.PI;
}

// Clasificar tipo de rostro basado en fórmulas antropométricas
function clasificarRostro(ratioAltoAncho, anguloMandibula, anchuraPomulos, anchuraFrente) {
    // Normalizar valores aproximados
    const ratio = parseFloat(ratioAltoAncho);
    const angulo = parseFloat(anguloMandibula);
    
    // Fórmulas de clasificación (basadas en antropometría facial estándar)
    if (ratio >= 1.4 && ratio <= 1.6 && angulo > 145) {
        return { tipo: "Rostro Ovalado", icono: "🥚", descripcion: "Proporciones equilibradas, mandíbula redondeada. Es el tipo más versátil para peinados y gafas." };
    }
    if (ratio >= 1.0 && ratio <= 1.2 && angulo > 155) {
        return { tipo: "Rostro Redondo", icono: "⚪", descripcion: "Ancho y alto similares, mejillas anchas. Los peinados con volumen superior ayudan a estilizar." };
    }
    if (ratio >= 1.0 && ratio <= 1.2 && angulo < 130) {
        return { tipo: "Rostro Cuadrado", icono: "⬛", descripcion: "Mandíbula angular, frente y mentón del mismo ancho. Los cortes en capas suavizan los ángulos." };
    }
    if (ratio > 1.6 && angulo >= 130 && angulo <= 145) {
        return { tipo: "Rostro Rectangular / Alargado", icono: "📏", descripcion: "Frente, pómulos y mandíbula similares, rostro más largo que ancho. El flequillo ayuda a acortar visualmente." };
    }
    if (ratio >= 1.3 && ratio <= 1.5 && angulo >= 130 && angulo <= 145 && anchuraFrente > anchuraPomulos) {
        return { tipo: "Rostro Corazón", icono: "💜", descripcion: "Frente ancha, mentón puntiagudo. Los peinados con volumen en la parte inferior equilibran." };
    }
    if (ratio >= 1.3 && ratio <= 1.5 && angulo < 130 && anchuraPomulos > anchuraFrente) {
        return { tipo: "Rostro Diamante", icono: "💎", descripcion: "Pómulos anchos, frente y mentón estrechos. Los peinados con volumen en la parte superior son ideales." };
    }
    
    return { tipo: "Rostro Mixto", icono: "✨", descripcion: "Combinación de características. ¡Eres único! Consulta con un estilista para recomendaciones personalizadas." };
}

// Extraer medidas de los landmarks de MediaPipe
function analizarMedidas(landmarks) {
    // Puntos clave según índice de MediaPipe
    // Referencia: mediapipe.dev
    const frenteCentro = landmarks[10];      // punto central frente
    const menton = landmarks[152];            // punto inferior mentón
    const mejillaIzq = landmarks[234];        // pómulo izquierdo
    const mejillaDer = landmarks[454];        // pómulo derecho
    const mandibulaIzq = landmarks[130];      // ángulo mandíbula izquierda
    const mandibulaDer = landmarks[359];      // ángulo mandíbula derecha
    const sienIzq = landmarks[54];            // sien izquierda
    const sienDer = landmarks[284];           // sien derecha
    
    // 1. Altura vs Anchura (proporción)
    const alturaRostro = distancia(frenteCentro, menton);
    const anchuraRostro = distancia(sienIzq, sienDer);
    const proporcionAltoAncho = alturaRostro / anchuraRostro;
    
    // 2. Ángulo de mandíbula (usando mentón y mandíbulas)
    const anguloMandibula = angulo(mandibulaIzq, menton, mandibulaDer);
    
    // 3. Anchura de pómulos vs frente
    const anchuraPomulos = distancia(mejillaIzq, mejillaDer);
    const anchuraFrente = distancia(sienIzq, sienDer);
    
    return {
        proporcion: proporcionAltoAncho.toFixed(2),
        angulo: anguloMandibula.toFixed(0),
        pomulos: anchuraPomulos.toFixed(3),
        frente: anchuraFrente.toFixed(3)
    };
}

// Dibujar puntos faciales en el canvas (feedback visual)
function dibujarPuntos(landmarks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#667eea';
    
    // Dibujar puntos principales
    const puntosClave = [10, 152, 234, 454, 130, 359, 54, 284];
    puntosClave.forEach(idx => {
        if (landmarks[idx]) {
            ctx.beginPath();
            ctx.arc(landmarks[idx].x * canvas.width, landmarks[idx].y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#667eea';
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    });
}

// ========== MEDIAPIPE INICIALIZACIÓN ==========
async function initMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
        },
        numFaces: 1,
        runningMode: runningMode,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
    });
    
    console.log("MediaPipe listo");
}

// ========== PREDICCIÓN EN TIEMPO REAL ==========
async function predictWebcam() {
    if (!webcamRunning) return;
    
    const nowInSeconds = Date.now();
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = faceLandmarker.detectForVideo(video, nowInSeconds);
        
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            currentLandmarks = result.faceLandmarks[0];
            dibujarPuntos(currentLandmarks);
        }
    }
    requestAnimationFrame(predictWebcam);
}

// ========== ANALIZAR ROSTRO (BOTÓN) ==========
function analizarRostro() {
    if (!currentLandmarks) {
        alert("Primero activa la cámara y asegúrate de que tu rostro sea visible");
        return;
    }
    
    loading.style.display = "block";
    
    setTimeout(() => {
        try {
            const medidas = analizarMedidas(currentLandmarks);
            const clasificacion = clasificarRostro(medidas.proporcion, medidas.angulo, medidas.pomulos, medidas.frente);
            
            // Actualizar UI
            resultName.textContent = clasificacion.tipo;
            resultIcon.innerHTML = `<i class="fas ${getIconoPorTipo(clasificacion.tipo)}"></i>`;
            resultDescription.textContent = clasificacion.descripcion;
            ratioVal.textContent = medidas.proporcion;
            angleVal.textContent = `${medidas.angulo}°`;
            cheekVal.textContent = (medidas.pomulos / medidas.frente).toFixed(2);
            
            // Animación de confeti si es primer análisis
            if (typeof canvasConfetti !== 'undefined') {
                canvasConfetti({ particleCount: 80, spread: 55, origin: { y: 0.8 } });
            }
            
        } catch (error) {
            console.error(error);
            alert("Error al analizar. Asegúrate de estar mirando directo a la cámara");
        } finally {
            loading.style.display = "none";
        }
    }, 100);
}

function getIconoPorTipo(tipo) {
    if (tipo.includes("Ovalado")) return "fa-egg";
    if (tipo.includes("Redondo")) return "fa-circle";
    if (tipo.includes("Cuadrado")) return "fa-square";
    if (tipo.includes("Rectangular")) return "fa-chart-line";
    if (tipo.includes("Corazón")) return "fa-heart";
    if (tipo.includes("Diamante")) return "fa-gem";
    return "fa-smile";
}

// ========== ACTIVAR CÁMARA ==========
async function iniciarCamara() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        webcamRunning = true;
        btnStart.disabled = true;
        btnAnalyze.disabled = false;
        btnStart.innerHTML = '<i class="fas fa-check"></i> Cámara activa';
        
        video.addEventListener('loadeddata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            predictWebcam();
        });
        
    } catch (error) {
        console.error("Error al acceder a la cámara:", error);
        alert("No se pudo acceder a la cámara. Verifica los permisos.");
    }
}

// ========== EVENTOS ==========
btnStart.addEventListener('click', iniciarCamara);
btnAnalyze.addEventListener('click', analizarRostro);

// ========== INICIALIZACIÓN ==========
initMediaPipe();
