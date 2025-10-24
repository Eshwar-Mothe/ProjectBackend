// utils/s3Utils.js
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3 } = require("./upload"); // reuse the same S3 client


const getSignedFileUrl = async (key) => {
    if (!key) throw new Error("Missing S3 key for signed URL generation");

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
    });

    // URL expires in 1 hour (3600 seconds)
    return await getSignedUrl(s3, command, { expiresIn: 300 });
};

module.exports = { getSignedFileUrl };
