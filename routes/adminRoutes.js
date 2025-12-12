const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const AdminUser = require("../models/User");
const Payment = require("../models/Payment");
const auth = require("../middleware/auth");

/* -------------------------------------------------------
   ONE-TIME SUPERADMIN PASSWORD RESET (TEMPORARY)
------------------------------------------------------- */
router.get("/reset-superadmin", async (req, res) => {
  try {
    const newPassword = "Admin@123";

    const hash = await bcrypt.hash(newPassword, 10);

    await AdminUser.findOneAndUpdate(
      { email: "oberoipranay0@gmail.com" },
      { password: hash }
    );

    res.json({
      status: "Superadmin password reset successfully",
      login_email: "oberoipranay0@gmail.com",
      new_password: newPassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------
   SUPERADMIN — Create Admin / Viewer Users
------------------------------------------------------- */
router.post("/create-user", auth("superadmin"), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await AdminUser.create({
      name,
      email,
      password: hash,
      role, // "admin" or "viewer"
    });

    res.json({ status: "User created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------
   LOGIN
------------------------------------------------------- */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect password" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

/* -------------------------------------------------------
   FETCH ALL PAYMENTS (Admin + Viewer + Superadmin)
------------------------------------------------------- */
router.get("/payments", auth(), async (req, res) => {
  const payments = await Payment.find().sort({ date: -1 });
  res.json(payments);
});

/* -------------------------------------------------------
   FETCH ALL USERS (ONLY SUPERADMIN)
------------------------------------------------------- */
router.get("/users", auth("superadmin"), async (req, res) => {
  const users = await AdminUser.find();
  res.json(users);
});

module.exports = router;
