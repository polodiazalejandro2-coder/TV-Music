import './three-scene.js';

const { Howl, Howler } = window;
const songsContainer = document.getElementById('songs-container');
const shuffleButton = document.getElementById('shuffle-btn');
const previousButton = document.getElementById('prev-btn');
const playPauseButton = document.getElementById('play-pause-btn');
const nextButton = document.getElementById('next-btn');
const repeatButton = document.getElementById('repeat-btn');
const volumeBar = document.getElementById('volume-bar');
const progressBar = document.getElementById('progress-bar');
const currentTimeLabel = document.getElementById('current-time');
const totalDurationLabel = document.getElementById('total-duration');

let songs = [];
let currentSound = null;
let currentSongIndex = -1;
let shuffleEnabled = false;
let repeatEnabled = false;
let audioAnalyser = null;
let audioData = null;
let visualizerFrame = null;
let progressFrame = null;

function updateRangeFill(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value) || 0;
    const percentage = ((value - min) / (max - min)) * 100;
    input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, percentage))}%`);
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
}

function updateProgress() {
    if (!currentSound || !currentSound.playing()) {
        progressFrame = null;
        return;
    }

    const duration = currentSound.duration();
    const seek = currentSound.seek();
    if (Number.isFinite(duration) && duration > 0 && Number.isFinite(seek)) {
        progressBar.value = String(Math.round((seek / duration) * Number(progressBar.max)));
        updateRangeFill(progressBar);
        currentTimeLabel.textContent = formatTime(seek);
        totalDurationLabel.textContent = formatTime(duration);
    }

    progressFrame = requestAnimationFrame(updateProgress);
}

function startProgress() {
    if (progressFrame === null) {
        progressFrame = requestAnimationFrame(updateProgress);
    }
}

function stopProgress() {
    if (progressFrame !== null) {
        cancelAnimationFrame(progressFrame);
        progressFrame = null;
    }
}

function startAudioVisualizer() {
    if (!audioAnalyser && Howler && Howler.ctx && Howler.masterGain) {
        audioAnalyser = Howler.ctx.createAnalyser();
        audioAnalyser.fftSize = 64;
        const silentGain = Howler.ctx.createGain();
        silentGain.gain.value = 0;
        Howler.masterGain.connect(audioAnalyser);
        audioAnalyser.connect(silentGain);
        silentGain.connect(Howler.ctx.destination);
        audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
    }

    if (!audioAnalyser || visualizerFrame !== null) return;

    const updateVisualizer = () => {
        audioAnalyser.getByteFrequencyData(audioData);
        if (typeof window.setTvAudioData === 'function') {
            window.setTvAudioData(audioData);
        }
        visualizerFrame = requestAnimationFrame(updateVisualizer);
    };

    updateVisualizer();
}

function setPlayButton(isPlaying) {
    playPauseButton.textContent = isPlaying ? '❚❚' : '▶';
    playPauseButton.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproducir');
    if (isPlaying) {
        startProgress();
    } else {
        stopProgress();
    }
}

function getAdjacentSongIndex(direction) {
    if (shuffleEnabled && songs.length > 1) {
        let nextIndex = currentSongIndex;
        while (nextIndex === currentSongIndex) {
            nextIndex = Math.floor(Math.random() * songs.length);
        }
        return nextIndex;
    }

    return (currentSongIndex + direction + songs.length) % songs.length;
}

function playSong(index) {
    const song = songs[index];
    if (!song) return;

    if (typeof Howl !== 'function' || !Howler) {
        console.error('No se puede reproducir la canción: Howler.js no está disponible.');
        return;
    }

    if (currentSound) {
        currentSound.stop();
        currentSound.unload();
    }

    currentSongIndex = index;
    progressBar.value = '0';
    currentTimeLabel.textContent = '0:00';
    totalDurationLabel.textContent = '0:00';
    updateRangeFill(progressBar);
    songsContainer.querySelectorAll('.song-card').forEach((card, cardIndex) => {
        const isCurrent = cardIndex === index;
        card.classList.toggle('is-current', isCurrent);
        card.setAttribute('aria-pressed', String(isCurrent));
    });
    window.dispatchEvent(new CustomEvent('player:trackchange', {
        detail: {
            title: song.title,
            artist: song.artist,
            artwork: song.cover
        }
    }));

    currentSound = new Howl({
        src: [song.src],
        loop: repeatEnabled,
        onload: () => {
            totalDurationLabel.textContent = formatTime(currentSound.duration());
        },
        onplay: () => setPlayButton(true),
        onpause: () => setPlayButton(false),
        onstop: () => setPlayButton(false),
        onend: () => {
            if (!repeatEnabled && songs.length > 1) {
                playSong(getAdjacentSongIndex(1));
            } else {
                setPlayButton(false);
            }
        },
        onloaderror: (_id, error) => console.error(`No se pudo cargar "${song.title}"`, error)
    });

    currentSound.play();
    startAudioVisualizer();
}

async function cargarCanciones() {
    try {
        const response = await fetch('../data/musica.json');

        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status} al cargar musica.json`);
        }

        songs = await response.json();
        if (!Array.isArray(songs)) {
            throw new Error('musica.json debe contener una lista de canciones');
        }
        songsContainer.innerHTML = '';

        songs.forEach((song, index) => {
            const songElement = document.createElement('div');
            songElement.classList.add('song-card');
            songElement.dataset.id = song.id;

            const imageContainer = document.createElement('div');
            imageContainer.classList.add('card-image');

            const cover = document.createElement('img');
            cover.src = song.cover;
            cover.alt = `Portada de ${song.title}`;

            songElement.setAttribute('role', 'button');
            songElement.setAttribute('tabindex', '0');
            songElement.setAttribute('aria-pressed', 'false');
            songElement.addEventListener('click', () => playSong(index));
            songElement.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    playSong(index);
                }
            });

            const title = document.createElement('h3');
            title.textContent = song.title;

            const artist = document.createElement('p');
            artist.textContent = song.artist;

            imageContainer.append(cover);
            const songInfo = document.createElement('div');
            songInfo.classList.add('song-info');
            songInfo.append(title, artist);
            songElement.append(imageContainer, songInfo);
            songsContainer.appendChild(songElement);
        });

        if (songs.length === 0) {
            songsContainer.textContent = 'No hay canciones en la lista.';
        }
    } catch (error) {
        console.error('No se pudieron cargar las canciones:', error);
        songsContainer.textContent = 'No se pudieron cargar las canciones.';
    }
}

playPauseButton.addEventListener('click', () => {
    if (!currentSound) {
        playSong(0);
    } else if (currentSound.playing()) {
        currentSound.pause();
    } else {
        currentSound.play();
    }
});

previousButton.addEventListener('click', () => {
    if (songs.length) playSong(getAdjacentSongIndex(-1));
});

nextButton.addEventListener('click', () => {
    if (songs.length) playSong(getAdjacentSongIndex(1));
});

shuffleButton.addEventListener('click', () => {
    shuffleEnabled = !shuffleEnabled;
    shuffleButton.setAttribute('aria-pressed', String(shuffleEnabled));
});

repeatButton.addEventListener('click', () => {
    repeatEnabled = !repeatEnabled;
    repeatButton.setAttribute('aria-pressed', String(repeatEnabled));
    if (currentSound) currentSound.loop(repeatEnabled);
});

progressBar.addEventListener('input', () => {
    updateRangeFill(progressBar);
    if (!currentSound) return;

    const duration = currentSound.duration();
    if (!Number.isFinite(duration) || duration <= 0) return;

    const seek = (Number(progressBar.value) / Number(progressBar.max)) * duration;
    currentSound.seek(seek);
    currentTimeLabel.textContent = formatTime(seek);
});

volumeBar.addEventListener('input', () => {
    updateRangeFill(volumeBar);
    if (Howler) Howler.volume(Number(volumeBar.value) / 100);
});

updateRangeFill(progressBar);
updateRangeFill(volumeBar);
if (Howler) Howler.volume(Number(volumeBar.value) / 100);
setPlayButton(false);
cargarCanciones();