const qrcode = require('qrcode-terminal');

const { Client } = require('whatsapp-web.js');
const client = new Client();

var express = require('express');
var app = express();

app.get('/', function (req, res) {
    var sql = require("mssql");

    // config for your database
    var config = {
        user: 'UsrExtraccion',
        password: 'Fw98ty72',
        server: '10.5.20.67', 
        database: 'RyD' 
    };

    // connect to your database
    sql.connect(config, function (err) {
        if (err) console.log(err);
        // create Request object
        var request = new sql.Request();
        // query to the database and get the records
        request.query('select * from Arboles', function (err, recordset) {
            if (err) console.log(err)
            // send records as a response
            res.send(recordset);
            
        });
    });
});

var server = app.listen(5000, function () {
    console.log('Server is running..');
});


client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Client is ready!');
    // Number where you want to send the message.
    const number = "+5491140585005";

    // Your message.
    const text = "Hola Julian";

    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = number.substring(1) + "@c.us";

    // Sending message.
    client.sendMessage(chatId, text);
});

client.on('message', message => {
    console.log(message.from); //5491140585005@c.us
    console.log(message.timestamp); //1621260040
    console.log(message.body); // mensaje
    console.log(message.author); // undefined
});

client.initialize();