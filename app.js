const express = require('express');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';

const maxDownloadsPerIp = 3;
const maxDownloadsTotal = 100;
const maxDownloadDurationMs = 3 * 60 * 1000;
const speedBps = 263 * 1024;
const chunkSize = 16 * 1024;
const delayMs = Math.round((chunkSize / speedBps) * 1000);
const downloadChunk = crypto.randomBytes(chunkSize);
const activeDownloads = new Map();
let activeDownloadsTotal = 0;

app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            imgSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/css', express.static(path.join(__dirname, 'css'), {
    fallthrough: false,
    maxAge: '1d'
}));

app.use('/vendor/bootstrap', express.static(
    path.join(__dirname, 'node_modules', 'bootstrap', 'dist'),
    {
        fallthrough: false,
        immutable: true,
        maxAge: '30d'
    }
));

app.get('/', (req, res) => {
    res.render('index', { title: 'Главная' });
});

app.get('/consent', (req, res) => {
    res.render('consent', { title: 'Образцы согласий' });
});

app.get('/policy', (req, res) => {
    res.render('policy', { title: 'Политика конфиденциальности' });
});

app.get('/cookies', (req, res) => {
    res.render('cookies', { title: 'Как правильно хранить куки' });
});

// Браузер ожидает большой MP4, но соединение намеренно обрывается
// после случайного объёма или по тайм-ауту.
app.get('/download/video', (req, res) => {
    const clientIp = req.ip;
    const activeForIp = activeDownloads.get(clientIp) || 0;

    if (activeForIp >= maxDownloadsPerIp) {
        res.setHeader('Retry-After', '60');
        res.status(429).send('Слишком много одновременных скачиваний');
        return;
    }

    if (activeDownloadsTotal >= maxDownloadsTotal) {
        res.setHeader('Retry-After', '60');
        res.status(503).send('Сервер занят, попробуйте позже');
        return;
    }

    activeDownloads.set(clientIp, activeForIp + 1);
    activeDownloadsTotal += 1;

    const advertisedFileSize = Math.floor(1.46 * 1024 * 1024 * 1024);
    const minSendMB = 10;
    const maxSendMB = 200;
    const maxSendBytes = (
        Math.floor(Math.random() * (maxSendMB - minSendMB + 1)) + minSendMB
    ) * 1024 * 1024;

    res.setHeader('Content-Disposition', 'attachment; filename="video_instruction.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', advertisedFileSize);
    res.setHeader('Cache-Control', 'no-store');

    let bytesSent = 0;
    let nextChunkTimer;
    let lifetimeTimer;
    let isActive = true;

    const releaseSlot = () => {
        if (!isActive) {
            return;
        }

        isActive = false;
        clearTimeout(nextChunkTimer);
        clearTimeout(lifetimeTimer);

        const currentCount = activeDownloads.get(clientIp) || 1;
        if (currentCount <= 1) {
            activeDownloads.delete(clientIp);
        } else {
            activeDownloads.set(clientIp, currentCount - 1);
        }
        activeDownloadsTotal -= 1;
    };

    const abortDownload = () => {
        releaseSlot();
        if (!res.destroyed) {
            res.destroy();
        }
    };

    const scheduleNextChunk = () => {
        if (isActive) {
            nextChunkTimer = setTimeout(sendChunk, delayMs);
        }
    };

    const sendChunk = () => {
        if (!isActive || res.destroyed) {
            releaseSlot();
            return;
        }

        if (bytesSent >= maxSendBytes) {
            abortDownload();
            return;
        }

        const sendNow = Math.min(chunkSize, maxSendBytes - bytesSent);
        const canContinue = res.write(downloadChunk.subarray(0, sendNow));
        bytesSent += sendNow;

        if (canContinue) {
            scheduleNextChunk();
        } else {
            // Не накапливаем данные в памяти, если клиент читает медленно.
            res.once('drain', scheduleNextChunk);
        }
    };

    lifetimeTimer = setTimeout(abortDownload, maxDownloadDurationMs);
    res.once('close', releaseSlot);
    scheduleNextChunk();
});

if (require.main === module) {
    app.listen(port, host, () => {
        console.log(`Сервер запущен на http://${host}:${port}`);
    });
}

module.exports = app;
