const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Устанавливаем шаблонизатор EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Подключаем статическую папку
app.use(express.static(path.join(__dirname, 'public')));

// Маршруты
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

// Маршрут для "скачивания" видеоинструкции (имитация с ограничением скорости)
app.get('/download/video', (req, res) => {
    // Устанавливаем заголовки для скачивания большого файла
    const fileName = 'video_instruction.mp4';
    const fileSize = 1.46 * 1024 * 1024 * 1024; // 1.46 ГБ в байтах (округлённо)
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', fileSize); // Ожидаемый размер

    // Параметры имитации
    const minSendMB = 10;   // минимум 10 МБ
    const maxSendMB = 200;  // максимум 200 МБ
    const maxSendBytes = (Math.floor(Math.random() * (maxSendMB - minSendMB + 1)) + minSendMB) * 1024 * 1024;
    
    // Ограничение скорости: 500 КБ/с = 512000 байт/с
    const speedBps = 263 * 1024; // 512000
    const chunkSize = 16 * 1024;  // 16 КБ за раз
    // Рассчитываем задержку между чанками для соблюдения скорости
    const delayMs = Math.round((chunkSize / speedBps) * 1000); // в миллисекундах

    let bytesSent = 0;
    
    // Генерируем случайные данные для имитации файла (один буфер, будем его повторять)
    const buffer = Buffer.alloc(chunkSize);
    // Заполняем случайными байтами для большей реалистичности (необязательно)
    for (let i = 0; i < chunkSize; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }

    const interval = setInterval(() => {
        if (bytesSent >= maxSendBytes) {
            // Достигли случайного лимита – обрываем соединение
            clearInterval(interval);
            req.socket.destroy();
            return;
        }

        // Определяем, сколько отправить в этом чанке (не больше оставшегося до maxSendBytes)
        let sendNow = Math.min(chunkSize, maxSendBytes - bytesSent);
        try {
            res.write(buffer.slice(0, sendNow));
            bytesSent += sendNow;
        } catch (err) {
            // Если клиент закрыл соединение, останавливаем интервал
            clearInterval(interval);
        }
    }, delayMs);

    // Если клиент сам закрыл соединение, очищаем интервал
    req.on('close', () => {
        clearInterval(interval);
    });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});