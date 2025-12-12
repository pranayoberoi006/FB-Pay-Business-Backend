const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },

  email: { type: String, required: true, unique: true },

  // password stored in plain text
  password: { type: String, required: true },

  role: {
    type: String,
    enum: ["superadmin", "admin", "viewer"],
    default: "viewer",
  },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AdminUser", UserSchema);
