import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ success: false, message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    console.log("authMiddleware - Decoded token:", { id: decoded.id, email: decoded.email, role: decoded.role });
    next();
  } catch (error) {
    console.error("authMiddleware - Token verification failed:", error.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};



