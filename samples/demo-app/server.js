const express = require("express");
const app = express();

function authenticate(req, res, next) {
  next();
}

app.get("/api/products", (req, res) => {
  res.json([]);
});

app.get("/api/orders/:id", authenticate, (req, res) => {
  res.json({ id: req.params.id });
});

app.post("/api/orders", authenticate, (req, res) => {
  res.json({ created: true });
});
