const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { downloadMedia } = require('mediasnap');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

async function downloadVideo(url, removeAudio = false) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`📥 Downloading from: ${url}`);
            const result = await downloadMedia(url);
            if (!result.success || !result.media || result.media.length === 0) {
                return reject(new Error('No media found at this URL'));
            }
            const videoItem = result.media.find(m => m.type === 'video' || m.type === 'photo');
            if (!videoItem) {
                return reject(new Error('No video found in this content'));
            }
            let videoUrl = videoItem.url;
            if (!videoUrl || videoUrl === '') {
                const fallback = result.media.find(m => m.url && m.url.startsWith('http'));
                if (fallback) videoUrl = fallback.url;
                else return reject(new Error('Could not extract video URL'));
            }
            console.log(`✅ Video URL extracted: ${videoUrl}`);

            if (removeAudio) {
                const videoId = uuidv4();
                const inputPath = path.join(TEMP_DIR, `${videoId}_input.mp4`);
                const outputPath = path.join(TEMP_DIR, `${videoId}.mp4`);
                const response = await fetch(videoUrl);
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(inputPath, Buffer.from(buffer));
                await new Promise((resolveFfmpeg, rejectFfmpeg) => {
                    ffmpeg(inputPath)
                        .noAudio()
                        .outputOptions(['-c:v copy'])
                        .on('end', () => {
                            fs.unlinkSync(inputPath);
                            resolveFfmpeg(outputPath);
                        })
                        .on('error', (err) => rejectFfmpeg(err))
                        .save(outputPath);
                });
                resolve(outputPath);
            } else {
                const videoId = uuidv4();
                const outputPath = path.join(TEMP_DIR, `${videoId}.mp4`);
                const response = await fetch(videoUrl);
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(outputPath, Buffer.from(buffer));
                resolve(outputPath);
            }
        } catch (error) {
            console.error('Download error:', error);
            reject(error);
        }
    });
}

app.post('/api/download', async (req, res) => {
    const { url, mute } = req.body;
    if (!url || !url.startsWith('http')) {
        return res.status(400).json({ error: 'Please enter a valid URL' });
    }
    try {
        const filePath = await downloadVideo(url, mute === true);
        const fileName = path.basename(filePath);
        res.json({ 
            success: true,
            downloadUrl: `/download/${fileName}`,
            message: 'Video processed successfully'
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ 
            error: 'Download failed. Platform may not be supported or URL is invalid.',
            details: err.message 
        });
    }
});

app.get('/download/:filename', (req, res) => {
    const filePath = path.join(TEMP_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found or expired.');
    }
});

setInterval(() => {
    const now = Date.now();
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Red Hole Universal Server running on port ${PORT}`);
    console.log(`📱 Supports: YouTube, Facebook, Instagram, TikTok, Twitter, Pinterest, LinkedIn, Reddit, Snapchat, and 100+ more!`);
});
