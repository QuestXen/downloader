document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const videoUrlInput = document.getElementById('videoUrl');
    const searchBtn = document.getElementById('searchBtn');
    const videoInfo = document.getElementById('videoInfo');
    const thumbnail = document.getElementById('thumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const videoDuration = document.getElementById('videoDuration');
    const qualitySelect = document.getElementById('quality');
    const downloadPath = document.getElementById('downloadPath');
    const browseBtn = document.getElementById('browseBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const progressSection = document.querySelector('.progress-section');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.getElementById('progressText');
    const downloadSpeed = document.getElementById('downloadSpeed');
    const status = document.getElementById('status');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const saveLocationCheckbox = document.getElementById('saveLocation');
    const autoQualityCheckbox = document.getElementById('autoQuality');
    const appVersion = document.getElementById('appVersion');

    // YouTube URL validation regex
    const youtubeUrlRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;

    // Load saved settings
    let settings = {};
    loadSettings();
    displayAppVersion();

    async function loadSettings() {
        settings = await window.api.getSettings() || {};
        saveLocationCheckbox.checked = settings.saveLocation || false;
        autoQualityCheckbox.checked = settings.autoQuality || false;
        if (settings.saveLocation && settings.lastPath) {
            downloadPath.value = settings.lastPath;
        }
    }

    async function displayAppVersion() {
        try {
            const version = await window.api.getAppVersion();
            appVersion.textContent = `v${version}`;
        } catch (error) {
            console.error('Failed to get app version:', error);
        }
    }

    // Event Listeners
    videoUrlInput.addEventListener('input', validateUrl);
    searchBtn.addEventListener('click', handleSearch);
    browseBtn.addEventListener('click', handleBrowse);
    downloadBtn.addEventListener('click', startDownload);
    cancelBtn.addEventListener('click', cancelDownload);
    settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));

    saveLocationCheckbox.addEventListener('change', async (e) => {
        settings.saveLocation = e.target.checked;
        await window.api.saveSettings(settings);
    });

    autoQualityCheckbox.addEventListener('change', async (e) => {
        settings.autoQuality = e.target.checked;
        await window.api.saveSettings(settings);
    });

    // URL Validation
    function validateUrl() {
        const isValid = youtubeUrlRegex.test(videoUrlInput.value);
        searchBtn.disabled = !isValid;
        return isValid;
    }

    // Search Video Information
    let lastVideoData = null; // Global variable to store video data

    async function handleSearch() {
        if (!validateUrl()) return;

        try {
            setStatus('Fetching video information...', 'info');
            const videoData = await window.api.searchVideo(videoUrlInput.value);
            lastVideoData = videoData; // Save video data
            displayVideoInfo(videoData);
            populateQualityOptions(videoData.formats);
            downloadBtn.disabled = false;
            setStatus('', 'info'); // Clear status message
        } catch (error) {
            setStatus('Failed to fetch video information', 'error');
            console.error(error);
        }
    }

    // Display Video Information
    function displayVideoInfo(data) {
        videoInfo.classList.remove('hidden');
        thumbnail.src = data.thumbnail;
        videoTitle.textContent = data.title;
        videoDuration.textContent = formatDuration(data.duration);
    }

    // Populate Quality Options
    function populateQualityOptions(formats) {
        const selectedFormat = document.querySelector('input[name="format"]:checked').value;
        qualitySelect.innerHTML = '';
        
        let filteredFormats;
        if (selectedFormat === 'audio') {
            // Für Audio nur Audio-Only Formate
            filteredFormats = formats.filter(format => !format.hasVideo && format.hasAudio);
        } else {
            // Für Video alle Videoformate
            filteredFormats = formats.filter(format => format.hasVideo);
        }

        // Sortiere Formate
        filteredFormats.sort((a, b) => {
            if (selectedFormat === 'audio') {
                return (b.audioBitrate || 0) - (a.audioBitrate || 0);
            }
            return (b.height || 0) - (a.height || 0);
        });

        filteredFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.itag;
            
            if (selectedFormat === 'audio') {
                const bitrate = format.audioBitrate ? `${format.audioBitrate}kbps` : 'Unknown quality';
                option.textContent = `${bitrate} (${format.container})`;
            } else {
                const fps = format.fps ? `${format.fps}fps` : '';
                option.textContent = `${format.qualityLabel} ${fps} (${format.container})`;
            }
            
            qualitySelect.appendChild(option);
        });

        // Automatically select highest quality if enabled
        if (settings.autoQuality || qualitySelect.options.length > 0) {
            qualitySelect.selectedIndex = 0;
        }
    }

    // Browse Download Location
    async function handleBrowse() {
        const path = await window.api.selectDirectory();
        if (path) {
            downloadPath.value = path;
            if (settings.saveLocation) {
                settings.lastPath = path;
                await window.api.saveSettings(settings);
            }
        }
    }

    // Start Download
    async function startDownload() {
        if (!downloadPath.value) {
            setStatus('Please select download location', 'error');
            return;
        }

        const format = document.querySelector('input[name="format"]:checked').value;
        const quality = qualitySelect.value;
        progressSection.classList.remove('hidden');
        downloadBtn.classList.add('hidden');
        cancelBtn.classList.remove('hidden');

        try {
            setStatus('Starting download...', 'info');
            window.api.onDownloadProgress(updateProgress);
            
            await window.api.downloadVideo(
                videoUrlInput.value,
                format,
                downloadPath.value,
                quality // Fügen Sie die ausgewählte Qualität hinzu
            );

            setStatus('Download completed successfully!', 'success');
            resetUI();
        } catch (error) {
            setStatus(`Download failed: ${error.message}`, 'error');
            resetUI();
        }
    }

    // Cancel Download
    function cancelDownload() {
        window.api.cancelDownload();
        setStatus('Download cancelled', 'info');
        resetUI();
    }

    // Update Progress
    function updateProgress(progress) {
        progressFill.style.width = `${progress.percent}%`;
        progressText.textContent = `${Math.round(progress.percent)}%`;
        downloadSpeed.textContent = formatBytes(progress.speed) + '/s';
    }

    // Helper Functions
    function formatDuration(seconds) {
        return new Date(seconds * 1000).toISOString().substr(11, 8);
    }

    function formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(2)} ${units[i]}`;
    }

    function setStatus(message, type = 'info') {
        status.textContent = message;
        status.className = `status-bar ${type}`;
    }

    function resetUI() {
        progressSection.classList.add('hidden');
        downloadBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        downloadSpeed.textContent = '';
    }

    // Fügen Sie einen Event Listener für Format-Änderungen hinzu
    document.querySelectorAll('input[name="format"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (lastVideoData) {
                populateQualityOptions(lastVideoData.formats);
            }
        });
    });
});