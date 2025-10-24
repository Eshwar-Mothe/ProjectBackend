import { S3Client } from "@aws-sdk/client-s3";
import multer from "multer";
import multerS3 from "multer-s3";

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

export const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: "private",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      try {
        const userId = String(req.body.userId || "anonymous");
        const timestamp = Date.now();
        const cleanName = file.originalname.replace(/\s+/g, "_");
        const uniqueKey = `${userId}-${timestamp}-${cleanName}`;
        console.log("📤 Uploading file with key:", uniqueKey);
        cb(null, uniqueKey);
      } catch (err) {
        cb(err);
      }
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});
