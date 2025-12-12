const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,

  amount: {
    type: Number,
    required: true
  },

  order_id: {
    type: String,
    required: true
  },

  payment_id: {
    type: String,
    default: null
  },

  status: {
    type: String,
    enum: ["PENDING", "SUCCESS", "FAILED"],
    default: "PENDING"
  },

  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Payment", PaymentSchema);
