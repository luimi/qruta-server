require('dotenv').config()
const nodemailer = require("nodemailer")
const ejs = require('ejs');

const { EMAIL_HOST, EMAIL_PORT, EMAIL_EMAIL, EMAIL_PASSWORD } = process.env
const emailFrom = `"Q'ruta" <${EMAIL_EMAIL}>`

const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: true,
    auth: {
        user: EMAIL_EMAIL,
        pass: EMAIL_PASSWORD
    }
});

const getTemplate = (file, info) => {
    return new Promise((res, rej) => {
        ejs.renderFile(__dirname + `/templates/${file}.ejs`, info, async (err, data) => {
            if (err) console.log(err)
            res(data)
        })
    })
}

const send = (email) => {
    return new Promise((res, rej) => {
        transporter.sendMail(email, (error, info) => {
            if (error) {
                console.error(error)
                res(false)
            } else {
                res(true)
            }
        });
    })
}

exports.sendOTP = async ({ to, otp }) => {
    const template = await getTemplate('otp', {
        otp: otp
    });
    const email = {
        from: emailFrom,
        to: to,
        subject: "Código OTP",
        html: template,
    }
    return await send(email)
}
