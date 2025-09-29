import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OrderEntry from '../OrderEntry';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('OrderEntry Component', () => {
  const defaultProps = {
    symbol: 'AAPL',
    currentPrice: 175.84,
    onOrderSubmit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the component with default props', () => {
      render(<OrderEntry {...defaultProps} />);
      
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('$175.84')).toBeInTheDocument();
      expect(screen.getByText('Order Entry')).toBeInTheDocument();
    });

    it('displays all navigation tabs', () => {
      render(<OrderEntry {...defaultProps} />);
      
      expect(screen.getByText('Order Entry')).toBeInTheDocument();
      expect(screen.getByText('Options')).toBeInTheDocument();
      expect(screen.getByText('Bracket/OCO')).toBeInTheDocument();
      expect(screen.getByText('Position Sizing')).toBeInTheDocument();
      expect(screen.getByText('Order History')).toBeInTheDocument();
    });

    it('shows portfolio summary cards', () => {
      render(<OrderEntry {...defaultProps} />);
      
      expect(screen.getByText('Available Balance')).toBeInTheDocument();
      expect(screen.getByText('Buying Power')).toBeInTheDocument();
      expect(screen.getByText('Position Value')).toBeInTheDocument();
    });
  });

  describe('Order Entry Tab', () => {
    it('allows asset type selection', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const cryptoButton = screen.getByRole('button', { name: /crypto/i });
      await user.click(cryptoButton);
      
      expect(cryptoButton).toHaveClass('bg-blue-600');
    });

    it('allows side selection (buy/sell)', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const sellButton = screen.getByRole('button', { name: /sell/i });
      await user.click(sellButton);
      
      expect(sellButton).toHaveClass('bg-gradient-to-r from-red-600 to-red-500');
    });

    it('allows order type selection', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const limitButton = screen.getByRole('button', { name: /limit/i });
      await user.click(limitButton);
      
      expect(limitButton).toHaveClass('bg-purple-600');
    });

    it('shows price inputs for limit orders', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const limitButton = screen.getByRole('button', { name: /limit/i });
      await user.click(limitButton);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter limit price')).toBeInTheDocument();
      });
    });

    it('allows quantity input', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const quantityInput = screen.getByPlaceholderText('Enter quantity');
      await user.type(quantityInput, '100');
      
      expect(quantityInput).toHaveValue(100);
    });

    it('allows time in force selection', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const gtcButton = screen.getByRole('button', { name: 'GTC' });
      await user.click(gtcButton);
      
      expect(gtcButton).toHaveClass('bg-indigo-600');
    });
  });

  describe('Options Trading Tab', () => {
    it('switches to options tab and shows options controls', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const optionsTab = screen.getByRole('button', { name: /options/i });
      await user.click(optionsTab);
      
      await waitFor(() => {
        expect(screen.getByText('Options Trading')).toBeInTheDocument();
        expect(screen.getByText('Option Type')).toBeInTheDocument();
        expect(screen.getByText('Strike Price')).toBeInTheDocument();
        expect(screen.getByText('Expiration Date')).toBeInTheDocument();
      });
    });

    it('allows option type selection (call/put)', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const optionsTab = screen.getByRole('button', { name: /options/i });
      await user.click(optionsTab);
      
      await waitFor(async () => {
        const putButton = screen.getByRole('button', { name: 'PUT' });
        await user.click(putButton);
        expect(putButton).toHaveClass('bg-purple-600');
      });
    });

    it('allows strike price input', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const optionsTab = screen.getByRole('button', { name: /options/i });
      await user.click(optionsTab);
      
      await waitFor(async () => {
        const strikeInput = screen.getByPlaceholderText('Enter strike price');
        await user.type(strikeInput, '180');
        expect(strikeInput).toHaveValue(180);
      });
    });
  });

  describe('Bracket/OCO Tab', () => {
    it('switches to bracket tab and shows bracket controls', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const bracketTab = screen.getByRole('button', { name: /bracket/i });
      await user.click(bracketTab);
      
      await waitFor(() => {
        expect(screen.getByText('Bracket & OCO Orders')).toBeInTheDocument();
        expect(screen.getByText('Take Profit Price')).toBeInTheDocument();
        expect(screen.getByText('Stop Loss Price')).toBeInTheDocument();
      });
    });

    it('calculates risk/reward ratio when prices are entered', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const bracketTab = screen.getByRole('button', { name: /bracket/i });
      await user.click(bracketTab);
      
      await waitFor(async () => {
        const takeProfitInput = screen.getByPlaceholderText('Take profit price');
        const stopLossInput = screen.getByPlaceholderText('Stop loss price');
        
        await user.type(takeProfitInput, '185');
        await user.type(stopLossInput, '170');
        
        expect(screen.getByText('Risk/Reward Analysis')).toBeInTheDocument();
      });
    });
  });

  describe('Position Sizing Tab', () => {
    it('switches to position sizing tab and shows calculator', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const sizingTab = screen.getByRole('button', { name: /position sizing/i });
      await user.click(sizingTab);
      
      await waitFor(() => {
        expect(screen.getByText('Position Sizing Calculator')).toBeInTheDocument();
        expect(screen.getByText('Risk Parameters')).toBeInTheDocument();
        expect(screen.getByText('Calculated Position')).toBeInTheDocument();
      });
    });

    it('allows risk percentage adjustment', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const sizingTab = screen.getByRole('button', { name: /position sizing/i });
      await user.click(sizingTab);
      
      await waitFor(async () => {
        const riskInput = screen.getByPlaceholderText('Risk percentage');
        await user.clear(riskInput);
        await user.type(riskInput, '3');
        expect(riskInput).toHaveValue(3);
      });
    });
  });

  describe('Order History Tab', () => {
    it('switches to order history tab and shows trade history', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const historyTab = screen.getByRole('button', { name: /order history/i });
      await user.click(historyTab);
      
      await waitFor(() => {
        expect(screen.getByText('Order History')).toBeInTheDocument();
        expect(screen.getByText('Total Orders')).toBeInTheDocument();
        expect(screen.getByText('Success Rate')).toBeInTheDocument();
      });
    });
  });

  describe('Order Submission', () => {
    it('calls onOrderSubmit when form is submitted with valid data', async () => {
      const user = userEvent.setup();
      const mockOnOrderSubmit = jest.fn();
      
      render(<OrderEntry {...defaultProps} onOrderSubmit={mockOnOrderSubmit} />);
      
      // Fill in quantity
      const quantityInput = screen.getByPlaceholderText('Enter quantity');
      await user.type(quantityInput, '100');
      
      // Submit order
      const submitButton = screen.getByRole('button', { name: /buy 100 aapl/i });
      await user.click(submitButton);
      
      expect(mockOnOrderSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 100,
          orderType: 'market',
        })
      );
    });

    it('does not submit order when quantity is zero', async () => {
      const user = userEvent.setup();
      const mockOnOrderSubmit = jest.fn();
      
      render(<OrderEntry {...defaultProps} onOrderSubmit={mockOnOrderSubmit} />);
      
      const submitButton = screen.getByRole('button', { name: /buy 0 aapl/i });
      await user.click(submitButton);
      
      expect(mockOnOrderSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(<OrderEntry {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /buy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sell/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const quantityInput = screen.getByPlaceholderText('Enter quantity');
      await user.tab();
      
      expect(document.activeElement).toBe(quantityInput);
    });
  });

  describe('Error Handling', () => {
    it('handles invalid input gracefully', async () => {
      const user = userEvent.setup();
      render(<OrderEntry {...defaultProps} />);
      
      const quantityInput = screen.getByPlaceholderText('Enter quantity');
      await user.type(quantityInput, 'invalid');
      
      // Should not crash and should handle invalid input
      expect(quantityInput).toBeInTheDocument();
    });
  });
});
