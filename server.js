require("dotenv").config({ path: "./.env" });

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


const app = express();
app.use(cors({
  origin: "https://fbpaybusiness.netlify.app",
  methods: ["GET", "POST"],
  credentials: false
}));

app.use(express.json());

// -----------------------------------------------------
// ✅ ENV VARIABLES (Render / Local .env)
// -----------------------------------------------------
const MONGO_URI = process.env.MONGO_URI;
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET = process.env.CASHFREE_SECRET;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const FAST2SMS_KEY = process.env.FAST2SMS_KEY;

const FRONTEND_URL = process.env.FRONTEND_URL;  
// Example: https://fbpaybusiness.netlify.app

// -----------------------------------------------------
// CONNECT MONGODB
// -----------------------------------------------------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

// -----------------------------------------------------
// PAYMENT SCHEMA
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
// CREATE ORDER — CASHFREE REST API
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
        return_url: "https://fbpaybusiness.netlify.app/success.html?order_id={order_id}&payment_id={cf_payment_id}",
      },
    };

    const response = await fetch("https://sandbox.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2022-09-01",
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
      body: JSON.stringify(orderData),
    });

    const data = await response.json();
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

    // ---------------------------- PDF RECEIPT ----------------------------
    const pdf = new PDFDocument({ margin: 40 });
    const filename = `receipt_${Date.now()}.pdf`;
    pdf.pipe(fs.createWriteStream(filename));

    pdf.fontSize(22).text("FB Pay Business", { align: "center" });
    pdf.fontSize(16).text("Payment Receipt", { align: "center" }).moveDown();

    pdf.fontSize(12);
    pdf.text(`Customer Name: ${name}`);
    pdf.text(`Phone: ${phone}`);
    pdf.text(`Email: ${email}`);
    pdf.text(`Order ID: ${order_id}`);
    pdf.text(`Payment ID: ${payment_id}`);
    pdf.text(`Amount Paid: ₹${amount}`);
    pdf.text(`Date: ${new Date().toLocaleString()}`);
    pdf.end();

    // ---------------------------- SEND EMAIL ----------------------------
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
      text: "Thanks for your payment. Receipt is attached.",
      attachments: [{ filename, path: "./" + filename }],
    });

    // ---------------------------- SEND SMS ----------------------------
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

    res.json({ status: "SUCCESS" });
  } catch (err) {
    console.log("SUCCESS ERROR:", err);
    res.status(500).json({ error: "Failed to send receipt" });
  }
});

// -----------------------------------------------------
// ADMIN API
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
