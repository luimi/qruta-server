const { fork } = require('child_process');
const request = require('request').defaults({ encoding: null });
module.exports = {
    computeDistanceBetween: (from, to) => {
        let radFromLat = toRadians(from[0])
        let radFromLng = toRadians(from[1]);
        let radToLat = toRadians(to[0])
        let radToLng = toRadians(to[1]);
        return 2 * Math.asin(Math.sqrt(
            Math.pow(Math.sin((radFromLat - radToLat) / 2), 2)
            + Math.cos(radFromLat) * Math.cos(radToLat) *
            Math.pow(Math.sin((radFromLng - radToLng) / 2), 2)
        )) * 6378137;
    },
    containsLocation: (point, polygon, geodesic) => {
        size = polygon.length;
        if (size == 0) {
            return false;
        } else {
            lat3 = toRadians(point[0]);
            lng3 = toRadians(point[1]);
            prev = polygon[size - 1];
            lat1 = toRadians(prev[0]);
            lng1 = toRadians(prev[1]);
            nIntersect = 0;

            lng2 = 0;
            for (let i = 0; i < size; i++) {
                point2 = polygon[i];

                dLng3 = wrap(lng3 - lng1, -3.141592653589793, 3.141592653589793);
                if (lat3 == lat1 && dLng3 == 0.0) {
                    return true;
                }

                lat2 = toRadians(point2[0]);
                lng2 = toRadians(point2[1]);
                if (intersects(lat1, lat2, wrap(lng2 - lng1, -3.141592653589793, 3.141592653589793), lat3, dLng3, geodesic)) {
                    ++nIntersect;
                }

                lat1 = lat2;
                lng1 = lng2;
            }
            return (nIntersect & 1) != 0;
        }
    },
    encode: (coords) => {
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
    },
    computeOffset: (from, distance, to) => {
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
    },
    validateArray: (validations, errorCode) => {
        for (let i = 0; i < validations.length; i++) {
            if (!validations[i]) {
                return { success: false, codeError: errorCode[i] };
            }
        }
        return { success: true };

    },
    fork: (path, params) => {
        return new Promise((result, reject) => {
            const process = fork(path);
            process.send(params);
            process.on('message', (message) => {
                result(message);
            });
        });
    },
    randomStr: (len) => {
        const seed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
        var ans = '';
        for (var i = len; i > 0; i--) {
            ans +=
                seed[Math.floor(Math.random() * seed.length)];
        }
        return ans;
    },
    analytics: (category, action, label, value) => {
        if (!process.env.GOOGLE_ANALITYCS_ID) return;
        const data = {
            v: '1',
            tid: process.env.GOOGLE_ANALITYCS_ID,
            cid: '1',
            t: 'event',
            ec: category,
            ea: action,
            el: label,
            ev: value,
        };
        request.post('http://www.google-analytics.com/collect', { form: data });
    },
    cat: (number) => {
        const parsed = parseFloat(`${number}`);
        return parsed.toFixed(4);
    }
}

toRadians = (angleDegrees) => {
    return angleDegrees * Math.PI / 180.0;
}


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
toDegrees = (radians) => {
    return radians * 180 / Math.PI;
}
