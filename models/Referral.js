// models/Referral.js
const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    user: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },
    referrals: [
      {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true },
      },
    ],
    isExistingUser: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = referralSchema;
