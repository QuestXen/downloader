import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { downloadVideo, getVideoInfo } from './utils/downloader.js';  // Add getVideoInfo here
import settings from './utils/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
let mainWindow;
let currentDownload = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    // mainWindow.webContents.openDevTools(); // Uncomment for development
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

ipcMain.handle('start-download', async (event, { url, format, outputPath }) => {
    try {
        currentDownload = downloadVideo(url, format, outputPath);
        
        currentDownload.on('progress', (progress) => {
            // Ensure all numbers are properly converted
            const serializedProgress = {
                percent: Number(progress.percent),
                downloaded: Number(progress.downloaded),
                total: Number(progress.total),
                speed: Number(progress.speed)
            };
            mainWindow.webContents.send('download-progress', serializedProgress);
        });

        currentDownload.on('complete', (result) => {
            mainWindow.webContents.send('download-complete', { 
                outputPath: result.outputPath 
            });
        });

        currentDownload.on('error', (error) => {
            mainWindow.webContents.send('download-error', { 
                message: error.message 
            });
        });

        return { success: true };
    } catch (error) {
        throw new Error(error.message);
    }
});

ipcMain.handle('cancel-download', () => {
    if (currentDownload) {
        currentDownload.cancel();
        currentDownload = null;
    }
});

ipcMain.handle('get-settings', () => {
    return settings.getSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
    store.set('settings', settings);
    return true;
});

ipcMain.handle('search-video', async (event, url) => {
    try {
        const videoInfo = await getVideoInfo(url);
        return videoInfo;
    } catch (error) {
        console.error('Search video error:', error);
        throw new Error('Failed to fetch video information');
    }
});