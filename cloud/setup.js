const utils = require('./utils');
const Sentry = require("@sentry/node");

module.exports = {
    install: async (request) => {
        try {
            //admin role
            var acl = new Parse.ACL();
            acl.setPublicReadAccess(true);
            let adminRole = new Parse.Role("admin", acl);
            adminRole = await adminRole.save();
            //operator role
            acl.setRoleWriteAccess(adminRole, true);
            let operatorRole = new Parse.Role("operator", acl);
            operatorRole = await operatorRole.save();
            //admin user
            let admin = new Parse.User();
            admin.set("username", "admin");
            let password = utils.randomStr(10);
            admin.set("password", password);
            await admin.signUp();
            //basic configuration
            await Parse.Config.save({
                geocode: [{ type: "arcgis" }],
                reverse: [{ type: "arcgis" }],
                walkto: [{ type: "arcgis" }],
                //TODO revisar esto
                status: { code: utils.randomStr(10), action: 1 },
                maintenance: true
            });
            console.log(`Servidor de Q'ruta instalado correctamente, con el usuario 'admin' y su contraseña: '${password}'`);
        } catch (e) {
            Sentry.captureException(e)
        }
    }
}
