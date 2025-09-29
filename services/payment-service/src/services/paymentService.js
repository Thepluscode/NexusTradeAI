// src/services/paymentService.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const Payment = require('../models/Payment');
const BankAccount = require('../models/BankAccount');

class PaymentService {
  constructor(options = {}) {
    this.logger = options.logger;
    
    // Initialize Plaid
    this.plaidClient = new PlaidApi(new Configuration({
      basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    }));
  }

  async initialize() {
    this.logger?.info('Initializing PaymentService...');
  }

  async processDeposit(userId, amount, source, options = {}) {
    try {
      const payment = new Payment({
        id: require('uuid').v4(),
        userId,
        type: 'deposit',
        amount,
        currency: options.currency || 'USD',
        source,
        status: 'pending',
        metadata: options.metadata || {},
        createdAt: new Date()
      });

      await payment.save();

      let result;
      
      switch (source.type) {
        case 'bank_account':
          result = await this.processBankDeposit(payment, source);
          break;
        case 'credit_card':
          result = await this.processCreditCardDeposit(payment, source);
          break;
        case 'crypto':
          result = await this.processCryptoDeposit(payment, source);
          break;
        default:
          throw new Error(`Unsupported deposit source: ${source.type}`);
      }

      await this.updatePaymentStatus(payment.id, result.status, result);
      
      this.logger?.info(`Deposit processed: ${payment.id}`, {
        userId,
        amount,
        status: result.status
      });

      return { payment, result };

    } catch (error) {
      this.logger?.error('Error processing deposit:', error);
      throw error;
    }
  }

  async processWithdrawal(userId, amount, destination, options = {}) {
    try {
      // Check available balance
      const availableBalance = await this.getAvailableBalance(userId);
      if (amount > availableBalance) {
        throw new Error('Insufficient funds');
      }

      const payment = new Payment({
        id: require('uuid').v4(),
        userId,
        type: 'withdrawal',
        amount,
        currency: options.currency || 'USD',
        destination,
        status: 'pending',
        metadata: options.metadata || {},
        createdAt: new Date()
      });

      await payment.save();

      let result;
      
      switch (destination.type) {
        case 'bank_account':
          result = await this.processBankWithdrawal(payment, destination);
          break;
        case 'crypto':
          result = await this.processCryptoWithdrawal(payment, destination);
          break;
        default:
          throw new Error(`Unsupported withdrawal destination: ${destination.type}`);
      }

      await this.updatePaymentStatus(payment.id, result.status, result);
      
      this.logger?.info(`Withdrawal processed: ${payment.id}`, {
        userId,
        amount,
        status: result.status
      });

      return { payment, result };

    } catch (error) {
      this.logger?.error('Error processing withdrawal:', error);
      throw error;
    }
  }

  async processBankDeposit(payment, source) {
    try {
      // Use Plaid for bank account deposits
      const response = await this.plaidClient.transferCreate({
        access_token: source.accessToken,
        account_id: source.accountId,
        type: 'credit',
        network: 'ach',
        amount: payment.amount.toString(),
        description: `Deposit to Nexus Trade AI - ${payment.id}`,
        user: {
          legal_name: source.accountHolderName
        }
      });

      return {
        status: 'processing',
        externalId: response.data.transfer.id,
        estimatedSettlement: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 business days
        fees: this.calculateACHFees(payment.amount)
      };

    } catch (error) {
      this.logger?.error('Error processing bank deposit:', error);
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  async processCreditCardDeposit(payment, source) {
    try {
      // Use Stripe for credit card processing
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100), // Convert to cents
        currency: payment.currency.toLowerCase(),
        payment_method: source.paymentMethodId,
        confirm: true,
        description: `Deposit to Nexus Trade AI - ${payment.id}`,
        metadata: {
          userId: payment.userId,
          paymentId: payment.id
        }
      });

      return {
        status: paymentIntent.status === 'succeeded' ? 'completed' : 'processing',
        externalId: paymentIntent.id,
        estimatedSettlement: new Date(), // Immediate for credit cards
        fees: this.calculateCreditCardFees(payment.amount)
      };

    } catch (error) {
      this.logger?.error('Error processing credit card deposit:', error);
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  async processBankWithdrawal(payment, destination) {
    try {
      const response = await this.plaidClient.transferCreate({
        access_token: destination.accessToken,
        account_id: destination.accountId,
        type: 'debit',
        network: 'ach',
        amount: payment.amount.toString(),
        description: `Withdrawal from Nexus Trade AI - ${payment.id}`,
        user: {
          legal_name: destination.accountHolderName
        }
      });

      return {
        status: 'processing',
        externalId: response.data.transfer.id,
        estimatedSettlement: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        fees: this.calculateACHFees(payment.amount)
      };

    } catch (error) {
      this.logger?.error('Error processing bank withdrawal:', error);
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  async linkBankAccount(userId, publicToken) {
    try {
      // Exchange public token for access token
      const exchangeResponse = await this.plaidClient.linkTokenExchange({
        public_token: publicToken
      });

      const accessToken = exchangeResponse.data.access_token;
      const itemId = exchangeResponse.data.item_id;

      // Get account information
      const accountsResponse = await this.plaidClient.accountsGet({
        access_token: accessToken
      });

      const accounts = accountsResponse.data.accounts;
      const linkedAccounts = [];

      for (const account of accounts) {
        const bankAccount = new BankAccount({
          id: require('uuid').v4(),
          userId,
          plaidAccountId: account.account_id,
          plaidItemId: itemId,
          accessToken: accessToken, // In production, encrypt this
          accountType: account.type,
          accountSubtype: account.subtype,
          institutionName: account.institution_id,
          accountName: account.name,
          mask: account.mask,
          isActive: true,
          createdAt: new Date()
        });

        await bankAccount.save();
        linkedAccounts.push(bankAccount);
      }

      this.logger?.info(`Bank accounts linked for user: ${userId}`, {
        accountCount: linkedAccounts.length
      });

      return linkedAccounts;

    } catch (error) {
      this.logger?.error('Error linking bank account:', error);
      throw error;
    }
  }

  async getPaymentHistory(userId, options = {}) {
    try {
      const query = { userId };
      
      if (options.type) {
        query.type = options.type;
      }
      
      if (options.status) {
        query.status = options.status;
      }
      
      if (options.startDate && options.endDate) {
        query.createdAt = {
          $gte: options.startDate,
          $lte: options.endDate
        };
      }

      const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 100);

      return payments;

    } catch (error) {
      this.logger?.error('Error getting payment history:', error);
      throw error;
    }
  }

  async getAvailableBalance(userId) {
    // Mock implementation - would integrate with account service
    return 10000.00;
  }

  calculateACHFees(amount) {
    // ACH fees are typically lower
    const fixedFee = 0.25;
    const percentageFee = amount * 0.001; // 0.1%
    return Math.max(fixedFee, percentageFee);
  }

  calculateCreditCardFees(amount) {
    // Credit card fees are higher
    const fixedFee = 0.30;
    const percentageFee = amount * 0.029; // 2.9%
    return fixedFee + percentageFee;
  }

  async updatePaymentStatus(paymentId, status, details = {}) {
    await Payment.findOneAndUpdate(
      { id: paymentId },
      {
        status,
        processedAt: status === 'completed' ? new Date() : undefined,
        externalId: details.externalId,
        fees: details.fees,
        error: details.error,
        updatedAt: new Date()
      }
    );
  }
}

module.exports = PaymentService;