import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { downloadVideo, getVideoInfo } from './utils/downloader.js';
import settings from './utils/settings.js';
import pkg from 'electron-updater';  // Change this line
const { autoUpdater } = pkg;  // Add this line
import log from 'electron-log';
import { shell } from 'electron';

log.transports.file.level = 'info';
log.info('App startet...');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
let mainWindow;
let currentDownload = null;

// Füge diese URL zur Konfiguration hinzu - Diese zeigt auf Ihre GitHub Pages Update-Datei
const updateURL = 'https://questxen.github.io/downloader/updates.json';

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

// // Setup für autoUpdater mit GitHub
// function setupAutoUpdater() {
//     if (process.env.NODE_ENV === 'development') {
//         log.info('Überspringe Auto-Update im Development-Modus');
//         return;
//     }

//     autoUpdater.logger = log;
//     autoUpdater.allowDowngrade = false;
//     autoUpdater.allowPrerelease = false;

//     // Entfernt die setFeedURL Konfiguration, da sie für öffentliche Repos nicht notwendig ist
//     // Der autoUpdater nutzt automatisch die Repository-URL aus package.json

//     autoUpdater.on('checking-for-update', () => {
//         log.info('Überprüfe auf Updates...');
//     });
    
//     autoUpdater.on('update-available', (info) => {
//         log.info('Update verfügbar', info);
//         dialog.showMessageBox({
//             type: 'info',
//             title: 'Update verfügbar',
//             message: `Version ${info.version} ist verfügbar und wird heruntergeladen...`,
//             buttons: ['OK']
//         });
//     });
    
//     autoUpdater.on('update-not-available', () => {
//       log.info('Kein Update verfügbar');
//     });
    
//     autoUpdater.on('download-progress', (progressObj) => {
//       let logMessage = `Download-Geschwindigkeit: ${progressObj.bytesPerSecond}`;
//       logMessage += ` - Heruntergeladen: ${progressObj.percent}%`;
//       logMessage += ` (${progressObj.transferred}/${progressObj.total})`;
//       log.info(logMessage);
      
//       // Optional: Fortschritt im Hauptfenster anzeigen
//       if (mainWindow) {
//         mainWindow.webContents.send('download-progress', progressObj);
//       }
//     });
    
//     autoUpdater.on('update-downloaded', (info) => {
//       log.info('Update heruntergeladen');
      
//       dialog.showMessageBox({
//         type: 'info',
//         title: 'Update bereit',
//         message: `Die Version ${info.version} wurde heruntergeladen und wird beim Neustart installiert.`,
//         buttons: ['Jetzt neu starten', 'Später']
//       }).then((returnValue) => {
//         if (returnValue.response === 0) {
//           autoUpdater.quitAndInstall();
//         }
//       });
//     });
    
//     autoUpdater.on('error', (error) => {
//       log.error('Fehler beim Update-Prozess:', error);
//       dialog.showErrorBox('Update-Fehler', 'Es ist ein Fehler beim Aktualisieren der Anwendung aufgetreten: ' + error);
//     });
  
//     // Überprüfe alle 6 Stunden auf Updates (in ms)
//     setInterval(() => {
//       autoUpdater.checkForUpdates().catch(err => {
//         log.error('Fehler bei Update-Prüfung:', err);
//       });
//     }, 6 * 60 * 60 * 1000);
    
//     // Erste Überprüfung nach dem Start
//     autoUpdater.checkForUpdates().catch(err => {
//       log.error('Fehler bei erster Update-Prüfung:', err);
//     });
//   }

// Angepasste Funktion für Self-Hosted Updates
function setupSelfHostedUpdater() {
    log.info('Starting update check...');
    log.info('Update URL:', updateURL);

    if (process.env.NODE_ENV === 'development') {
        log.info('Überspringe Auto-Update im Development-Modus');
        return;
    }

    autoUpdater.logger = log;
    
    // Wichtig: URL für updates.json setzen
    autoUpdater.setFeedURL({
        provider: 'generic',
        url: 'https://questxen.github.io/downloader',
    });
    
    // Deaktiviere einige Standardprüfungen
    autoUpdater.autoDownload = true; // Automatisches Herunterladen deaktivieren
    
    autoUpdater.on('checking-for-update', () => {
        log.info('Überprüfe auf Updates...');
    });
    
    autoUpdater.on('update-available', (info) => {
        log.info('Update verfügbar', info);
        
        // Anstatt automatisch herunterzuladen, fragen wir den Benutzer
        dialog.showMessageBox({
            type: 'info',
            title: 'Update verfügbar',
            message: `Version ${info.version} ist verfügbar.`,
            detail: 'Möchten Sie die neue Version jetzt herunterladen und installieren?',
            buttons: ['Herunterladen', 'Website öffnen', 'Später']
        }).then((returnValue) => {
            if (returnValue.response === 0) {
                // Starte den Download-Prozess
                autoUpdater.downloadUpdate().catch(err => {
                    log.error('Download-Fehler:', err);
                    // Bei Fehler zur manuellen Download-Seite weiterleiten
                    offerManualDownload(info.version);
                });
            } else if (returnValue.response === 1) {
                // Öffne direkt die Release-Seite
                shell.openExternal('https://github.com/QuestXen/downloader/releases/latest');
            }
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
        
        // Optional: Update-Fortschritt im Hauptfenster anzeigen
        if (mainWindow) {
            mainWindow.webContents.send('update-progress', progressObj);
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
        log.error('Update error details:', error);
        log.error('Update error message:', error.message);
        log.error('Update error stack:', error.stack);
        
        // Bei einem Update-Fehler bieten wir einen manuellen Download an
        offerManualDownload();
    });
  
    // Überprüfe bei Programmstart und dann alle 6 Stunden auf Updates
    autoUpdater.checkForUpdates().catch(err => {
        log.error('Fehler bei erster Update-Prüfung:', err);
    });
    
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(err => {
            log.error('Fehler bei Update-Prüfung:', err);
        });
    }, 6 * 60 * 60 * 1000);
}

  // Hilfsfunktion für manuellen Download
function offerManualDownload(version) {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update nicht möglich',
        message: 'Automatisches Update nicht möglich.',
        detail: version ? `Sie können Version ${version} manuell von der Website herunterladen.` : 
                          'Sie können die neueste Version manuell von der Website herunterladen.',
        buttons: ['Website öffnen', 'Abbrechen']
    }).then((returnValue) => {
        if (returnValue.response === 0) {
            shell.openExternal('https://github.com/QuestXen/downloader/releases/latest');
        }
    });
}

// App Events
app.on('ready', () => {
    createWindow();
    setupSelfHostedUpdater();
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

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Füge einen Menüpunkt oder Button hinzu, um Updates manuell zu überprüfen
ipcMain.handle('check-for-updates', async () => {
    if (process.env.NODE_ENV === 'development') {
        return { success: false, message: 'Im Entwicklungsmodus nicht verfügbar' };
    }
    
    try {
        await autoUpdater.checkForUpdates();
        return { success: true };
    } catch (error) {
        log.error('Fehler bei manueller Update-Prüfung:', error);
        return { 
            success: false, 
            message: 'Fehler bei der Update-Prüfung: ' + error.message 
        };
    }
});