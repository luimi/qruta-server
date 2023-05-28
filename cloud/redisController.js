const hash = require('object-hash');
const redis = require('redis');
const { REDIS_URL } = process.env;
module.exports = {
    getCached: async (params) => {
        if (!REDIS_URL) return;
        let client = getClient();
        let result = undefined;
        try {
            await client.connect();
            result = await client.get(hash(params));
            if(result) result = JSON.parse(result);
            await client.disconnect();
        } catch (e) { }
        return result;
    },
    setCache: async (params, result) => {
        if (!REDIS_URL) return;
        let client = getClient();
        await client.connect();
        await client.set(hash(params), JSON.stringify(result));
        await client.disconnect();
    }
}

const getClient = () => {
    return redis.createClient({
        url: REDIS_URL
    });
}