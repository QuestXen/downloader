import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { downloadVideo, getVideoInfo } from './utils/downloader.js';  // Add getVideoInfo here
import settings from './utils/settings.js';
import { autoUpdater } from 'electron-updater';
import { log } from 'electron-log';

log.transports.file.level = 'info';
log.info('App startet...');

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
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    // mainWindow.webContents.openDevTools(); // Uncomment for development
}

// Setup für autoUpdater mit GitHub
function setupAutoUpdater() {
    // Aktiviere Logging
    autoUpdater.logger = log;
    
    // Die GitHub-Konfiguration ist bereits in package.json definiert
    // (siehe unten für die package.json Konfiguration)
    
    autoUpdater.on('checking-for-update', () => {
      log.info('Überprüfe auf Updates...');
    });
    
    autoUpdater.on('update-available', (info) => {
      log.info('Update verfügbar', info);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update verfügbar',
        message: `Version ${info.version} ist verfügbar und wird heruntergeladen...`,
        buttons: ['OK']
      });
    });
    
    autoUpdater.on('update-not-available', () => {
      log.info('Kein Update verfügbar');
    });
    
    autoUpdater.on('download-progress', (progressObj) => {
      let logMessage = `Download-Geschwindigkeit: ${progressObj.bytesPerSecond}`;
      logMessage += ` - Heruntergeladen: ${progressObj.percent}%`;
      logMessage += ` (${progressObj.transferred}/${progressObj.total})`;
      log.info(logMessage);
      
      // Optional: Fortschritt im Hauptfenster anzeigen
      if (mainWindow) {
        mainWindow.webContents.send('download-progress', progressObj);
      }
    });
    
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update heruntergeladen');
      
      dialog.showMessageBox({
        type: 'info',
        title: 'Update bereit',
        message: `Die Version ${info.version} wurde heruntergeladen und wird beim Neustart installiert.`,
        buttons: ['Jetzt neu starten', 'Später']
      }).then((returnValue) => {
        if (returnValue.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });
    
    autoUpdater.on('error', (error) => {
      log.error('Fehler beim Update-Prozess:', error);
      dialog.showErrorBox('Update-Fehler', 'Es ist ein Fehler beim Aktualisieren der Anwendung aufgetreten: ' + error);
    });
  
    // Überprüfe alle 6 Stunden auf Updates (in ms)
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        log.error('Fehler bei Update-Prüfung:', err);
      });
    }, 6 * 60 * 60 * 1000);
    
    // Erste Überprüfung nach dem Start
    autoUpdater.checkForUpdates().catch(err => {
      log.error('Fehler bei erster Update-Prüfung:', err);
    });
  }

// App Events
app.on('ready', () => {
    createWindow();
    setupAutoUpdater();
  });

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

ipcMain.handle('start-download', async (event, { url, format, outputPath, quality }) => {
    try {
        currentDownload = downloadVideo(url, format, outputPath, quality);
        
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