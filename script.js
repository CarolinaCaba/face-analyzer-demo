// ========== ESPERAR A QUE EL DOM ESTÉ LISTO ==========
document.addEventListener('DOMContentLoaded', () => {

    // ========== ELEMENTOS DOM ==========
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('overlayCanvas');
    const ctx = canvas.getContext('2d');
    const btnStart = document.getElementById('btnStart');
    const btnAnalyze = document.getElementById('btnAnalyze');
    const loading = document.getElementById('loading');
    const faceStatus = document.getElementById('faceStatus');

    const resultName = document.getElementById('resultName');
    const resultIcon = document.getElementById('resultIcon');
    const resultDescription = document.getElementById('resultDescription');
    const ratioVal = document.getElementById('ratioVal');
    const angleVal = document.getElementById('angleVal');
    const cheekVal = document.getElementById('cheekVal');

    // ========== VERIFICAR QUE LOS ELEMENTOS EXISTAN ==========
    if (!btnStart || !btnAnalyze || !video || !canvas) {
        console.error("Error: No se encontraron los elementos necesarios en el DOM");
        return;
    }

    // ========== VARIABLES ==========
    let modelsLoaded = false;
    let stream = null;
    let detectionInterval = null;
    let currentDetection = null;

    // ========== FUNCIONES DE CLASIFICACIÓN ==========
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

    function clasificarRostro(ratioAnchoAlto, puntos) {
        let angulo = 140;
        if (puntos && puntos.length > 0 && puntos[8] && puntos[0] && puntos[16]) {
            angulo = calcularAngulo(puntos[0], puntos[8], puntos[16]);
        }
        
        const r = parseFloat(ratioAnchoAlto);
        
        if (r >= 1.4 && r <= 1.6 && angulo > 145) {
            return { tipo: "Rostro Ovalado", icono: "🥚", descripcion: "Proporciones equilibradas, mandíbula redondeada." };
        }
        if (r >= 1.0 && r <= 1.2 && angulo > 155) {
            return { tipo: "Rostro Redondo", icono: "⚪", descripcion: "Ancho y alto similares. Peinados con volumen arriba ayudan." };
        }
        if (r >= 1.0 && r <= 1.2 && angulo < 130) {
            return { tipo: "Rostro Cuadrado", icono: "⬛", descripcion: "Mandíbula angular. Cortes en capas suavizan los ángulos." };
        }
        if (r > 1.6) {
            return { tipo: "Rostro Alargado", icono: "📏", descripcion: "Rostro más largo que ancho. Flequillo ayuda a acortar." };
        }
        if (r >= 1.3 && r <= 1.5) {
            if (angulo < 135) {
                return { tipo: "Rostro Diamante", icono: "💎", descripcion: "Pómulos anchos. Volumen en parte superior es ideal." };
            }
            return { tipo: "Rostro Corazón", icono: "💜", descripcion: "Frente ancha, mentón puntiagudo." };
        }
        return { tipo: "Rostro Mixto", icono: "✨", descripcion: "Características únicas. ¡Eres único/a!" };
    }

    // ========== DIBUJAR PUNTOS ==========
    function dibujarPuntos(detection) {
        if (!detection || !detection.landmarks || !ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dibujar bounding box
        const box = detection.detection.box;
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Dibujar landmarks
        const landmarks = detection.landmarks;
        for (let i = 0; i < landmarks.length; i++) {
            ctx.beginPath();
            ctx.arc(landmarks[i].x, landmarks[i].y, 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff6b6b';
            ctx.fill();
        }
        
        // Puntos clave más grandes
        const puntosClave = [0, 8, 16];
        puntosClave.forEach(idx => {
            if (landmarks[idx]) {
                ctx.beginPath();
                ctx.arc(landmarks[idx].x, landmarks[idx].y, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#ffd700';
                ctx.fill();
            }
        });
    }

    // ========== DETECCIÓN CONTINUA ==========
    function iniciarDeteccion() {
        if (detectionInterval) clearInterval(detectionInterval);
        
        detectionInterval = setInterval(async () => {
            if (!video.videoWidth || !video.videoHeight) return;
            
            try {
                if (typeof faceapi === 'undefined') return;
                
                const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks();
                
                if (detections && detections.length > 0) {
                    currentDetection = detections[0];
                    dibujarPuntos(currentDetection);
                    if (faceStatus) {
                        faceStatus.innerHTML = '<i class="fas fa-check-circle"></i> Rostro detectado ✅';
                        faceStatus.style.background = 'rgba(76,175,80,0.8)';
                    }
                    btnAnalyze.disabled = false;
                } else {
                    if (faceStatus) {
                        faceStatus.innerHTML = '<i class="fas fa-eye-slash"></i> No se detecta rostro. ¿Estás mirando a la cámara?';
                        faceStatus.style.background = 'rgba(0,0,0,0.7)';
                    }
                    currentDetection = null;
                    btnAnalyze.disabled = true;
                }
            } catch (error) {
                console.error("Error en detección:", error);
            }
        }, 500);
    }

    // ========== ANALIZAR ROSTRO ==========
    function analizarRostro() {
        if (!currentDetection) {
            alert("⚠️ No se detecta ningún rostro. Asegúrate de mirar directamente a la cámara.");
            return;
        }
        
        if (loading) loading.style.display = "block";
        
        setTimeout(() => {
            try {
                const box = currentDetection.detection.box;
                const ancho = box.width;
                const alto = box.height;
                const proporcion = (alto / ancho).toFixed(2);
                
                const clasificacion = clasificarRostro(proporcion, currentDetection.landmarks);
                
                if (resultName) resultName.textContent = clasificacion.tipo;
                if (resultIcon) resultIcon.textContent = clasificacion.icono;
                if (resultDescription) resultDescription.textContent = clasificacion.descripcion;
                if (ratioVal) ratioVal.textContent = proporcion;
                if (angleVal) angleVal.textContent = "~140°";
                if (cheekVal) cheekVal.textContent = clasificacion.tipo.split(" ")[0];
                
                if (typeof canvasConfetti !== 'undefined') {
                    canvasConfetti({ particleCount: 80, spread: 55, origin: { y: 0.8 } });
                }
                
            } catch (error) {
                console.error(error);
                alert("Error al analizar. Intenta de nuevo.");
            } finally {
                if (loading) loading.style.display = "none";
            }
        }, 100);
    }

    // ========== INICIAR CÁMARA ==========
    async function iniciarCamara() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: "user" }
            });
            
            video.srcObject = stream;
            
            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    resolve();
                };
            });
            
            btnStart.disabled = true;
            btnStart.innerHTML = '<i class="fas fa-check"></i> Cámara activa';
            if (faceStatus) {
                faceStatus.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Iniciando detección...';
                faceStatus.style.background = 'rgba(0,0,0,0.7)';
            }
            
            iniciarDeteccion();
            
        } catch (error) {
            console.error(error);
            alert("No se pudo acceder a la cámara. Verifica los permisos.");
            if (faceStatus) {
                faceStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error de cámara';
                faceStatus.style.background = 'rgba(244,67,54,0.8)';
            }
        }
    }

    // ========== CARGAR MODELOS ==========
    async function cargarModelos() {
        if (faceStatus) {
            faceStatus.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Cargando modelos de IA...';
            faceStatus.style.background = 'rgba(0,0,0,0.7)';
        }
        
        try {
            // Esperar a que faceapi esté disponible
            if (typeof faceapi === 'undefined') {
                throw new Error("Face-api.js no cargó correctamente");
            }
            
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/models';
            
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
            ]);
            
            modelsLoaded = true;
            if (faceStatus) {
                faceStatus.innerHTML = '<i class="fas fa-check-circle"></i> Modelos listos. Activa la cámara.';
                faceStatus.style.background = 'rgba(76,175,80,0.8)';
            }
            
            console.log("Modelos cargados correctamente");
            
        } catch (error) {
            console.error("Error cargando modelos:", error);
            if (faceStatus) {
                faceStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error cargando modelos. Recarga la página.';
                faceStatus.style.background = 'rgba(244,67,54,0.8)';
            }
        }
    }

    // ========== EVENTOS ==========
    btnStart.addEventListener('click', iniciarCamara);
    btnAnalyze.addEventListener('click', analizarRostro);

    // ========== INICIALIZACIÓN ==========
    cargarModelos();

}); // Cierre de DOMContentLoaded
