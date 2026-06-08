// ========== ELEMENTOS DOM ==========
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btnStart');
const btnAnalyze = document.getElementById('btnAnalyze');
const btnDebug = document.getElementById('btnDebug');
const loading = document.getElementById('loading');
const faceStatus = document.getElementById('faceStatus');
const debugPanel = document.getElementById('debugPanel');
const debugContent = document.getElementById('debugContent');

const resultName = document.getElementById('resultName');
const resultIcon = document.getElementById('resultIcon');
const resultDescription = document.getElementById('resultDescription');
const ratioVal = document.getElementById('ratioVal');
const angleVal = document.getElementById('angleVal');
const cheekVal = document.getElementById('cheekVal');

// ========== VARIABLES ==========
let stream = null;
let detectionInterval = null;
let currentDetection = null;
let modelsLoaded = false;

// ========== FUNCIONES DE DEBUG ==========
function addDebugLog(message, isError = false) {
    const p = document.createElement('p');
    p.innerHTML = `📌 ${new Date().toLocaleTimeString()}: ${message}`;
    p.style.color = isError ? '#ff5555' : '#50fa7b';
    debugContent.appendChild(p);
    debugPanel.scrollTop = debugPanel.scrollHeight;
    console.log(message);
}

// ========== CLASIFICACIÓN DE ROSTRO ==========
function clasificarRostroPorMedidas(ancho, alto, relacionAnchoAlto, puntos) {
    // Calcular ángulo de mandíbula aproximado usando puntos de la quijada
    let anguloMandibula = 140; // valor por defecto
    
    if (puntos && puntos.length > 0) {
        try {
            // Puntos de mandíbula en face-api: índice 0-15 aproximadamente
            const mandIzq = puntos[2];
            const menton = puntos[8];
            const mandDer = puntos[14];
            if (mandIzq && menton && mandDer) {
                anguloMandibula = calcularAngulo(mandIzq, menton, mandDer);
            }
        } catch(e) {}
    }
    
    addDebugLog(`Medidas: ancho=${ancho}, alto=${alto}, ratio=${relacionAnchoAlto}, ángulo=${anguloMandibula}`);
    
    // Clasificación basada en proporciones y ángulo
    if (relacionAnchoAlto >= 1.4 && relacionAnchoAlto <= 1.6 && anguloMandibula > 145) {
        return { tipo: "Rostro Ovalado", icono: "🥚", descripcion: "Proporciones equilibradas, mandíbula redondeada. Es el tipo más versátil para peinados y gafas." };
    }
    if (relacionAnchoAlto >= 1.0 && relacionAnchoAlto <= 1.2 && anguloMandibula > 155) {
        return { tipo: "Rostro Redondo", icono: "⚪", descripcion: "Ancho y alto similares, mejillas anchas. Los peinados con volumen superior ayudan a estilizar." };
    }
    if (relacionAnchoAlto >= 1.0 && relacionAnchoAlto <= 1.2 && anguloMandibula < 130) {
        return { tipo: "Rostro Cuadrado", icono: "⬛", descripcion: "Mandíbula angular, frente y mentón del mismo ancho. Los cortes en capas suavizan los ángulos." };
    }
    if (relacionAnchoAlto > 1.6) {
        return { tipo: "Rostro Rectangular / Alargado", icono: "📏", descripcion: "Rostro más largo que ancho. El flequillo ayuda a acortar visualmente." };
    }
    if (relacionAnchoAlto >= 1.3 && relacionAnchoAlto <= 1.5) {
        if (anguloMandibula < 135) {
            return { tipo: "Rostro Diamante", icono: "💎", descripcion: "Pómulos anchos, frente y mentón estrechos. Ideal para volumen en la parte superior." };
        }
        return { tipo: "Rostro Corazón", icono: "💜", descripcion: "Frente ancha, mentón puntiagudo. Busca equilibrio con volumen en la parte inferior." };
    }
    
    return { tipo: "Rostro Mixto", icono: "✨", descripcion: "Combinación de características únicas. ¡Eres único/a!" };
}

function calcularAngulo(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 === 0 || mag2 === 0) return 140;
    const rad = Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2))));
    return rad * 180 / Math.PI;
}

// ========== DIBUJAR PUNTOS ==========
function dibujarPuntos(detection) {
    if (!detection || !detection.landmarks) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar bounding box
    const box = detection.detection.box;
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    
    // Dibujar puntos faciales
    const landmarks = detection.landmarks;
    for (let i = 0; i < landmarks.length; i++) {
        ctx.beginPath();
        ctx.arc(landmarks[i].x, landmarks[i].y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
    }
    
    // Puntos clave más grandes
    const puntosClave = [0, 8, 16, 32, 48];
    puntosClave.forEach(idx => {
        if (landmarks[idx]) {
            ctx.beginPath();
            ctx.arc(landmarks[idx].x, landmarks[idx].y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffd700';
            ctx.fill();
        }
    });
}

// ========== ANALIZAR ROSTRO ==========
function analizarRostro() {
    if (!currentDetection) {
        addDebugLog("No hay detección de rostro disponible", true);
        alert("⚠️ No se detecta ningún rostro. Asegúrate de mirar directamente a la cámara.");
        return;
    }
    
    loading.style.display = "block";
    
    setTimeout(() => {
        try {
            const box = currentDetection.detection.box;
            const ancho = box.width;
            const alto = box.height;
            const relacionAnchoAlto = alto / ancho;
            
            const clasificacion = clasificarRostroPorMedidas(ancho, alto, relacionAnchoAlto, currentDetection.landmarks);
            
            resultName.textContent = clasificacion.tipo;
            resultIcon.innerHTML = clasificacion.icono;
            resultDescription.textContent = clasificacion.descripcion;
            ratioVal.textContent = relacionAnchoAlto.toFixed(2);
            angleVal.textContent = "~140°";
            cheekVal.textContent = clasificacion.tipo.split(" ")[0];
            
            addDebugLog(`✅ Análisis completado: ${clasificacion.tipo}`);
            
            canvasConfetti({ particleCount: 80, spread: 55, origin: { y: 0.8 } });
            
        } catch (error) {
            addDebugLog(`Error en análisis: ${error.message}`, true);
            alert("Error al analizar. Intenta de nuevo.");
        } finally {
            loading.style.display = "none";
        }
    }, 100);
}

// ========== DETECCIÓN CONTINUA ==========
async function startDetection() {
    if (detectionInterval) clearInterval(detectionInterval);
    
    detectionInterval = setInterval(async () => {
        if (!video.videoWidth || !video.videoHeight) return;
        
        try {
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks();
            
            if (detections && detections.length > 0) {
                currentDetection = detections[0];
                dibujarPuntos(currentDetection);
                faceStatus.innerHTML = `<i class="fas fa-check-circle"></i> Rostro detectado ✅`;
                faceStatus.className = "face-status status-ready";
                btnAnalyze.disabled = false;
            } else {
                faceStatus.innerHTML = `<i class="fas fa-eye-slash"></i> No se detecta rostro. ¿Estás mirando a la cámara?`;
                faceStatus.className = "face-status";
                currentDetection = null;
                btnAnalyze.disabled = true;
            }
        } catch (error) {
            addDebugLog(`Error en detección: ${error.message}`, true);
        }
    }, 500);
}

// ========== INICIAR CÁMARA ==========
async function iniciarCamara() {
    addDebugLog("Solicitando acceso a la cámara...");
    
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }
        });
        
        video.srcObject = stream;
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                resolve();
            };
        });
        
        addDebugLog(`✅ Cámara activada: ${video.videoWidth}x${video.videoHeight}`);
        btnStart.disabled = true;
        btnStart.innerHTML = '<i class="fas fa-check"></i> Cámara activa';
        
        startDetection();
        
    } catch (error) {
        addDebugLog(`❌ Error en cámara: ${error.message}`, true);
        alert("No se pudo acceder a la cámara. Verifica los permisos.");
    }
}

// ========== CARGAR MODELOS DE FACE-API ==========
async function loadModels() {
    addDebugLog("Cargando modelos de IA...");
    faceStatus.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Cargando modelos de IA...';
    
    try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/models';
        
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        
        modelsLoaded = true;
        addDebugLog("✅ Modelos cargados correctamente");
        faceStatus.innerHTML = '<i class="fas fa-check-circle"></i> Modelos listos. Activa la cámara.';
        faceStatus.className = "face-status status-ready";
        
    } catch (error) {
        addDebugLog(`❌ Error cargando modelos: ${error.message}`, true);
        faceStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error cargando modelos. Recarga la página.';
        faceStatus.className = "face-status status-error";
    }
}

// ========== TOGGLE DEBUG ==========
btnDebug.addEventListener('click', () => {
    debugPanel.classList.toggle('show');
    btnDebug.innerHTML = debugPanel.classList.contains('show') 
        ? '<i class="fas fa-eye-slash"></i> Ocultar debug' 
        : '<i class="fas fa-bug"></i> Debug';
});

// ========== EVENTOS ==========
btnStart.addEventListener('click', iniciarCamara);
btnAnalyze.addEventListener('click', analizarRostro);

// ========== INICIALIZACIÓN ==========
loadModels();
addDebugLog("App iniciada. Esperando carga de modelos...");
