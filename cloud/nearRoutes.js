const utils = require('./utils');

module.exports = async ({ data, params }) => {
  let result = await nearRoutes(data, params);
  return result;
};

nearRoutes = async (data, params) => {
  result = { urban: [], massive: [], success: true };
  let near = (array, type) => {
    array.forEach((route) => {
      if (utils.containsLocation(params.location, route.area[params.area], true)) {
        result[type].push({ id: route.id, name: route.name, details: route.details });
      }
    });
  }
  near(data[params.city].urban, "urban");
  near(data[params.city].massive, "massive");
  return result;
}