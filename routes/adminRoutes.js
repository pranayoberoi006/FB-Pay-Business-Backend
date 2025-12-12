const express = require("express");
const router = express.Router();

const AdminUser = require("../models/User");
const Payment = require("../models/Payment");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");

// -------------------------------------------------------
// SUPERADMIN — Create Users (NO HASH)
// -------------------------------------------------------
router.post("/create-user", auth("superadmin"), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const user = await AdminUser.create({
      name,
      email,
      password, // plain text as you decided
      role
    });

    // IMPORTANT FIX
    res.json(user);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------------------------------------------
// LOGIN (PLAIN PASSWORD CHECK)
// -------------------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await AdminUser.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (password !== user.password)
    return res.status(401).json({ error: "Incorrect password" });

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, role: user.role, name: user.name });
});

// -------------------------------------------------------
// GET PAYMENTS
// -------------------------------------------------------
router.get("/payments", auth(), async (req, res) => {
  const payments = await Payment.find().sort({ date: -1 });
  res.json(payments);
});

// -------------------------------------------------------
// GET USERS — Only Superadmin
// -------------------------------------------------------
router.get("/users", auth("superadmin"), async (req, res) => {
  const users = await AdminUser.find();
  res.json(users);
});

module.exports = router;
