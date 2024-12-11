const getPathDistances = (path) => {
    let distances = [];
    path.forEach((location, index) => {
        if (index == 0) {
            distances.push(0);
        } else {
            distances.push(distanceBetween(location, path[index - 1]) + distances[index - 1]);
        }
    });
    return distances;
}
const distanceBetween = (from, to) => {
    let radFromLat = toRadians(from[0])
    let radFromLng = toRadians(from[1]);
    let radToLat = toRadians(to[0])
    let radToLng = toRadians(to[1]);
    return 2 * Math.asin(Math.sqrt(
        Math.pow(Math.sin((radFromLat - radToLat) / 2), 2)
        + Math.cos(radFromLat) * Math.cos(radToLat) *
        Math.pow(Math.sin((radFromLng - radToLng) / 2), 2)
    )) * 6378137;
}
const toRadians = (angleDegrees) => {
    return angleDegrees * Math.PI / 180.0;
}
const getSegmentedPath = (path, gapDistance) => {
    for (let i = path.length - 2; i > 0; i--) {
        let distance = distanceBetween(path[i], path[i + 1]);
        if (distance > gapDistance) {
            let segments = Math.floor(distance / gapDistance);
            if (segments > 1) {
                for (let j = segments; j > 0; j--) {
                    path.splice((i + 1), 0, computeOffset(
                        path[i], (gapDistance * j), path[i + 1]
                    )
                    );
                }
            }
        }
    }
    return path;
}
const computeOffset = (from, distance, to) => {
    distance /= 6378137;
    let fromLat = toRadians(from[0]);
    let toLat = toRadians(to[0]);
    let deltaLng = toRadians(to[1]) - toRadians(from[1]);
    let fmod = (a, b) => Number((a - (Math.floor(a / b) * b)).toPrecision(8));
    let angle = toDegrees(
        Math.atan2(
            Math.sin(deltaLng) * Math.cos(toLat),
            Math.cos(fromLat) * Math.sin(toLat) -
            Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)
        )
    );
    if (angle === 180) { }
    else {
        angle = fmod((fmod((angle - -180), 360) + 360), 360) + -180;
    }
    let heading = toRadians(angle);

    let cosDistance = Math.cos(distance);
    let sinDistance = Math.sin(distance);
    let sinFromLat = Math.sin(fromLat);
    let cosFromLat = Math.cos(fromLat);
    let sc = cosDistance * sinFromLat + sinDistance * cosFromLat * Math.cos(heading);
    return [
        toDegrees(Math.asin(sc)),
        toDegrees(toRadians(from[1]) +
            Math.atan2(sinDistance * cosFromLat * Math.sin(heading),
                cosDistance - sinFromLat * sc))
    ];
}
toDegrees = (radians) => {
    return radians * 180 / Math.PI;
}
const isNearRoute = (route, location, maxDistance) => {
    let result = false;
    for (let i = 0; i < route.path.length; i++) {
        let distance = distanceBetween(route.path[i], location)
        if(distance < maxDistance) {
            result = true;
            break;
        }
    }
    return result;
}

const encode = (coords) => {
    let encodePoint = (plat, plng, lat, lng) => {
        let late5 = Math.round(lat * 1e5);
        let plate5 = Math.round(plat * 1e5)

        let lnge5 = Math.round(lng * 1e5);
        let plnge5 = Math.round(plng * 1e5)

        dlng = lnge5 - plnge5;
        dlat = late5 - plate5;
        return encodeSignedNumber(dlat) + encodeSignedNumber(dlng);
    }

    let encodeSignedNumber = (num) => {
        let sgn_num = num << 1;
        if (num < 0) {
            sgn_num = ~(sgn_num);
        }
        return (encodeNumber(sgn_num));
    }

    let encodeNumber = (num) => {
        let encodeString = "";
        while (num >= 0x20) {
            encodeString += (String.fromCharCode((0x20 | (num & 0x1f)) + 63));
            num >>= 5;
        }
        encodeString += (String.fromCharCode(num + 63));
        return encodeString;
    }

    let i = 0;
    let plat = 0;
    let plng = 0;
    let encoded_points = "";
    for (i = 0; i < coords.length; ++i) {
        let lat = coords[i][0];
        let lng = coords[i][1];
        encoded_points += encodePoint(plat, plng, lat, lng);
        plat = lat;
        plng = lng;
    }
    //encoded_points += encodePoint(plat, plng, coords[0][0], coords[0][1]);
    return encoded_points;
}
module.exports = {
    getPathDistances,
    distanceBetween,
    getSegmentedPath,
    isNearRoute,
    encode
}
/*
wrap = (n, min, max) => {
    return n >= min && n < max ? n : mod(n - min, max - min) + min;
}
mod = (x, m) => {
    return (x % m + m) % m;
}
mercator = (lat) => {
    return Math.log(Math.tan(lat * 0.5 + 0.7853981633974483));
}
intersects = (lat1, lat2, lng2, lat3, lng3, geodesic) => {
    if ((lng3 < 0.0 || lng3 < lng2) && (lng3 >= 0.0 || lng3 >= lng2)) {
        if (lat3 <= -1.5707963267948966) {
            return false;
        } else if (lat1 > -1.5707963267948966 && lat2 > -1.5707963267948966 && lat1 < 1.5707963267948966 && lat2 < 1.5707963267948966) {
            if (lng2 <= -3.141592653589793) {
                return false;
            } else {
                linearLat = (lat1 * (lng2 - lng3) + lat2 * lng3) / lng2;
                return lat1 >= 0.0 && lat2 >= 0.0 && lat3 <
                    linearLat ? false : (lat1 <= 0.0 && lat2 <= 0.0 && lat3 >=
                        linearLat ? true : (lat3 >= 1.5707963267948966 ? true : (
                            geodesic ? Math.tan(lat3) >= tanLatGC(lat1, lat2, lng2, lng3) :
                                mercator(lat3) >= mercatorLatRhumb(lat1, lat2, lng2, lng3))));
            }
        } else {
            return false;
        }
    } else {
        return false;
    }
}
tanLatGC = (lat1, lat2, lng2, lng3) => {
    return (Math.tan(lat1) * Math.sin(lng2 - lng3) + Math.tan(lat2) * Math.sin(lng3)) / Math.sin(lng2);
}
mercatorLatRhumb = (lat1, lat2, lng2, lng3) => {
    return (mercator(lat1) * (lng2 - lng3) + mercator(lat2) * lng3) / lng2;
}
*/