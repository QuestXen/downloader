import ytdl from '@distube/ytdl-core';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'child_process';
import path from 'path';
import { createWriteStream, unlink } from 'fs';
import { EventEmitter } from 'events';

// Create agent with cookies
const cookies = [
    { name: 'CONSENT', value: 'YES+1' }
];
const agent = ytdl.createAgent(cookies);

class DownloadEmitter extends EventEmitter {
    constructor() {
        super();
        this.cancelled = false;
    }

    cancel() {
        this.cancelled = true;
        this.emit('cancelled');
    }
}

async function getVideoInfo(url) {
    try {
        const info = await ytdl.getInfo(url, {
            agent,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }
        });
        
        const videoDetails = info.videoDetails;
        const formats = info.formats;
        
        // Verbesserte Format-Filterung
        const filteredFormats = formats
            .filter(format => {
                // Für Video-Formate
                if (format.hasVideo) {
                    return format.hasVideo && format.hasAudio; // Nur Formate mit Video UND Audio
                }
                // Für Audio-Formate
                return format.hasAudio && !format.hasVideo; // Nur Audio-Formate
            })
            .sort((a, b) => {
                // Sortiere nach Qualität (höchste zuerst)
                if (a.height && b.height) {
                    return b.height - a.height;
                }
                return 0;
            });

        return {
            title: videoDetails.title,
            duration: parseInt(videoDetails.lengthSeconds),
            thumbnail: videoDetails.thumbnails[0].url,
            formats: filteredFormats.map(format => ({
                itag: format.itag,
                qualityLabel: format.qualityLabel || format.audioQuality || 'Audio Only',
                container: format.container,
                hasVideo: format.hasVideo,
                hasAudio: format.hasAudio,
                height: format.height || 0,
                audioBitrate: format.audioBitrate || 0
            }))
        };
    } catch (error) {
        console.error('Video info error:', error);
        throw new Error('Failed to fetch video information');
    }
}

function downloadVideo(url, format, outputPath, quality) { // Fügen Sie quality-Parameter hinzu
    const emitter = new DownloadEmitter();

    (async () => {
        try {
            const info = await ytdl.getBasicInfo(url, { agent });
            const fileName = `${sanitizeFileName(info.videoDetails.title)}.${format === 'audio' ? 'mp3' : 'mp4'}`;
            const outputFile = path.join(outputPath, fileName);

            if (format === 'audio') {
                await downloadAudio(url, outputFile, emitter);
            } else {
                await downloadVideoFile(url, outputFile, emitter, quality);
            }
        } catch (error) {
            emitter.emit('error', { message: error.message });
        }
    })();

    return {
        on: (event, callback) => {
            emitter.on(event, (data) => {
                // Ensure progress data is serializable
                if (event === 'progress') {
                    callback({
                        percent: Number(data.percent.toFixed(2)),
                        downloaded: Number(data.downloaded),
                        total: Number(data.total),
                        speed: Number(data.speed)
                    });
                } else if (event === 'complete') {
                    callback({ outputPath: data });
                } else if (event === 'error') {
                    callback({ message: data.message });
                }
            });
        },
        cancel: () => emitter.cancel()
    };
}

function downloadVideoFile(url, outputFile, emitter, quality) {
    const video = ytdl(url, {
        quality: quality, // Just pass the itag directly
        filter: format => format.hasVideo && format.hasAudio,
        agent,
        requestOptions: {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }
    });

    let totalSize = 0;
    let downloadedSize = 0;
    let lastUpdate = Date.now();

    video.once('response', response => {
        totalSize = parseInt(response.headers['content-length']);
    });

    video.on('progress', (_, downloaded, total) => {
        if (emitter.cancelled) {
            video.destroy();
            unlink(outputFile, () => {});
            return;
        }

        downloadedSize = downloaded;
        const now = Date.now();
        const timeDiff = now - lastUpdate;

        if (timeDiff > 1000) { // Update progress every second
            const speed = (downloaded - downloadedSize) / (timeDiff / 1000);
            const percent = (downloaded / total) * 100;

            emitter.emit('progress', {
                percent: Number(percent.toFixed(2)),
                downloaded: Number(downloaded),
                total: Number(total),
                speed: Number(speed)
            });

            lastUpdate = now;
        }
    });

    const writeStream = createWriteStream(outputFile);
    video.pipe(writeStream);

    writeStream.on('finish', () => {
        if (!emitter.cancelled) {
            emitter.emit('complete', outputFile);
        }
    });

    writeStream.on('error', error => {
        emitter.emit('error', error);
    });
}

function downloadAudio(url, outputFile, emitter) {
    const tempFile = outputFile + '.temp';
    const audio = ytdl(url, {
        quality: 'highestaudio',
        agent,
        requestOptions: {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }
    });

    let totalSize = 0;
    let downloadedSize = 0;
    let lastUpdate = Date.now();

    const ffmpegProcess = spawn(ffmpeg, [
        '-i', 'pipe:0',
        '-codec:a', 'libmp3lame',
        '-q:a', '0',
        outputFile
    ]);

    audio.pipe(ffmpegProcess.stdin);

    audio.on('progress', (_, downloaded, total) => {
        if (emitter.cancelled) {
            audio.destroy();
            ffmpegProcess.kill();
            unlink(tempFile, () => {});
            unlink(outputFile, () => {});
            return;
        }

        const now = Date.now();
        const timeDiff = now - lastUpdate;

        if (timeDiff > 1000) {
            const speed = (downloaded - downloadedSize) / (timeDiff / 1000);
            const percent = (downloaded / total) * 100;

            emitter.emit('progress', {
                percent,
                downloaded,
                total,
                speed
            });

            lastUpdate = now;
            downloadedSize = downloaded;
        }
    });

    ffmpegProcess.on('close', () => {
        if (!emitter.cancelled) {
            emitter.emit('complete', outputFile);
        }
    });

    ffmpegProcess.on('error', error => {
        emitter.emit('error', error);
    });
}

function sanitizeFileName(fileName) {
    return fileName.replace(/[/\\?%*:|"<>]/g, '-');
}

export { getVideoInfo, downloadVideo };