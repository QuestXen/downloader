const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    searchVideo: async (url) => {
        try {
            return await ipcRenderer.invoke('search-video', url);
        } catch (error) {
            throw new Error('Failed to fetch video info');
        }
    },

    downloadVideo: async (url, format, outputPath, quality) => {
        try {
            return await ipcRenderer.invoke('start-download', { url, format, outputPath, quality });
        } catch (error) {
            throw new Error('Download failed');
        }
    },

    cancelDownload: async () => {
        await ipcRenderer.invoke('cancel-download');
    },

    selectDirectory: async () => {
        return await ipcRenderer.invoke('select-directory');
    },

    getSettings: async () => {
        return await ipcRenderer.invoke('get-settings');
    },

    saveSettings: async (settings) => {
        return await ipcRenderer.invoke('save-settings', settings);
    },

    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },

    onDownloadComplete: (callback) => {
        ipcRenderer.on('download-complete', (event, result) => callback(result));
    },

    onDownloadError: (callback) => {
        ipcRenderer.on('download-error', (event, error) => callback(error));
    }
});