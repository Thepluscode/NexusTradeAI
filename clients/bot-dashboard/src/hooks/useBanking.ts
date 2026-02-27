import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '@/services/api';
import type { BankAccount, TradingAccount, Transaction } from '@/types';

/**
 * Hook for fetching linked bank accounts
 */
export function useBankAccounts() {
    return useQuery<BankAccount[], Error>(
        'bankAccounts',
        () => apiClient.getBankAccounts(),
        {
            staleTime: 60000,
            retry: 1,
        }
    );
}

/**
 * Hook for fetching trading account balance
 */
export function useTradingAccountBalance() {
    return useQuery<TradingAccount, Error>(
        'tradingAccountBalance',
        () => apiClient.getTradingAccountBalance(),
        {
            refetchInterval: 30000,
            staleTime: 15000,
        }
    );
}

/**
 * Hook for fetching transaction history
 */
export function useTransactions(limit?: number) {
    return useQuery<Transaction[], Error>(
        ['transactions', limit],
        () => apiClient.getTransactions(limit),
        {
            staleTime: 30000,
        }
    );
}

/**
 * Hook for making deposits
 */
export function useDeposit() {
    const queryClient = useQueryClient();

    return useMutation<Transaction, Error, { amount: number; fromAccountId: string }>(
        ({ amount, fromAccountId }) => apiClient.deposit(amount, fromAccountId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('tradingAccountBalance');
                queryClient.invalidateQueries('transactions');
                queryClient.invalidateQueries('bankAccounts');
            },
        }
    );
}

/**
 * Hook for making withdrawals
 */
export function useWithdraw() {
    const queryClient = useQueryClient();

    return useMutation<Transaction, Error, { amount: number; toAccountId: string }>(
        ({ amount, toAccountId }) => apiClient.withdraw(amount, toAccountId),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('tradingAccountBalance');
                queryClient.invalidateQueries('transactions');
                queryClient.invalidateQueries('bankAccounts');
            },
        }
    );
}

/**
 * Hook for linking a new bank account
 */
export function useLinkBankAccount() {
    const queryClient = useQueryClient();

    return useMutation<BankAccount, Error, { bankName: string; accountNumber: string; routingNumber: string }>(
        (accountDetails) => apiClient.linkBankAccount(accountDetails),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('bankAccounts');
            },
        }
    );
}
