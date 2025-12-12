require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

// IMPORTANT: make sure these two files actually exist at these paths:
const adminRoutes = require("./routes/adminRoutes");
const Payment = require("./models/Payment");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(express.json());

// ENV
const {
  MONGO_URI,
  CASHFREE_APP_ID,
  CASHFREE_SECRET,
  EMAIL_USER,
  EMAIL_PASS,
  FAST2SMS_KEY,
  FRONTEND_URL,
  JWT_SECRET,
} = process.env;

// health check
app.get("/_health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// connect to mongo
mongoose
  .connect(MONGO_URI, { keepAlive: true })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Error:", err));

// create-order (example)
app.post("/create-order", async (req, res) => {
  try {
    // minimal validation
    const { name, phone, email, amount } = req.body;
    if (!name || !phone || !email || !amount) {
      return res.status(400).json({ error: "Missing fields" });
    }

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
        return_url:
          (FRONTEND_URL || "http://127.0.0.1:5500") +
          `/success.html?order_id={order_id}&payment_id={cf_payment_id}`,
      },
    };

    const cfResp = await fetch("https://sandbox.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2022-09-01",
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
      body: JSON.stringify(orderData),
    });

    const data = await cfResp.json();
    console.log("CASHFREE ORDER:", data);

    await Payment.create({
      name,
      phone,
      email,
      amount,
      order_id: data.order_id,
      status: "PENDING",
    });

    res.json({ payment_session_id: data.payment_session_id, data });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Order creation failed", detail: String(err) });
  }
});

// success endpoint used by frontend
app.post("/cashfree-success", async (req, res) => {
  try {
    const { name, phone, email, amount, order_id, payment_id } = req.body;
    await Payment.findOneAndUpdate({ order_id }, { payment_id, status: "SUCCESS" });

    // generate a simple pdf (you can expand)
    const filename = `receipt_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, filename);
    const pdf = new PDFDocument({ margin: 40 });
    pdf.pipe(fs.createWriteStream(filePath));
    pdf.fontSize(20).text("FB Pay Business - Receipt", { align: "center" }).moveDown();
    pdf.fontSize(12).text(`Name: ${name}`);
    pdf.text(`Email: ${email}`);
    pdf.text(`Phone: ${phone}`);
    pdf.text(`Order ID: ${order_id}`);
    pdf.text(`Payment ID: ${payment_id}`);
    pdf.text(`Amount: ₹${amount}`);
    pdf.end();

    // send email (simple)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `FB Pay Business <${EMAIL_USER}>`,
      to: email,
      subject: "Your Payment Receipt",
      text: "Thanks for the payment. Receipt attached.",
      attachments: [{ filename, path: filePath }],
    });

    res.json({ status: "SUCCESS" });
  } catch (err) {
    console.error("SUCCESS ERROR:", err);
    res.status(500).json({ error: "Failed to process success" });
  }
});

// admin routes mount - must exist
// admin routes
app.use("/admin-api", adminRoutes);

// 🚨 TEMPORARY EMERGENCY LOGIN
app.post("/admin-api/force-login", (req, res) => {
  return res.json({
    token: "FORCE_TOKEN_123",
    role: "superadmin",
    name: "Pranay"
  });
});

// fallback
app.get("/", (req, res) => res.send("FB Pay Business backend root. See /_health"));

// start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`FB Pay Business Backend running on port ${PORT}`));
