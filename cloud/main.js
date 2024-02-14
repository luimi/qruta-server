require('dotenv').config();
const setup = require('./setup');
const utils = require('./utils');
const calculate = require('qruta-calcular');
const nearRoutes = require('./nearRoutes');
const Sentry = require("@sentry/node");
const load = require('./load');
const redisCtrl = require('./redisController');
const schedule = require('node-schedule');
const _request = require('request');
const os = require("os");
const { version } = require("../package.json");
const { NAME, SCHEDULE, SERVER_URL, CITIES, APP_ID } = process.env;


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
  await server.save({time:status.time},{ useMasterKey: true })
  console.log('Datos cargados');
}
isInstalled = async () => {
  try {
    let admin = await new Parse.Query(Parse.Role).equalTo("name", "admin").first();
    return admin !== undefined;
  } catch (e) {
    console.log("isInstalled: error:", e.message)
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
  await utils.sleep(1000)
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
    let cache = await redisCtrl.getCached(params);
    if (cache) return cache;
    await await setServerStatus("busy");
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

Parse.Cloud.define("getServer", async (request) => {
  /**
   * Error code
   * 1. City is missing
   * 2. No server available
   */
  let { city } = request.params
  let result = await utils.validateArray([
    city != undefined
  ], [1]);
  if (!result.success) return result
  let queries = [
    { query: new Parse.Query("Server").equalTo("cities", city).equalTo("status", "available"), verify: true },
    { query: new Parse.Query("Server").equalTo("cities", "*").equalTo("status", "available"), verify: true },
    { query: new Parse.Query("Server").equalTo("cities", city).equalTo("status", "busy"), verify: false },
    { query: new Parse.Query("Server").equalTo("cities", "*").equalTo("status", "busy"), verify: false },
  ];
  let checkServer = (server) => {
    return new Promise((res, rej) => {
      let options = {
        'method': 'POST',
        'url': `${server.get("url")}/functions/status`,
        'headers': {
          'X-Parse-Application-Id': APP_ID
        },
        'timeout': 3000,
        'json': true
      };
      _request(options, (error, response, body) => {
        if (body) res(body.result ? body.result.data : false)
        else res(false)
      });
    })
  }
  let verifyServers = async (servers, verify) => {
    let result = { success: false }
    for (let i = 0; i < servers.length; i++) {
      let lastUpdate = new Date().getTime() - servers[i].updatedAt.getTime()
      if (verify) {
        if (await checkServer(servers[i])) {
          result.success = true
          result.url = servers[i].get("url")
          break;
        } else {
          servers[i].set("status", "idle")
          await servers[i].save(null, { useMasterKey: true })
        }
      } else {
        result.success = true
        result.url = servers[i].get("url")
        break;
      }
    }
    return result;
  }
  for (let i = 0; i < queries.length; i++) {
    let servers = await queries[i].query
      .notEqualTo("url", "http://localhost:1337/parse")
      .ascending("time")
      .find({ useMasterKey: true })
    let result = await verifyServers(servers, queries[i].verify)
    if (result.success) {
      return result
    }
  }
  return { success: false, errorCode: 2 }
})