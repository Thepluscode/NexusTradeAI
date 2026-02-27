import React, { useState, useRef, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    IconButton,
    CircularProgress,
    Paper,
    Chip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import { useMutation } from 'react-query';
import { apiClient } from '@/services/api';
import type { AIChatMessage, AIChatResponse } from '@/types';

export const AIChat: React.FC = () => {
    const [messages, setMessages] = useState<AIChatMessage[]>([
        {
            role: 'assistant',
            content: "Hello! I'm your AI trading assistant. Ask me about performance, risk, strategies, or market conditions.",
            timestamp: new Date().toISOString(),
        },
    ]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chatMutation = useMutation<AIChatResponse, Error, string>(
        (message) => apiClient.sendAIChatMessage(message),
        {
            onSuccess: (data) => {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: data.response,
                        timestamp: data.timestamp,
                    },
                ]);
            },
        }
    );

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;

        setMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: input,
                timestamp: new Date().toISOString(),
            },
        ]);

        chatMutation.mutate(input);
        setInput('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const suggestions = [
        'Show performance',
        'Risk analysis',
        'Strategy status',
        'Market outlook',
    ];

    const handleSuggestion = (suggestion: string) => {
        setInput(suggestion);
    };

    return (
        <Card sx={{ bgcolor: 'background.paper', mb: 2, height: 450, display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <SmartToyIcon color="primary" />
                    <Typography variant="h6" fontWeight={600}>
                        AI Trading Assistant
                    </Typography>
                </Box>

                {/* Messages */}
                <Box
                    sx={{
                        flex: 1,
                        overflow: 'auto',
                        mb: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                    }}
                >
                    {messages.map((msg, idx) => (
                        <Box
                            key={idx}
                            sx={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}
                        >
                            <Paper
                                elevation={1}
                                sx={{
                                    p: 1.5,
                                    maxWidth: '80%',
                                    bgcolor: msg.role === 'user' ? 'primary.dark' : 'background.default',
                                    borderRadius: 2,
                                }}
                            >
                                <Box display="flex" alignItems="flex-start" gap={1}>
                                    {msg.role === 'assistant' && <SmartToyIcon fontSize="small" color="primary" />}
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {msg.content}
                                    </Typography>
                                    {msg.role === 'user' && <PersonIcon fontSize="small" color="inherit" />}
                                </Box>
                            </Paper>
                        </Box>
                    ))}
                    {chatMutation.isLoading && (
                        <Box display="flex" alignItems="center" gap={1}>
                            <CircularProgress size={16} />
                            <Typography variant="body2" color="text.secondary">
                                Thinking...
                            </Typography>
                        </Box>
                    )}
                    <div ref={messagesEndRef} />
                </Box>

                {/* Suggestions */}
                <Box mb={1} display="flex" gap={0.5} flexWrap="wrap">
                    {suggestions.map((s) => (
                        <Chip
                            key={s}
                            label={s}
                            size="small"
                            variant="outlined"
                            onClick={() => handleSuggestion(s)}
                            sx={{ cursor: 'pointer' }}
                        />
                    ))}
                </Box>

                {/* Input */}
                <Box display="flex" gap={1}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Ask about trading, risk, strategies..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={chatMutation.isLoading}
                    />
                    <IconButton
                        color="primary"
                        onClick={handleSend}
                        disabled={!input.trim() || chatMutation.isLoading}
                    >
                        <SendIcon />
                    </IconButton>
                </Box>
            </CardContent>
        </Card>
    );
};
