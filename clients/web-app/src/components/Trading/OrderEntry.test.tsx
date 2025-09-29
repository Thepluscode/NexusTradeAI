// /clients/web-app/src/components/Trading/OrderEntry.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrderEntry from './OrderEntry';

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: 'div',
    button: 'button',
  },
  AnimatePresence: 'div',
}));

describe('OrderEntry Component', () => {
  const mockOnOrderSubmit = jest.fn();

  beforeEach(() => {
    mockOnOrderSubmit.mockClear();
  });

  it('renders with default props', () => {
    render(<OrderEntry />);
    
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('$175.84')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
  });

  it('renders with custom symbol and price', () => {
    render(
      <OrderEntry 
        symbol="TSLA" 
        currentPrice={250.50} 
        onOrderSubmit={mockOnOrderSubmit}
      />
    );
    
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('$250.50')).toBeInTheDocument();
  });

  it('switches between buy and sell sides', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const buyButton = screen.getByRole('button', { name: /buy/i });
    const sellButton = screen.getByRole('button', { name: /sell/i });
    
    // Initially buy should be selected
    expect(buyButton).toHaveClass('bg-gradient-to-r', 'from-green-600');
    
    // Click sell button
    fireEvent.click(sellButton);
    expect(sellButton).toHaveClass('bg-gradient-to-r', 'from-red-600');
  });

  it('changes order type', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const limitButton = screen.getByRole('button', { name: /limit/i });
    fireEvent.click(limitButton);
    
    expect(limitButton).toHaveClass('bg-blue-600');
  });

  it('updates quantity input', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const quantityInput = screen.getByPlaceholderText('Enter quantity');
    fireEvent.change(quantityInput, { target: { value: '100' } });
    
    expect(quantityInput).toHaveValue(100);
  });

  it('shows price fields for limit orders', async () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const limitButton = screen.getByRole('button', { name: /limit/i });
    fireEvent.click(limitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Limit Price')).toBeInTheDocument();
    });
  });

  it('shows stop price fields for stop orders', async () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const stopButton = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopButton);
    
    await waitFor(() => {
      expect(screen.getByText('Stop Price')).toBeInTheDocument();
    });
  });

  it('displays AI recommendation', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    expect(screen.getByText('AI Recommendation')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('78%')).toBeInTheDocument();
  });

  it('displays market depth', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    expect(screen.getByText('Market Depth')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
  });

  it('displays current position info', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    expect(screen.getByText('Current Position')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument(); // quantity
    expect(screen.getByText('$165.20')).toBeInTheDocument(); // avg price
  });

  it('shows order summary', () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    expect(screen.getByText('Order Summary')).toBeInTheDocument();
    expect(screen.getByText('Estimated Cost:')).toBeInTheDocument();
    expect(screen.getByText('Commission:')).toBeInTheDocument();
  });

  it('toggles advanced options', async () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const advancedButton = screen.getByText('Advanced Options');
    fireEvent.click(advancedButton);
    
    await waitFor(() => {
      expect(screen.getByText('Reduce Only')).toBeInTheDocument();
      expect(screen.getByText('Post Only')).toBeInTheDocument();
    });
  });

  it('validates order before submission', async () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const submitButton = screen.getByRole('button', { name: /buy 0 aapl/i });
    
    // Should be disabled due to zero quantity
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button with valid order', async () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const quantityInput = screen.getByPlaceholderText('Enter quantity');
    fireEvent.change(quantityInput, { target: { value: '10' } });
    
    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /buy 10 aapl/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('calls onOrderSubmit when form is submitted', async () => {
    render(<OrderEntry onOrderSubmit={mockOnOrderSubmit} />);
    
    const quantityInput = screen.getByPlaceholderText('Enter quantity');
    fireEvent.change(quantityInput, { target: { value: '10' } });
    
    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /buy 10 aapl/i });
      fireEvent.click(submitButton);
    });
    
    await waitFor(() => {
      expect(mockOnOrderSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          orderType: 'market',
          timeInForce: 'DAY'
        })
      );
    });
  });
});
