require('dotenv').config();
const setup = require('./setup');
const utils = require('./utils');
const calculate = require('qruta-calcular');
const nearRoutes = require('./nearRoutes');
const Sentry = require("@sentry/node");
const load = require('./load');
const redisCtrl = require('./redisController');
const schedule = require('node-schedule');
const os = require("os");
const { version } = require("../package.json");
const { NAME, SCHEDULE, SERVER_URL, CITIES } = process.env;


let data;
let config = {
  walkInterval: 500,
  maxMetersBTWpoints: 100,
  avgError: 0.3,
  proportion: 10,
  walkingDistance: 200
};
let status = {
  data: false,
  since: new Date().getTime()
};
let server;
loadData = async () => {
  console.log("Iniciando carga de datos");
  const time = new Date();
  const c = await Parse.Config.get();
  config = c.get('serverConfig');
  const citiesQuery = new Parse.Query("City")
  if (CITIES !== "*") citiesQuery.containedIn("objectId", CITIES.split(","))
  const cities = await citiesQuery.find();
  console.log("Ciudades", cities.length);
  const routesCount = await new Parse.Query("Route").equalTo('status', true).containedIn("city", cities).count();
  const routes = await new Parse.Query("Route").include('company', 'city').containedIn("city", cities).limit(routesCount).equalTo('status', true).exists('company').find();
  console.log("Rutas", routes.length);
  data = await load(cities, routes, config);
  status.data = true;
  status.time = new Date() - time;
  utils.analytics('server', 'loadData', 'time', status.time);
  console.log('Datos cargados');
}
isInstalled = async () => {
  try {
    let admin = await new Parse.Query(Parse.Role).equalTo("name", "admin").first();
    return admin !== undefined;
  } catch (e) {
    Sentry.captureException(e)
  }
  return false;
}
getServer = async () => {
  server = await new Parse.Query("Server").equalTo("name", NAME || "Default").first({ useMasterKey: true });
  if (!server) {
    server = new Parse.Object("Server");
    server.set("name", NAME || "Default");
    let acl = new Parse.ACL();
    acl.setPublicReadAccess(false)
    acl.setPublicWriteAccess(false)
    server.setACL(acl);
  }
  server.set("url", SERVER_URL);
  server.set("status", "loading")
  server.set("cities", CITIES ? CITIES.split(",") : []);
  server.set("memTotal", utils.convertBytes(os.totalmem()))
  server.set("memFree", utils.convertBytes(os.freemem()))
  server.set("cores", os.cpus().length)
  server.set("version", version)
  server.set("node", process.versions.node)
  await server.save(null, { useMasterKey: true })
}
setServerStatus = async (status) => {
  server.set("status", status)
  server.set("memFree", utils.convertBytes(os.freemem()))
  await server.save(null, { useMasterKey: true });
}
init = async () => {
  console.log("Verificando instalación");
  let result = await isInstalled()
  if (!result) {
    console.log("Iniciando instalación");
    await setup.install();
  }
  await getServer();
  if (CITIES) {
    await loadData();
  }
  await setServerStatus("available");
}

init();

const job = schedule.scheduleJob(SCHEDULE ? SCHEDULE : '0 0 23 * * *', async () => {
  if (CITIES) {
    await setServerStatus("loading");
    await loadData();
    await setServerStatus("available");
  }
});

Parse.Cloud.job("clearCache", async (request) => {
  try {
    await redisCtrl.clearCache()
    request.message("Caché borrada")
  } catch (e) {
    request.message("Error " + e.message)
  }

})
Parse.Cloud.define("calculate", async (request) => {
  /**
   * Error code
   * 1. Data is still loading
   * 2. City is missing
   * 3. Area is missing
   * 4. Start location is missing
   * 5. End location is missing
   */
  let params = request.params;
  let result = utils.validateArray([
    data !== undefined,
    params.city !== undefined,
    params.area !== undefined,
    params.start !== undefined,
    params.end !== undefined
  ], [1, 2, 3, 4, 5]);
  if (result.success) {
    await await setServerStatus("busy");
    let cache = await redisCtrl.getCached(params);
    if (cache) return cache;
    const time = new Date();
    utils.analytics('calculate', 'start', `${utils.cat(params.start[0])},${utils.cat(params.start[1])}`, 1);
    utils.analytics('calculate', 'end', `${utils.cat(params.end[0])},${utils.cat(params.end[1])}`, 1);
    result = await calculate({ rutas: data[params.city][params.type ? params.type : "urban"], config: config, origen: params.start, destino: params.end, area: params.area, qty: params.qty ? params.qty : 5 });
    utils.analytics('calculate', 'calculate', 'time', new Date() - time);
    redisCtrl.setCache(params, result);
  }
  await setServerStatus("available");
  return result;
});
Parse.Cloud.define("nearRoutes", async (request) => {
  /**
   * Error code
   * 1. Data is still loading
   * 2. Location is missing
   * 3. City is missing
   * 4. Area is missing
   */
  let params = request.params;

  let result = await utils.validateArray([
    data !== undefined,
    params.location !== undefined,
    params.city !== undefined,
    params.area !== undefined
  ], [1, 2, 3, 4]);
  if (result.success) {
    await setServerStatus("busy");
    let cache = await redisCtrl.getCached(params);
    if (cache) return cache;
    utils.analytics('nearRoutes', 'location', `${utils.cat(params.location[0])},${utils.cat(params.location[1])}`, 1);
    const time = new Date();
    result = await nearRoutes({ data: data, params: params });
    utils.analytics('nearRoutes', 'nearRoutes', 'time', new Date() - time);
    redisCtrl.setCache(params, result);
  }
  await setServerStatus("available");
  return result;
});

Parse.Cloud.define("status", async (request) => {
  return { ...status, running: new Date().getTime() - status.since };
});