const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
});

const sendMail = async (payload) => {
    try {
        const { to, subject, html } = payload;
        if (!to || !subject || !html) {
            throw new Error("Missing required email parameters: 'to', 'subject', or 'html'");
        }

        const info = await transporter.sendMail({
            from: `"Adwik Tax Consultancy" <no-reply@adwik.com>`,
            to,
            subject,
            html,
        });

        console.log("Email sent successfully: ", info.messageId);
        return { success: true, messageId: info.messageId, message: "OTP Sent Successfully", status: 200 };
    } catch (error) {
        console.error("Error sending email: ", error);
        return { success: false, error: error.message, status: 500 };
    }
};

module.exports = sendMail;
