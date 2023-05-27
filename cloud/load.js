const jsts = require("jsts");
const utils = require('./utils');
const geometryFactory = new jsts.geom.GeometryFactory();
let data = {};
const loadData = async (_cities, _routes, _config) => {

    setCities(_cities);
    _routes.forEach(_route => {
        let route = { id: _route.id, area: {} };
        let city = _route.get("city").id;

        // get if is massive or urban
        let massiveCompany = data[city].massiveCompany
        let isMassive = massiveCompany !== undefined && massiveCompany.id === _route.get("company").id;

        // check path
        if (!_route.get("path")) {
            return;
        }

        // get areas
        route.area = getAreas(_route, _config);

        let path = _route.get("path");
        if (!_route.get("osisp")) {
            path = getSegmentedPath(path, _config);
        }
        route.distances = getDistances(path);
        route.path = path;
        route.name = _route.get("name");
        route.details = _route.get("details");
        route.company = _route.get("company").get("name");
        route.osisp = _route.get("osisp");
        data[city][isMassive ? "massive" : "urban"].push(route);
    });
    return data;
}
const getPolygon = (path, maxWalk) => {
    let distance = (maxWalk * 0.0011) / 111.12;
    let shell = geometryFactory.createLineString(path);
    let coordinates = shell.buffer(distance).getCoordinates();
    let polygon = [];
    coordinates.forEach(coordinate => {
        polygon.push([coordinate.y, coordinate.x]);
    });
    return polygon;
}

const setCities = (_cities) => {
    _cities.forEach(_city => {
        let id = _city.id;
        data[id] = {};
        data[id].urban = [];
        data[id].massive = [];
        if (_city.get("massive")) {
            data[id].massiveCompany = _city.get("massive");
        }
    });
}
const getAreas = (_route, _config) => {
    let area = []
    let path = [];
    _route.get("path").forEach(location => {
        path.push(new jsts.geom.Coordinate(location[1], location[0]));
    });
    for (let i = 1; i < 4; i++) {
        area[i] = getPolygon(path, _config.walkInterval * i);
    }
    return area;
}
const getDistances = (_path) => {
    let distances = [];
    _path.forEach((location, index) => {
        if (index == 0) {
            distances.push(0);
        } else {
            distances.push(utils.computeDistanceBetween(location, _path[index - 1]) + distances[index - 1]);
        }
    });
    return distances;
}
const getSegmentedPath = (_path, _config) => {
    for (let i = _path.length - 2; i > 0; i--) {
        let distance = utils.computeDistanceBetween(_path[i], _path[i + 1]);
        if (distance > _config.maxMetersBTWpoints) {
            let segments = Math.floor(distance / _config.maxMetersBTWpoints);
            if (segments > 1) {
                for (let j = segments; j > 0; j--) {
                    _path.splice((i + 1), 0, utils.computeOffset(
                        _path[i], (_config.maxMetersBTWpoints * j), _path[i + 1]
                    )
                    );
                }
            }
        }
    }
    return _path;
}
module.exports = loadData;