// ==========================================================================
// Fortner Web — Client Application
//
// This file contains ZERO proprietary information about how Fortner
// compression works. It is a generic upload/download UI that communicates
// with the Fortner REST API via standard HTTP.
//
// Copyright (c) 2026 John R Fortner. All Rights Reserved.
// ==========================================================================

(function () {
    'use strict';

    // --- Configuration ---------------------------------------------------
    // The API URL is loaded from config.json so the tunnel URL can change
    // without redeploying the site. Falls back to localhost for dev.
    let API_URL = localStorage.getItem('fortner_api_url') || 'http://localhost:8080';
    let apiKey = localStorage.getItem('fortner_api_key') || '';

    // --- DOM Elements ----------------------------------------------------
    const $ = (sel) => document.querySelector(sel);
    const keySetup     = $('#key-setup');
    const mainApp      = $('#main-app');
    const keyInput     = $('#api-key-input');
    const saveKeyBtn   = $('#save-key-btn');
    const keyError     = $('#key-error');
    const changeKeyBtn = $('#change-key-btn');
    const serverStatus = $('#server-status');
    const footerStatus = $('#footer-status');

    // Encode
    const encodeDrop   = $('#encode-drop');
    const encodeFile   = $('#encode-file');
    const encodePanel  = $('#encode-panel');
    const encodeStatus = $('#encode-status');
    const encodeProgress = $('#encode-progress');
    const encodeMessage = $('#encode-message');
    const encodeResult = $('#encode-result');
    const encodeStars  = $('#encode-stars');
    const encodeRatio  = $('#encode-ratio');
    const encodeSizes  = $('#encode-sizes');
    const encodeDownload = $('#encode-download');
    const encodeAgain  = $('#encode-again');

    // Decode
    const decodeDrop   = $('#decode-drop');
    const decodeFile   = $('#decode-file');
    const decodePanel  = $('#decode-panel');
    const decodeStatus = $('#decode-status');
    const decodeProgress = $('#decode-progress');
    const decodeMessage = $('#decode-message');
    const decodeResult = $('#decode-result');
    const decodePreview = $('#decode-preview');
    const decodeDownload = $('#decode-download');
    const decodeAgain  = $('#decode-again');

    // Tabs
    const tabs = document.querySelectorAll('.tab');

    // State
    let lastEncodedBlob = null;
    let lastEncodedName = '';
    let lastDecodedBlob = null;
    let lastDecodedName = '';

    // --- Init ------------------------------------------------------------
    async function init() {
        // Load config — localStorage override takes priority
        const savedUrl = localStorage.getItem('fortner_api_url');
        if (savedUrl) {
            API_URL = savedUrl;
        } else {
            try {
                const resp = await fetch('config.json');
                if (resp.ok) {
                    const cfg = await resp.json();
                    if (cfg.apiUrl) API_URL = cfg.apiUrl.replace(/\/+$/, '');
                }
            } catch { /* use default */ }
        }

        // Check server
        checkServer();
        setInterval(checkServer, 30000);

        // Route
        if (apiKey) {
            showApp();
        } else {
            showKeySetup();
        }

        // Wire up events
        wireEvents();
    }

    // --- Server Health ---------------------------------------------------
    async function checkServer() {
        serverStatus.className = 'status-dot checking';
        serverStatus.title = 'Checking server...';
        try {
            const resp = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
            const data = await resp.json();
            if (data.status === 'healthy') {
                serverStatus.className = 'status-dot online';
                serverStatus.title = 'Server online — Angel running';
            } else {
                serverStatus.className = 'status-dot offline';
                serverStatus.title = `Server degraded: ${JSON.stringify(data)}`;
            }
        } catch {
            serverStatus.className = 'status-dot offline';
            serverStatus.title = 'Server offline';
        }
    }

    // --- Key Setup -------------------------------------------------------
    const serverUrlInput = $('#server-url-input');
    const saveUrlBtn     = $('#save-url-btn');
    const urlSaved       = $('#url-saved');
    const settingsBtn    = $('#settings-btn');

    function showKeySetup() {
        keySetup.style.display = '';
        mainApp.style.display = 'none';
        keyInput.value = '';
        // Pre-fill current server URL
        if (serverUrlInput) serverUrlInput.value = API_URL !== 'http://localhost:8080' ? API_URL : '';
        keyInput.focus();
    }

    function saveServerUrl() {
        const url = serverUrlInput.value.trim().replace(/\/+$/, '');
        if (url) {
            API_URL = url;
            localStorage.setItem('fortner_api_url', url);
        } else {
            localStorage.removeItem('fortner_api_url');
            API_URL = 'http://localhost:8080';
        }
        urlSaved.style.display = '';
        setTimeout(() => { urlSaved.style.display = 'none'; }, 2000);
        checkServer();
    }

    function showApp() {
        keySetup.style.display = 'none';
        mainApp.style.display = '';
        setFooter('Ready');
    }

    async function saveKey() {
        const key = keyInput.value.trim();
        if (!key) {
            showKeyError('Please enter an API key');
            return;
        }

        // Validate key against server
        saveKeyBtn.disabled = true;
        saveKeyBtn.textContent = 'Checking...';
        try {
            const form = new FormData();
            // Attempt a tiny request to see if the key is accepted
            const resp = await fetch(`${API_URL}/health`, {
                headers: { 'X-API-Key': key }
            });
            if (resp.ok) {
                apiKey = key;
                localStorage.setItem('fortner_api_key', key);
                keyError.style.display = 'none';
                showApp();
            } else {
                showKeyError('Could not connect — check your key and try again');
            }
        } catch {
            showKeyError('Could not reach server — is it running?');
        } finally {
            saveKeyBtn.disabled = false;
            saveKeyBtn.textContent = 'Connect';
        }
    }

    function showKeyError(msg) {
        keyError.textContent = msg;
        keyError.style.display = '';
    }

    // --- Tabs ------------------------------------------------------------
    function switchTab(mode) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        encodePanel.style.display = mode === 'encode' ? '' : 'none';
        decodePanel.style.display = mode === 'decode' ? '' : 'none';
    }

    // --- Footer ----------------------------------------------------------
    function setFooter(msg) {
        footerStatus.textContent = msg;
    }

    // --- Encode ----------------------------------------------------------
    async function handleEncode(file) {
        if (!file) return;

        // Validate extension
        const ext = file.name.split('.').pop().toLowerCase();
        const allowed = ['png','jpg','jpeg','bmp','tga','webp','avif','tiff','tif','gif'];
        if (!allowed.includes(ext)) {
            setFooter(`Unsupported file type: .${ext}`);
            return;
        }

        // Validate size
        if (file.size > 50 * 1024 * 1024) {
            setFooter('File too large (max 50 MB)');
            return;
        }

        // Show progress
        encodeDrop.style.display = 'none';
        encodeResult.style.display = 'none';
        encodeStatus.style.display = '';
        encodeProgress.style.width = '0%';
        encodeProgress.classList.add('indeterminate');
        encodeMessage.textContent = `Compressing ${file.name}...`;
        setFooter(`Uploading ${file.name} (${formatBytes(file.size)})...`);

        try {
            const form = new FormData();
            form.append('file', file);

            const resp = await fetch(`${API_URL}/encode`, {
                method: 'POST',
                headers: { 'X-API-Key': apiKey },
                body: form
            });

            if (resp.status === 401) {
                setFooter('API key rejected — check your key');
                apiKey = '';
                localStorage.removeItem('fortner_api_key');
                showKeySetup();
                return;
            }

            if (resp.status === 429) {
                setFooter('Rate limit reached — wait a minute and try again');
                resetEncode();
                return;
            }

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
                setFooter(`Encode error: ${err.error || resp.statusText}`);
                resetEncode();
                return;
            }

            // Success
            const blob = await resp.blob();
            const origSize = parseInt(resp.headers.get('X-Original-Size') || file.size);
            const compSize = parseInt(resp.headers.get('X-Compressed-Size') || blob.size);
            const ratio = resp.headers.get('X-Compression-Ratio') || 
                          ((1 - compSize / origSize) * 100).toFixed(1) + '%';

            lastEncodedBlob = blob;
            lastEncodedName = file.name.replace(/\.[^.]+$/, '.fortner');

            // Show result
            encodeProgress.classList.remove('indeterminate');
            encodeProgress.style.width = '100%';
            encodeStatus.style.display = 'none';
            encodeResult.style.display = '';

            const ratioNum = parseFloat(ratio);
            encodeStars.textContent = getStars(ratioNum);
            encodeRatio.textContent = `${ratio} smaller`;
            encodeSizes.textContent = `${formatBytes(origSize)} → ${formatBytes(compSize)}`;
            setFooter(`Compressed: ${file.name} → ${lastEncodedName} (${ratio} smaller)`);

        } catch (err) {
            setFooter(`Network error: ${err.message}`);
            resetEncode();
        }
    }

    function resetEncode() {
        encodeStatus.style.display = 'none';
        encodeResult.style.display = 'none';
        encodeDrop.style.display = '';
        lastEncodedBlob = null;
        lastEncodedName = '';
    }

    // --- Decode ----------------------------------------------------------
    async function handleDecode(file) {
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.fortner')) {
            setFooter('Please select a .fortner file');
            return;
        }

        decodeDrop.style.display = 'none';
        decodeResult.style.display = 'none';
        decodeStatus.style.display = '';
        decodeProgress.classList.add('indeterminate');
        decodeMessage.textContent = `Decompressing ${file.name}...`;
        setFooter(`Uploading ${file.name} (${formatBytes(file.size)})...`);

        try {
            const form = new FormData();
            form.append('file', file);

            const resp = await fetch(`${API_URL}/decode`, {
                method: 'POST',
                headers: { 'X-API-Key': apiKey },
                body: form
            });

            if (resp.status === 401) {
                setFooter('API key rejected');
                apiKey = '';
                localStorage.removeItem('fortner_api_key');
                showKeySetup();
                return;
            }

            if (resp.status === 429) {
                setFooter('Rate limit reached — wait a minute and try again');
                resetDecode();
                return;
            }

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
                setFooter(`Decode error: ${err.error || resp.statusText}`);
                resetDecode();
                return;
            }

            const blob = await resp.blob();
            lastDecodedBlob = blob;
            lastDecodedName = file.name.replace(/\.fortner$/i, '.png');

            // Show preview
            decodePreview.src = URL.createObjectURL(blob);
            decodeProgress.classList.remove('indeterminate');
            decodeStatus.style.display = 'none';
            decodeResult.style.display = '';
            setFooter(`Decompressed: ${file.name} → ${lastDecodedName} (${formatBytes(blob.size)})`);

        } catch (err) {
            setFooter(`Network error: ${err.message}`);
            resetDecode();
        }
    }

    function resetDecode() {
        decodeStatus.style.display = 'none';
        decodeResult.style.display = 'none';
        decodeDrop.style.display = '';
        lastDecodedBlob = null;
        lastDecodedName = '';
        if (decodePreview.src.startsWith('blob:')) URL.revokeObjectURL(decodePreview.src);
    }

    // --- Utilities -------------------------------------------------------
    function formatBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function getStars(ratioPercent) {
        // Matches the WPF scoring tiers
        if (ratioPercent >= 80) return '★★★★★';
        if (ratioPercent >= 60) return '★★★★☆';
        if (ratioPercent >= 40) return '★★★☆☆';
        if (ratioPercent >= 20) return '★★★☆☆';
        if (ratioPercent >= 0)  return '★★☆☆☆';
        return '★☆☆☆☆'; // larger than original
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Drop Zone Helpers -----------------------------------------------
    function setupDropZone(zone, fileInput, handler) {
        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handler(fileInput.files[0]);
            fileInput.value = ''; // reset so same file can be selected again
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handler(e.dataTransfer.files[0]);
        });
    }

    // --- Wire Events -----------------------------------------------------
    function wireEvents() {
        // Key setup
        saveKeyBtn.addEventListener('click', saveKey);
        keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKey(); });
        changeKeyBtn.addEventListener('click', () => {
            apiKey = '';
            localStorage.removeItem('fortner_api_key');
            showKeySetup();
        });

        // Server URL
        if (saveUrlBtn) saveUrlBtn.addEventListener('click', saveServerUrl);
        if (serverUrlInput) serverUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveServerUrl(); });

        // Settings gear — go back to key/url screen
        if (settingsBtn) settingsBtn.addEventListener('click', () => {
            showKeySetup();
            // Open the server URL section
            const details = document.querySelector('.server-url-details');
            if (details) details.open = true;
        });

        // Tabs
        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.mode));
        });

        // Drop zones
        setupDropZone(encodeDrop, encodeFile, handleEncode);
        setupDropZone(decodeDrop, decodeFile, handleDecode);

        // Downloads
        encodeDownload.addEventListener('click', () => {
            if (lastEncodedBlob) downloadBlob(lastEncodedBlob, lastEncodedName);
        });
        decodeDownload.addEventListener('click', () => {
            if (lastDecodedBlob) downloadBlob(lastDecodedBlob, lastDecodedName);
        });

        // Again buttons
        encodeAgain.addEventListener('click', resetEncode);
        decodeAgain.addEventListener('click', resetDecode);
    }

    // --- Start -----------------------------------------------------------
    init();

})();
