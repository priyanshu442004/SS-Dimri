import AWS from "aws-sdk";

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Generate signed URL for file access
const getSignedUrl = (key, expiresIn = 3600) => {
  return s3.getSignedUrlPromise('getObject', {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn
  });
};

// Upload file to S3
const uploadToS3 = async (file, key, contentType) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: contentType || file.mimetype,
    ServerSideEncryption: 'AES256'
  };

  return s3.upload(params).promise();
};

// Delete file from S3
const deleteFromS3 = async (key) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key
  };

  return s3.deleteObject(params).promise();
};

export { getSignedUrl, uploadToS3, deleteFromS3 };


