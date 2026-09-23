const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const app = require('../app');

let server;
let port;

const request = (pathname, headers = {}) => new Promise((resolve, reject) => {
    const req = http.get({
        host: '127.0.0.1',
        port,
        path: pathname,
        headers
    }, (res) => {
        resolve(res);
    });
    req.on('error', reject);
});

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
});

test('страницы и локальные статические файлы доступны', async () => {
    for (const pathname of [
        '/',
        '/css/style.css',
        '/vendor/bootstrap/css/bootstrap.min.css',
        '/vendor/bootstrap/js/bootstrap.bundle.min.js'
    ]) {
        const res = await request(pathname);
        assert.equal(res.statusCode, 200, pathname);
        res.destroy();
    }
});

test('защитные заголовки включены', async () => {
    const res = await request('/');

    assert.equal(res.headers['x-powered-by'], undefined);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    res.destroy();
});

test('четвёртая параллельная загрузка с одного IP блокируется', async () => {
    const responses = await Promise.all([
        request('/download/video'),
        request('/download/video'),
        request('/download/video'),
        request('/download/video')
    ]);

    const statuses = responses.map((res) => res.statusCode).sort();
    assert.deepEqual(statuses, [200, 200, 200, 429]);
    responses.forEach((res) => res.destroy());
});

test('лимит различает IP клиентов за локальным reverse proxy', async () => {
    const responses = await Promise.all([
        request('/download/video', { 'X-Forwarded-For': '192.0.2.1' }),
        request('/download/video', { 'X-Forwarded-For': '192.0.2.2' }),
        request('/download/video', { 'X-Forwarded-For': '192.0.2.3' }),
        request('/download/video', { 'X-Forwarded-For': '192.0.2.4' })
    ]);

    assert.deepEqual(responses.map((res) => res.statusCode), [200, 200, 200, 200]);
    responses.forEach((res) => res.destroy());
});
