const setup = require('./setup');
const utils = require('./utils');
const calculate = require('qruta-calcular');
const nearRoutes = require('./nearRoutes');
let data;
let config = {
  walkInterval: 500,
  maxMetersBTWpoints: 100,
  avgError: 0.3,
  proportion: 10,
  walkingDistance: 200
};
loadData = async () => {
  console.log("Iniciando carga de datos");
  const time = new Date();
  const c = await Parse.Config.get();
  config = c.get('serverConfig');
  const cities = await new Parse.Query("City").find();
  const routesCount = await new Parse.Query("Route").equalTo('status', true).count();
  const routes = await new Parse.Query("Route").include('company').limit(routesCount).equalTo('status', true).exists('company').find();
  data = await utils.fork('./cloud/loadData.js', { cities: cities, routes: routes, config: config });
  utils.analytics('server', 'loadData', 'time', new Date() - time);
  console.log('Datos cargados');
}
isInstalled = async () => {
  try {
    let admin = await new Parse.Query(Parse.Role).equalTo("name", "admin").first();
    return admin !== undefined;
  } catch (e) { }
  return false;
}
init = async () => {
  console.log("Verificando instalación");
  let result = await isInstalled()
  if (result) {
    loadData();
  } else {
    console.log("Iniciando instalación");
    await setup.install();
    loadData();
  }
}
init();

Parse.Cloud.job("loadData", async (request) => {
  await loadData();
  request.message("Data successfully loaded");
});
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
    const time = new Date();
    utils.analytics('calculate', 'start', `${utils.cat(params.start[0])},${utils.cat(params.start[1])}`, 1);
    utils.analytics('calculate', 'end', `${utils.cat(params.end[0])},${utils.cat(params.end[1])}`, 1);
    result = await calculate({ rutas: data[params.city][params.type ? params.type : "urban"], config: config, origen: params.start, destino: params.end, area: params.area, qty: params.qty ? params.qty : 5 });
    utils.analytics('calculate', 'calculate', 'time', new Date() - time);
  }
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
    utils.analytics('nearRoutes', 'location', `${utils.cat(params.location[0])},${utils.cat(params.location[1])}`, 1);
    const time = new Date();
    result = await nearRoutes({ data: data, params: params });
    utils.analytics('nearRoutes', 'nearRoutes', 'time', new Date() - time);
  }
  return result;
});

//TODO intentar agregar uso de cpu y ram
Parse.Cloud.define("status", async (request) => {
  return { dataIsLoaded: data !== undefined };
});
Parse.Cloud.define("advertise", async (request) => {
  return {
    picture: 'https://image.winudf.com/v2/image1/Y29tLmx1aTJtaS5xcnV0YV9zY3JlZW5fMF8xNTQ4ODY0OTUxXzA4OA/screen-0.jpg?fakeurl=1&type=.jpg',
    url: 'https://queruta.com'
  }
});