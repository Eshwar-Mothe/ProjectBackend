const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: "private",
    key: (req, file, cb) => {
      // ✅ Ensure string conversion
      const userId = String(req.body.userId || "anonymous");
      const timestamp = Date.now();
      const originalName = String(file.originalname || "file");

      const uniqueName = `${userId}-${timestamp}-${originalName}`;

      console.log("Uploading file with key:", uniqueName); // debug log
      cb(null, uniqueName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
