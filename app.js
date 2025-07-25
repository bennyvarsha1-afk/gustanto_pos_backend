// gustanto_pos_backend/app.js

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// Load menu codex JSON
const codexPath = path.join(__dirname, 'gustanto_codex.json');
const orderFilePath = path.join(__dirname, 'orders.json');

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
const client = twilio(accountSid, authToken);

// Routes
app.get('/', (req, res) => {
  res.send('Gustanto POS Backend is Live ✅');
});

// Serve the full codex
app.get('/codex', (req, res) => {
  fs.readFile(codexPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading codex:', err);
      return res.status(500).json({ error: 'Codex not found' });
    }
    res.json(JSON.parse(data));
  });
});

// Save order to file and send WhatsApp to customer
app.post('/order', (req, res) => {
  const order = req.body;
  const timestamp = new Date().toISOString();
  const customerPhone = order.phone; // expects full number with country code

  if (!customerPhone) {
    return res.status(400).json({ success: false, message: 'Customer phone number is required' });
  }

  fs.readFile(orderFilePath, 'utf8', (err, data) => {
    let orders = [];
    if (!err && data) {
      try {
        orders = JSON.parse(data);
      } catch (e) {
        console.error('Error parsing orders.json:', e);
      }
    }
    orders.push({ ...order, timestamp });
    fs.writeFile(orderFilePath, JSON.stringify(orders, null, 2), (err) => {
      if (err) {
        console.error('Failed to save order:', err);
        return res.status(500).json({ success: false });
      }

      // Send WhatsApp message to the customer
      const messageBody = formatOrderForWhatsApp(order, timestamp);
      client.messages.create({
        from: `whatsapp:${whatsappFrom}`,
        to: `whatsapp:${customerPhone}`,
        body: messageBody
      }).then(message => {
        console.log('WhatsApp message sent:', message.sid);
      }).catch(err => {
        console.error('Failed to send WhatsApp message:', err);
      });

      res.json({ success: true });
    });
  });
});

function formatOrderForWhatsApp(order, timestamp) {
  let summary = `🧾 *Order Summary*\n📅 ${new Date(timestamp).toLocaleString()}\n`;
  order.items.forEach(item => {
    summary += `\n${item.name} x${item.qty} – ₹${item.qty * item.price}`;
  });
  summary += `\n\n*Total*: ₹${order.total}\n🙏 Thank you for ordering from *Gustanto*!`;
  return summary;
}

// Send promotional WhatsApp message
app.post('/send-promo', (req, res) => {
  const { message, phone } = req.body;
  if (!message || !phone) {
    return res.status(400).json({ success: false, message: 'Message and phone number are required' });
  }
  client.messages.create({
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${phone}`,
    body: message
  }).then(msg => {
    console.log('Promo message sent:', msg.sid);
    res.json({ success: true, sid: msg.sid });
  }).catch(err => {
    console.error('Promo message error:', err);
    res.status(500).json({ success: false, error: err.message });
  });
});

// Get order history
app.get('/orders', (req, res) => {
  fs.readFile(orderFilePath, 'utf8', (err, data) => {
    if (err || !data) {
      return res.json([]);
    }
    try {
      const orders = JSON.parse(data);
      res.json(orders);
    } catch (e) {
      console.error('Error parsing orders:', e);
      res.status(500).json({ error: 'Failed to parse orders' });
    }
  });
});

// Basic chart data (total per day)
app.get('/chart-data', (req, res) => {
  fs.readFile(orderFilePath, 'utf8', (err, data) => {
    if (err || !data) return res.json([]);
    try {
      const orders = JSON.parse(data);
      const chart = {};
      orders.forEach(order => {
        const day = new Date(order.timestamp).toISOString().split('T')[0];
        chart[day] = (chart[day] || 0) + (order.total || 0);
      });
      const result = Object.entries(chart).map(([date, total]) => ({ date, total }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to build chart data' });
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Gustanto POS Backend running at http://localhost:${PORT}`);
});
