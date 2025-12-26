import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { query } from "../config/db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

if (!JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is not defined. Tokens cannot be issued without it.");
}

const publicUserFields = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "active",
  "gender",
  "age",
  "education",
  "speciality",
  "experience_years",
  "fee",
  "profile_image_url",
  "bio",
  "balance",
  "created_at",
  "updated_at",
];

const sanitizeUser = (user) => {
  if (!user) return null;
  return publicUserFields.reduce((acc, field) => {
    acc[field] = user[field] ?? null;
    return acc;
  }, {});
};

const toPublicPath = (filePath) => {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const [_, relative] = normalized.split("/assets/");
  return relative ? `/assets/${relative}` : normalized;
};

export const signup = async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      password,
      role,
      gender,
      age,
      education,
      speciality,
      experience_years,
      fee,
      bio,
    } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "full_name, email, password and role are required",
      });
    }

    const normalizedRole = role.toLowerCase();
    const allowedRoles = ["patient", "doctor", "admin"];
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be patient, doctor or admin",
      });
    }

    const existing = await query("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertResult = await query(
      `INSERT INTO users 
        (full_name, email, phone, password_hash, role, active, gender, age, education, speciality, experience_years, fee, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name,
        email.toLowerCase(),
        phone || null,
        passwordHash,
        normalizedRole,
        normalizedRole === "doctor" ? 0 : 1,
        gender || null,
        age || null,
        education || null,
        speciality || null,
        experience_years || null,
        fee || null,
        bio || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        normalizedRole === "doctor"
          ? "Signup successful. An administrator will review your documents shortly."
          : "Signup successful",
      user: {
        id: insertResult.insertId,
        full_name,
        email: email.toLowerCase(),
        role: normalizedRole,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create user at the moment",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const [user] = await query("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found with this email",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: "Account is not active yet. Please contact support.",
      });
    }

    // Pour les patients, vérifier le statut de souscription
    if (user.role === 'patient') {
      // Vérifier si la colonne subscribed existe, sinon vérifier les achats actifs
      const subscribed = user.subscribed === 1 || user.subscribed === true;
      
      if (!subscribed) {
        return res.status(403).json({
          success: false,
          message: "You need to subscribe to a plan before you can login. Please purchase a subscription plan first.",
          requires_plan: true,
          subscribed: false,
        });
      }
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server misconfiguration: JWT secret missing",
      });
    }

    // Calculate expiration time in seconds for the response
    const parseExpiresIn = (expiresStr) => {
      const match = expiresStr.match(/^(\d+)([smhd])$/);
      if (!match) return 86400; // Default to 24 hours if format is invalid
      
      const value = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return 86400;
      }
    };

    const expiresInSeconds = parseExpiresIn(JWT_EXPIRES);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // Decode token to get the actual expiration time from the token itself
    // JWT exp is in seconds since epoch, convert to milliseconds
    const decoded = jwt.decode(token);
    const tokenExpiresAt = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + (expiresInSeconds * 1000);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      expires_in: expiresInSeconds, // Expiration time in seconds
      expires_at: tokenExpiresAt, // Actual expiration timestamp in milliseconds
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to login at the moment",
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again.",
      });
    }

    // Use * to get all columns, then sanitize - more robust if columns are missing
    const [user] = await query("SELECT * FROM users WHERE id = ?", [req.user.id]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Fetch profile error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch profile at the moment",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    const relativePath = req.file.path.replace(/\\/g, "/");
    const fileUrl = toPublicPath(relativePath);
    await query("UPDATE users SET profile_image_url = ? WHERE id = ?", [fileUrl, req.user.id]);

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      image_url: fileUrl,
    });
  } catch (error) {
    console.error("Update profile picture error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update profile picture",
    });
  }
};
