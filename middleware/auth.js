module.exports = (requiredRole = null) => {
  return (req, res, next) => {
    // TEMP: allow all requests
    req.user = {
      id: "temp",
      role: "superadmin",
      name: "Pranay"
    };
    next();
  };
};
