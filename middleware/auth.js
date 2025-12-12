const jwt = require("jsonwebtoken");

/*
   auth(requiredRole)

   requiredRole can be:
   - undefined → any logged-in user (viewer/admin/superadmin)
   - "admin" → admin + superadmin
   - "superadmin" → ONLY superadmin
*/

module.exports = function (requiredRole) {
  return (req, res, next) => {
    try {
      const token = req.headers.authorization;

      if (!token) return res.status(401).json({ error: "No token provided" });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      // ROLE CHECK
      if (requiredRole) {
        if (requiredRole === "admin") {
          if (decoded.role !== "admin" && decoded.role !== "superadmin") {
            return res.status(403).json({ error: "Admin access required" });
          }
        }

        if (requiredRole === "superadmin") {
          if (decoded.role !== "superadmin") {
            return res.status(403).json({ error: "Superadmin only" });
          }
        }
      }

      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
};
