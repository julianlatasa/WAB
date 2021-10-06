const qrcode = require('qrcode-terminal');

const { Client } = require('whatsapp-web.js');

var express = require('express');
const fs = require('fs');

// Path where the session data will be stored
const SESSION_FILE_PATH = './session.json';

// Load the session data if it has been previously saved
let sessionData;
if(fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

// Use the saved values
const client = new Client({
    session: sessionData
});

run().catch(err => console.log(err));

async function run() {
    const app = express();

    app.get('/events', async function(req, res) {
        console.log('Got /events');
        res.set({
            'Cache-Control': 'no-cache',
            'Content-Type': 'text/event-stream',
            'Connection': 'keep-alive'
        });
        res.flushHeaders();

        // Tell the client to retry every 10 seconds if connectivity is lost
        res.write('retry: 10000\n\n');

//        while (true) {
//            await new Promise(resolve => setTimeout(resolve, 1000));

            // validar que client este inicializado
            client.on('message', message => {
                console.log(message.from); //5491140585005@c.us
                console.log(message.timestamp); //1621260040
                console.log(message.body); // mensaje
                console.log(message.author); // undefined
                console.log('Mensaje In');
                res.write(`data: ${message.body}\n\n`);
            });
//        }
    });

    const index = fs.readFileSync('./index.html', 'utf8');
    app.get('/', (req, res) => res.send(index));

    await app.listen(3000);
    console.log('Listening on port 3000');
}

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Client is ready!');
});

// Save session values to the file upon successful auth
client.on('authenticated', (session) => {
    sessionData = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
        if (err) {
            console.error(err);
        }
    });
    console.log('autenticado!');
});

client.initialize();

