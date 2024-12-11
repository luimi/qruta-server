const geoUtils = require('./geoUtils');
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

        let path = _route.get("path");
        if (!_route.get("osisp")) {
            path = geoUtils.getSegmentedPath(path, _config);
        }
        route.distances = geoUtils.getPathDistances(path);
        route.path = path;
        route.name = _route.get("name");
        route.details = _route.get("details");
        route.company = _route.get("company").get("name");
        route.osisp = _route.get("osisp");
        data[city][isMassive ? "massive" : "urban"].push(route);
    });
    return data;
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

module.exports = loadData;