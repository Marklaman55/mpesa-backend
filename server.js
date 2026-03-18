import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins
app.use(cors({
  origin: "*"
}));
app.use(express.json());

// GET / - API Health Check
app.get("/", (req, res) => {
  res.send("API running");
});

// Helper function to get M-Pesa Access Token
const getAccessToken = async () => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const response = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error("Access Token Error:", error.response?.data || error.message);
    return null;
  }
};

// POST /stk-push - M-Pesa STK Push Integration
app.post("/stk-push", async (req, res) => {
  const { phone, amount } = req.body;

  // STEP 1: VALIDATE INPUT
  if (!phone || !amount) {
    return res.status(400).json({ error: "Phone and amount required" });
  }

  // STEP 2: FORMAT PHONE NUMBER
  let formattedPhone = phone.replace(/\D/g, ""); // Remove non-digits
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "254" + formattedPhone.substring(1);
  } else if (formattedPhone.startsWith("7") || formattedPhone.startsWith("1")) {
    formattedPhone = "254" + formattedPhone;
  }

  // STEP 3: HANDLE ACCESS TOKEN FAILURE
  const token = await getAccessToken();
  if (!token) {
    return res.status(500).json({ error: "Failed to get access token" });
  }

  try {
    const shortcode = process.env.MPESA_SHORTCODE || "174379";
    const passkey = process.env.MPESA_PASSKEY;
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, -3);
    
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    // STEP 4 & 5: SEND STK PUSH REQUEST WITH FORMATTED PHONE AND IMPROVED HEADERS
    const stkResponse = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${process.env.BASE_URL}/callback`,
        AccountReference: "M-Shop",
        TransactionDesc: "Payment for goods",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );

    res.json(stkResponse.data);
  } catch (error) {
    // STEP 6: IMPROVE ERROR HANDLING
    console.error("STK Push Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "STK Push Failed",
      details: error.response?.data || error.message,
    });
  }
});

// STEP 7: KEEP CALLBACK CLEAN
app.post("/callback", (req, res) => {
  console.log("M-PESA CALLBACK:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
