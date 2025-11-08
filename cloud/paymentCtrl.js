require('dotenv').config()
const moment = require('moment');
const { useMasterKey } = require('parse-server/lib/cloud-code/Parse.Cloud');

const { PAYMENT_METHOD, PAYMENT_APPID, PAYMENT_URL } = process.env;
/**
 * 
 * @param {*} request 
 * @returns 
 * @errors
 * 1- No plan selected
 * 2- Invalid user
 * 3- User with active subscription
 * 4- Plan does not exists
 */
exports.getPaymentLink = async (request) => {

    const { plan } = request.params;

    if (!plan) return { success: false, codeError: 1 }
    if (!request.user) return { success: false, codeError: 2 }

    const config = await Parse.Config.get();
    const plans = config.get("plans");
    if (!plans[plan]) return { success: false, codeError: 4 }
    const _plan = plans[plan];

    const currentSub = await new Parse.Query("Subscription")
        .equalTo("user", request.user)
        .equalTo("status", true)
        .greaterThan("expireAt", new Date())
        .first({ useMasterKey: true })
    if (currentSub) return { success: false, codeError: 3 }

    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setPublicWriteAccess(false);
    acl.setReadAccess(request.user, true)

    const sub = new Parse.Object("Subscription");
    sub.set("user", request.user);
    sub.set("expireAt", moment().add(_plan.qty, _plan.type).add(1, 'day').toDate())
    sub.set("status", false)
    sub.set("log", [])
    sub.setACL(acl)
    await sub.save(null, { useMasterKey: true })

    const link = await getLink(_plan.title, sub.id, _plan.price, _plan.description);
    if (link.success) {
        sub.set("code", link.data.id)
        sub.save(null, { useMasterKey: true })
    }

    return link;
}

exports.getPaymentUpdate = async () => {
    const { code, transaction, status } = request.params;
    const sub = await new Parse.Query("Subscription").equalTo("code", code).first({ useMasterKey: true });
    const log = sub.get("log");
    log.push(transaction)
    sub.set("log", log)
    if (status === 'Approved') {
        sub.set("status", true)
    }
    await sub.save(null, { useMasterKey: true })
}

const getLink = async (title, id, price, message) => {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    const raw = JSON.stringify({
        "title": title,
        "description": message,
        "id": id,
        "price": price,
        "method": PAYMENT_METHOD,
        "application": PAYMENT_APPID
    });

    const requestOptions = {
        method: "POST",
        body: raw,
        headers: headers,
        redirect: "follow"
    };

    const result = await fetch(`${PAYMENT_URL}/getLink`, requestOptions)
    return await result.json()

}