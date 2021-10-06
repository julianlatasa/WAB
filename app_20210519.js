const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const express = require('express');
const dateFormat = require('dateformat');
const fs = require('fs');
const sql = require("mssql");
 

// Path where the session data will be stored
const SESSION_FILE_PATH = './session.json';

// Load the session data if it has been previously saved
let sessionData;
if(fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

// Define SQL Query
let sqlQuery = 'SELECT IncidenteLlamado.Telefono, \
Llamados.Instante InstanteLlamado, \
IncidentePaciente.NomPaciente, \
ClasifsIncidente.CodClasifIncidente, \
ISNULL(IncidentesCerrados.Instante, IncidentesCancelados.Instante) InstanteCierre, \
CASE WHEN IncidentesCerrados.Instante IS NOT NULL THEN \'Cerrado\' ELSE \'Cancelado\' END TipoCierre, \
Incidentes.NumIncidente	\
FROM IncidenteLlamado \
INNER JOIN Llamados \
ON IncidenteLlamado.PunLlamado = Llamados.PunLlamado AND Llamados.PunTipoLlamado = 1 \
INNER JOIN Incidentes \
ON Incidentes.PunIncidente = IncidenteLlamado.PunIncidente \
INNER JOIN IncidClasifIncidClaseRecurso \
ON IncidClasifIncidClaseRecurso.PunIncidente = IncidenteLlamado.PunIncidente \
INNER JOIN ClasifsIncidente \
ON ClasifsIncidente.PunClasifIncidente = IncidClasifIncidClaseRecurso.PunClasifIncidente \
INNER JOIN IncidentePaciente \
ON IncidentePaciente.PunIncidente = IncidenteLlamado.PunIncidente \
LEFT JOIN IncidentesCerrados \
ON IncidentesCerrados.PunIncidente = IncidenteLlamado.PunIncidente \
LEFT JOIN IncidentesCancelados \
ON IncidentesCancelados.PunIncidente = IncidenteLlamado.PunIncidente \
LEFT JOIN  \
    (SELECT Asignaciones.PunIncidente, Asignaciones.PunAsignacion FROM Asignaciones INNER JOIN AsignacionUltima ON Asignaciones.PunAsignacion = AsignacionUltima.PunAsignacion) Asignacion \
    ON Asignacion.PunIncidente = IncidenteLlamado.PunIncidente \
LEFT JOIN AsignacionEstado IncidenteAsignado \
    ON IncidenteAsignado.PunAsignacion = Asignacion.PunAsignacion AND IncidenteAsignado.PunEstado = 100 \
LEFT JOIN AsignacionEstado IncidenteDesAsignado \
    ON IncidenteDesAsignado.PunAsignacion = Asignacion.PunAsignacion AND IncidenteDesAsignado.PunEstado = 1000 \
LEFT JOIN IncidentesDuplicados \
    ON IncidentesDuplicados.PunIncidenteOriginal = IncidenteLlamado.PunIncidente \
WHERE IncidentesCerrados.Instante BETWEEN CAST(@desdeDateTime AS DATETIME) AND CAST(@hastaDateTime AS DATETIME)  \
AND Llamados.PunTipoLlamado = 1 \
AND IncidentesDuplicados.PunIncidenteDuplicado IS NULL \
AND ( ClasifsIncidente.CodClasifIncidente LIKE \'%Rojo%\'  \
				OR ClasifsIncidente.CodClasifIncidente LIKE \'%Amarillo%\' \
				OR ClasifsIncidente.CodClasifIncidente LIKE \'%Verde%\')  \
	ORDER BY IncidentesCerrados.Instante';
//WHERE IncidentesCerrados.Instante BETWEEM CAST(\'2021-05-18 13:10:00\' AS DATETIME) \

// Use the saved values
const client = new Client({
    session: sessionData,
    puppeteer: {args: [ '--ignore-certificate-errors' ]}
});

const app = express();

app.get('/isvalid', function(req, res) {
    let phone = req.query.phone;
    // Verificar que client sea ready

    // Number where you want to send the message.
    const number = "+549" + phone;

    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = number.substring(1) + "@c.us";

    client.isRegisteredUser(chatId).then(function(resmsg){  // true o false
        res.send(JSON.stringify(resmsg, null, 4));
    });
});


app.get('/sendmessage', function(req, res) {
    let phone = req.query.phone;
    // Verificar que client sea ready

    // Number where you want to send the message.
    const number = "+549" + phone;

    // Your message.
    const text = req.query.message;

    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = number.substring(1) + "@c.us";

    // Sending message.
    client.sendMessage(chatId, text).then(function(resmsg){ 
        res.send(resmsg.from); 
        //res.send(JSON.stringify(resmsg, null, 4));
    });
});

app.get('/events', function(req, res) {
    console.log('/events Listo');
    res.set({
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();

    // Tell the client to retry every 10 seconds if connectivity is lost
    res.write('retry: 10000\n\n');

    // validar que client este inicializado
    // si el mensaje ya fue enviado, no enviar de nuevo, agragar flag
    client.on('message', message => {
        console.log(message.from); //5491140585005@c.us
        console.log(message.timestamp); //1621260040
        console.log(message.body); // mensaje
        console.log(message.author); // undefined
        res.write(`data: ${message.body}\n\n`);
    });
});

// config for your database
var config = {
    user: 'UsrExtraccion',
    password: 'Fw98ty72',
    server: '10.5.20.67', 
    database: 'RyD',
    options: {
        trustedConnection: true,
        trustServerCertificate: true
    }
};

dateFormat.masks.fechaAfiliado = 'UTC:dddd dd "de" mmmm "del" yyyy';
dateFormat.i18n = {
    dayNames: [
      "Dom",
      "Lun",
      "Mar",
      "Mie",
      "Jue",
      "Vie",
      "Sab",
      "Domingo",
      "Lunes",
      "Martes",
      "Miercoles",
      "Jueves",
      "Viernes",
      "Sabado",
    ],
    monthNames: [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ]
};

function qualityMessage(fecha, nombre) {
    message = `Hola, nos comunicamos de PAMI. Usted hizo un pedido de ambulancia el ${fecha} para ${nombre}. ¿el servicio ya fue realizado?, por favor responda por Sí o No. Desde ya muchas gracias.`;
    return message;
}

function linkMessage(fecha, nombre, telefono, rowNum) {
    mensaje = qualityMessage(fecha,nombre);
    link = `<a target="sendwa" href="https://web.whatsapp.com/send?phone=+549${telefono}&text=${mensaje}&source&data&app_absent" onclick="document.getElementById(\'prueba${rowNum}\').innerHTML=\'Clickeado\';">${telefono}</a>`;
    return link;
}

function linkUpdate(nombre, rowNum) {
    link = `<a href="#" onclick="document.getElementById(\'prueba${rowNum}\').innerHTML=\'No enviado\';">${nombre}</a>`;
    return link;
}

app.get('/calls', function(req, res) {
    console.log('/calls Listo');
    res.write('<body><table border=1>');
    res.write('<tr>');
    res.write('<th>Incidente</th>');
    res.write('<th>Clasificacion</th>');
    res.write('<th>Nombre</th>');
    res.write('<th>Hora Llamado</th>');
    res.write('<th>Telefono</th>');
    res.write('<th>Hora Cierre</th>');
    res.write('<th>Tipo Cierre</th>');
    res.write('<th>Respuesta</th>');
    res.write('</tr>');
    
    var currentBegin = new Date();
    currentBegin.setSeconds(currentBegin.getSeconds());
    var currentFinish = new Date(currentBegin);
    currentBegin.setSeconds(currentBegin.getSeconds() - 15);
    var rowNum = 1;

    // connect to your database
    sql.connect(config, function (err) {
        if (err) console.log(err);

        setInterval(function(){
            // create Request object
            var request = new sql.Request();
            request.input('desdeDateTime', sql.VarChar, dateFormat(currentBegin,"yyyy-mm-dd HH:MM:ss") );
            request.input('hastaDateTime', sql.VarChar, dateFormat(currentFinish,"yyyy-mm-dd HH:MM:ss"));

            // query to the database and get the records
            request.query(sqlQuery, function (err, recordset) {
                if (err) console.log(err)
//                console.log(JSON.stringify(recordset, null, 4));

                // send records as a response
                if (recordset.rowsAffected > 0) {
                    recordset.recordsets[0].forEach(record => {
                        res.write('<tr>');
                        res.write('<td>' + record.NumIncidente + '</td>');
                        res.write('<td>' + record.CodClasifIncidente + '</td>');
                        res.write('<td>' + linkUpdate(record.NomPaciente, rowNum) + '</td>');
                        res.write('<td>' + dateFormat(record.InstanteLlamado, "UTC:yyyy-mm-dd HH:MM:ss") + '</td>');
                        res.write('<td>' + linkMessage( dateFormat(record.InstanteLlamado, "fechaAfiliado"), record.NomPaciente,formatPhoneNumber(record.Telefono), rowNum) + '</td>');
                        res.write('<td>' + dateFormat(record.InstanteCierre, "UTC:yyyy-mm-dd HH:MM:ss") + '</td>');
                        res.write('<td>' + record.TipoCierre + '</td>');
                        res.write('<td id="prueba' + rowNum + '"></td>');
                        res.write('</tr>');
                        rowNum = rowNum + 1;
                    });
                }
                currentBegin = currentFinish;
                currentFinish = new Date(currentBegin);
                currentFinish.setSeconds(currentFinish.getSeconds() + 15);
            });
        }, 15000);

    });

});


function formatPhoneNumber(phoneNumber) {
    phone = phoneNumber.trim();
    if (phone.length == 8){
        phone = '11' + phone;
    }
    else if (phone.substr(0,2) === '15'){
        phone = '11' + phone.substr(2,phone.length);
    }
    return phone;
}

app.get('/', (req, res) => {
    const index = fs.readFileSync('./index.html', 'utf8');
    //res.send(index) // Pagina de inicio cargada
});

var server = app.listen(3000, function () {
    client.initialize();
    console.log('Servidor ejecutando..');
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('WhatsApp Listo!');
});

// Save session values to the file upon successful auth
client.on('authenticated', (session) => {
    sessionData = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
        if (err) {
            console.error(err);
        }
    });
    console.log('Autenticado');
});

