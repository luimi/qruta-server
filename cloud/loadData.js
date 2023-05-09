const jsts = require("jsts");
const utils = require('./utils');
const { performance } = require('perf_hooks');
const geometryFactory = new jsts.geom.GeometryFactory();
let data = {};
let executionTime;
process.on('message', async ({ cities, routes, config }) => {
    let result = await loadData(cities, routes, config);
    process.send(result);
});
loadData = (cities, routes, config) => {
    return new Promise(async (resolve, reject) => {
        executionTime = performance.now();

        cities.forEach(city => {
            data[city.objectId] = {};
            data[city.objectId].urban = [];
            data[city.objectId].massive = [];
            if (city.massive) {
                data[city.objectId].massiveCompany = city.massive;
            }
        });
        routes.forEach(route => {
            let _route = { id: route.objectId, area: {} };
            let path = [];
            // get if is massive or urban
            let massiveCompany = data[route.city.objectId].massiveCompany
            let isMassive = massiveCompany !== undefined && massiveCompany.objectId === route.company.objectId;
            // get areas
            if (route.path) {
                route.path.forEach(location => {
                    path.push(new jsts.geom.Coordinate(location[1], location[0]));
                });
                for (let i = 1; i < 4; i++) {
                    _route.area[i] = getPolygon(path, config.walkInterval * i);
                }
                path = route.path;
                // segment path
                if (!route.osisp) {
                    for (let i = path.length - 2; i > 0; i--) {
                        let distance = utils.computeDistanceBetween(path[i], path[i + 1]);
                        if (distance > config.maxMetersBTWpoints) {
                            let segments = Math.floor(distance / config.maxMetersBTWpoints);
                            if (segments > 1) {
                                for (let j = segments; j > 0; j--) {
                                    path.splice((i + 1), 0, utils.computeOffset(
                                        path[i], (config.maxMetersBTWpoints * j), path[i + 1]
                                    )
                                    );
                                }
                            }
                        }
                    }
                }
                // distances
                let distances = [];
                path.forEach((location, index) => {
                    if (index == 0) {
                        distances.push(0);
                    } else {
                        distances.push(utils.computeDistanceBetween(location, path[index - 1])
                            + distances[index - 1]);
                    }
                });
                _route.distances = distances;
                _route.path = path;
                _route.name = route.name;
                _route.details = route.details;
                _route.company = route.company.name;
                _route.osisp = route.osisp;
                data[route.city.objectId][isMassive ? "massive" : "urban"].push(_route);
            }

        });
        executionTime = performance.now() - executionTime;
        resolve(data);
    });
}
getPolygon = (path, maxWalk) => {
    let distance = (maxWalk * 0.0011) / 111.12;
    let shell = geometryFactory.createLineString(path);
    let coordinates = shell.buffer(distance).getCoordinates();
    let polygon = [];
    coordinates.forEach(coordinate => {
        polygon.push([coordinate.y, coordinate.x]);
    });
    return polygon;
}