require('dotenv').config();
var https = require('https');
var fs = require('fs');
var express = require('express');
var ParseServer = require('parse-server').ParseServer;
var Sentry = require("@sentry/node");


var app = express();
const { PORT, DATABASE_URL, APP_ID, MASTER_KEY, SERVER_URL, SENTRY_URL, HTTPS_PRIVATEKEY_PATH, HTTPS_FULLCHAIN_PATH, MASTER_KEY_IP, REST_KEY } = process.env;

if (!PORT || !DATABASE_URL || !APP_ID || !MASTER_KEY || !SERVER_URL) {
  console.log("Configuración incorrecta, verifique las variables de entorno");
  process.exit();
}
var api = new ParseServer({
  databaseURI: DATABASE_URL,
  cloud: './cloud/main.js',
  appId: APP_ID,
  masterKey: MASTER_KEY,
  restAPIKey: REST_KEY,
  serverURL: SERVER_URL,
  masterKeyIps: [MASTER_KEY_IP || '0.0.0.0/0']
});

const init = async () => {
  await api.start();
  app.use('/parse', api.app);
  app.listen(PORT, () => {
    console.log('Servidor iniciado para http');
  });
  initSentry()
  initHTTPS()
}

const initSentry = () => {
  if (SENTRY_URL) Sentry.init({ dsn: SENTRY_URL, tracesSampleRate: 1.0, });
}
const initHTTPS = () => {
  if (!HTTPS_PRIVATEKEY_PATH && !HTTPS_FULLCHAIN_PATH) {
    return
  }
  try {
    const httpsServer = https.createServer({
      key: fs.readFileSync(HTTPS_PRIVATEKEY_PATH),
      cert: fs.readFileSync(HTTPS_FULLCHAIN_PATH),
    }, app);

    httpsServer.listen(443, () => {
      console.log('Servidor iniciado para https');
    });
  } catch (e) {
    Sentry.captureException(e)
  }
}

init()