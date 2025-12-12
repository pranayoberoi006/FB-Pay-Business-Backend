require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// CORRECT imports based on YOUR project
const adminRoutes = require("./routes/adminRoutes");
const Payment = require("./models/Payment");

const app = express();

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: false,
  })
);

app.use(express.json());

// ------------------------------------------------------------
// ENV
// ------------------------------------------------------------
const {
  MONGO_URI,
  CASHFREE_APP_ID,
  CASHFREE_SECRET,
  EMAIL_USER,
  EMAIL_PASS,
  FAST2SMS_KEY,
  FRONTEND_URL,
} = process.env;

// ------------------------------------------------------------
// MONGO CONNECT
// ------------------------------------------------------------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));


// ------------------------------------------------------------
// CREATE ORDER
// ------------------------------------------------------------
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
        return_url: `${FRONTEND_URL}/success.html?order_id={order_id}&payment_id={cf_payment_id}`,
      },
    };

    const cf = await fetch("https://sandbox.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2022-09-01",
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
      body: JSON.stringify(orderData),
    });

    const data = await cf.json();
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

// ------------------------------------------------------------
// PAYMENT SUCCESS
// ------------------------------------------------------------
app.post("/cashfree-success", async (req, res) => {
  try {
    const { name, phone, email, amount, order_id, payment_id } = req.body;

    await Payment.findOneAndUpdate(
      { order_id },
      { payment_id, status: "SUCCESS" }
    );

    const filename = `receipt_${Date.now()}.pdf`;
    const filepath = path.join(__dirname, filename);

    const pdf = new PDFDocument({ margin: 40 });
    pdf.pipe(fs.createWriteStream(filepath));

    pdf.fontSize(26).text("FB Pay Business", { align: "center" });
    pdf.fontSize(16).text("Payment Receipt", { align: "center" });

    pdf.text(`Name: ${name}`);
    pdf.text(`Email: ${email}`);
    pdf.text(`Phone: ${phone}`);
    pdf.text(`Order ID: ${order_id}`);
    pdf.text(`Payment ID: ${payment_id}`);
    pdf.text(`Amount: ₹${amount}`);
    pdf.text(`Date: ${new Date().toLocaleString()}`);

    pdf.end();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `FB Pay Business <${EMAIL_USER}>`,
      to: email,
      subject: "Your Payment Receipt",
      attachments: [{ filename, path: filepath }],
    });

    res.json({ status: "SUCCESS" });
  } catch (err) {
    console.log("SUCCESS ERROR:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ------------------------------------------------------------
// ADMIN ROUTES
// ------------------------------------------------------------
app.use("/admin-api", adminRoutes);

// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------
app.listen(5000, () => console.log("FB Pay Business Backend Running on Port 5000"));
