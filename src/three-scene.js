import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

const container = document.getElementById('three-background');
const artworkCanvas = document.createElement('canvas');
const visualizerCanvas = document.createElement('canvas');
artworkCanvas.width = artworkCanvas.height = visualizerCanvas.width = visualizerCanvas.height = 300;

const artworkContext = artworkCanvas.getContext('2d');
const visualizerContext = visualizerCanvas.getContext('2d');
const idleVideo = document.createElement('video');
idleVideo.src = new URL('../tv/textures/no_signal.webm', import.meta.url).href;
idleVideo.muted = true;
idleVideo.loop = true;
idleVideo.playsInline = true;

let artworkTexture;
let visualizerTexture;
let videoScreen;
let isIdle = true;
let trackRequestId = 0;
let gradient;
let maxHeight;
let startPosition;
let visualizerWidth;
let middleY;
let albumColor = [225, 225, 225];

function setAmbientColor(color) {
    document.body.style.setProperty('--gradientColor1', `rgb(${color.join(',')})`);
}

function updateVisualizerGradient() {
    maxHeight = 32;
    startPosition = 50;
    visualizerWidth = 200;
    middleY = 222;

    gradient = visualizerContext.createLinearGradient(0, middleY - maxHeight, 0, middleY);
    gradient.addColorStop(0, 'rgba(255,248,220,0.95)');
    gradient.addColorStop(0.55, `rgb(${albumColor.join(',')})`);
    gradient.addColorStop(1, `rgba(${albumColor.join(',')},0.85)`);
}

function drawTrack(title, artist, image) {
    artworkContext.clearRect(0, 0, artworkCanvas.width, artworkCanvas.height);
    artworkContext.textAlign = 'center';

    if (image) {
        const imageWidth = image.naturalWidth || image.width;
        const imageHeight = image.naturalHeight || image.height;
        const frame = { x: 50, y: 20, size: 200 };
        const coverScale = Math.max(frame.size / imageWidth, frame.size / imageHeight);
        const cropWidth = frame.size / coverScale;
        const cropHeight = frame.size / coverScale;
        const cropX = (imageWidth - cropWidth) / 2;
        const cropY = (imageHeight - cropHeight) / 2;

        artworkContext.drawImage(
            image,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            frame.x,
            frame.y,
            frame.size,
            frame.size
        );
    }

    artworkContext.fillStyle = '#ffffff';
    artworkContext.font = 'bold 20px Arial, sans-serif';
    artworkContext.fillText(title, artworkCanvas.width / 2, 250, 280);
    artworkContext.font = '15px Arial, sans-serif';
    artworkContext.fillText(artist, artworkCanvas.width / 2, 278, 280);

    if (artworkTexture) artworkTexture.needsUpdate = true;
}

function setTvTrack(track) {
    if (!track || typeof track.title !== 'string' || !track.title.trim()) {
        throw new TypeError('La rola debe incluir un título válido.');
    }

    const requestId = ++trackRequestId;
    const title = track.title.trim();
    const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
    let image = null;

    isIdle = false;
    albumColor = [225, 225, 225];
    document.body.style.setProperty('--gradientColor1', '#2d2d2d');
    updateVisualizerGradient();
    drawTrack(title, artist, image);

    if (typeof track.artwork !== 'string' || !track.artwork.trim()) return;

    image = new Image();
    image.onload = () => {
        if (requestId !== trackRequestId) return;
        drawTrack(title, artist, image);
        try {
            if (typeof window.ColorThief !== 'function') {
                throw new Error('ColorThief no está disponible.');
            }
            albumColor = new window.ColorThief().getColor(image);
            setAmbientColor(albumColor);
            updateVisualizerGradient();
        } catch (error) {
            console.warn('No se pudo obtener el color de la portada:', error);
        }
    };
    image.onerror = () => {
        if (requestId === trackRequestId) {
            console.error(`No se pudo cargar la portada de la rola: ${track.artwork}`);
        }
    };
    image.src = track.artwork;
}

window.setTvTrack = setTvTrack;
window.addEventListener('player:trackchange', (event) => {
    try {
        setTvTrack(event.detail);
    } catch (error) {
        console.error('No se pudo actualizar la pantalla de la TV:', error);
    }
});

window.setTvAudioData = (audioArray) => {
    if (!Array.isArray(audioArray) && !(audioArray instanceof Uint8Array)) {
        throw new TypeError('Los datos del visualizador deben ser un array o Uint8Array.');
    }
    if (audioArray.length === 0 || isIdle || !gradient) return;

    visualizerContext.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    const barCount = 32;
    const gap = 2;
    const barWidth = (visualizerWidth - gap * (barCount - 1)) / barCount;
    visualizerContext.fillStyle = gradient;
    visualizerContext.shadowColor = `rgb(${albumColor.join(',')})`;
    visualizerContext.shadowBlur = 4;

    for (let index = 0; index < barCount; index++) {
        const firstSample = Math.floor(index * audioArray.length / barCount);
        const lastSample = Math.max(firstSample + 1, Math.floor((index + 1) * audioArray.length / barCount));
        let sum = 0;
        for (let sample = firstSample; sample < lastSample; sample++) {
            sum += audioArray[sample];
        }

        const average = sum / (lastSample - firstSample);
        const level = Math.max(0, Math.min(1, (average - 72) / 170));
        const height = 2 + Math.pow(level, 0.8) * maxHeight;
        const x = startPosition + index * (barWidth + gap);
        visualizerContext.fillRect(x, middleY - height, barWidth, height);
    }

    visualizerContext.shadowBlur = 0;
    visualizerContext.fillStyle = gradient;
    if (visualizerTexture) visualizerTexture.needsUpdate = true;
};

function cloneScreenLayer(source, zOffset) {
    const layer = source.clone(false);
    source.getWorldPosition(layer.position);
    source.getWorldQuaternion(layer.quaternion);
    layer.position.z += zOffset;
    return layer;
}

function initScene() {
    if (!container) {
        console.error('No se encontró el contenedor #three-background.');
        return;
    }

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
        console.error('No se pudo iniciar WebGL para la escena de la TV:', error);
        return;
    }

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    const camera = new THREE.PerspectiveCamera(52.5, window.innerWidth / window.innerHeight, 0.25, 1000);
    camera.rotation.x = (Math.PI / 180) * 10;

    const controls = new OrbitControls(camera, container);
    controls.enableDamping = true;
    controls.minDistance = 12.5;
    controls.maxDistance = 50;
    controls.minAzimuthAngle = -Math.PI * 0.5;
    controls.maxAzimuthAngle = Math.PI * 0.5;
    controls.target.set(0, 0, -0.1);
    controls.update();

    const scene = new THREE.Scene();
    const environmentUrl = new URL('../tv/textures/colorful_studio_1k.hdr', import.meta.url).href;
    new RGBELoader().load(
        environmentUrl,
        (environment) => {
            environment.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = environment;
        },
        undefined,
        (error) => console.error('No se pudo cargar la iluminación HDR de la TV:', error)
    );

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const light = new THREE.SpotLight(0xffffff, 0.1);
    light.position.set(-10, 75, 0);
    light.castShadow = true;
    scene.add(light);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.ShadowMaterial({ color: new THREE.Color(0x000000) })
    );
    floor.receiveShadow = true;
    floor.position.set(0, -5, -4);
    floor.rotation.x = (Math.PI / 180) * -90;
    scene.add(floor);

    const loader = new GLTFLoader();
    const modelUrl = new URL('../tv/models/screen_low.glb', import.meta.url).href;
    loader.load(
        modelUrl,
        (gltf) => {
            gltf.scene.scale.setScalar(0.01);
            gltf.scene.rotation.y = THREE.MathUtils.degToRad(-30);
            gltf.scene.position.set(0.0, -5, -6);
            gltf.scene.traverse((child) => {
                if (child.isMesh) child.castShadow = true;
            });
            scene.add(gltf.scene);
            gltf.scene.updateMatrixWorld(true);

            const screen = gltf.scene.getObjectByName('SCREEN');
            if (!screen) {
                console.error('El modelo screen_low.glb no contiene un nodo llamado "SCREEN".');
                return;
            }

            artworkTexture = new THREE.CanvasTexture(artworkCanvas);
            artworkTexture.magFilter = THREE.NearestFilter;
            artworkTexture.minFilter = THREE.NearestFilter;
            artworkTexture.flipY = false;
            screen.material = new THREE.MeshBasicMaterial({ map: artworkTexture });

            visualizerTexture = new THREE.CanvasTexture(visualizerCanvas);
            visualizerTexture.magFilter = THREE.NearestFilter;
            visualizerTexture.minFilter = THREE.NearestFilter;
            visualizerTexture.flipY = false;
            visualizerTexture.premultiplyAlpha = true;
            const visualizerLayer = cloneScreenLayer(screen, 0.001);
            visualizerLayer.material = new THREE.MeshBasicMaterial({
                map: visualizerTexture,
                transparent: true
            });
            scene.add(visualizerLayer);

            const videoTexture = new THREE.VideoTexture(idleVideo);
            videoTexture.format = THREE.RGBAFormat;
            videoTexture.minFilter = THREE.NearestFilter;
            videoTexture.magFilter = THREE.NearestFilter;
            videoTexture.generateMipmaps = false;
            videoTexture.flipY = false;
            videoTexture.offset.y = -0.12;
            videoScreen = cloneScreenLayer(screen, 0.002);
            videoScreen.material = new THREE.MeshBasicMaterial({ map: videoTexture });
            scene.add(videoScreen);
        },
        undefined,
        (error) => console.error('No se pudo cargar el modelo 3D de la TV:', error)
    );

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    idleVideo.play().catch((error) => {
        console.warn('No se pudo iniciar el video de espera de la TV:', error);
    });

    function render() {
        requestAnimationFrame(render);
        controls.update();

        if (videoScreen) {
            videoScreen.visible = isIdle;
            if (isIdle && idleVideo.paused) {
                idleVideo.play().catch((error) => {
                    console.warn('No se pudo reanudar el video de espera de la TV:', error);
                });
            } else if (!isIdle && !idleVideo.paused) {
                idleVideo.pause();
            }
        }

        composer.render();
    }

    render();
}

updateVisualizerGradient();
initScene();
