const KYC = require('../models/KYC');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

class KYCController {
  async submitKYC(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user._id;
      
      // Check if KYC already exists
      let kyc = await KYC.findOne({ userId });
      
      if (kyc && kyc.verification.status === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'KYC already approved'
        });
      }

      const {
        fullName,
        dateOfBirth,
        nationality,
        countryOfResidence,
        address,
        idType,
        idNumber
      } = req.body;

      // Process uploaded files
      const documents = {};
      if (req.files) {
        if (req.files.idFront) {
          documents.idFrontImage = await this.processDocument(req.files.idFront[0], 'id-front');
        }
        if (req.files.idBack) {
          documents.idBackImage = await this.processDocument(req.files.idBack[0], 'id-back');
        }
        if (req.files.selfie) {
          documents.selfieImage = await this.processDocument(req.files.selfie[0], 'selfie');
        }
        if (req.files.proofOfAddress) {
          documents.proofOfAddress = await this.processDocument(req.files.proofOfAddress[0], 'proof-address');
        }
      }

      const kycData = {
        userId,
        personalInfo: {
          fullName,
          dateOfBirth: new Date(dateOfBirth),
          nationality,
          countryOfResidence,
          address: typeof address === 'string' ? JSON.parse(address) : address
        },
        documents: {
          idType,
          idNumber,
          ...documents
        },
        verification: {
          status: 'pending'
        }
      };

      if (kyc) {
        // Update existing KYC
        Object.assign(kyc, kycData);
        kyc.submissionHistory.push({
          submittedAt: new Date(),
          status: 'resubmitted'
        });
      } else {
        // Create new KYC
        kyc = new KYC(kycData);
        kyc.submissionHistory.push({
          submittedAt: new Date(),
          status: 'submitted'
        });
      }

      await kyc.save();

      // Update user KYC status
      await User.findByIdAndUpdate(userId, {
        kycStatus: 'pending'
      });

      res.status(201).json({
        success: true,
        message: 'KYC submitted successfully',
        data: { kyc }
      });
    } catch (error) {
      console.error('Submit KYC error:', error);
      res.status(500).json({
        success: false,
        message: 'KYC submission failed',
        error: error.message
      });
    }
  }

  async getKYCStatus(req, res) {
    try {
      const kyc = await KYC.findOne({ userId: req.user._id });

      if (!kyc) {
        return res.json({
          success: true,
          data: {
            status: 'not_started',
            kyc: null
          }
        });
      }

      res.json({
        success: true,
        data: {
          status: kyc.verification.status,
          kyc: {
            ...kyc.toObject(),
            documents: {
              ...kyc.documents,
              // Don't expose full document paths for security
              idFrontImage: kyc.documents.idFrontImage ? 'uploaded' : null,
              idBackImage: kyc.documents.idBackImage ? 'uploaded' : null,
              selfieImage: kyc.documents.selfieImage ? 'uploaded' : null,
              proofOfAddress: kyc.documents.proofOfAddress ? 'uploaded' : null
            }
          }
        }
      });
    } catch (error) {
      console.error('Get KYC status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get KYC status',
        error: error.message
      });
    }
  }

  // Admin methods
  async getAllKYCs(req, res) {
    try {
      const { status, page = 1, limit = 10 } = req.query;
      const filter = {};
      
      if (status) {
        filter['verification.status'] = status;
      }

      const kycs = await KYC.find(filter)
        .populate('userId', 'email username firstName lastName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await KYC.countDocuments(filter);

      res.json({
        success: true,
        data: {
          kycs,
          pagination: {
            current: parseInt(page),
            total: Math.ceil(total / limit),
            count: kycs.length,
            totalRecords: total
          }
        }
      });
    } catch (error) {
      console.error('Get all KYCs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get KYCs',
        error: error.message
      });
    }
  }

  async reviewKYC(req, res) {
    try {
      const { kycId } = req.params;
      const { status, rejectionReason, notes, riskScore } = req.body;

      const kyc = await KYC.findById(kycId).populate('userId');
      
      if (!kyc) {
        return res.status(404).json({
          success: false,
          message: 'KYC not found'
        });
      }

      // Update verification status
      kyc.verification.status = status;
      kyc.verification.reviewedBy = req.user._id;
      kyc.verification.reviewedAt = new Date();
      
      if (rejectionReason) {
        kyc.verification.rejectionReason = rejectionReason;
      }
      
      if (notes) {
        kyc.verification.notes = notes;
      }
      
      if (riskScore !== undefined) {
        kyc.verification.riskScore = riskScore;
      }

      await kyc.save();

      // Update user KYC status
      const userKycStatus = status === 'approved' ? 'verified' : 
                           status === 'rejected' ? 'rejected' : 'pending';
      
      await User.findByIdAndUpdate(kyc.userId._id, {
        kycStatus: userKycStatus
      });

      res.json({
        success: true,
        message: `KYC ${status} successfully`,
        data: { kyc }
      });
    } catch (error) {
      console.error('Review KYC error:', error);
      res.status(500).json({
        success: false,
        message: 'KYC review failed',
        error: error.message
      });
    }
  }

  async processDocument(file, type) {
    try {
      const filename = `${type}-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpeg`;
      const filePath = path.join('uploads/kyc', filename);

      await sharp(file.buffer)
        .resize(1200, 1200, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toFile(filePath);

      return `/uploads/kyc/${filename}`;
    } catch (error) {
      console.error('Process document error:', error);
      throw new Error('Failed to process document');
    }
  }
}

module.exports = new KYCController();