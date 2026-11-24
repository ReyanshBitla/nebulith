const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    unique: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
}, {
  timestamps: true,
});

userSchema.set('toJSON', {
  transform(_document, value) {
    delete value.passwordHash;
    delete value.__v;
    return value;
  },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
