import fs from "fs";
import path from "path";
import multer from "multer";

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const createStorage = (folderName) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.resolve("assets", folderName);
      ensureDir(uploadPath);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(
        null,
        `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`
      );
    },
  });

const profileUpload = multer({ storage: createStorage("users") });
export const documentUpload = multer({ storage: createStorage("appointments") });
export const doctorDocumentUpload = multer({ storage: createStorage("doctor-documents") });
export const carePlanDocumentUpload = multer({ storage: createStorage("plan-documents") });

export default profileUpload;
