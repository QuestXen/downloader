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
        
        // Verbesserte Format-Filterung für alle Qualitäten
        const videoFormats = formats
            .filter(format => {
                // Akzeptiere alle Video-Formate, auch ohne Audio
                return format.hasVideo && format.qualityLabel;
            })
            .sort((a, b) => {
                // Sortiere nach Höhe (Qualität)
                return (b.height || 0) - (a.height || 0);
            });

        // Entferne Duplikate basierend auf der Qualität
        const uniqueFormats = videoFormats.filter((format, index, self) =>
            index === self.findIndex(f => f.qualityLabel === format.qualityLabel)
        );

        return {
            title: videoDetails.title,
            duration: parseInt(videoDetails.lengthSeconds),
            thumbnail: videoDetails.thumbnails[0].url,
            formats: uniqueFormats.map(format => ({
                itag: format.itag,
                qualityLabel: format.qualityLabel,
                container: format.container,
                hasVideo: format.hasVideo,
                hasAudio: format.hasAudio,
                height: format.height || 0,
                fps: format.fps || 0,
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

async function downloadVideoFile(url, outputFile, emitter, quality) {
    // Hole Video-Informationen
    const info = await ytdl.getInfo(url);
    const videoFormat = info.formats.find(f => f.itag === parseInt(quality));
    
    if (!videoFormat) {
        throw new Error('Selected quality not found');
    }

    // Wenn das Format kein Audio hat, müssen wir es separat herunterladen
    if (!videoFormat.hasAudio && videoFormat.hasVideo) {
        // Finde das beste Audio-Format
        const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
        
        // Temporäre Dateien für Video und Audio
        const tempVideoFile = outputFile + '.video.tmp';
        const tempAudioFile = outputFile + '.audio.tmp';
        
        // Download Video
        const video = ytdl(url, {
            quality: quality,
            filter: format => format.itag === parseInt(quality),
            agent
        });
        
        // Download Audio
        const audio = ytdl(url, {
            quality: audioFormat.itag,
            filter: format => format.itag === audioFormat.itag,
            agent
        });

        // Speichere Video und Audio
        const videoWrite = createWriteStream(tempVideoFile);
        const audioWrite = createWriteStream(tempAudioFile);
        
        video.pipe(videoWrite);
        audio.pipe(audioWrite);

        // Warte auf beide Downloads
        await Promise.all([
            new Promise((resolve, reject) => {
                videoWrite.on('finish', resolve);
                videoWrite.on('error', reject);
            }),
            new Promise((resolve, reject) => {
                audioWrite.on('finish', resolve);
                audioWrite.on('error', reject);
            })
        ]);

        // Kombiniere Video und Audio mit FFmpeg
        const ffmpegProcess = spawn(ffmpeg, [
            '-i', tempVideoFile,
            '-i', tempAudioFile,
            '-c:v', 'copy',
            '-c:a', 'aac',
            outputFile
        ]);

        await new Promise((resolve, reject) => {
            ffmpegProcess.on('close', resolve);
            ffmpegProcess.on('error', reject);
        });

        // Lösche temporäre Dateien
        unlink(tempVideoFile, () => {});
        unlink(tempAudioFile, () => {});
        
        emitter.emit('complete', outputFile);
    } else {
        // Normaler Download für Formate mit Audio
        const video = ytdl(url, {
            quality: quality,
            agent
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