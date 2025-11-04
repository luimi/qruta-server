const emailCtrl = require('./emailCtrl');
const utils = require('./utils');


/**
   * Error code
   * 1. Data is missing
   * 2. Email not sent
   */
exports.loginOTP = async (request) => {
    const { email } = request.params;

    if (!email) {
        return { success: false, codeError: 1 }
    }
    let user = await new Parse.Query(Parse.User).equalTo("username", email).first({ useMasterKey: true });

    if (!user) {
        user = new Parse.User();
        user.set("username", email);
        user.set("email", email);
    }
    const otp = utils.randomNum(100000, 999999);
    user.set('password', `${otp}`);

    await user.save(null, { useMasterKey: true });
    const sent = await emailCtrl.sendOTP({ to: email, otp: otp })

    setTimeout(() => {
        const newPassword = utils.randomStr(20)
        user.set("password", newPassword)
        user.save(null, { useMasterKey: true })
    }, 10 * 60 * 1000)

    return { success: sent, codeError: sent ? undefined : 2 }
}