// middlewares/roleMiddleware.js

/**
 * Middleware to check if user has a specific role or roles
 * @param {string|string[]} roles - Role or array of roles to allow
 */
export const roleMiddleware = (roles) => {
    return (req, res, next) => {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ 
          success: false,
          message: "Unauthorized. No user role found." 
        });
      }
  
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          success: false,
          message: `Access denied. ${allowedRoles.join(" or ")} role required.` 
        });
      }
  
      next();
    };
  };
  
  // Convenience middlewares
  export const isPatient = roleMiddleware("patient");
  export const isDoctor = roleMiddleware("doctor");
  export const isAdmin = roleMiddleware("admin");
  