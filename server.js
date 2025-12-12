require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();

// -----------------------------------------------------
// CORS (ONLY FRONTEND ALLOWED)
// -----------------------------------------------------
app.use(cors({
    origin: "https://fbpaybusiness.netlify.app",
    methods: ["GET", "POST"]
}));


app.use(express.json());

// -----------------------------------------------------
// ENV VARIABLES
// -----------------------------------------------------
const MONGO_URI = process.env.MONGO_URI;
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET = process.env.CASHFREE_SECRET;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const FAST2SMS_KEY = process.env.FAST2SMS_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL;

// -----------------------------------------------------
// CONNECT MONGODB
// -----------------------------------------------------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

// -----------------------------------------------------
// Payment Schema
// -----------------------------------------------------
const PaymentSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  amount: Number,
  order_id: String,
  payment_id: String,
  status: { type: String, default: "PENDING" },
  date: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", PaymentSchema);

// -----------------------------------------------------
// CREATE ORDER (CASHFREE REST API)
// -----------------------------------------------------
app.post("/create-order", async (req, res) => {
  try {
    const { name, phone, email, amount } = req.body;

    const orderData = {
      order_amount: Number(amount),
      order_currency: "INR",
      customer_details: {
        customer_id: phone + "_cust",
        customer_email: email,
        customer_phone: phone,
        customer_name: name,
      },
      order_meta: {
    return_url: `https://fbpaybusiness.netlify.app/success.html?order_id={order_id}&payment_id={cf_payment_id}&name=${name}&email=${email}&phone=${phone}&amount=${amount}`
}
,
    };

    const cfResponse = await fetch("https://sandbox.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2022-09-01",
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
      body: JSON.stringify(orderData),
    });

    const data = await cfResponse.json();
    console.log("CASHFREE ORDER:", data);

    await Payment.create({
      name,
      phone,
      email,
      amount,
      order_id: data.order_id,
      status: "PENDING",
    });

    res.json({ payment_session_id: data.payment_session_id });
  } catch (err) {
    console.log("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// -----------------------------------------------------
// PAYMENT SUCCESS
// -----------------------------------------------------
app.post("/cashfree-success", async (req, res) => {
  try {
    const { name, phone, email, amount, order_id, payment_id } = req.body;

    await Payment.findOneAndUpdate(
      { order_id },
      { payment_id, status: "SUCCESS" }
    );

    // --------------------- Create PDF Receipt ---------------------
    const pdf = new PDFDocument({ margin: 40 });
    const filename = `receipt_${Date.now()}.pdf`;
    pdf.pipe(fs.createWriteStream(filename));

    pdf.fontSize(22).text("FB Pay Business", { align: "center" });
    pdf.fontSize(16).text("Payment Receipt", { align: "center" }).moveDown();

    pdf.fontSize(12)
      .text(`Customer Name: ${name}`)
      .text(`Phone: ${phone}`)
      .text(`Email: ${email}`)
      .text(`Order ID: ${order_id}`)
      .text(`Payment ID: ${payment_id}`)
      .text(`Amount Paid: ₹${amount}`)
      .text(`Date: ${new Date().toLocaleString()}`);

    pdf.end();

    // ------------------------ Send Email -------------------------
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `FB Pay Business <${EMAIL_USER}>`,
      to: email,
      subject: "Your Payment Receipt",
      text: "Thank you for your payment. Your receipt is attached.",
      attachments: [{ filename, path: "./" + filename }],
    });

    // ------------------------ Send SMS -------------------------
    await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: FAST2SMS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "v3",
        sender_id: "TXTIND",
        message: `FB Pay Business: Payment Successful. Amount ₹${amount}`,
        language: "english",
        numbers: phone,
      }),
    });

    res.json({
      status: "SUCCESS",
      receipt_url: `${FRONTEND_URL}/receipts/${filename}`,
    });
  } catch (err) {
    console.log("SUCCESS ERROR:", err);
    res.status(500).json({ error: "Failed to process success" });
  }
});

// -----------------------------------------------------
// ADMIN PANEL — GET ALL PAYMENTS
// -----------------------------------------------------
app.get("/admin/payments", async (req, res) => {
  const all = await Payment.find().sort({ date: -1 });
  res.json(all);
});

// -----------------------------------------------------
// START SERVER
// -----------------------------------------------------
app.listen(5000, () => {
  console.log("FB Pay Business Backend Running on Port 5000");
});
