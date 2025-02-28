import Store from 'electron-store';
import path from 'path';
import os from 'os';

// Define the schema for settings validation
const schema = {
    settings: {
        type: 'object',
        properties: {
            saveLocation: { type: 'boolean', default: false },
            autoQuality: { type: 'boolean', default: false },
            lastPath: { type: 'string', default: path.join(os.homedir(), 'Downloads') },
            defaultFormat: { type: 'string', enum: ['video', 'audio'], default: 'video' },
            downloadHistory: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        url: { type: 'string' },
                        title: { type: 'string' },
                        format: { type: 'string' },
                        path: { type: 'string' },
                        date: { type: 'string' }
                    }
                },
                default: []
            }
        }
    }
};

class Settings {
    constructor() {
        this.store = new Store({
            schema,
            migrations: {
                '1.0.0': store => {
                    // Migration for future version updates
                    store.set('settings', {
                        ...store.get('settings'),
                        autoQuality: false
                    });
                }
            }
        });

        // Initialize default settings if they don't exist
        if (!this.store.has('settings')) {
            this.store.set('settings', {
                saveLocation: false,
                autoQuality: false,
                lastPath: path.join(os.homedir(), 'Downloads'),
                defaultFormat: 'video',
                downloadHistory: []
            });
        }
    }

    // Get all settings
    getSettings() {
        return this.store.get('settings');
    }

    // Update settings
    updateSettings(newSettings) {
        this.store.set('settings', {
            ...this.getSettings(),
            ...newSettings
        });
    }

    // Add download to history
    addToHistory(download) {
        const history = this.getSettings().downloadHistory;
        history.unshift({
            ...download,
            date: new Date().toISOString()
        });

        // Keep only last 50 downloads
        if (history.length > 50) {
            history.pop();
        }

        this.updateSettings({ downloadHistory: history });
    }

    // Clear download history
    clearHistory() {
        this.updateSettings({ downloadHistory: [] });
    }

    // Get default download path
    getDefaultPath() {
        return this.getSettings().lastPath;
    }

    // Set default download path
    setDefaultPath(path) {
        this.updateSettings({ lastPath: path });
    }

    // Reset settings to default
    resetToDefault() {
        this.store.clear();
        this.store.set('settings', {
            saveLocation: false,
            autoQuality: false,
            lastPath: path.join(os.homedir(), 'Downloads'),
            defaultFormat: 'video',
            downloadHistory: []
        });
    }
}

export default new Settings();