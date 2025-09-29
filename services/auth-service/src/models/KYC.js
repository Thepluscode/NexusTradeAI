const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  personalInfo: {
    fullName: {
      type: String,
      required: true
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    nationality: {
      type: String,
      required: true
    },
    countryOfResidence: {
      type: String,
      required: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },
  documents: {
    idType: {
      type: String,
      enum: ['passport', 'drivers_license', 'national_id'],
      required: true
    },
    idNumber: {
      type: String,
      required: true
    },
    idFrontImage: {
      type: String,
      required: true
    },
    idBackImage: String,
    selfieImage: {
      type: String,
      required: true
    },
    proofOfAddress: String
  },
  verification: {
    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected', 'requires_resubmission'],
      default: 'pending'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    rejectionReason: String,
    notes: String,
    riskScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  compliance: {
    sanctions: {
      checked: {
        type: Boolean,
        default: false
      },
      result: {
        type: String,
        enum: ['clear', 'match', 'potential_match']
      },
      checkedAt: Date
    },
    pep: {
      checked: {
        type: Boolean,
        default: false
      },
      result: {
        type: String,
        enum: ['clear', 'match', 'potential_match']
      },
      checkedAt: Date
    },
    aml: {
      checked: {
        type: Boolean,
        default: false
      },
      result: {
        type: String,
        enum: ['clear', 'flagged']
      },
      checkedAt: Date
    }
  },
  submissionHistory: [{
    submittedAt: {
      type: Date,
      default: Date.now
    },
    status: String,
    changes: [{
      field: String,
      oldValue: String,
      newValue: String
    }]
  }]
}, {
  timestamps: true
});

kycSchema.index({ userId: 1 });
kycSchema.index({ 'verification.status': 1 });
kycSchema.index({ 'verification.reviewedAt': 1 });

module.exports = mongoose.model('KYC', kycSchema);
