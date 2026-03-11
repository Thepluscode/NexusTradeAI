import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, Typography, Button, IconButton, alpha, Stepper, Step, StepLabel } from '@mui/material';
import { Close, VpnKey, Code, TrendingUp } from '@mui/icons-material';

const STORAGE_KEY = 'nexus_onboarding_dismissed';

const STEPS = [
    { label: 'Create API Key', icon: <VpnKey sx={{ fontSize: 18 }} />, path: '/api', desc: 'Generate your first key from the API Access page' },
    { label: 'Make First Call', icon: <Code sx={{ fontSize: 18 }} />, path: '/docs', desc: 'Copy the code example and evaluate a signal' },
    { label: 'Report Outcome', icon: <TrendingUp sx={{ fontSize: 18 }} />, path: '/docs', desc: 'Tell the AI how the trade went — it learns and improves' },
];

interface Props {
    activeKeys?: number;
    totalCalls?: number;
}

export default function OnboardingBanner({ activeKeys = 0, totalCalls = 0 }: Props) {
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

    if (dismissed) return null;

    // Determine current step
    let activeStep = 0;
    if (activeKeys > 0) activeStep = 1;
    if (totalCalls > 0) activeStep = 2;
    if (totalCalls > 2) {
        // Completed onboarding — auto-dismiss
        localStorage.setItem(STORAGE_KEY, 'true');
        return null;
    }

    const currentStep = STEPS[activeStep];

    const handleDismiss = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setDismissed(true);
    };

    return (
        <Paper sx={{
            p: 2.5, mb: 3,
            background: `linear-gradient(135deg, ${alpha('#3b82f6', 0.08)}, ${alpha('#8b5cf6', 0.08)})`,
            border: `1px solid ${alpha('#3b82f6', 0.2)}`,
            position: 'relative',
        }}>
            <IconButton
                size="small"
                onClick={handleDismiss}
                sx={{ position: 'absolute', top: 8, right: 8, color: 'text.secondary' }}
            >
                <Close sx={{ fontSize: 16 }} />
            </IconButton>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                Get started with NexusTradeAI API
            </Typography>

            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
                {STEPS.map(step => (
                    <Step key={step.label}>
                        <StepLabel
                            StepIconProps={{
                                sx: {
                                    '&.Mui-active': { color: '#3b82f6' },
                                    '&.Mui-completed': { color: '#10b981' },
                                },
                            }}
                        >
                            <Typography variant="caption" fontWeight={600}>{step.label}</Typography>
                        </StepLabel>
                    </Step>
                ))}
            </Stepper>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                    {currentStep.desc}
                </Typography>
                <Button
                    size="small"
                    variant="contained"
                    onClick={() => navigate(currentStep.path)}
                    sx={{
                        textTransform: 'none', fontWeight: 600, borderRadius: 1.5, ml: 2,
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    }}
                >
                    {activeStep === 0 ? 'Create Key' : activeStep === 1 ? 'View Docs' : 'Learn More'}
                </Button>
            </Box>
        </Paper>
    );
}
