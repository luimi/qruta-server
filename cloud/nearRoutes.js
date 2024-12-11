const geoUtils = require('./geoUtils')

module.exports = async ({ data, params }) => {
  let result = await nearRoutes(data, params);
  return result;
};

nearRoutes = async (data, params) => {
  result = { urban: [], massive: [], success: true };
  let near = (array, type) => {
    array.forEach((route) => {
      if (geoUtils.isNearRoute(route, params.location, params.area * 500)) {
        result[type].push({ id: route.id, name: route.name, details: route.details });
      }
    });
  }
  near(data[params.city].urban, "urban");
  near(data[params.city].massive, "massive");
  return result;
}