require('dotenv').config()

const MENUBE_URL = 'https://api.menube.co/v1'
const MENUBE_CLIENT_ID = process.env.MENUBE_CLIENT_ID
const MENUBE_CLIENT_SECRET = process.env.MENUBE_CLIENT_SECRET
const MENUBE_RADIUS_KM = 20
const MENUBE_LIMIT = 50

const AUTH_PATH = '/auth/token'
const NEARBY_PATH = '/businesses/nearby'

// Token cache: avoids requesting a new token on every call (tokens last 1 hour)
let authCache = { accessToken: null, expiresAt: 0 }

const isValidCoordinate = (lat, lng) => {
    const latitude = Number(lat)
    const longitude = Number(lng)
    return lat !== undefined && lat !== null && lat !== '' &&
        lng !== undefined && lng !== null && lng !== '' &&
        !isNaN(latitude) && latitude >= -90 && latitude <= 90 &&
        !isNaN(longitude) && longitude >= -180 && longitude <= 180
}

const getAccessToken = async () => {
    const now = Date.now()
    if (authCache.accessToken && now < authCache.expiresAt) return authCache.accessToken

    const response = await fetch(`${MENUBE_URL}${AUTH_PATH}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            accept: '*/*'
        },
        body: JSON.stringify({
            clientId: MENUBE_CLIENT_ID,
            clientSecret: MENUBE_CLIENT_SECRET
        }),
        redirect: 'follow'
    })

    if (!response.ok) throw new Error(`Menube auth error: ${response.status}`)

    const { accessToken, expiresIn } = await response.json()
    if (!accessToken) throw new Error('Menube auth error: accessToken missing')

    // Refresh 1 minute before the token actually expires
    const ttl = Number(expiresIn) || 3600
    authCache = { accessToken, expiresAt: now + Math.max(ttl - 60, 0) * 1000 }

    return accessToken
}

const getNearbyBusinesses = async (lat, lng) => {
    const accessToken = await getAccessToken()

    const query = new URLSearchParams({
        lat: `${lat}`,
        lng: `${lng}`,
        radiusKm: `${MENUBE_RADIUS_KM}`,
        limit: `${MENUBE_LIMIT}`
    })

    const response = await fetch(`${MENUBE_URL}${NEARBY_PATH}?${query}`, {
        method: 'GET',
        headers: {
            accept: '*/*',
            Authorization: `Bearer ${accessToken}`
        },
        redirect: 'follow'
    })

    if (!response.ok) throw new Error(`Menube nearby error: ${response.status}`)

    return await response.json()
}

/**
 * Returns the businesses near the given coordinates.
 * @param {*} request
 * @returns Menube nearby response or {} on error
 */
exports.getNearby = async (request) => {
    const params = request && request.params ? request.params : {}
    const { lat, lng } = params
    if (!MENUBE_CLIENT_ID || !MENUBE_CLIENT_SECRET) return {}
    if (!isValidCoordinate(lat, lng)) return {}

    try {
        return await getNearbyBusinesses(Number(lat), Number(lng))
    } catch (e) {
        console.log('getNearby error:', e.message)
        return {}
    }
}
