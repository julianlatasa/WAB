const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const express = require('express');
const dateFormat = require('dateformat');
const fs = require('fs');
const sql = require("mssql");
const util = require('util');
const mysql = require('mysql');
 
// Path where the session data will be stored
const SESSION_FILE_PATH = './session.json';

// Load the session data if it has been previously saved
let sessionData;
if(fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

// Define SQL Query
var sqlQuery = 'SELECT IncidenteLlamado.PunIncidente, \
IncidenteLlamado.Telefono, \
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

// Use the saved values
const client = new Client({
    session: sessionData,
    puppeteer: {args: [ '--ignore-certificate-errors' ]}
});

const app = express();

app.get('/sendmessage', function(req, res) {
    const phone = req.query.phone;
    // Number where you want to send the message.
    const number = "+549" + phone;

    // Your message.
    const text = req.query.message;
    const punincidente = req.query.punincidente;

    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = number.substring(1) + "@c.us";

    // Verificar que client sea ready
    var estadoReady = true;

    client.getState().then(function(state){ 
        if (state === 'CONFLICT') {
            estadoReady = false;
            client.initialize();
        }
        if (state === 'CONNECTED') {
            estadoReady = true;
        }
    }).catch(error => {
        client.initialize();
        estadoReady = false;
        console.log('Error en estado');
    });

    setInterval(function(){
        client.getState().then(function(state){ 
            if (state === 'CONNECTED') {
                estadoReady = true;
            }
        });
    },2000);

    if (estadoReady) {
        client.isRegisteredUser(chatId).then(function(resmsg){  // true o false
            if (resmsg == false) {
                actualizarEstadoMensaje('NumeroInvalido', '', '', punincidente);
                res.send("Numero invalido");
            }
            else {
                // Sending message.
                client.sendMessage(chatId, text).then(function(resmsg){ 
                    actualizarEstadoMensaje('Enviado', text, chatId, punincidente);
                    res.send("Mensaje enviado: " + text); 
                    //res.send(JSON.stringify(resmsg, null, 4));
                });
            }
        });
    } else {
        actualizarEstadoMensaje('ErrorEnvio', '', '', punincidente);
        res.send("No fue posible enviar el mensaje");
    }
});

function actualizarEstadoMensaje(resultado, mensaje, idchat, punincidente) {
    var InstanteActual = new Date(); 
    connection.query('UPDATE incidentes SET InstanteMensaje = ?, ResultadoEnvio = ?, Mensaje = ?, IdChat = ? WHERE PunIncidente = ?;', 
    [InstanteActual,
    resultado,
    mensaje,
    idchat,
    punincidente], 
    function (error, results, fields) {
        if (error) 
            console.log(error);
    });
}

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


var connection = mysql.createConnection({
    host     : '10.58.28.170',
    user     : 'jlatasa',
    password : 'Nico2001',
    database : 'whatsapp'
});

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
    //var message = util.format('Hola, nos comunicamos de PAMI. Usted hizo un pedido de ambulancia el %s para %s. ¿el servicio ya fue realizado?, por favor responda por Sí o No. Desde ya muchas gracias.`;',fecha, nombre);
    var message = `Hola, nos comunicamos de PAMI. Usted hizo un pedido de ambulancia el ${fecha} para ${nombre}. ¿el servicio ya fue realizado?, por favor responda por Sí o No. Desde ya muchas gracias.`;
    return message;
}

function linkMessage(fecha, nombre, telefono, punincidente) {
    mensaje = qualityMessage(fecha,nombre);
    //link = `<a target="sendwa" href="https://web.whatsapp.com/send?phone=+549${telefono}&text=${mensaje}&source&data&app_absent" onclick="document.getElementById(\'prueba${rowNum}\').innerHTML=\'Clickeado\';">${telefono}</a>`;
    url = `http://10.58.28.170:3000/sendmessage?phone=${telefono}&message=${mensaje}&punincidente=${punincidente}`;
    link = `<a href="#" onclick="updateEstadoEnviado('${url}',${punincidente});event.preventDefault();">Enviar Mensaje</a>`;
    return link;
}

function linkMessageManual(fecha, nombre, telefono, punincidente) {
    mensaje = qualityMessage(fecha,nombre);
    url = `http://10.58.28.170:3000/manualsend?phone=${telefono}&message=${mensaje}&punincidente=${punincidente}`;
    link = `<a href="#" onclick="if (document.getElementById('1782525').childNodes[0].innerHTML === 'Enviar Mensaje') {document.getElementById(\'${punincidente}\').innerHTML=\'Enviado manual\'; window.open('${url}','waweb'); event.preventDefault();}">${telefono}</a>`;
    return link;
}

app.get('/manualsend', function(req, res) {
    const phone = req.query.phone;
    // Number where you want to send the message.
    const number = "+549" + phone;
    // Your message.
    const text = req.query.message;
    const punincidente = req.query.punincidente;
    // Getting chatId from the number.
    // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
    const chatId = number.substring(1) + "@c.us";
    actualizarEstadoMensaje('Enviado', text, chatId, punincidente);
    res.redirect('https://web.whatsapp.com/send?phone=+549${phone}&text=${text}&source&data&app_absent');
});

/* Funcion a deprecar*/
/*function linkUpdate(mensaje, url) {
    link = `<a href="#" onclick="updateEstadoEnviado(${mensaje},${url});">Enviar Mensaje</a>`;
    return link;
}
*/
app.get('/calls', function(req, res) {
    console.log('/calls Listo');
    res.write('<html><head>');
    res.write('<script>');
    res.write('function updateEstadoEnviado(theUrl, id) {\
                var xmlHttp = new XMLHttpRequest(); \
                xmlHttp.open( "GET", theUrl); \
		        xmlHttp.onreadystatechange = function (aEvt) { \
  			        if (xmlHttp.readyState == 4) { \
     				        if(xmlHttp.status == 200) \
      					        document.getElementById(id).innerHTML = xmlHttp.responseText; \
     				        else \
      					        document.getElementById(id).innerHTML = "Error cargando"; \
  				} \
		        }; \
                xmlHttp.send();\
                }'); 
    res.write('const source = new EventSource(\'/estado\'); \
      source.addEventListener(\'message\', message => { \
          document.getElementById(\'estado\').innerHTML = event.data; \
      });');
/*    res.write('function updateEstadoEnviado(url,id) {\
                document.getElementById(id).innerHTML=httpGet(url); \
                }'); */
    res.write('</script>');
    res.write('</head>');
    res.write('<body>');
    res.write('Estado: <div id=\'estado\'></div>');
    res.write('<button onclick="window.open(\'/connect\'); event.preventDefault();">Conectar</button>')
    res.write('<table border=1>');
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
                        res.write('<td>' + record.NomPaciente + '</td>');
                        res.write('<td>' + dateFormat(record.InstanteLlamado, "UTC:yyyy-mm-dd HH:MM:ss") + '</td>');
                        res.write('<td>' + linkMessageManual( dateFormat(record.InstanteLlamado, "fechaAfiliado"), record.NomPaciente,formatPhoneNumber(record.Telefono),record.PunIncidente) + '</td>');
                        //res.write('<td>' + formatPhoneNumber(record.Telefono) + '</td>'); 
                        res.write('<td>' + dateFormat(record.InstanteCierre, "UTC:yyyy-mm-dd HH:MM:ss") + '</td>');
                        res.write('<td>' + record.TipoCierre + '</td>');
                        res.write('<td id="' + record.PunIncidente + '">' + linkMessage( dateFormat(record.InstanteLlamado, "fechaAfiliado"), record.NomPaciente,formatPhoneNumber(record.Telefono),record.PunIncidente) + '</td>');
                        res.write('</tr>');
                        rowNum = rowNum + 1;
                        // Agrego incidente a Base de datos
                        connection.query('INSERT INTO incidentes \
                            (PunIncidente, \
                            NumIncidente, \
                            Clasificacion, \
                            NomPaciente, \
                            InstanteLlamado, \
                            InstanteCerrado, \
                            TipoCierre) \
                            VALUES \
                            (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE PunIncidente=PunIncidente;', 
                            [record.PunIncidente, 
                            record.NumIncidente, 
                            record.CodClasifIncidente, 
                            record.NomPaciente, 
                            dateFormat(record.InstanteLlamado, "UTC:yyyy-mm-dd HH:MM:ss"), 
                            dateFormat(record.InstanteCierre, "UTC:yyyy-mm-dd HH:MM:ss"), 
                            record.TipoCierre], 
                            function (error, results, fields) {
                                if (error) 
                                    console.log(error);
                        });
                    });
                }
                currentBegin = currentFinish;
                currentFinish = new Date(currentBegin);
                currentFinish.setSeconds(currentFinish.getSeconds() + 15);
            });
        }, 15000);

    });

});

/*
<table>
  <tbody id="tbody">
    <tr>
      <td>row 1</td>
    </tr>
  </tbody>
</table>
and append to the tbody, being sure to create a row (tr) as well as a td since your apparent goal is to add a row:

var td = document.createElement("td");
td.innerHTML = "add row";
var tr = document.createElement("tr");
tr.appendChild(td);
document.getElementById("tbody").appendChild(tr);
*/

function formatPhoneNumber(phoneNumber, numIncidente) {
    if (!phoneNumber)
        phone = "000000000";
    phone = phoneNumber.trim();
    if (!isNaN(phone)) {
        if (phone.length == 8){
            phone = '11' + phone;
        }
        else if (phone.substr(0,2) === '15'){
            phone = '11' + phone.substr(2,phone.length);
        }
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

app.get('/connect', function(req, res) {
    client.initialize();
});

app.get('/estado', function(req, res) {
    res.set({
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();
    client.getState().then(function(resmsg){ 
        res.send('data: ' + resmsg + '\n\n');
        //console.log(resmsg);
    }).catch(error => {
        res.send('data: DISCONNECT\n\n');
        console.log('Error en estado');
    });

    client.on('change_state', (state) => {
        res.write('data: ' + state + '\n\n');
    });
    //res.end();
});
